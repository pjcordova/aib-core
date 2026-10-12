// ---------------------------------------------------------------------------
// Después de «vite build»: páginas por servicio y por rubro en HTML, sitemap
// y robots
// ---------------------------------------------------------------------------
// La web es una app de React: sin JavaScript, cada página es un <div> vacío.
// Google suele ejecutarlo, pero tarde y no siempre. Por eso, para cada página
// de servicio (src/data/paginasServicio.json) y de rubro
// (src/data/paginasRubro.json) se escribe un HTML con su título, su
// descripción, sus datos estructurados y el texto ya dentro: lo lee cualquier
// buscador. Al abrirla, React la reemplaza por la versión completa, con los
// diseños y los ingenieros del momento.
//
// También escribe sitemap.xml (con las páginas públicas de los ingenieros, si
// se pueden leer de Supabase) y robots.txt.
// ---------------------------------------------------------------------------

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'dist');
const SITIO = 'https://www.aibplus.app';

const paginas = JSON.parse(readFileSync(join(raiz, 'src/data/paginasServicio.json'), 'utf8'));
const rubros = JSON.parse(readFileSync(join(raiz, 'src/data/paginasRubro.json'), 'utf8'));
const plantilla = readFileSync(join(dist, 'index.html'), 'utf8');

// vercel.json manda cada /servicios/<slug> y /rubros/<slug> a su HTML: una
// página nueva tiene que estar también en esa lista, o Vercel serviría la app
// vacía.
const vercel = readFileSync(join(raiz, '..', 'vercel.json'), 'utf8');
for (const [carpeta, lista] of [
  ['servicios', paginas],
  ['rubros', rubros],
]) {
  const sinRegla = lista.filter((p) => !new RegExp(`/${carpeta}/:slug\\([^)]*\\b${p.slug}\\b`).test(vercel));
  if (sinRegla.length) {
    throw new Error(`Faltan en la regla /${carpeta}/:slug(...) de vercel.json: ${sinRegla.map((p) => p.slug).join(', ')}`);
  }
}

// Cada rubro enlaza a otros servicios por su slug: que existan.
for (const r of rubros) {
  const malos = r.tambien.filter((t) => !paginas.some((p) => p.slug === t.servicio));
  if (malos.length) throw new Error(`El rubro ${r.slug} enlaza a servicios que no existen: ${malos.map((t) => t.servicio).join(', ')}`);
}

const esc = (t) =>
  String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** JSON dentro de <script>: que nada pueda cerrar la etiqueta. */
const jsonLd = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

function reemplazar(html, buscar, poner) {
  if (!buscar.test(html)) throw new Error(`No encontré ${buscar} en dist/index.html`);
  return html.replace(buscar, () => poner);
}

// «Cómo funciona», igual que PASOS_COMO_FUNCIONA en src/lib/paginasServicio.ts.
const PASOS = [
  'Cuéntanos de tu negocio: respondes unas preguntas, casi todas con un clic.',
  'Mira cómo quedaría: en un minuto ves una primera versión con tu nombre y tus colores, gratis.',
  'Elige a tu ingeniero: te envía su propuesta con precio y plazo, y sigues el avance desde AIB+.',
];

const lista = (elementos) => `<ul class="mt-4">${elementos.map((e) => `<li>${e}</li>`).join('')}</ul>`;

const comoFunciona = () => `<h2 class="mt-10 text-2xl">Cómo funciona</h2>
  <ol class="mt-4">${PASOS.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>`;

const preguntasHtml = (preguntas) => `<h2 class="mt-10 text-2xl">Preguntas frecuentes</h2>
  ${preguntas.map((q) => `<h3 class="mt-6 font-semibold">${esc(q.pregunta)}</h3>\n  <p class="mt-2 text-ink-muted">${esc(q.respuesta)}</p>`).join('\n  ')}`;

const enlacesRubros = (excepto) =>
  lista(rubros.filter((r) => r.slug !== excepto).map((r) => `<a href="/rubros/${esc(r.slug)}">${esc(r.nombre)}</a>`));

