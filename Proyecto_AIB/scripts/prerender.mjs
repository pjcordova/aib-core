// ---------------------------------------------------------------------------
// Después de «vite build»: páginas por servicio en HTML, sitemap y robots
// ---------------------------------------------------------------------------
// La web es una app de React: sin JavaScript, cada página es un <div> vacío.
// Google suele ejecutarlo, pero tarde y no siempre. Por eso, para cada página
// de servicio (src/data/paginasServicio.json) se escribe un HTML con su título,
// su descripción, sus datos estructurados y el texto ya dentro: lo lee
// cualquier buscador. Al abrirla, React la reemplaza por la versión completa,
// con los diseños y los ingenieros del momento.
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
const plantilla = readFileSync(join(dist, 'index.html'), 'utf8');

// vercel.json manda cada /servicios/<slug> a su HTML: una página nueva tiene
// que estar también en esa lista, o Vercel serviría la app vacía.
const vercel = readFileSync(join(raiz, '..', 'vercel.json'), 'utf8');
const sinRegla = paginas.filter((p) => !new RegExp(`/servicios/:slug\\([^)]*\\b${p.slug}\\b`).test(vercel));
if (sinRegla.length) {
  throw new Error(`Faltan en la regla /servicios/:slug(...) de vercel.json: ${sinRegla.map((p) => p.slug).join(', ')}`);
}

const esc = (t) =>
  String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** JSON dentro de <script>: que nada pueda cerrar la etiqueta. */
const jsonLd = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

function reemplazar(html, buscar, poner) {
  if (!buscar.test(html)) throw new Error(`No encontré ${buscar} en dist/index.html`);
  return html.replace(buscar, () => poner);
}

function contenido(p) {
  const otras = paginas.filter((o) => o.slug !== p.slug);
  return `<main class="mx-auto max-w-4xl px-4 py-10 sm:px-6">
  <nav aria-label="Ruta" class="text-xs text-ink-subtle"><a href="/">Inicio</a> › Servicios › ${esc(p.nombre)}</nav>
  <h1 class="mt-6 text-4xl">${esc(p.h1)}</h1>
  <p class="mt-4 text-ink-muted">${esc(p.intro)}</p>
  <p class="mt-6"><a class="btn btn-primary" href="/probar?servicio=${esc(p.clave)}">Mira gratis cómo quedaría</a></p>
  <ul class="mt-8">${p.beneficios.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
  <h2 class="mt-10 text-2xl">Qué puede incluir</h2>
  <ul class="mt-4">${p.incluye.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
  <h2 class="mt-10 text-2xl">Cómo funciona</h2>
  <ol class="mt-4">
    <li>Cuéntanos de tu negocio: respondes unas preguntas, casi todas con un clic.</li>
    <li>Mira cómo quedaría: en un minuto ves una primera versión con tu nombre y tus colores, gratis.</li>
    <li>Elige a tu ingeniero: te envía su propuesta con precio y plazo, y sigues el avance desde AIB+.</li>
  </ol>
  <p class="mt-4"><a href="/explorar?servicio=${esc(p.clave)}">Conoce a los ingenieros que lo construyen</a></p>
  <h2 class="mt-10 text-2xl">Preguntas frecuentes</h2>
  ${p.preguntas.map((q) => `<h3 class="mt-6 font-semibold">${esc(q.pregunta)}</h3>\n  <p class="mt-2 text-ink-muted">${esc(q.respuesta)}</p>`).join('\n  ')}
  <h2 class="mt-10 text-2xl">También hacemos</h2>
  <ul class="mt-4">${otras.map((o) => `<li><a href="/servicios/${esc(o.slug)}">${esc(o.nombre)}</a></li>`).join('')}</ul>
</main>`;
}

function datosEstructurados(p, url) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: p.nombre,
      serviceType: p.nombre,
      description: p.descripcion,
      url,
      areaServed: { '@type': 'Country', name: 'Perú' },
      provider: { '@type': 'Organization', name: 'AIB+', url: SITIO, logo: `${SITIO}/og.png` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: p.preguntas.map((q) => ({
        '@type': 'Question',
        name: q.pregunta,
        acceptedAnswer: { '@type': 'Answer', text: q.respuesta },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITIO}/` },
        { '@type': 'ListItem', position: 2, name: p.nombre, item: url },
      ],
    },
  ];
}

for (const p of paginas) {
  const url = `${SITIO}/servicios/${p.slug}`;
  let html = plantilla;
  html = reemplazar(html, /<title>[\s\S]*?<\/title>/, `<title>${esc(p.titulo)}</title>`);
  html = reemplazar(html, /<meta\s+name="description"[\s\S]*?\/>/, `<meta name="description" content="${esc(p.descripcion)}" />`);
  html = reemplazar(html, /<meta property="og:title"[\s\S]*?\/>/, `<meta property="og:title" content="${esc(p.titulo)}" />`);
  html = reemplazar(html, /<meta\s+property="og:description"[\s\S]*?\/>/, `<meta property="og:description" content="${esc(p.descripcion)}" />`);
  html = reemplazar(
    html,
    /<\/head>/,
    `    <link rel="canonical" href="${url}" />
    <meta property="og:url" content="${url}" />
${datosEstructurados(p, url).map((d) => `    <script type="application/ld+json">${jsonLd(d)}</script>`).join('\n')}
  </head>`
  );
  html = reemplazar(html, /<div id="root"><\/div>/, `<div id="root">${contenido(p)}</div>`);

  const carpeta = join(dist, 'servicios', p.slug);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, 'index.html'), html);
}
console.log(`[prerender] ${paginas.length} páginas de servicio`);

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
