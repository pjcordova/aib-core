// --- ABI: EL ASISTENTE DEL INGENIERO ---
// El panel le manda la conversación y recibe la respuesta de ABI, con los
// borradores de WhatsApp que haya preparado. Solo para ingenieros: un cliente
// no tiene nada que preguntarle y cada pregunta cuesta dinero real.

const { Router } = require('express');
const { conversarConAbi } = require('../abi');
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

async function soloIngeniero(req, res, next) {
  try {
    const esIngeniero = await consultarComo(req.tokenUsuario, 'rpc/es_ingeniero', { cuerpo: {} });
    if (esIngeniero === true) return next();
    return res.status(403).json({ success: false, error: 'ABI es solo para ingenieros.' });
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

router.post('/abi', limitar, requireAuth, soloIngeniero, cobrarCuota('abi'), mantenerConexion, async (req, res, next) => {
  try {
    const conversacion = leerConversacion(req.body);
    if (!conversacion) {
      return res.status(400).json({ success: false, error: 'Escríbele algo a ABI.' });
    }

    // Su nombre y su enlace de agenda; si no hay ajustes, ABI se las arregla.
    const ajustes = await consultarComo(req.tokenUsuario, 'ajustes_ingeniero', {
      params: [['select', 'nombre,enlace_agenda']],
    })
      .then((filas) => filas[0] ?? null)
      .catch((error) => {
        console.warn('[AIB+] ABI sin ajustes:', error.message);
        return null;
      });

    const { texto, acciones, uso } = await conversarConAbi({ token: req.tokenUsuario, conversacion, ajustes });
    return res.json({ success: true, respuesta: texto, acciones, usage: uso });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
