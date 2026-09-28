// ---------------------------------------------------------------------------
// Marca del cliente: logo, colores y montaje de la maqueta web
// ---------------------------------------------------------------------------
// La IA solo escribe el cuerpo de la página. Todo lo demás se pone aquí, sin
// gastar tokens: la cabecera con Bootstrap, los colores de la marca, el logo y
// la limpieza de seguridad. Así el modelo escribe menos y el resultado es
// siempre coherente.
// ---------------------------------------------------------------------------

import type { FichaWeb, Paleta } from './servicios';

/** Versiones fijadas: una maqueta no debe cambiar porque salga Bootstrap 6. */
const BOOTSTRAP_CSS = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css';
const BOOTSTRAP_JS = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js';
const BOOTSTRAP_ICONS =
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css';

/** Marcador que la IA pone donde va la marca; aquí se sustituye por logo o nombre. */
export const MARCADOR_MARCA = '{{MARCA}}';

/* -------------------------------------------------------------------------- */
/* Logo                                                                       */
/* -------------------------------------------------------------------------- */

const FORMATOS_LOGO = ['image/png', 'image/jpeg', 'image/webp'];
const PESO_MAXIMO = 3 * 1024 * 1024;
const LADO_MAXIMO = 320;

/**
 * Reduce el logo en el navegador y lo devuelve como data URI.
 *
 * Pasarlo por un canvas cumple dos funciones: lo deja en un tamaño que cabe
 * dentro del proyecto sin montar almacenamiento de archivos, y lo re-codifica,
 * con lo que cualquier cosa rara que viniera en el archivo original se pierde.
 */
export async function prepararLogo(archivo: File): Promise<string> {
  if (!FORMATOS_LOGO.includes(archivo.type)) {
    throw new Error('Sube el logo en PNG, JPG o WEBP.');
  }
  if (archivo.size > PESO_MAXIMO) {
    throw new Error('El logo pesa demasiado. Prueba con uno de menos de 3 MB.');
  }

  const imagen = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
  const ancho = Math.max(1, Math.round(imagen.width * escala));
  const alto = Math.max(1, Math.round(imagen.height * escala));

  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no pudo procesar la imagen.');
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  imagen.close();

  // WEBP conserva la transparencia y pesa bastante menos que PNG.
  return canvas.toDataURL('image/webp', 0.9);
}

/**
 * Saca los dos colores dominantes del logo, ignorando el fondo transparente y
 * los casi blancos o casi negros, que casi nunca son "el color de la marca".
 */
export async function coloresDelLogo(dataUri: string): Promise<Paleta | null> {
  const img = new Image();
  img.src = dataUri;
  await img.decode();

  const lado = 48;
  const canvas = document.createElement('canvas');
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, lado, lado);

  const { data } = ctx.getImageData(0, 0, lado, lado);
  const cubos = new Map<string, { r: number; g: number; b: number; n: number }>();

  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 128) continue;
    const luz = (r + g + b) / 3;
    if (luz > 235 || luz < 20) continue;

    // Agrupamos colores parecidos para que un degradado no cuente como cien.
    const clave = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const cubo = cubos.get(clave) ?? { r: 0, g: 0, b: 0, n: 0 };
    cubo.r += r;
    cubo.g += g;
    cubo.b += b;
    cubo.n += 1;
    cubos.set(clave, cubo);
  }

  const ordenados = [...cubos.values()]
    .sort((x, y) => y.n - x.n)
    .map((c) => [c.r / c.n, c.g / c.n, c.b / c.n] as const);

  if (ordenados.length === 0) return null;

  const primario = ordenados[0];
  // El secundario tiene que distinguirse del primario; si no, no aporta nada.
  const secundario =
    ordenados.find(
      (c) => Math.hypot(c[0] - primario[0], c[1] - primario[1], c[2] - primario[2]) > 80
    ) ?? null;

  return {
    id: 'logo',
    nombre: 'Colores de tu logo',
    primario: aHex(primario),
    secundario: secundario ? aHex(secundario) : '#f59e0b',
  };
}

