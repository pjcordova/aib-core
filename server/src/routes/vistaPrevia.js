// ---------------------------------------------------------------------------
// Vista previa de los enlaces en WhatsApp
// ---------------------------------------------------------------------------
// WhatsApp, Facebook, Telegram y compañía piden la página para armar la
// tarjeta del enlace, pero no ejecutan JavaScript: con la app de siempre solo
// verían el título genérico. Vercel les manda aquí a ellos (y solo a ellos,
// por su user-agent; ver vercel.json) y se responde una página mínima con el
// nombre del negocio en el título. Las personas siguen yendo a la app.
// ---------------------------------------------------------------------------

const express = require('express');
const { config } = require('../config');
const { consultarComo } = require('../supabaseUsuario');

const router = express.Router();

const TEXTOS = {
  invitacion: {
    titulo: (negocio) => `${negocio}: mira cómo se vería tu página web`,
    descripcion:
      'Responde unas preguntas rápidas y en un minuto ves una primera versión con tu nombre y tus colores. Sin crear cuenta ni pagar nada.',
  },
  maqueta: {
    titulo: (empresa) => `Mira la página web de ${empresa}`,
    descripcion: 'Una primera versión de su web, hecha con AIB+. Ábrela y dinos qué te parece.',
  },
};

const GENERICO = {
  titulo: 'AIB+ · Mira cómo se vería la web de tu negocio',
  descripcion: 'Respondes unas preguntas y en un minuto ves una primera versión con tu nombre y tus colores.',
};

const escapar = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function vistaPrevia(tipo, req, res) {
  const token = String(req.params.token ?? '');
  let nombre = null;
  if (/^[0-9a-f]{32}$/.test(token)) {
    try {
      nombre = await consultarComo(config.supabaseAnonKey, 'rpc/vista_previa_enlace', {
        cuerpo: { p_tipo: tipo, p_token: token },
      });
    } catch (error) {
      // Sin nombre, la tarjeta sale con el texto genérico: mejor eso que nada.
      console.warn('[AIB+] Vista previa sin nombre:', error.message);
    }
  }

  const textos = typeof nombre === 'string' && nombre ? TEXTOS[tipo] : null;
  const titulo = textos ? textos.titulo(nombre) : GENERICO.titulo;
  const descripcion = textos ? textos.descripcion : GENERICO.descripcion;
  const origen = `${req.protocol}://${req.get('host')}`;
  const url = `${origen}${req.path}`;
  const imagen = `${origen}/og.png`;

  res.set('Cache-Control', 'public, max-age=300');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.type('html').send(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escapar(titulo)}</title>
<meta name="description" content="${escapar(descripcion)}">
<meta name="robots" content="noindex, nofollow">
<meta property="og:type" content="website">
<meta property="og:site_name" content="AIB+">
<meta property="og:locale" content="es_PE">
<meta property="og:title" content="${escapar(titulo)}">
<meta property="og:description" content="${escapar(descripcion)}">
<meta property="og:url" content="${escapar(url)}">
<meta property="og:image" content="${escapar(imagen)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="AIB+: la página web de tu negocio, lista para ver en un minuto">
<meta name="twitter:card" content="summary_large_image">
</head>
<body><p><a href="${escapar(req.path)}">${escapar(titulo)}</a></p></body>
</html>`);
}

router.get('/i/:token', (req, res) => vistaPrevia('invitacion', req, res));
router.get('/ver/:token', (req, res) => vistaPrevia('maqueta', req, res));

module.exports = router;
