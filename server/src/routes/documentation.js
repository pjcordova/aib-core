// --- ENDPOINT 3: DOCUMENTACIÓN PARA INGENIERÍA ---
// Se invoca cuando el cliente acepta la previsualización (o desde el panel del
// ingeniero, si falta o la quiere con el formato nuevo). Convierte el
// discovery en el expediente del encargo: para la primera llamada, para
// cotizar por etapas y para construirlo.

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

const TIPOS = ['web', 'crm', 'erp', 'automatizacion', 'app-movil', 'otro'];
const texto = (valor, max) => (typeof valor === 'string' ? valor.trim().slice(0, max) : '');

/** Lo que manda el navegador sobre el encargo, solo lo que se espera. */
function leerContexto(c) {
  if (!c || typeof c !== 'object') return {};
  const precio = Number(c.plantilla?.precio_desde);
  return {
    tipo_servicio: TIPOS.includes(c.tipo_servicio) ? c.tipo_servicio : undefined,
    empresa: texto(c.empresa, 80),
    plantilla: c.plantilla?.nombre
      ? {
          nombre: texto(c.plantilla.nombre, 80),
          precio_desde: Number.isInteger(precio) && precio > 0 && precio < 1_000_000 ? precio : null,
        }
      : null,
  };
}

/**
 * Las etapas, listas para la propuesta «Por etapas»: de 2 a 5, con porcentajes
 * enteros que suman 100 (la última se lleva el redondeo) y días razonables.
 * Si no sirven, se quitan: el resto del documento vale igual.
 */
function normalizarEtapas(etapas) {
  if (!Array.isArray(etapas)) return undefined;
  const validas = etapas
    .filter((e) => e && typeof e.titulo === 'string' && e.titulo.trim().length >= 2)
    .slice(0, 5)
    .map((e) => ({
      titulo: e.titulo.replace(/[<>]/g, '').trim().slice(0, 60),
      porcentaje: Math.max(1, Math.round(Number(e.porcentaje) || 0)),
      dias: Math.min(365, Math.max(1, Math.round(Number(e.dias) || 0))),
      entregable: texto(e.entregable, 200),
    }));
  if (validas.length < 2) return undefined;

  const suma = validas.reduce((s, e) => s + e.porcentaje, 0);
  let acumulado = 0;
  validas.forEach((e, i) => {
    e.porcentaje = i === validas.length - 1 ? 100 - acumulado : Math.max(1, Math.round((e.porcentaje * 100) / suma));
    acumulado += e.porcentaje;
  });
  return validas.every((e) => e.porcentaje >= 1) ? validas : undefined;
}

router.post('/generar-documentacion', limitar, requireAuth, cobrarCuota('documentacion'), mantenerConexion, async (req, res, next) => {
  try {
    const { servicio, historial } = req.body ?? {};

    if (typeof servicio !== 'string' || !servicio.trim()) {
      return res.status(400).json({ success: false, error: 'Falta el servicio solicitado.' });
    }
    const contexto = leerContexto(req.body?.contexto);

    const { text, usage } = await generateText({
      label: 'documentacion',
      prompt: documentationPrompt({ servicio, historial, contexto }),
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

    // version 2: con la llamada, los materiales y las etapas; tipo, para pintarla.
    doc.version = 2;
    doc.tipo = contexto.tipo_servicio === 'web' ? 'web' : 'sistema';
    doc.etapas = normalizarEtapas(doc.etapas);
    if (!doc.etapas) delete doc.etapas;

    return res.json({ success: true, documentacion: doc, usage });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
module.exports.normalizarEtapas = normalizarEtapas;