function contenidoServicio(p) {
  const otras = paginas.filter((o) => o.slug !== p.slug);
  return `<main class="mx-auto max-w-4xl px-4 py-10 sm:px-6">
  <nav aria-label="Ruta" class="text-xs text-ink-subtle"><a href="/">Inicio</a> › Servicios › ${esc(p.nombre)}</nav>
  <h1 class="mt-6 text-4xl">${esc(p.h1)}</h1>
  <p class="mt-4 text-ink-muted">${esc(p.intro)}</p>
  <p class="mt-6"><a class="btn btn-primary" href="/probar?servicio=${esc(p.clave)}">Mira gratis cómo quedaría</a></p>
  <ul class="mt-8">${p.beneficios.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
  <h2 class="mt-10 text-2xl">Qué puede incluir</h2>
  ${lista(p.incluye.map(esc))}
  ${p.clave === 'web' ? `<h2 class="mt-10 text-2xl">Según tu tipo de negocio</h2>\n  ${enlacesRubros()}` : ''}
  ${comoFunciona()}
  <p class="mt-4"><a href="/explorar?servicio=${esc(p.clave)}">Conoce a los ingenieros que lo construyen</a></p>
  ${preguntasHtml(p.preguntas)}
  <h2 class="mt-10 text-2xl">También hacemos</h2>
  ${lista(otras.map((o) => `<a href="/servicios/${esc(o.slug)}">${esc(o.nombre)}</a>`))}
</main>`;
}

function contenidoRubro(r) {
  const tambien = r.tambien.map((t) => ({ ...t, pagina: paginas.find((p) => p.slug === t.servicio) }));
  return `<main class="mx-auto max-w-4xl px-4 py-10 sm:px-6">
  <nav aria-label="Ruta" class="text-xs text-ink-subtle"><a href="/">Inicio</a> › <a href="/servicios/paginas-web">Páginas web</a> › ${esc(r.nombre)}</nav>
  <h1 class="mt-6 text-4xl">${esc(r.h1)}</h1>
  <p class="mt-4 text-ink-muted">${esc(r.intro)}</p>
  <p class="mt-6"><a class="btn btn-primary" href="/probar?servicio=web">Mira gratis cómo quedaría</a></p>
  <h2 class="mt-10 text-2xl">Lo que no le puede faltar</h2>
  ${lista(r.necesita.map(esc))}
  <h2 class="mt-10 text-2xl">Además de la web</h2>
  ${lista(tambien.map((t) => `<a href="/servicios/${esc(t.servicio)}">${esc(t.pagina.nombre)}</a>: ${esc(t.texto)}`))}
  ${comoFunciona()}
  <p class="mt-4"><a href="/explorar?servicio=web&amp;rubro=${esc(r.categoria)}">Conoce a los ingenieros que lo construyen</a></p>
  ${preguntasHtml(r.preguntas)}
  <h2 class="mt-10 text-2xl">También hacemos webs para</h2>
  ${enlacesRubros(r.slug)}
</main>`;
}

/** Servicio, preguntas frecuentes y ruta, para que Google entienda la página. */
function datosEstructurados({ servicio, descripcion, url, preguntas, ruta, audiencia }) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: servicio,
      serviceType: servicio,
      description: descripcion,
      url,
      areaServed: { '@type': 'Country', name: 'Perú' },
      ...(audiencia ? { audience: { '@type': 'BusinessAudience', name: audiencia } } : {}),
      provider: { '@type': 'Organization', name: 'AIB+', url: SITIO, logo: `${SITIO}/og.png` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: preguntas.map((q) => ({
        '@type': 'Question',
        name: q.pregunta,
        acceptedAnswer: { '@type': 'Answer', text: q.respuesta },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: ruta.map(([nombre, item], i) => ({ '@type': 'ListItem', position: i + 1, name: nombre, item })),
    },
  ];
}

/** Escribe dist/<ruta>/index.html con su título, descripción, datos y texto. */
function escribir(ruta, { titulo, descripcion, datos, cuerpo }) {
  const url = `${SITIO}${ruta}`;
  let html = plantilla;
  html = reemplazar(html, /<title>[\s\S]*?<\/title>/, `<title>${esc(titulo)}</title>`);
  html = reemplazar(html, /<meta\s+name="description"[\s\S]*?\/>/, `<meta name="description" content="${esc(descripcion)}" />`);
  html = reemplazar(html, /<meta property="og:title"[\s\S]*?\/>/, `<meta property="og:title" content="${esc(titulo)}" />`);
  html = reemplazar(html, /<meta\s+property="og:description"[\s\S]*?\/>/, `<meta property="og:description" content="${esc(descripcion)}" />`);
  html = reemplazar(
    html,
    /<\/head>/,
    `    <link rel="canonical" href="${url}" />
    <meta property="og:url" content="${url}" />
${datos.map((d) => `    <script type="application/ld+json">${jsonLd(d)}</script>`).join('\n')}
  </head>`
  );
  html = reemplazar(html, /<div id="root"><\/div>/, `<div id="root">${cuerpo}</div>`);

  const carpeta = join(dist, ...ruta.split('/').filter(Boolean));
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, 'index.html'), html);
}

