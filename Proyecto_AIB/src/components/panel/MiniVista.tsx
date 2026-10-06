import { useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  documento: string;
  titulo: string;
  /** Ancho al que se "pinta" la página antes de reducirla. */
  anchoPagina?: number;
  /** Alto de la miniatura en píxeles. */
  alto?: number;
  /**
   * Cargarla ya, sin esperar a que el navegador decida que está a la vista.
   * Para las que se ven nada más llegar (portada, diseños a elegir): algunos
   * navegadores de celular no llegaban a cargar las diferidas dentro de una
   * caja reducida, y se quedaban en blanco.
   */
  inmediata?: boolean;
}

/**
 * Las fuentes de Google no frenan el dibujo de la miniatura: se pinta con la
 * letra del sistema y cambia a la suya al llegar. Antes, con una conexión
 * lenta, la miniatura se quedaba en blanco hasta que llegaban.
 */
function sinEsperarFuentes(documento: string): string {
  return documento.replace(
    /<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/[^"]+)">/g,
    `<link rel="stylesheet" href="$1" media="print" onload="this.media='all'">`
  );
}

/**
 * Miniatura en vivo de una página: la pinta a tamaño de escritorio en un
 * iframe y la reduce hasta caber en su tarjeta. No hace falta guardar capturas:
 * si la plantilla cambia, la miniatura cambia con ella.
 */
export function MiniVista({ documento, titulo, anchoPagina = 1280, alto = 200, inmediata = false }: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.25);
  const pagina = useMemo(() => sinEsperarFuentes(documento), [documento]);

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
        srcDoc={pagina}
        sandbox="allow-scripts"
        loading={inmediata ? 'eager' : 'lazy'}
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
