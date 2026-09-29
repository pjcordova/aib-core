// ---------------------------------------------------------------------------
// Edición en vivo de la maqueta
// ---------------------------------------------------------------------------
// El cliente toca un texto de su web y lo cambia ahí mismo, o prueba otra
// paleta, sin volver a llamar a la IA: coste cero. Sirve igual para las
// maquetas de plantilla y para las generadas por IA, porque se edita la página
// ya montada.
//
// La maqueta sigue en su iframe aislado (sandbox sin allow-same-origin), así
// que la app no puede tocar su DOM. Mientras se edita se le inyecta un guion
// pequeño que marca los textos como editables y devuelve la página por
// postMessage. Lo que vuelve no se da por bueno: se limpia antes de guardar.
// ---------------------------------------------------------------------------

import { BOOTSTRAP_JS, estilosDeMarca, ID_PALETA } from './marca';
import { estilosDePaleta } from './plantillas';
import { obtenerPlantillaBase } from '../plantillas';
import type { Paleta } from './servicios';

/** Mensajes entre la app y el iframe. */
export const MENSAJE_EDICION = 'aib-edicion';
export const MENSAJE_PALETA = 'aib-paleta';

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
 * Guion que corre dentro del iframe mientras se edita. Solo se vuelven
 * editables los elementos con texto propio (títulos, párrafos, precios,
 * botones), en modo solo texto: ni se pega HTML ni se rompe la estructura.
 */
function guionEditor(origenApp: string): string {
  return `(() => {
  const ICONOS = ['BR', 'I', 'SVG'];
  document.querySelectorAll('body *').forEach((el) => {
    if (el.closest('svg, script, style, noscript, [data-aib-editor]')) return;
    if (![...el.children].every((h) => ICONOS.includes(h.tagName.toUpperCase()))) return;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
    el.setAttribute('contenteditable', 'plaintext-only');
    el.setAttribute('data-aib-editable', '');
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
  // Enlaces, botones y desplegables no navegan mientras se edita.
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('a, button, summary')) e.preventDefault();
  }, true);

  const enviar = () => {
    const copia = document.documentElement.cloneNode(true);
    copia.querySelectorAll('[data-aib-editor]').forEach((n) => n.remove());
    copia.querySelectorAll('[data-aib-editable]').forEach((n) => {
      n.removeAttribute('contenteditable');
      n.removeAttribute('data-aib-editable');
    });
    copia.querySelectorAll('details[open]').forEach((n) => n.removeAttribute('open'));
    parent.postMessage({ tipo: '${MENSAJE_EDICION}', html: '<!doctype html>\\n' + copia.outerHTML }, ${JSON.stringify(origenApp)});
  };

  let espera;
  document.addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(enviar, 250);
  });

  window.addEventListener('message', (e) => {
    if (e.source !== parent || !e.data || e.data.tipo !== '${MENSAJE_PALETA}') return;
    let estilo = document.getElementById('${ID_PALETA}');
    if (!estilo) {
      estilo = document.createElement('style');
      estilo.id = '${ID_PALETA}';
      document.head.appendChild(estilo);
    }
    estilo.textContent = String(e.data.css);
  });
})();`;
}

// Solo contornos: un fondo taparía el color de los botones mientras se edita.
const ESTILOS_EDITOR = `[data-aib-editable]{outline:1px dashed rgba(59,130,246,.45);outline-offset:2px;cursor:text;border-radius:2px}
[data-aib-editable]:hover,[data-aib-editable]:focus{outline:2px solid #3b82f6}`;

/** La maqueta con el editor dentro. Solo para mostrarla mientras se edita. */
export function documentoEditable(documento: string): string {
  const editor =
    `<style data-aib-editor>${ESTILOS_EDITOR}</style>\n` +
    `<script data-aib-editor>${guionEditor(window.location.origin)}</script>\n`;
  return documento.includes('</body>')
    ? documento.replace('</body>', () => `${editor}</body>`)
    : documento + editor;
}

/**
 * Limpia la página editada antes de guardarla. No se confía en lo que devuelve
 * el iframe: se quita todo lo que pueda ejecutar código salvo el Bootstrap
 * que ya traían las maquetas de IA, y los restos del editor.
 */
export function sanearDocumento(documento: string): string {
  const doc = new DOMParser().parseFromString(documento, 'text/html');

  doc.querySelectorAll('[data-aib-editor], iframe, object, embed, base, meta[http-equiv]').forEach((n) => n.remove());
  doc.querySelectorAll('script').forEach((s) => {
    if (s.getAttribute('src') !== BOOTSTRAP_JS || s.textContent?.trim()) s.remove();
  });

  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const nombre = attr.name.toLowerCase();
      const valor = attr.value.trim().toLowerCase();
      if (nombre.startsWith('on') || nombre === 'contenteditable' || nombre === 'data-aib-editable') {
        el.removeAttribute(attr.name);
      } else if (['href', 'src', 'action', 'formaction', 'xlink:href'].includes(nombre) && valor.startsWith('javascript:')) {
        el.removeAttribute(attr.name);
      }
    }
  });

  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}
