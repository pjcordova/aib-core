// ---------------------------------------------------------------------------
// Animaciones de las maquetas
// ---------------------------------------------------------------------------
// Un cliente real pidió ver su web «con animaciones». Son solo CSS porque la
// maqueta pública se muestra sin scripts (lib/compartir.ts), y sirven igual en
// la web que se le entrega:
//   - la portada entra al cargar: título, textos y botones en cascada, y la
//     foto con un acercamiento suave;
//   - al bajar, títulos, tarjetas y fotos aparecen con algo de profundidad
//     (animation-timeline: view()). El navegador que no lo soporta muestra la
//     página tal cual, sin animar.
// Quien pidió a su teléfono menos movimiento (prefers-reduced-motion) no ve
// ninguna. Las plantillas marcan su portada con aria-label="Portada" y sus
// fotos con data-aib-foto; con eso basta para todas, sin tocar cada una.
// Solo se anima `transform` y `opacity` desde un estado inicial: el final es
// el que ya tenía cada elemento, así que no pisa los estilos de la plantilla.
// ---------------------------------------------------------------------------

export const ANIMACIONES_CSS = `
@keyframes aib-entrar{from{opacity:0;transform:translateY(18px)}}
@keyframes aib-acercar{from{opacity:0;transform:scale(1.06)}}
@keyframes aib-aparecer{from{opacity:0;transform:perspective(900px) translateY(36px) rotateX(14deg)}}
@keyframes aib-subir{from{opacity:0;transform:translateY(28px) scale(.97)}}
@media (prefers-reduced-motion:no-preference){
[aria-label="Portada"] h1{animation:aib-entrar .7s cubic-bezier(.2,.7,.2,1) .05s both}
[aria-label="Portada"] p{animation:aib-entrar .7s cubic-bezier(.2,.7,.2,1) .2s both}
[aria-label="Portada"] a{animation:aib-entrar .7s cubic-bezier(.2,.7,.2,1) .35s both}
[aria-label="Portada"] [data-aib-foto]{animation:aib-acercar 1.1s cubic-bezier(.2,.7,.2,1) both}
@supports (animation-timeline:view()){
main section:not([aria-label="Portada"]) :is(h2,h2 + p){animation:aib-aparecer linear both;animation-timeline:view();animation-range:entry 0% cover 30%}
main section:not([aria-label="Portada"]) :is(li,figure,blockquote,details,[class~="grid"] > *){animation:aib-subir linear both;animation-timeline:view();animation-range:entry 0% cover 30%}
main section:not([aria-label="Portada"]) [data-aib-foto]{animation:aib-acercar linear both;animation-timeline:view();animation-range:entry 0% cover 40%}
}
}`;

const MARCA = 'id="aib-animaciones"';

/**
 * Añade las animaciones a una maqueta de plantilla que aún no las tiene: así
 * las ven también las que se guardaron antes. Las maquetas libres de la IA
 * (otra estructura) y cualquier otro documento se devuelven tal cual.
 */
export function conAnimaciones(documento: string): string {
  if (documento.includes(MARCA) || !documento.includes('aria-label="Portada"') || !documento.includes('</head>')) {
    return documento;
  }
  return documento.replace('</head>', `<style ${MARCA}>${ANIMACIONES_CSS}</style>\n</head>`);
}
