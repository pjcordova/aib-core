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
  /**
   * Se puede recorrer: desplazarse por la página y tocar sus enlaces internos,
   * como en los mockups de la portada. Si no, es una imagen fija.
   */
  interactiva?: boolean;
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

/** Sin barra de desplazamiento: dentro de un celular o una ventana pequeña estorba. */
const SIN_BARRA = 'html{scrollbar-width:none}html::-webkit-scrollbar{display:none}';

/**
 * Sin animaciones de entrada: en la página real lucen, pero en una miniatura
 * el contenido arranca invisible y, dentro de una caja reducida, a veces no
 * llegaba a aparecer al desplazarse. Así se ve siempre todo.
 */
const SIN_ANIMACIONES = '*,*::before,*::after{animation:none!important}';

function paraMiniatura(documento: string): string {
  const estilo = `<style>${SIN_BARRA}${SIN_ANIMACIONES}</style>`;
  const pagina = sinEsperarFuentes(documento);
  return pagina.includes('</head>') ? pagina.replace('</head>', `${estilo}</head>`) : estilo + pagina;
}

/**
 * Miniatura en vivo de una página: la pinta a tamaño de escritorio en un
 * iframe y la reduce hasta caber en su tarjeta. No hace falta guardar capturas:
 * si la plantilla cambia, la miniatura cambia con ella.
 */
export function MiniVista({
  documento,
  titulo,
  anchoPagina = 1280,
  alto = 200,
  inmediata = false,
  interactiva = false,
}: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.25);
  const pagina = useMemo(() => paraMiniatura(documento), [documento]);

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
        {...(interactiva ? {} : { tabIndex: -1, 'aria-hidden': true })}
        className={
          'absolute top-0 left-0 origin-top-left border-0 ' + (interactiva ? '' : 'pointer-events-none')
        }
        style={{
          width: anchoPagina,
          height: alto / escala,
          transform: `scale(${escala})`,
        }}
      />
    </div>
  );
}
