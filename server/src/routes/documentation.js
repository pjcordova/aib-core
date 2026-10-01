// --- ENDPOINT 3: DOCUMENTACIÓN PARA INGENIERÍA ---
// Se invoca cuando el cliente acepta la previsualización. Convierte el
// discovery en un documento estructurado con el que el equipo puede estimar y
// construir.

const { Router } = require('express');
const { config } = require('../config');
const { generateText, stripMarkdownFences } = require('../claude');
const { documentationPrompt } = require('../prompts');
const { crearLimitador } = require('../rateLimit');
const { requireAuth } = require('../auth');
const { cobrarCuota } = require('../cuota');
const { mantenerConexion } = require('../mantenerConexion');

const router = Router();

// Aceptar una propuesta es un acto puntual, no algo que se repita en bucle.
const limitar = crearLimitador({ maxPorMinuto: 5, nombre: 'generar-documentacion' });

router.post('/generar-documentacion', limitar, requireAuth, cobrarCuota('documentacion'), mantenerConexion, async (req, res, next) => {
  try {
    const { servicio, historial } = req.body ?? {};

    if (typeof servicio !== 'string' || !servicio.trim()) {
      return res.status(400).json({ success: false, error: 'Falta el servicio solicitado.' });
    }

    const { text, usage } = await generateText({
      label: 'documentacion',
      prompt: documentationPrompt({ servicio, historial }),
      maxTokens: config.maxTokens.documentation,
      temperature: 0.4, // Un documento técnico pide menos improvisación.
    });

    let doc;
    try {
      doc = JSON.parse(stripMarkdownFences(text));
    } catch {
      console.error('[AIB+] JSON inválido en documentación:', text.slice(0, 400));
      return res.status(502).json({
        success: false,
        error: 'La IA devolvió un documento que no se pudo interpretar. Vuelve a intentarlo.',
      });
    }

    // El dashboard del ingeniero cuenta con estos campos para pintar la ficha.
    if (!doc?.resumen || !Array.isArray(doc.funcionalidades)) {
      return res.status(502).json({
        success: false,
        error: 'La documentación llegó incompleta. Vuelve a intentarlo.',
      });
    }

    return res.json({ success: true, documentacion: doc, usage });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
