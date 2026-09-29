// ---------------------------------------------------------------------------
// Edición en vivo de la maqueta
// ---------------------------------------------------------------------------
// El cliente toca un texto de su web y lo cambia ahí mismo, prueba otra
// paleta o pone sus propias fotos, sin volver a llamar a la IA: coste cero.
// Sirve igual para las maquetas de plantilla y para las generadas por IA,
// porque se edita la página ya montada.
//
// La maqueta sigue en su iframe aislado (sandbox sin allow-same-origin), así
// que la app no puede tocar su DOM. Mientras se edita se le inyecta un guion
// pequeño que marca los textos como editables y devuelve la página por
// postMessage. Lo que vuelve no se da por bueno: se limpia antes de guardar.
// ---------------------------------------------------------------------------

import { BOOTSTRAP_JS, estilosDeMarca, ID_PALETA } from './marca';
import { estilosDePaleta } from './plantillas';
import { PREFIJO_FOTOS } from './fotos';
import { obtenerPlantillaBase } from '../plantillas';
import type { Paleta } from './servicios';

/** Mensajes entre la app y el iframe. */
export const MENSAJE_EDICION = 'aib-edicion';
export const MENSAJE_PALETA = 'aib-paleta';
/** El cliente tocó un hueco de imagen: la app abre el selector de archivos. */
export const MENSAJE_PEDIR_FOTO = 'aib-pedir-foto';
/** La foto ya está subida: el iframe la coloca en su hueco. */
export const MENSAJE_PONER_FOTO = 'aib-poner-foto';

/** id del bloque <style> que acompaña a las fotos del cliente. */
const ID_FOTOS = 'fotos-cliente';

/**
 * Cómo se ve una foto dentro de su hueco. La foto entra como primer hijo y
 * ocupa todo el hueco; el icono de relleno que hubiera se oculta. En las
 * portadas con texto encima se aclara (velo claro) o se oscurece (velo
 * oscuro) para que el texto siga leyéndose.
 */
const CSS_FOTOS = `img[data-aib-foto-img]{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit}
[data-aib-con-foto]>svg,[data-aib-con-foto]~svg,[data-aib-con-foto]>i{display:none}
.marca-imagen{position:relative;overflow:hidden}
[data-aib-velo=claro]>img[data-aib-foto-img]{opacity:.45}
[data-aib-velo=oscuro]>img[data-aib-foto-img]{filter:brightness(.65)}`;

/**
 * CSS de colores para una paleta: el de la plantilla si la maqueta sale de
 * una, o el de Bootstrap si la escribió la IA.
 */
export function cssDePaleta(paleta: Paleta, plantillaBase?: string | null): string {
  const base = plantillaBase ? obtenerPlantillaBase(plantillaBase) : null;
  return base ? estilosDePaleta(base, paleta) : estilosDeMarca(paleta);
}

/**
 * Sustituye el bloque de colores del cliente. Las maquetas guardadas antes de
 * que existiera no lo tienen: se añade al final del <head>, y al ir detrás
 * pisa a los colores anteriores.
 */
export function aplicarPaleta(documento: string, css: string): string {
  const bloque = `<style id="${ID_PALETA}">${css}</style>`;
  const existente = new RegExp(`<style id="${ID_PALETA}">[\\s\\S]*?</style>`);
  if (existente.test(documento)) return documento.replace(existente, () => bloque);
  return documento.replace('</head>', () => `${bloque}\n</head>`);
}

/**
 * Guion que corre dentro del iframe mientras se edita.
 *
 * - Textos: solo los elementos con texto propio (títulos, párrafos, precios,
 *   botones), en modo solo texto: ni se pega HTML ni se rompe la estructura.
 * - Fotos: los huecos marcados con data-aib-foto (plantillas) y los
 *   .marca-imagen (maquetas de IA). Al tocarlos se avisa a la app, que es
 *   quien abre el selector de archivos y sube la foto.
 */
