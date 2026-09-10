// --- ENDPOINT 1: EL INTERROGADOR (IA Product Owner) ---

const { Router } = require('express');
const { config } = require('../config');
const { generateText, stripMarkdownFences } = require('../claude');
const { DISCOVERY_SYSTEM, discoveryUserMessage } = require('../prompts');
const { crearLimitador } = require('../rateLimit');

const router = Router();

// Una ronda de discovery real tarda ~10 s, asi que un usuario legitimo no pasa
// de 6/min. 20 deja margen de sobra y corta cualquier bucle.
const limitar = crearLimitador({ maxPorMinuto: 20, nombre: 'generar-preguntas' });

router.post('/generar-preguntas', limitar, async (req, res, next) => {
  try {
    const { servicio, historial } = req.body ?? {};

    if (typeof servicio !== 'string' || !servicio.trim()) {
      return res.status(400).json({ error: 'Falta el servicio solicitado.' });
    }

    const { text, usage } = await generateText({
      label: 'discovery',
      system: DISCOVERY_SYSTEM,
      prompt: discoveryUserMessage({ servicio, historial }),
      maxTokens: config.maxTokens.discovery,
    });

    let parsed;
    try {
      parsed = JSON.parse(stripMarkdownFences(text));
    } catch {
      console.error('[AIB+] JSON inválido del modelo:', text.slice(0, 500));
      return res.status(502).json({
        error: 'La IA devolvió una respuesta que no se pudo interpretar. Vuelve a intentarlo.',
      });
    }

    // El frontend confía en estos campos; si faltan preferimos fallar aquí.
    if (typeof parsed.is_complete !== 'boolean') {
      return res.status(502).json({
        error: 'La IA devolvió una respuesta incompleta. Vuelve a intentarlo.',
      });
    }

    return res.json({ ...parsed, questions: parsed.questions ?? [], usage });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
