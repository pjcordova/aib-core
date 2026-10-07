// ---------------------------------------------------------------------------
// Plantillas propias: el diseño que sube cada ingeniero
// ---------------------------------------------------------------------------
// El ingeniero sube un HTML (puede usar Bootstrap o sus propios estilos). Aquí
// se limpia y se convierte al mismo formato que las plantillas de la
// biblioteca, así que el cliente lo ve, lo personaliza y lo edita igual.
//
// Lo personalizable son unos huecos sencillos:
//   {{negocio}}       el nombre del negocio del cliente
//   {{{marca}}}       su logo (o su nombre si no subió logo)
//   {{descripcion}}   a qué se dedica, con sus palabras
//   {{anio}}          el año en curso
// y los colores, con las variables CSS --aib-primario, --aib-secundario y sus
// tonos (ver COLORES_PROPIA).
//
// La página se muestra siempre en un iframe aislado, pero aun así se le
// quitan los scripts y todo lo que podría ejecutar algo: es un diseño, no una
// aplicación.
// ---------------------------------------------------------------------------

import Mustache from 'mustache';
import type { CategoriaNegocio, PlantillaBase, RolColor } from './plantillas';

export type NivelPlantilla = 'basica' | 'elaborada' | 'premium';

export const NIVELES: { valor: NivelPlantilla; etiqueta: string; detalle: string }[] = [
  { valor: 'basica', etiqueta: 'Básica', detalle: 'Una web sencilla y clara, para empezar.' },
  { valor: 'elaborada', etiqueta: 'Elaborada', detalle: 'Más secciones y detalle de diseño.' },
  {
    valor: 'premium',
    etiqueta: 'Premium',
    detalle: 'No sale en la plataforma: solo la ve el cliente al que se la habilites en su invitación.',
  },
];

export const etiquetaNivel = (n: NivelPlantilla) => NIVELES.find((x) => x.valor === n)?.etiqueta ?? 'Básica';

/** Variables de color que la paleta del cliente sustituye. */
export const COLORES_PROPIA: Record<string, RolColor> = {
  '--aib-primario': 'primario',
  '--aib-primario-oscuro': 'primario-oscuro',
  '--aib-primario-texto': 'primario-texto',
  '--aib-secundario': 'secundario',
  '--aib-secundario-oscuro': 'secundario-oscuro',
  '--aib-secundario-suave': 'secundario-suave',
};

/** Lo que pesa como máximo (lo mismo que admite la base de datos). */
const MAX_HTML = 400_000;
const MAX_CSS = 200_000;
const MAX_FUENTES = 6;

export interface DisenoPropio {
  html: string;
  css: string;
  fuentes: string[];
}

/** Etiquetas que no tienen nada que hacer en un diseño. */
const PROHIBIDAS = 'script, noscript, iframe, frame, frameset, object, embed, applet, base, portal, meta[http-equiv]';

const URL_PELIGROSA = /^\s*(javascript|vbscript|data:text\/html)/i;

/** Quita lo que podría ejecutar algo en un fragmento ya parseado. */
function limpiarNodos(raiz: ParentNode) {
  raiz.querySelectorAll(PROHIBIDAS).forEach((el) => el.remove());
  raiz.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const nombre = attr.name.toLowerCase();
      if (nombre.startsWith('on')) el.removeAttribute(attr.name);
      else if (['href', 'src', 'action', 'formaction', 'xlink:href', 'srcset', 'poster'].includes(nombre)) {
        if (URL_PELIGROSA.test(attr.value)) el.removeAttribute(attr.name);
      }
    }
  });
}

/** Un <style> no puede cerrarse antes de tiempo ni traer comportamiento. */
function limpiarCss(css: string): string {
  return css
    .replace(/<\/?style/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/javascript:/gi, '');
}

