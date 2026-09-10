// --- ENDPOINT 2: EL CONSTRUCTOR VISUAL (SaaS Engine) ---

const { Router } = require('express');
const { config } = require('../config');
const { generateText, stripMarkdownFences } = require('../claude');
const { prototypePrompt } = require('../prompts');
const { crearLimitador } = require('../rateLimit');

const router = Router();

// Cada prototipo cuesta ~0,20 $ y tarda mas de dos minutos: aqui el techo es
// mucho mas estrecho.
const limitar = crearLimitador({ maxPorMinuto: 5, nombre: 'generar-prototipo' });

router.post('/generar-prototipo', limitar, async (req, res, next) => {
  try {
    const { servicio, historial } = req.body ?? {};

    if (typeof servicio !== 'string' || !servicio.trim()) {
      return res.status(400).json({ success: false, error: 'Falta el servicio solicitado.' });
    }

    const { text, usage } = await generateText({
      label: 'prototipo',
      prompt: prototypePrompt({ servicio, historial }),
      maxTokens: config.maxTokens.prototype,
    });

    const code = stripMarkdownFences(text);

    // Sandpack monta /App.tsx por su export por defecto. Sin él falla dentro
    // del iframe con un error que no dice nada; mejor detectarlo aquí.
    if (!code.includes('export default')) {
      return res.status(502).json({
        success: false,
        error: 'La IA devolvió un componente sin export default; Sandpack no puede montarlo.',
      });
    }

    return res.json({ success: true, react_code: code, usage });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
