// ---------------------------------------------------------------------------
// Tope diario de gasto en IA
// ---------------------------------------------------------------------------
// El limitador por IP frena ráfagas, pero no protege el saldo: con el registro
// abierto, un usuario podía regenerar maquetas sin parar a unos 5 céntimos
// cada una. Antes de cada llamada a la IA se reserva su coste en Supabase
// (función reservar_cuota_ia, en supabase_cuota_ia.sql), que lleva la cuenta
// por usuario y día y guarda los límites y los costes.
//
// Se llama con el token del propio usuario: así la base de datos sabe quién es
// sin que el servidor necesite una clave de administrador.
// ---------------------------------------------------------------------------

const { config } = require('./config');

const MENSAJES = {
  limite_usuario:
    'Llegaste al límite de uso de hoy. Vuelve mañana y seguimos con tu proyecto.',
  limite_global:
    'El servicio de IA alcanzó su límite de hoy. Vuelve a intentarlo mañana.',
  sin_invitacion:
    'Tu enlace se abrió en otro navegador o dispositivo. Para seguir aquí, vuelve a abrir el enlace de tu invitación.',
};

/**
 * Middleware: reserva el coste de `tipo` antes de llamar a la IA. Va después
 * de requireAuth, que deja el token en req.tokenUsuario.
 *
 * Si no se puede comprobar la cuota, se deniega: fallar abierto aquí sería
 * volver a dejar el saldo sin protección.
 */
/**
 * Devuelve lo reservado para `tipo` (devolver_cuota_ia, con tope de 3 al día).
 * Nunca falla hacia fuera: si no se puede, solo queda en los logs.
 */
async function devolverCuota(token, tipo) {
  try {
    const respuesta = await fetch(`${config.supabaseUrl}/rest/v1/rpc/devolver_cuota_ia`, {
      method: 'POST',
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_tipo: tipo }),
      signal: AbortSignal.timeout(5_000),
    });
    const estado = respuesta.ok ? await respuesta.json() : `HTTP ${respuesta.status}`;
    if (estado !== 'ok') console.warn(`[AIB+] No se devolvió la cuota de ${tipo}: ${estado}`);
  } catch (error) {
    console.warn(`[AIB+] No se pudo devolver la cuota de ${tipo}:`, error.message);
  }
}

function cobrarCuota(tipo) {
  return async (req, res, next) => {
    try {
      const respuesta = await fetch(`${config.supabaseUrl}/rest/v1/rpc/reservar_cuota_ia`, {
        method: 'POST',
        headers: {
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${req.tokenUsuario}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_tipo: tipo }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!respuesta.ok) {
        throw new Error(`HTTP ${respuesta.status}: ${(await respuesta.text()).slice(0, 200)}`);
      }

      const estado = await respuesta.json();
      if (estado === 'ok') {
        // Si la llamada acaba en error, se devuelve lo reservado ANTES de
        // responder: en Vercel lo que se hace después de responder puede no
        // llegar a ejecutarse. Con mantenerConexion, ese middleware lo llama
        // en su propio res.json; sin él, lo hace este envoltorio.
        res.locals.devolverCuota = () => devolverCuota(req.tokenUsuario, tipo);
        const jsonOriginal = res.json.bind(res);
        res.json = (cuerpo) => {
          const devolver = res.statusCode >= 400 ? res.locals.devolverCuota : null;
          res.locals.devolverCuota = null;
          if (!devolver) return jsonOriginal(cuerpo);
          void devolver().finally(() => jsonOriginal(cuerpo));
          return res;
        };
        return next();
      }

      if (estado === 'limite_global') {
        console.error('[AIB+] ⚠ TOPE DIARIO GLOBAL DE IA ALCANZADO. Se sube en la tabla limites_ia.');
        return res.status(503).json({ success: false, error: MENSAJES.limite_global });
      }
      // Sesión anónima sin invitación activa (supabase_invitaciones.sql).
      if (estado === 'sin_invitacion') {
        return res.status(403).json({ success: false, error: MENSAJES.sin_invitacion });
      }
      if (estado === 'limite_usuario') {
        console.warn(`[AIB+] Usuario ${req.usuario?.id} alcanzó su tope diario (${tipo}).`);
        return res.status(429).json({ success: false, error: MENSAJES.limite_usuario });
      }

      throw new Error(`Respuesta inesperada de reservar_cuota_ia: ${JSON.stringify(estado)}`);
    } catch (error) {
      console.error('[AIB+] No se pudo comprobar la cuota de IA:', error.message);
      return res.status(503).json({
        success: false,
        error: 'No pudimos comprobar tu límite de uso. Inténtalo de nuevo en unos segundos.',
      });
    }
  };
}

module.exports = { cobrarCuota };
