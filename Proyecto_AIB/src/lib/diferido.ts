// ---------------------------------------------------------------------------
// Componentes que se descargan aparte
// ---------------------------------------------------------------------------
// Cada página baja solo su código: quien entra a /rubros/restaurantes desde
// Google no baja el cuestionario ni el panel. `precargar()` baja una antes de
// mostrarla; main.tsx lo hace con la página de entrada, así el HTML
// prerenderizado pasa directo a la página, sin un «Cargando…» en medio.
// ---------------------------------------------------------------------------

import { createElement, lazy, useState, type ComponentType } from 'react';

export interface Diferido<P extends object> {
  (props: P): ReturnType<typeof createElement>;
  /** La baja (una sola vez). Si falla, se puede volver a intentar. */
  precargar: () => Promise<ComponentType<P>>;
}

export function diferido<P extends object>(cargar: () => Promise<ComponentType<P>>): Diferido<P> {
  let listo: ComponentType<P> | null = null;
  let bajando: Promise<ComponentType<P>> | null = null;

  const precargar = () =>
    (bajando ??= cargar().then(
      (componente) => (listo = componente),
      (error: unknown) => {
        bajando = null;
        throw error;
      }
    ));
  const Perezoso = lazy(() => precargar().then((componente) => ({ default: componente })));

  function Componente(props: P) {
    // Se decide al montarse y no cambia: si ya estaba bajado, se muestra
    // directo; si no, pasa por Suspense. Cambiar de uno a otro después
    // remontaría la página y perdería su estado.
    const [Tipo] = useState<ComponentType<P>>(() => listo ?? (Perezoso as unknown as ComponentType<P>));
    return createElement(Tipo, props);
  }
  return Object.assign(Componente, { precargar });
}