for (const p of paginas) {
  const ruta = `/servicios/${p.slug}`;
  escribir(ruta, {
    titulo: p.titulo,
    descripcion: p.descripcion,
    cuerpo: contenidoServicio(p),
    datos: datosEstructurados({
      servicio: p.nombre,
      descripcion: p.descripcion,
      url: `${SITIO}${ruta}`,
      preguntas: p.preguntas,
      ruta: [
        ['Inicio', `${SITIO}/`],
        [p.nombre, `${SITIO}${ruta}`],
      ],
    }),
  });
}
console.log(`[prerender] ${paginas.length} páginas de servicio`);

for (const r of rubros) {
  const ruta = `/rubros/${r.slug}`;
  escribir(ruta, {
    titulo: r.titulo,
    descripcion: r.descripcion,
    cuerpo: contenidoRubro(r),
    datos: datosEstructurados({
      servicio: `Páginas web para ${r.nombre.toLowerCase()}`,
      descripcion: r.descripcion,
      url: `${SITIO}${ruta}`,
      preguntas: r.preguntas,
      audiencia: r.nombre,
      ruta: [
        ['Inicio', `${SITIO}/`],
        ['Páginas web', `${SITIO}/servicios/paginas-web`],
        [r.nombre, `${SITIO}${ruta}`],
      ],
    }),
  });
}
console.log(`[prerender] ${rubros.length} páginas por rubro`);

// ------------------------------------------------------------- sitemap y robots

/** Las páginas públicas de los ingenieros. Si no se pueden leer, el sitemap sale sin ellas. */
async function slugsDeIngenieros() {
  const url = process.env.VITE_SUPABASE_URL;
  const clave = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !clave) return [];
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/ingenieros_disponibles`, {
      method: 'POST',
      headers: { apikey: clave, Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return [];
    const lista = await r.json();
    return (Array.isArray(lista) ? lista : [])
      .map((i) => i.slug)
      .filter((s) => typeof s === 'string' && /^[a-z0-9-]{3,40}$/.test(s));
  } catch {
    return [];
  }
}

const hoy = new Date().toISOString().slice(0, 10);
const rutas = [
  ['/', '1.0'],
  ...paginas.map((p) => [`/servicios/${p.slug}`, '0.9']),
  ...rubros.map((r) => [`/rubros/${r.slug}`, '0.8']),
  ['/explorar', '0.8'],
  ['/ingenieros', '0.6'],
  ...(await slugsDeIngenieros()).map((s) => [`/ing/${s}`, '0.7']),
  ['/privacidad', '0.3'],
  ['/terminos', '0.3'],
];
writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rutas.map(([r, prioridad]) => `  <url><loc>${SITIO}${r}</loc><lastmod>${hoy}</lastmod><priority>${prioridad}</priority></url>`).join('\n')}
</urlset>
`
);
// /probar abre una sesión de prueba al visitarla, y lo demás es privado: los
// buscadores no tienen nada que hacer ahí.
writeFileSync(
  join(dist, 'robots.txt'),
  `User-agent: *
Allow: /
Disallow: /probar
Disallow: /mi-web
Disallow: /dashboard
Disallow: /ingresar

Sitemap: ${SITIO}/sitemap.xml
`
);
console.log(`[prerender] sitemap.xml con ${rutas.length} direcciones y robots.txt`);
