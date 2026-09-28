// --- ENDPOINT 4: MAQUETA WEB (HTML + Bootstrap) ---
// Genera el cuerpo de una página web a partir de la ficha del cliente. El logo
// no viaja hasta aquí: el modelo no necesita verlo, solo deja un marcador que
// el cliente sustituye por la imagen.

const { Router } = require('express');
const { config } = require('../config');
const { generateText, stripMarkdownFences } = require('../claude');
const { webPreviewPrompt } = require('../prompts');
const { crearLimitador } = require('../rateLimit');
const { requireAuth } = require('../auth');

const router = Router();

const limitar = crearLimitador({ maxPorMinuto: 5, nombre: 'generar-preview-web' });

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Valida la ficha y acota cada campo. Todo acaba dentro del prompt, así que
 * sin límites un cliente podría inflarlo y disparar el coste de cada llamada.
 */
function leerFicha(cuerpo) {
  const f = cuerpo?.ficha;
  if (!f || typeof f !== 'object') return { error: 'Falta la ficha del proyecto.' };

  const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  const empresa = texto(f.empresa, 80);
  const rubro = texto(f.rubro, 600);
  const estilo = texto(f.estilo, 60);

  if (!empresa) return { error: 'Falta el nombre de la empresa.' };
  if (!rubro) return { error: 'Falta a qué se dedica la empresa.' };

  const paleta = f.paleta ?? {};
  if (!HEX.test(paleta.primario ?? '') || !HEX.test(paleta.secundario ?? '')) {
    return { error: 'La paleta de colores no es válida.' };
  }

  const secciones = Array.isArray(f.secciones)
    ? f.secciones.filter((s) => typeof s === 'string').map((s) => s.trim().slice(0, 40)).slice(0, 5)
    : [];

  return {
    ficha: {
      empresa,
      rubro,
      estilo: estilo || 'Moderno y minimalista',
      secciones,
      paleta: {
        nombre: texto(paleta.nombre, 40) || 'Personalizada',
        primario: paleta.primario,
        secundario: paleta.secundario,
      },
    },
  };
}

/** Se queda con el contenido del <body> y quita cualquier script. */
function extraerCuerpo(html) {
  let limpio = stripMarkdownFences(html);

  const body = limpio.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (body) limpio = body[1];

  return limpio
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?(html|head|body)[^>]*>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .trim();
}

router.post('/generar-preview-web', limitar, requireAuth, async (req, res, next) => {
  try {
    const { ficha, error } = leerFicha(req.body);
    if (error) return res.status(400).json({ success: false, error });

    const { text, usage } = await generateText({
      label: 'preview-web',
      prompt: webPreviewPrompt(ficha),
      maxTokens: config.maxTokens.web,
    });

    const cuerpo = extraerCuerpo(text);

    if (cuerpo.length < 200) {
      return res.status(502).json({
        success: false,
        error: 'La IA devolvió una página vacía. Vuelve a intentarlo.',
      });
    }

    return res.json({ success: true, html: cuerpo, usage });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
