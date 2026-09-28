import { useEffect, useRef, useState } from 'react';

interface Props {
  documento: string;
  titulo: string;
  /** Ancho al que se "pinta" la página antes de reducirla. */
  anchoPagina?: number;
  /** Alto de la miniatura en píxeles. */
  alto?: number;
}

/**
 * Miniatura en vivo de una página: la pinta a tamaño de escritorio en un
 * iframe y la reduce hasta caber en su tarjeta. No hace falta guardar capturas:
 * si la plantilla cambia, la miniatura cambia con ella.
 */
export function MiniVista({ documento, titulo, anchoPagina = 1280, alto = 200 }: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.25);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setEscala(el.clientWidth / anchoPagina);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [anchoPagina]);

  return (
    <div ref={caja} className="relative overflow-hidden bg-white" style={{ height: alto }}>
      <iframe
        title={titulo}
        srcDoc={documento}
        sandbox="allow-scripts"
        loading="lazy"
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
        style={{
          width: anchoPagina,
          height: alto / escala,
          transform: `scale(${escala})`,
        }}
      />
    </div>
  );
}
