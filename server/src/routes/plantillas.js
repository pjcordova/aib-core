// --- ENDPOINT 5: TEXTOS PARA UNA PLANTILLA ---
// Rellena una plantilla del ingeniero con los textos de un cliente concreto.
// La IA no escribe HTML: devuelve solo los textos, con la forma exacta que la
// plantilla espera (structured outputs), y el frontend los inserta.

const { Router } = require('express');
const { config } = require('../config');
const { generateText } = require('../claude');
const { crearLimitador } = require('../rateLimit');
const { requireAuth } = require('../auth');
const { obtenerPlantilla } = require('../plantillas');

const router = Router();

const limitar = crearLimitador({ maxPorMinuto: 5, nombre: 'rellenar-plantilla' });

router.post('/rellenar-plantilla', limitar, requireAuth, async (req, res, next) => {
  try {
    const { plantilla: id, ficha } = req.body ?? {};

    const plantilla = obtenerPlantilla(typeof id === 'string' ? id : '');
    if (!plantilla) {
      return res.status(400).json({ success: false, error: 'Plantilla desconocida.' });
    }

    const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const empresa = texto(ficha?.empresa, 80);
    const rubro = texto(ficha?.rubro, 600);
    const estilo = texto(ficha?.estilo, 60) || 'Moderno y minimalista';

    if (!empresa || !rubro) {
      return res.status(400).json({ success: false, error: 'Faltan el nombre o el rubro del negocio.' });
    }

    const { text, usage } = await generateText({
      label: `plantilla:${plantilla.id}`,
      prompt: plantilla.prompt({ empresa, rubro, estilo }),
      maxTokens: config.maxTokens.plantilla,
      temperature: 0.6,
      schema: plantilla.esquema,
    });

    let crudo;
    try {
      crudo = JSON.parse(text);
    } catch {
      console.error('[AIB+] JSON inválido pese al esquema:', text.slice(0, 300));
      return res.status(502).json({ success: false, error: 'No pudimos preparar los textos. Vuelve a intentarlo.' });
    }

    const textos = plantilla.normalizar(crudo);
    if (!textos) {
      return res.status(502).json({ success: false, error: 'Los textos llegaron incompletos. Vuelve a intentarlo.' });
    }

    return res.json({ success: true, textos, usage });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
