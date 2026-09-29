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
};

/**
 * Middleware: reserva el coste de `tipo` antes de llamar a la IA. Va después
 * de requireAuth, que deja el token en req.tokenUsuario.
 *
 * Si no se puede comprobar la cuota, se deniega: fallar abierto aquí sería
 * volver a dejar el saldo sin protección.
 */
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
      if (estado === 'ok') return next();

      if (estado === 'limite_global') {
        console.error('[AIB+] ⚠ TOPE DIARIO GLOBAL DE IA ALCANZADO. Se sube en la tabla limites_ia.');
        return res.status(503).json({ success: false, error: MENSAJES.limite_global });
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
