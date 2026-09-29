// ---------------------------------------------------------------------------
// Autenticación de la API
// ---------------------------------------------------------------------------
// Los endpoints gastan dinero real: cada prototipo cuesta unos 0,20 $. Sin esta
// comprobación, publicar el backend equivale a dejar abierta una puerta por la
// que cualquiera puede consumir la cuota de Anthropic.
//
// El cliente envía el access token que Supabase ya le dio al iniciar sesión, y
// aquí se valida contra el propio Supabase. Se usa la clave anónima, que es
// pública por diseño: la que manda es la validez del token del usuario.
//
// Se valida por HTTP en vez de verificar la firma del JWT en local a propósito:
// así un token revocado o una sesión cerrada dejan de funcionar al instante, en
// lugar de seguir siendo válidos hasta que expiren.
// ---------------------------------------------------------------------------

const { config } = require('./config');

/** Extrae el token de la cabecera Authorization. */
function leerToken(req) {
  const cabecera = req.get('authorization') ?? '';
  const [esquema, valor] = cabecera.split(' ');
  if (!valor || esquema.toLowerCase() !== 'bearer') return null;
  return valor.trim() || null;
}

/**
 * Middleware: exige una sesión de Supabase válida.
 * Deja `req.usuario` con { id, email } y `req.tokenUsuario` con el token, que
 * el tope de gasto (cuota.js) usa para identificarse ante Supabase.
 */
async function requireAuth(req, res, next) {
  const token = leerToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Necesitas iniciar sesión para usar esta función.',
    });
  }

  try {
    const respuesta = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!respuesta.ok) {
      return res.status(401).json({
        success: false,
        error: 'Tu sesión no es válida o ha caducado. Vuelve a iniciar sesión.',
      });
    }

    const usuario = await respuesta.json();

    if (!usuario?.id) {
      return res.status(401).json({ success: false, error: 'Sesión no válida.' });
    }

    req.usuario = { id: usuario.id, email: usuario.email };
    req.tokenUsuario = token;
    return next();
  } catch (error) {
    // Si Supabase no responde no podemos afirmar que el usuario sea legítimo,
    // así que denegamos: fallar abierto aquí sería dejar la API sin puerta.
    console.error('[AIB+] No se pudo verificar la sesión:', error.message);
    return res.status(503).json({
      success: false,
      error: 'No se pudo verificar tu sesión. Inténtalo de nuevo en unos segundos.',
    });
  }
}

module.exports = { requireAuth };