/* -------------------------------------------------------------------------- */
/* Documento                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Monta la página completa a partir del cuerpo que escribió la IA.
 *
 * El resultado se muestra en un iframe con sandbox y sin `allow-same-origin`,
 * así que aunque algo se colara no podría leer la sesión del usuario. La
 * limpieza de aquí es la segunda capa: el cuerpo no debería traer scripts, y
 * si los trae se quitan antes de pintarlo.
 */
export function construirDocumento(cuerpo: string, ficha: FichaWeb): string {
  const limpio = sanearCuerpo(cuerpo).replaceAll(MARCADOR_MARCA, marcaHtml(ficha));

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(ficha.empresa)}</title>
<link rel="stylesheet" href="${BOOTSTRAP_CSS}">
<link rel="stylesheet" href="${BOOTSTRAP_ICONS}">
<style>${estilosDeMarca(ficha.paleta)}</style>
</head>
<body>
${limpio}
<script src="${BOOTSTRAP_JS}"></script>
</body>
</html>`;
}

/** Quita todo lo que pueda ejecutar código: scripts, manejadores y `javascript:`. */
function sanearCuerpo(html: string): string {
  const plantilla = document.createElement('template');
  plantilla.innerHTML = html;
  const raiz = plantilla.content;

  raiz.querySelectorAll('script, iframe, object, embed, base, meta, link').forEach((n) => n.remove());

  raiz.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const nombre = attr.name.toLowerCase();
      const valor = attr.value.trim().toLowerCase();
      if (nombre.startsWith('on')) el.removeAttribute(attr.name);
      else if (['href', 'src', 'action', 'formaction'].includes(nombre) && valor.startsWith('javascript:')) {
        el.removeAttribute(attr.name);
      }
    }
  });

  const contenedor = document.createElement('div');
  contenedor.appendChild(raiz.cloneNode(true));
  return contenedor.innerHTML;
}

function marcaHtml(ficha: FichaWeb): string {
  const nombre = escapar(ficha.empresa);
  return ficha.logo
    ? `<img src="${ficha.logo}" alt="${nombre}" class="marca-logo">`
    : `<span class="marca-nombre">${nombre}</span>`;
}

/**
 * Traduce la paleta a variables de Bootstrap. Así la IA usa `btn-primary` o
 * `bg-primary` sin escribir un solo color, y la web sale con los de la marca.
 */
function estilosDeMarca(p: Paleta): string {
  const oscuro = ajustar(p.primario, -0.18);
  const sobrePrimario = textoLegible(p.primario);
  const sobreSecundario = textoLegible(p.secundario);
  // Un acento claro (un amarillo, un rosa pastel) sirve de fondo pero no se lee
  // como texto sobre blanco. Para texto se usa una versión oscurecida.
  const textoSecundario = sobreSecundario === '#111827' ? ajustar(p.secundario, -0.45) : p.secundario;

  return `
:root{
  --marca-primario:${p.primario};--marca-secundario:${p.secundario};
  --bs-primary:${p.primario};--bs-primary-rgb:${aRgb(p.primario)};
  --bs-link-color:${p.primario};--bs-link-color-rgb:${aRgb(p.primario)};
  --bs-link-hover-color:${oscuro};
}
.btn-primary{--bs-btn-bg:${p.primario};--bs-btn-border-color:${p.primario};--bs-btn-color:${sobrePrimario};
  --bs-btn-hover-bg:${oscuro};--bs-btn-hover-border-color:${oscuro};--bs-btn-hover-color:${sobrePrimario};
  --bs-btn-active-bg:${oscuro};--bs-btn-active-border-color:${oscuro};--bs-btn-active-color:${sobrePrimario}}
.btn-outline-primary{--bs-btn-color:${p.primario};--bs-btn-border-color:${p.primario};
  --bs-btn-hover-bg:${p.primario};--bs-btn-hover-border-color:${p.primario};--bs-btn-hover-color:${sobrePrimario};
  --bs-btn-active-bg:${p.primario};--bs-btn-active-border-color:${p.primario}}
