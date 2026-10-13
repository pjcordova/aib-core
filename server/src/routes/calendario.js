// --- GOOGLE CALENDAR DEL INGENIERO (src/calendario.js) ---
// Conectar y desconectar desde los ajustes de ABI, la vuelta de Google y crear
// la reunión que el ingeniero confirma en una tarjeta de ABI. Como ABI, es del
// plan Pro y Negocio.

const { Router } = require('express');
const { config } = require('../config');
const { requireAuth } = require('../auth');
const { crearLimitador } = require('../rateLimit');
const { consultarComo } = require('../supabaseUsuario');
const {
  CalendarioError,
  configurado,
  urlAutorizacion,
  leerEstado,
  completarConexion,
  desconectar,
  crearReunion,
} = require('../calendario');

const router = Router();
const limitar = crearLimitador({ maxPorMinuto: 10, nombre: 'calendario' });

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CORREO = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

async function conAbi(req, res, next) {
  try {
    if ((await consultarComo(req.tokenUsuario, 'rpc/tengo_abi', { cuerpo: {} })) === true) return next();
    return res.status(403).json({ success: false, error: 'Conectar tu calendario viene con el plan Pro, junto con ABI.' });
  } catch (error) {
    console.error('[AIB+] No se pudo comprobar el plan para el calendario:', error.message);
    return res.status(503).json({ success: false, error: 'No pudimos comprobar tu cuenta. Inténtalo de nuevo.' });
  }
}

function responderError(res, error, next) {
  if (!(error instanceof CalendarioError)) return next(error);
  console.warn(`[AIB+] Calendario (${error.codigo}):`, error.message);
  const mensajes = {
    sin_configurar: 'El calendario aún no está disponible en AIB+.',
    sin_conectar: 'Conecta tu Google Calendar en los ajustes de ABI.',
    desconectado: 'Google ya no acepta el permiso de tu calendario: vuelve a conectarlo en los ajustes de ABI.',
    permisos: 'Faltan permisos del calendario: vuelve a conectarlo y marca las dos casillas.',
    google: 'Google Calendar no respondió bien. Vuelve a intentarlo en un momento.',
  };
  const estado = error.codigo === 'google' ? 502 : error.codigo === 'sin_configurar' ? 503 : 409;
  return res.status(estado).json({ success: false, codigo: error.codigo, error: mensajes[error.codigo] });
}

/** Si está disponible y con qué cuenta lo conectó. */
router.post('/calendario/estado', requireAuth, async (req, res, next) => {
  try {
    const [fila] = await consultarComo(req.tokenUsuario, 'calendarios_ingeniero', {
      params: [['select', 'correo,conectado_en']],
    });
    return res.json({
      success: true,
      disponible: configurado(),
      conectado: Boolean(fila),
      correo: fila?.correo ?? null,
    });
  } catch (error) {
    return next(error);
  }
});

/** Devuelve la pantalla de Google a la que el panel lleva al ingeniero. */
router.post('/calendario/conectar', limitar, requireAuth, conAbi, (req, res) => {
  if (!configurado()) {
    return res.status(503).json({ success: false, error: 'El calendario aún no está disponible en AIB+.' });
  }
  return res.json({ success: true, url: urlAutorizacion(req.usuario.id) });
});

/** Google vuelve aquí (en el navegador del ingeniero) con el código o el rechazo. */
router.get('/calendario/volver', limitar, async (req, res) => {
  const volver = (resultado) => res.redirect(303, `${config.appUrl}/dashboard?calendario=${resultado}`);
  if (!configurado()) return volver('error');
  if (req.query.error) return volver(req.query.error === 'access_denied' ? 'cancelado' : 'error');

  const usuarioId = leerEstado(req.query.state);
  if (!usuarioId || typeof req.query.code !== 'string') return volver('error');
  try {
    await completarConexion(usuarioId, req.query.code);
    return volver('conectado');
  } catch (error) {
    console.warn('[AIB+] No se pudo conectar el calendario:', error.message);
    return volver(error instanceof CalendarioError && error.codigo === 'permisos' ? 'permisos' : 'error');
  }
});

router.post('/calendario/desconectar', limitar, requireAuth, async (req, res, next) => {
  try {
    await desconectar(req.usuario.id);
    return res.json({ success: true });
  } catch (error) {
    return responderError(res, error, next);
  }
});

/**
 * La reunión que el ingeniero confirmó en una tarjeta de ABI. Se vuelve a
 * comprobar todo aquí: que el encargo sea suyo (RLS) y que la hora tenga
 * sentido. Si el cliente dejó correo, Google le manda la invitación.
 */
router.post('/calendario/reunion', limitar, requireAuth, conAbi, async (req, res, next) => {
  const { encargo_id: encargoId, inicio, minutos, titulo, nota } = req.body ?? {};
  const comienzo = new Date(inicio);
  const duracion = Number(minutos);
  if (!ID.test(String(encargoId))) return res.status(400).json({ success: false, error: 'Falta el encargo.' });
  if (Number.isNaN(comienzo.getTime()) || comienzo.getTime() < Date.now() - 5 * 60_000) {
    return res.status(400).json({ success: false, error: 'Ese horario ya pasó: pídele a ABI otro.' });
  }
  if (comienzo.getTime() > Date.now() + 90 * 86_400_000) {
    return res.status(400).json({ success: false, error: 'Ese horario está demasiado lejos.' });
  }
  if (!Number.isInteger(duracion) || duracion < 15 || duracion > 180) {
    return res.status(400).json({ success: false, error: 'La reunión debe durar entre 15 minutos y 3 horas.' });
  }

  try {
    // Con el token del ingeniero: si el encargo no es suyo, no lo ve.
    const [proyecto] = await consultarComo(req.tokenUsuario, 'proyectos', {
      params: [
        ['select', 'empresa:payload->ficha->>empresa,servicio:payload->>servicio,correo:payload->contacto->>correo'],
        ['id', `eq.${encargoId}`],
      ],
    });
    if (!proyecto) return res.status(404).json({ success: false, error: 'No encontré ese encargo.' });

    const negocio = proyecto.empresa || proyecto.servicio || 'tu proyecto';
    // Quien aceptó desde una prueba sin cuenta dejó el encargo sin correo: se
    // usa el de la cuenta que guardó después (correo_cliente, supabase_calendario.sql).
    let correo = proyecto.correo;
    if (!CORREO.test(String(correo ?? ''))) {
      correo = await consultarComo(req.tokenUsuario, 'rpc/correo_cliente', { cuerpo: { p_proyecto: encargoId } }).catch(
        () => null
      );
    }
    const invitado = CORREO.test(String(correo ?? '')) ? correo : null;
    const reunion = await crearReunion(req.usuario.id, {
      titulo: String(titulo ?? '').trim().slice(0, 120) || `Reunión: ${negocio} · AIB+`,
      inicio: comienzo.toISOString(),
      minutos: duracion,
      descripcion: [String(nota ?? '').trim().slice(0, 500), `Agendada desde AIB+ para ${negocio}.`]
        .filter(Boolean)
        .join('\n\n'),
      invitado,
    });
    return res.json({ success: true, ...reunion, invitado: Boolean(invitado) });
  } catch (error) {
    return responderError(res, error, next);
  }
});

module.exports = router;