function guionEditor(origenApp: string, prefijoFotos: string): string {
  return `(() => {
  const ORIGEN = ${JSON.stringify(origenApp)};
  const PREFIJO_FOTOS = ${JSON.stringify(prefijoFotos)};
  const ICONOS = ['BR', 'I', 'SVG'];

  document.querySelectorAll('body *').forEach((el) => {
    if (el.closest('svg, script, style, noscript, [data-aib-editor]')) return;
    if (![...el.children].every((h) => ICONOS.includes(h.tagName.toUpperCase()))) return;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
    el.setAttribute('contenteditable', 'plaintext-only');
    el.setAttribute('data-aib-editable', '');
  });

  document.querySelectorAll('[data-aib-foto], .marca-imagen').forEach((el, i) => {
    el.setAttribute('data-aib-hueco', String(i));
  });

  const editable = (e) => e.target && e.target.closest && e.target.closest('[data-aib-editable]');

  // Siempre texto plano, aunque el navegador no conozca plaintext-only.
  document.addEventListener('paste', (e) => {
    if (!editable(e)) return;
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  document.addEventListener('drop', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && editable(e)) e.preventDefault();
  });

  document.addEventListener('click', (e) => {
    // Enlaces, botones y desplegables no navegan mientras se edita.
    if (e.target.closest && e.target.closest('a, button, summary')) e.preventDefault();
    if (editable(e)) return;
    // El hueco puede estar debajo de otras capas (degradados, textos encima).
    const hueco = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find((n) => n.hasAttribute && n.hasAttribute('data-aib-hueco'));
    if (!hueco) return;
    e.preventDefault();
    parent.postMessage({ tipo: '${MENSAJE_PEDIR_FOTO}', hueco: Number(hueco.getAttribute('data-aib-hueco')) }, ORIGEN);
  }, true);

  const enviar = () => {
    const copia = document.documentElement.cloneNode(true);
    copia.querySelectorAll('[data-aib-editor]').forEach((n) => n.remove());
    copia.querySelectorAll('[data-aib-editable]').forEach((n) => {
      n.removeAttribute('contenteditable');
      n.removeAttribute('data-aib-editable');
    });
    copia.querySelectorAll('[data-aib-hueco]').forEach((n) => n.removeAttribute('data-aib-hueco'));
    copia.querySelectorAll('details[open]').forEach((n) => n.removeAttribute('open'));
    parent.postMessage({ tipo: '${MENSAJE_EDICION}', html: '<!doctype html>\\n' + copia.outerHTML }, ORIGEN);
  };

  let espera;
  document.addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(enviar, 250);
  });

  const bloqueDeEstilos = (id) => {
    let estilo = document.getElementById(id);
    if (!estilo) {
      estilo = document.createElement('style');
      estilo.id = id;
      document.head.appendChild(estilo);
    }
    return estilo;
  };

  window.addEventListener('message', (e) => {
    if (e.source !== parent || !e.data) return;

    if (e.data.tipo === '${MENSAJE_PALETA}') {
      bloqueDeEstilos('${ID_PALETA}').textContent = String(e.data.css);
      enviar();
    }

    if (e.data.tipo === '${MENSAJE_PONER_FOTO}') {
      const url = String(e.data.url);
      const hueco = document.querySelector('[data-aib-hueco="' + Number(e.data.hueco) + '"]');
      if (!hueco || !url.startsWith(PREFIJO_FOTOS)) return;
      bloqueDeEstilos('${ID_FOTOS}').textContent = ${JSON.stringify(CSS_FOTOS)};
      let foto = hueco.querySelector(':scope > img[data-aib-foto-img]');
      if (!foto) {
        foto = document.createElement('img');
        foto.setAttribute('data-aib-foto-img', '');
        foto.alt = '';
        hueco.prepend(foto);
      }
      foto.src = url;
      hueco.setAttribute('data-aib-con-foto', '');
      enviar();
    }
  });
})();`;
}

// Solo contornos: un fondo taparía el color de los botones mientras se edita.
const ESTILOS_EDITOR = `[data-aib-editable]{outline:1px dashed rgba(59,130,246,.45);outline-offset:2px;cursor:text;border-radius:2px}
[data-aib-editable]:hover,[data-aib-editable]:focus{outline:2px solid #3b82f6}
[data-aib-hueco]{outline:2px dashed rgba(245,158,11,.9);outline-offset:-6px;cursor:pointer}`;

/** La maqueta con el editor dentro. Solo para mostrarla mientras se edita. */
export function documentoEditable(documento: string): string {
  const editor =
    `<style data-aib-editor>${ESTILOS_EDITOR}</style>\n` +
    `<script data-aib-editor>${guionEditor(window.location.origin, PREFIJO_FOTOS)}</script>\n`;
  return documento.includes('</body>')
    ? documento.replace('</body>', () => `${editor}</body>`)
    : documento + editor;
}

/**
 * Limpia la página editada antes de guardarla. No se confía en lo que devuelve
 * el iframe: se quita todo lo que pueda ejecutar código salvo el Bootstrap
 * que ya traían las maquetas de IA, las fotos que no vengan de nuestro
 * almacenamiento y los restos del editor.
 */
export function sanearDocumento(documento: string): string {
  const doc = new DOMParser().parseFromString(documento, 'text/html');

  doc.querySelectorAll('[data-aib-editor], iframe, object, embed, base, meta[http-equiv]').forEach((n) => n.remove());
  doc.querySelectorAll('script').forEach((s) => {
    if (s.getAttribute('src') !== BOOTSTRAP_JS || s.textContent?.trim()) s.remove();
  });
  doc.querySelectorAll('img[data-aib-foto-img]').forEach((img) => {
    if (!(img.getAttribute('src') ?? '').startsWith(PREFIJO_FOTOS)) img.remove();
  });

  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const nombre = attr.name.toLowerCase();
      const valor = attr.value.trim().toLowerCase();
      if (
        nombre.startsWith('on') ||
        nombre === 'contenteditable' ||
        nombre === 'data-aib-editable' ||
        nombre === 'data-aib-hueco'
      ) {
        el.removeAttribute(attr.name);
      } else if (['href', 'src', 'action', 'formaction', 'xlink:href'].includes(nombre) && valor.startsWith('javascript:')) {
        el.removeAttribute(attr.name);
      }
    }
  });

  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}