.bg-primary{color:${sobrePrimario}}
.navbar.bg-primary{${varsNavbar(sobrePrimario)}}
.navbar.bg-dark{${varsNavbar('#ffffff')}}
.bg-marca-secundario{background-color:${p.secundario}!important;color:${sobreSecundario}}
.text-marca-secundario{color:${textoSecundario}!important}
/* Guardas de contraste. El modelo a veces pone texto del color de la marca
   sobre un fondo de ese mismo color, y el texto desaparece. En vez de confiar
   en que no lo haga, estas reglas lo vuelven legible siempre. */
.bg-marca-secundario .text-marca-secundario,.bg-marca-secundario.text-marca-secundario{color:${sobreSecundario}!important}
.bg-primary .text-primary,.bg-primary.text-primary{color:${sobrePrimario}!important}
.bg-primary .btn-primary{--bs-btn-bg:${sobrePrimario};--bs-btn-border-color:${sobrePrimario};--bs-btn-color:${p.primario};
  --bs-btn-hover-bg:${sobrePrimario};--bs-btn-hover-border-color:${sobrePrimario};--bs-btn-hover-color:${oscuro}}
.bg-primary .btn-outline-primary{--bs-btn-color:${sobrePrimario};--bs-btn-border-color:${sobrePrimario};
  --bs-btn-hover-bg:${sobrePrimario};--bs-btn-hover-color:${p.primario}}
.icono-xl{font-size:6rem;line-height:1}
.icono-lg{font-size:2.75rem;line-height:1}
.marca-logo{max-height:44px;width:auto}
.marca-nombre{font-weight:700;font-size:1.25rem;letter-spacing:-.01em}
.marca-imagen{display:flex;align-items:center;justify-content:center;min-height:200px;
  border-radius:.75rem;background:linear-gradient(135deg,${p.primario}22,${p.secundario}33);
  color:${p.primario};font-size:3rem}
html{scroll-behavior:smooth}
section{scroll-margin-top:72px}
`;
}

/**
 * Colores de una barra de navegación según su fondo. Bootstrap pinta por
 * defecto el icono de hamburguesa oscuro, que sobre una barra de color casi no
 * se ve; y el modelo no siempre añade la variante clara. Aquí se corrige solo.
 */
function varsNavbar(texto: string): string {
  const claro = texto === '#ffffff';
  const trazo = claro ? 'rgba%28255,255,255,0.9%29' : 'rgba%2817,24,39,0.85%29';
  const icono =
    `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3e` +
    `%3cpath stroke='${trazo}' stroke-linecap='round' stroke-miterlimit='10' stroke-width='2' ` +
    `d='M4 7h22M4 15h22M4 23h22'/%3e%3c/svg%3e")`;
  const suave = claro ? 'rgba(255,255,255,.85)' : 'rgba(17,24,39,.8)';
  return (
    `--bs-navbar-color:${suave};--bs-navbar-hover-color:${texto};--bs-navbar-active-color:${texto};` +
    `--bs-navbar-brand-color:${texto};--bs-navbar-brand-hover-color:${texto};` +
    `--bs-navbar-toggler-border-color:${claro ? 'rgba(255,255,255,.35)' : 'rgba(17,24,39,.25)'};` +
    `--bs-navbar-toggler-icon-bg:${icono}`
  );
}

/* -------------------------------------------------------------------------- */
/* Utilidades de color                                                        */
/* -------------------------------------------------------------------------- */

function aHex([r, g, b]: readonly [number, number, number]): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function deHex(hex: string): [number, number, number] {
  const limpio = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(limpio.slice(i, i + 2), 16)) as [number, number, number];
}

function aRgb(hex: string): string {
  return deHex(hex).join(',');
}

/** Oscurece (negativo) o aclara (positivo) un color. */
export function ajustar(hex: string, cantidad: number): string {
  const [r, g, b] = deHex(hex);
  const f = (v: number) =>
    cantidad < 0 ? v * (1 + cantidad) : v + (255 - v) * cantidad;
  return aHex([f(r), f(g), f(b)]);
}

/** Blanco o casi negro, el que se lea mejor sobre ese fondo. */
export function textoLegible(hex: string): string {
  const [r, g, b] = deHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminancia > 0.45 ? '#111827' : '#ffffff';
}

export function escapar(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
