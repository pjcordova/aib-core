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
  titulo: 'AIB+ · Tecnología para tu negocio, hecha por ingenieros',
  descripcion: 'Webs, tiendas online, CRM, ERP, automatizaciones y apps. Mira gratis cómo quedaría con tu nombre y tus colores.',
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
  enviarTarjeta(req, res, titulo, descripcion);
}

/** La página pública de un ingeniero (/ing/:slug): su nombre y lo que hace. */
async function vistaPerfil(req, res) {
  const slug = String(req.params.slug ?? '');
  let datos = null;
  if (/^[a-z0-9-]{3,40}$/.test(slug)) {
    try {
      datos = await consultarComo(config.supabaseAnonKey, 'rpc/vista_previa_perfil', { cuerpo: { p_slug: slug } });
    } catch (error) {
      console.warn('[AIB+] Vista previa del perfil sin datos:', error.message);
    }
  }
  const titulo = datos?.nombre ? `${datos.nombre} · Ingeniero web en AIB+` : GENERICO.titulo;
  const descripcion = datos?.nombre
    ? `${datos.titular ? `${datos.titular}. ` : ''}Mira mis diseños y arma tu web conmigo en un minuto, gratis.`
    : GENERICO.descripcion;
  enviarTarjeta(req, res, titulo, descripcion);
}

/** La propuesta que el ingeniero le manda al cliente (/propuesta/:token). */
async function vistaPropuesta(req, res) {
  const token = String(req.params.token ?? '');
  let datos = null;
  if (/^[0-9a-f]{32}$/.test(token)) {
    try {
      datos = await consultarComo(config.supabaseAnonKey, 'rpc/vista_previa_propuesta', { cuerpo: { p_token: token } });
    } catch (error) {
      console.warn('[AIB+] Vista previa de la propuesta sin datos:', error.message);
    }
  }
  const titulo = datos?.negocio ? `Propuesta de ${datos.ingeniero} para ${datos.negocio}` : 'Tu propuesta en AIB+';
  const descripcion = 'Mira el precio, el plazo y lo que incluye tu web. Puedes aceptarla o pedir cambios con un clic.';
  enviarTarjeta(req, res, titulo, descripcion);
}

function enviarTarjeta(req, res, titulo, descripcion) {
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
<meta property="og:image:alt" content="AIB+: tecnología para tu negocio, hecha por ingenieros">
<meta name="twitter:card" content="summary_large_image">
</head>
<body><p><a href="${escapar(req.path)}">${escapar(titulo)}</a></p></body>
</html>`);
}

router.get('/i/:token', (req, res) => vistaPrevia('invitacion', req, res));
router.get('/ver/:token', (req, res) => vistaPrevia('maqueta', req, res));
router.get('/ing/:slug', vistaPerfil);
router.get('/propuesta/:token', vistaPropuesta);

module.exports = router;
