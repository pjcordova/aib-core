// ---------------------------------------------------------------------------
// Google Calendar del ingeniero, para ABI
// ---------------------------------------------------------------------------
// El ingeniero conecta su calendario una vez (OAuth de Google con
// access_type=offline). Google le da al servidor un permiso de larga duración
// (refresh token) que se guarda cifrado en Supabase Vault
// (supabase_calendario.sql). Con él, el servidor:
//   - consulta su disponibilidad (freeBusy), para que ABI proponga horarios;
//   - crea la reunión que el ingeniero confirma, con Google Meet, e invita al
//     correo del cliente.
// Solo pide dos permisos: ver su disponibilidad y crear eventos en sus propios
// calendarios. No lee el contenido de sus otros eventos.
// ---------------------------------------------------------------------------

const crypto = require('node:crypto');
const { config } = require('./config');
const { consultarComo } = require('./supabaseUsuario');

const ALCANCES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/calendar.freebusy',
];
const NECESARIOS = ALCANCES.slice(2);

const ZONA = 'America/Lima';
/** Lima no tiene horario de verano: siempre UTC-5. */
const DESFASE_LIMA_MS = 5 * 3_600_000;
/** Cuánto vale el «state» firmado que va y vuelve de Google. */
const VIGENCIA_ESTADO_MS = 15 * 60_000;

class CalendarioError extends Error {
  /** @param {'sin_configurar' | 'sin_conectar' | 'desconectado' | 'permisos' | 'google'} codigo */
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
  }
}

const configurado = () => Boolean(config.google.clientId && config.google.clientSecret && config.cronSecret);
const urlVuelta = () => `${config.appUrl}/api/calendario/volver`;

/* -------------------------------------------------------------- el «state» */

const base64url = (texto) => Buffer.from(texto).toString('base64url');
const firma = (datos) => crypto.createHmac('sha256', config.google.clientSecret).update(datos).digest('base64url');

/** El ingeniero que empezó la conexión, firmado para que nadie lo cambie a la vuelta. */
function firmarEstado(usuarioId) {
  const datos = base64url(JSON.stringify({ u: usuarioId, t: Date.now(), n: crypto.randomBytes(8).toString('hex') }));
  return `${datos}.${firma(datos)}`;
}

/** El id del ingeniero, o null si el «state» no es nuestro o caducó. */
function leerEstado(estado) {
  if (typeof estado !== 'string' || !estado.includes('.')) return null;
  const [datos, recibida] = estado.split('.');
  const esperada = firma(datos);
  if (recibida.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(recibida), Buffer.from(esperada))) {
    return null;
  }
  try {
    const { u, t } = JSON.parse(Buffer.from(datos, 'base64url').toString());
    if (typeof u !== 'string' || typeof t !== 'number' || Date.now() - t > VIGENCIA_ESTADO_MS) return null;
    return u;
  } catch {
    return null;
  }
}

/** La pantalla de Google donde el ingeniero da permiso. */
function urlAutorizacion(usuarioId) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', config.google.clientId);
  url.searchParams.set('redirect_uri', urlVuelta());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', ALCANCES.join(' '));
  // offline + consent: así Google siempre devuelve el refresh token.
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', firmarEstado(usuarioId));
  return url.toString();
}

/* ------------------------------------------------------------ con Supabase */

/** Las funciones con clave de servidor (supabase_calendario.sql). */
const rpcServidor = (funcion, cuerpo) =>
  consultarComo(config.supabaseAnonKey, `rpc/${funcion}`, { cuerpo: { p_clave: config.cronSecret, ...cuerpo } });

/* --------------------------------------------------------------- con Google */

async function pedirToken(parametros) {
  const respuesta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      ...parametros,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const datos = await respuesta.json().catch(() => ({}));
  return { ok: respuesta.ok, datos };
}

/** El correo de la cuenta, del id_token que Google acaba de entregar por HTTPS. */
function correoDe(idToken) {
  try {
    return JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString()).email ?? null;
  } catch {
    return null;
  }
}

/**
 * A la vuelta de Google: canjea el código y guarda el permiso. Lanza
 * CalendarioError('permisos') si el ingeniero desmarcó alguno de los dos.
 */
async function completarConexion(usuarioId, codigo) {
  const { ok, datos } = await pedirToken({ code: codigo, grant_type: 'authorization_code', redirect_uri: urlVuelta() });
  if (!ok || !datos.refresh_token) {
    throw new CalendarioError('google', `Google no entregó el permiso: ${datos.error ?? 'sin refresh_token'}`);
  }
  const concedidos = String(datos.scope ?? '').split(' ');
  if (!NECESARIOS.every((a) => concedidos.includes(a))) {
    // Sin los dos no sirve: se devuelve el permiso a medias.
    void revocar(datos.refresh_token);
    throw new CalendarioError('permisos', 'Faltan permisos del calendario.');
  }
  const guardado = await rpcServidor('guardar_calendario', {
    p_usuario: usuarioId,
    p_correo: correoDe(datos.id_token),
    p_token: datos.refresh_token,
  });
  if (guardado !== true) throw new CalendarioError('google', 'No se pudo guardar la conexión.');
}

function revocar(refreshToken) {
  return fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}

/** Desconecta: le devuelve el permiso a Google y lo borra de la base. */
async function desconectar(usuarioId) {
  const token = await rpcServidor('token_calendario', { p_usuario: usuarioId });
  if (token) await revocar(token);
  await rpcServidor('borrar_calendario', { p_usuario: usuarioId });
}

