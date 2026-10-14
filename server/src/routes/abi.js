// --- ABI: EL ASISTENTE DEL INGENIERO ---
// El panel le manda la conversación y recibe la respuesta de ABI, con los
// borradores de WhatsApp que haya preparado. También le pide que prepare la
// propuesta de un encargo. Solo para ingenieros: un cliente no tiene nada que
// preguntarle y cada pregunta cuesta dinero real.

const { Router } = require('express');
const { armarPropuesta, conversarConAbi, PropuestaError } = require('../abi');
const { consultarComo } = require('../supabaseUsuario');
const { crearLimitador } = require('../rateLimit');
const { requireAuth } = require('../auth');
const { cobrarCuota } = require('../cuota');
const { mantenerConexion } = require('../mantenerConexion');

const router = Router();

const limitar = crearLimitador({ maxPorMinuto: 12, nombre: 'abi' });

/** Lo que admite una conversación: suficiente para el contexto, acotado en coste. */
const MAX_MENSAJES = 20;
const MAX_CARACTERES_MENSAJE = 4000;

/** ABI viene con los planes Pro y Negocio (supabase_planes.sql). */
async function soloIngeniero(req, res, next) {
  try {
    const conAbi = await consultarComo(req.tokenUsuario, 'rpc/tengo_abi', { cuerpo: {} });
    if (conAbi === true) return next();
    return res.status(403).json({ success: false, error: 'ABI viene con el plan Pro. Actívalo en «Mi plan».' });
  } catch (error) {
    console.error('[AIB+] No se pudo comprobar el rol para ABI:', error.message);
    return res.status(503).json({ success: false, error: 'No pudimos comprobar tu cuenta. Inténtalo de nuevo.' });
  }
}

/** Valida y recorta la conversación que manda el panel. null si no sirve. */
function leerConversacion(cuerpo) {
  const lista = Array.isArray(cuerpo?.conversacion) ? cuerpo.conversacion : null;
  if (!lista || lista.length === 0) return null;

  const limpia = lista
    .slice(-MAX_MENSAJES)
    .filter((m) => (m?.rol === 'usuario' || m?.rol === 'abi') && typeof m.texto === 'string' && m.texto.trim())
    .map((m) => ({ rol: m.rol, texto: m.texto.trim().slice(0, MAX_CARACTERES_MENSAJE) }));

  // La API exige que empiece el usuario, y la última tiene que ser su pregunta.
  while (limpia.length && limpia[0].rol !== 'usuario') limpia.shift();
  if (limpia.length === 0 || limpia.at(-1).rol !== 'usuario') return null;
  return limpia;
}

/** Lee algo opcional para ABI: si falla, sigue sin ello en vez de no responder. */
function leerOpcional(token, ruta, params, porDefecto) {
  return consultarComo(token, ruta, { params }).catch((error) => {
    console.warn(`[AIB+] ABI sin ${ruta}:`, error.message);
    return porDefecto;
  });
}

/**
 * Anota la pregunta en abi_registro, con la sesión del ingeniero. Si falla no
 * se pierde la respuesta: solo queda la línea en los logs del servidor.
 */
async function anotar(token, pregunta, r) {
  try {
    await consultarComo(token, 'abi_registro', {
      cuerpo: {
        pregunta: pregunta.slice(0, 300),
        herramientas: r.herramientas ?? [],
        resultado: r.resultado,
        tokens_entrada: r.uso?.input_tokens ?? 0,
        tokens_cache_escritos: r.uso?.cache_creation_input_tokens ?? 0,
        tokens_cache_leidos: r.uso?.cache_read_input_tokens ?? 0,
        tokens_salida: r.uso?.output_tokens ?? 0,
        costo_estimado_usd: Number((r.costoUsd ?? 0).toFixed(5)),
        milisegundos: r.milisegundos ?? 0,
      },
    });
  } catch (error) {
    console.warn('[AIB+] No se pudo anotar la pregunta a ABI:', error.message);
  }
}

/** Su nombre, su enlace de agenda, su estilo, lo que le pidió recordar y cómo corrigió los últimos borradores. */
async function leerPerfil(token) {
  const [ajustes, recuerdos, correcciones] = await Promise.all([
    leerOpcional(
      token,
      'ajustes_ingeniero',
      [['select', 'nombre,enlace_agenda,estilo_trato,estilo_tono,estilo_largo,estilo_emojis,firma']],
      []
    ).then((filas) => filas[0] ?? null),
    leerOpcional(
      token,
      'abi_memoria',
      [
        ['select', 'texto'],
        ['order', 'created_at.asc'],
        ['limit', '40'],
      ],
      []
    ).then((filas) => filas.map((f) => f.texto)),
    leerOpcional(
      token,
      'abi_correcciones',
      [
        ['select', 'borrador,final'],
        ['order', 'created_at.desc'],
        ['limit', '5'],
      ],
      []
    ),
  ]);
  return { ajustes, recuerdos, correcciones };
}

router.post('/abi', limitar, requireAuth, soloIngeniero, cobrarCuota('abi'), mantenerConexion, async (req, res, next) => {
  const conversacion = leerConversacion(req.body);
  if (!conversacion) {
    return res.status(400).json({ success: false, error: 'Escríbele algo a ABI.' });
  }
  const pregunta = conversacion.at(-1).texto;
  const inicio = Date.now();

  try {
    // Lo que sabe del ingeniero y si conectó su calendario.
    const [{ ajustes, recuerdos, correcciones }, calendario] = await Promise.all([
      leerPerfil(req.tokenUsuario),
      leerOpcional(req.tokenUsuario, 'calendarios_ingeniero', [['select', 'correo']], []),
    ]);

    const r = await conversarConAbi({
      token: req.tokenUsuario,
      conversacion,
      ajustes,
      recuerdos,
      correcciones,
      usuarioId: req.usuario.id,
      calendarioConectado: calendario.length > 0,
    });
    await anotar(req.tokenUsuario, pregunta, r);
    return res.json({ success: true, respuesta: r.texto, acciones: r.acciones });
  } catch (error) {
    await anotar(req.tokenUsuario, pregunta, { resultado: 'error', milisegundos: Date.now() - inicio });
    return next(error);
  }
});

// «Que ABI la prepare»: la propuesta de un encargo, para que el ingeniero la
// revise en el formulario. No guarda nada.
router.post('/abi/propuesta', limitar, requireAuth, soloIngeniero, cobrarCuota('abi'), mantenerConexion, async (req, res, next) => {
  const encargoId = typeof req.body?.encargo_id === 'string' ? req.body.encargo_id : '';
  const pregunta = 'Preparar la propuesta de un encargo';
  const inicio = Date.now();
  try {
    const perfil = await leerPerfil(req.tokenUsuario);
    const r = await armarPropuesta({ token: req.tokenUsuario, encargoId, ...perfil });
    await anotar(req.tokenUsuario, pregunta, r);
    return res.json({ success: true, propuesta: r.propuesta });
  } catch (error) {
    await anotar(req.tokenUsuario, pregunta, error.registro ?? { resultado: 'error', milisegundos: Date.now() - inicio });
    if (error instanceof PropuestaError) return res.status(error.estado).json({ success: false, error: error.message });
    return next(error);
  }
});

module.exports = router;
