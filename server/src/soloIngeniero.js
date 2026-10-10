// ---------------------------------------------------------------------------
// Solo para ingenieros
// ---------------------------------------------------------------------------
// Algunas ayudas de la IA (sugerir preguntas, crear diseños) son del panel del
// ingeniero: un cliente o un invitado no tiene por qué gastarlas. Se pregunta
// a Supabase con el token del propio usuario (es_ingeniero). Va después de
// requireAuth y antes de cobrarCuota: así no se cobra a quien no puede usarla.
// ---------------------------------------------------------------------------

const { consultarComo } = require('./supabaseUsuario');

/** @param {string} mensaje Lo que lee quien no es ingeniero. */
function soloIngeniero(mensaje) {
  return async (req, res, next) => {
    try {
      const es = await consultarComo(req.tokenUsuario, 'rpc/es_ingeniero', { cuerpo: {} });
      if (es === true) return next();
      return res.status(403).json({ success: false, error: mensaje });
    } catch (error) {
      console.error('[AIB+] No se pudo comprobar si es ingeniero:', error.message);
      return res.status(503).json({ success: false, error: 'No pudimos comprobar tu cuenta. Inténtalo de nuevo.' });
    }
  };
}

module.exports = { soloIngeniero };