/** Un acceso de una hora, a partir del permiso guardado. */
async function accesoDe(usuarioId) {
  if (!configurado()) throw new CalendarioError('sin_configurar', 'El calendario aún no está disponible en AIB+.');
  const refresco = await rpcServidor('token_calendario', { p_usuario: usuarioId });
  if (!refresco) throw new CalendarioError('sin_conectar', 'El ingeniero no conectó su Google Calendar.');

  const { ok, datos } = await pedirToken({ refresh_token: refresco, grant_type: 'refresh_token' });
  if (!ok) {
    // Quitó el permiso desde su cuenta de Google o caducó: se borra para que vuelva a conectarlo.
    if (datos.error === 'invalid_grant') {
      await rpcServidor('borrar_calendario', { p_usuario: usuarioId }).catch(() => {});
      throw new CalendarioError('desconectado', 'Google ya no acepta el permiso: hay que volver a conectar el calendario.');
    }
    throw new CalendarioError('google', `Google no dio acceso: ${datos.error ?? 'error'}`);
  }
  return datos.access_token;
}

async function api(acceso, ruta, { metodo = 'GET', cuerpo, params = {} } = {}) {
  const url = new URL(`https://www.googleapis.com/calendar/v3/${ruta}`);
  for (const [clave, valor] of Object.entries(params)) url.searchParams.set(clave, valor);
  const respuesta = await fetch(url, {
    method: metodo,
    headers: { Authorization: `Bearer ${acceso}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    throw new CalendarioError('google', `Google Calendar respondió ${respuesta.status}: ${datos.error?.message ?? ''}`);
  }
  return datos;
}

/* -------------------------------------------------------------- lo que usa ABI */

/** «lunes 20 de octubre, 10:00» en hora de Lima. */
const textoLima = (fecha) =>
  fecha.toLocaleString('es-PE', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/**
 * Su disponibilidad en los próximos `dias` (1 a 14): lo ocupado y, para
 * proponer, huecos de una hora de lunes a sábado entre las 9:00 y las 19:00
 * de Lima, desde dentro de dos horas.
 */
async function disponibilidad(usuarioId, dias) {
  const acceso = await accesoDe(usuarioId);
  const n = Math.min(Math.max(Math.round(Number(dias) || 7), 1), 14);
  const desde = new Date();
  const hasta = new Date(desde.getTime() + n * 86_400_000);

  const r = await api(acceso, 'freeBusy', {
    metodo: 'POST',
    cuerpo: { timeMin: desde.toISOString(), timeMax: hasta.toISOString(), timeZone: ZONA, items: [{ id: 'primary' }] },
  });
  const ocupado = (r.calendars?.primary?.busy ?? []).map((b) => ({ inicio: new Date(b.start), fin: new Date(b.end) }));

  const libres = [];
  const minimo = desde.getTime() + 2 * 3_600_000;
  // Medianoche de hoy en Lima, en UTC.
  const hoyLima = new Date(desde.getTime() - DESFASE_LIMA_MS);
  const base = Date.UTC(hoyLima.getUTCFullYear(), hoyLima.getUTCMonth(), hoyLima.getUTCDate()) + DESFASE_LIMA_MS;
  for (let d = 0; d <= n && libres.length < 24; d++) {
    const dia = new Date(base + d * 86_400_000);
    // getUTCDay de la medianoche de Lima desplazada: 0 domingo.
    if (new Date(dia.getTime() - DESFASE_LIMA_MS).getUTCDay() === 0) continue;
    for (let hora = 9; hora < 19 && libres.length < 24; hora++) {
      const inicio = new Date(dia.getTime() + hora * 3_600_000);
      const fin = new Date(inicio.getTime() + 3_600_000);
      if (inicio.getTime() < minimo || fin > hasta) continue;
      if (ocupado.some((o) => o.inicio < fin && o.fin > inicio)) continue;
      libres.push({ inicio: inicio.toISOString(), texto: textoLima(inicio) });
    }
  }

  return {
    zona: ZONA,
    ocupado: ocupado.slice(0, 40).map((o) => ({ desde: textoLima(o.inicio), hasta: textoLima(o.fin) })),
    libres_una_hora: libres,
  };
}

/**
 * Crea la reunión en su calendario, con Google Meet. Si hay correo del
 * cliente, Google le manda la invitación.
 */
async function crearReunion(usuarioId, { titulo, inicio, minutos, descripcion, invitado }) {
  const acceso = await accesoDe(usuarioId);
  const comienzo = new Date(inicio);
  const fin = new Date(comienzo.getTime() + minutos * 60_000);

  const evento = await api(acceso, 'calendars/primary/events', {
    metodo: 'POST',
    params: { conferenceDataVersion: '1', sendUpdates: invitado ? 'all' : 'none' },
    cuerpo: {
      summary: titulo,
      description: descripcion,
      start: { dateTime: comienzo.toISOString(), timeZone: ZONA },
      end: { dateTime: fin.toISOString(), timeZone: ZONA },
      attendees: invitado ? [{ email: invitado }] : [],
      conferenceData: {
        createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
      reminders: { useDefault: true },
    },
  });

  const meet =
    evento.hangoutLink ?? evento.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ?? null;
  return { enlace: evento.htmlLink ?? null, meet, inicio: comienzo.toISOString(), fin: fin.toISOString() };
}

module.exports = {
  CalendarioError,
  configurado,
  urlAutorizacion,
  leerEstado,
  completarConexion,
  desconectar,
  disponibilidad,
  crearReunion,
  textoLima,
};