function esHojaSegura(href: string): boolean {
  return /^https:\/\/[^\s<>"'()]+$/.test(href) && href.length <= 500;
}

/**
 * Convierte el HTML que subió el ingeniero en su diseño listo para guardar.
 * Acepta una página completa o solo el contenido del <body>.
 */
export function prepararDiseno(archivo: string): { diseno: DisenoPropio } | { error: string } {
  // Sin la marca de orden de bytes que dejan algunos editores al inicio.
  const texto = archivo.replace(/^\uFEFF/, '');
  if (!/<[a-z]/i.test(texto)) return { error: 'El archivo no parece una página HTML.' };

  const doc = new DOMParser().parseFromString(texto, 'text/html');
  limpiarNodos(doc);

  const fuentes: string[] = [];
  const estilos: string[] = [];

  doc.querySelectorAll('link').forEach((link) => {
    const rel = (link.getAttribute('rel') ?? '').toLowerCase();
    const href = link.getAttribute('href') ?? '';
    if (rel.includes('stylesheet') && esHojaSegura(href) && !fuentes.includes(href)) fuentes.push(href);
    link.remove();
  });
  doc.querySelectorAll('style').forEach((style) => {
    estilos.push(style.textContent ?? '');
    style.remove();
  });

  const html = doc.body.innerHTML.trim();
  const css = limpiarCss(estilos.join('\n'));

  if (html.length < 20) return { error: 'La página no tiene contenido en el <body>.' };
  if (new Blob([html]).size > MAX_HTML) return { error: 'La página pesa demasiado (máximo 400 KB sin imágenes incrustadas).' };
  if (new Blob([css]).size > MAX_CSS) return { error: 'Los estilos pesan demasiado (máximo 200 KB).' };
  if (fuentes.length > MAX_FUENTES) return { error: `Usa como máximo ${MAX_FUENTES} hojas de estilo externas.` };

  try {
    Mustache.parse(html);
  } catch {
    return {
      error: 'La página tiene llaves {{ }} que no son de AIB+. Usa solo {{negocio}}, {{{marca}}}, {{descripcion}} o {{anio}}.',
    };
  }

  return { diseno: { html, css, fuentes } };
}

/** Lo que el cliente aporta a una plantilla propia. */
export interface TextosPropia {
  descripcion: string;
}

export const TEXTOS_EJEMPLO: TextosPropia = {
  descripcion: 'Aquí va lo que hace el negocio, contado con las palabras del cliente.',
};

export interface FilaPropia {
  nombre: string;
  descripcion: string | null;
  categoria: CategoriaNegocio;
  estilo: string;
  etiquetas: string[];
  html?: string | null;
  css?: string | null;
  fuentes?: string[] | null;
  color_primario: string | null;
  color_secundario: string | null;
}

/**
 * La plantilla propia en el formato de las de la biblioteca. Se vuelve a
 * limpiar aquí: lo que llega de la base de datos no se da por bueno.
 */
export function basePropia(fila: FilaPropia): PlantillaBase {
  let html = '';
  if (fila.html) {
    const doc = new DOMParser().parseFromString(`<body>${fila.html}</body>`, 'text/html');
    limpiarNodos(doc);
    html = doc.body.innerHTML;
    try {
      Mustache.parse(html);
    } catch {
      // Llaves rotas: se enseña tal cual, sin huecos.
      html = html.replace(/{{/g, '{ {');
    }
  }

  return {
    id: 'propia',
    nombre: fila.nombre,
    descripcion: fila.descripcion ?? '',
    categoria: fila.categoria,
    estilo: fila.estilo,
    etiquetas: fila.etiquetas,
    // No se sabe qué secciones trae: no se promete ninguna.
    secciones: [],
    html,
    css: limpiarCss(fila.css ?? ''),
    fuentes: (fila.fuentes ?? []).filter(esHojaSegura),
    colores: COLORES_PROPIA,
    paletaOriginal: {
      primario: fila.color_primario ?? '#1a2d4d',
      secundario: fila.color_secundario ?? '#c4a26a',
    },
    ejemplo: TEXTOS_EJEMPLO,
    vista: (textos, contexto) => ({
      negocio: contexto.empresa,
      empresa: contexto.empresa,
      marca: contexto.marca,
      anio: contexto.anio,
      descripcion: (textos as Partial<TextosPropia> | null)?.descripcion ?? '',
    }),
  };
}

/** Solo los colores: para cambiar la paleta de una maqueta ya guardada. */
export const BASE_COLORES_PROPIA = { id: 'propia', colores: COLORES_PROPIA, secciones: [] } as unknown as PlantillaBase;

/** Página de ejemplo para descargar desde el panel, con todos los huecos. */
export const EJEMPLO_PLANTILLA = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{negocio}}</title>
<!-- Puedes usar Bootstrap u otra hoja externa por https. -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
<style>
  /* Tus colores por defecto. AIB+ los cambia por los del cliente. */
  :root {
    --aib-primario: #1a2d4d;
    --aib-primario-oscuro: #0e1a2b;
    --aib-secundario: #c4a26a;
    --aib-secundario-suave: #f3ead9;
  }
  .portada { background: var(--aib-primario); color: #fff; padding: 96px 0; }
  .btn-marca { background: var(--aib-secundario); color: #0e1a2b; border: 0; }
  .franja { background: var(--aib-secundario-suave); }
</style>
</head>
<body>
  <nav class="navbar bg-white border-bottom">
    <div class="container">
      <span class="navbar-brand fw-bold">{{{marca}}}</span>
      <a class="btn btn-marca" href="#contacto">Contáctanos</a>
    </div>
  </nav>

  <header class="portada">
    <div class="container">
      <h1 class="display-4 fw-bold">{{negocio}}</h1>
      <p class="lead">{{descripcion}}</p>
      <a class="btn btn-marca btn-lg mt-3" href="#contacto">Escríbenos por WhatsApp</a>
    </div>
  </header>

  <section class="py-5">
    <div class="container">
      <h2 class="mb-4">Lo que hacemos</h2>
      <div class="row g-4">
        <div class="col-md-4"><h3 class="h5">Servicio uno</h3><p>Describe aquí un servicio del negocio.</p></div>
        <div class="col-md-4"><h3 class="h5">Servicio dos</h3><p>Describe aquí otro servicio.</p></div>
        <div class="col-md-4"><h3 class="h5">Servicio tres</h3><p>Y uno más.</p></div>
      </div>
    </div>
  </section>

  <!-- Un hueco para foto: el cliente puede tocarlo y subir la suya. -->
  <section class="franja py-5">
    <div class="container">
      <div data-aib-foto style="position:relative;height:280px;border-radius:16px;background:#e9e4d8"></div>
    </div>
  </section>

  <footer id="contacto" class="py-4 text-center">
    <p class="mb-0">© {{anio}} {{negocio}}</p>
  </footer>
</body>
</html>
`;
