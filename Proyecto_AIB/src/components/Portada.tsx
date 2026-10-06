// ---------------------------------------------------------------------------
// Portada pública
// ---------------------------------------------------------------------------
// Lo primero que ve un dueño de negocio que llega a AIB+ sin invitación. La
// idea es la de un marketplace: AIB+ le enseña en un minuto cómo quedaría su
// web y un ingeniero la construye. Todo lo que promete aquí existe en la app,
// y los ejemplos son las plantillas reales con sus textos de muestra.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wordmark } from './ui/Primitives';
import { MiniVista } from './panel/MiniVista';
import { PLANTILLAS_BASE } from '../plantillas';
import { renderizarPlantilla, type PlantillaBase } from '../lib/plantillas';
import { canalDeLaVisita, registrarVisitaPortada } from '../lib/medicionPortada';
import { ingenierosDisponibles, type IngenieroPublico } from '../lib/ingenieros';
import { TarjetaIngeniero } from './ingenieros/TarjetaIngeniero';
import { PiePagina } from './ui/PiePagina';

type Acceso = 'login' | 'registro';

/** Negocios inventados para enseñar cada diseño: son ejemplos, no clientes. */
const EJEMPLOS: { id: string; rubro: string; negocio: string }[] = [
  { id: 'restaurante', rubro: 'Restaurante', negocio: 'Sazón de la Casa' },
  { id: 'moda-boutique', rubro: 'Tienda de ropa', negocio: 'Alma Boutique' },
  { id: 'salud-belleza', rubro: 'Salud y belleza', negocio: 'Spa Armonía' },
  { id: 'consultora', rubro: 'Consultora', negocio: 'Norte Consultores' },
  { id: 'institucional', rubro: 'Institución u ONG', negocio: 'Asociación Las Flores' },
];

const PASOS = [
  {
    titulo: 'Cuéntanos de tu negocio',
    texto: 'Nombre, rubro, para qué quieres la web y tus colores. Casi todo con un clic.',
  },
  {
    titulo: 'Mira tu web en un minuto',
    texto: 'Elige el diseño que más te guste y míralo con tu nombre. Cambia textos y colores, y pon tus fotos.',
  },
  {
    titulo: 'Elige a tu ingeniero',
    texto: 'Si te gusta, eliges quién la construye por su perfil y sus reseñas. Te contacta con una propuesta.',
  },
];

const INCLUYE = [
  'Tu nombre, tu logo y tus colores',
  'Botón de WhatsApp para que tus clientes te escriban',
  'Se ve bien en el celular',
  'Tus propias fotos',
  'Un enlace para mostrársela a tu socio o tu familia',
];

const PREGUNTAS = [
  {
    pregunta: '¿Cuánto cuesta?',
    respuesta:
      'Ver tu web es gratis. Si quieres que un ingeniero la construya, te envía una propuesta con el precio según lo que necesites. No pagas nada por verla ni por recibir la propuesta.',
  },
  {
    pregunta: '¿Necesito saber de tecnología?',
    respuesta: 'No. Casi todas las preguntas se responden con un clic, y el ingeniero se encarga de la parte técnica.',
  },
  {
    pregunta: '¿Tengo que crear una cuenta?',
    respuesta: 'No. Pulsas «Pruébalo gratis» y empiezas. Si vuelves desde el mismo navegador, tu web te estará esperando.',
  },
  {
    pregunta: '¿Puedo cambiar lo que no me guste?',
    respuesta: 'Sí. Ahí mismo cambias los textos y los colores, pones tus fotos o pruebas otro diseño.',
  },
  {
    pregunta: '¿Quién construye mi web?',
    respuesta:
      'Tú lo eliges entre los ingenieros de AIB+: ves su perfil, los rubros con los que trabajan y lo que opinan sus clientes. Al terminar, tú también puedes calificar a tu ingeniero.',
  },
  {
    pregunta: '¿Qué pasa cuando digo «Me gusta, sigamos»?',
    respuesta:
      'Eliges a tu ingeniero y dejas tu nombre y tu WhatsApp. Le llega tu proyecto con todo lo que respondiste, te contacta con una propuesta y puedes seguir el avance desde la app.',
  },
  {
    pregunta: '¿Puedo enseñársela a alguien antes de decidir?',
    respuesta: 'Sí. Con «Compartir» creas un enlace para que la vean tu socio, tu familia o quien quieras.',
  },
];

/** La página de muestra de un diseño, con un negocio de ejemplo y sus colores. */
function documentoDeEjemplo(id: string): string | null {
  const base = PLANTILLAS_BASE.find((p) => p.id === id) as PlantillaBase | undefined;
  const ejemplo = EJEMPLOS.find((e) => e.id === id);
  if (!base || !ejemplo) return null;
  return renderizarPlantilla(base, base.ejemplo, {
    empresa: ejemplo.negocio,
    logo: null,
    paleta: base.paletaOriginal,
  });
}

export function Portada({
  onAcceso,
  continuar,
}: {
  onAcceso: (modo: Acceso) => void;
  /** Quien ya tiene una prueba o una invitación abierta: vuelve a su web. */
  continuar?: () => void;
}) {
  const navigate = useNavigate();
  // Sin cuenta: /probar abre una sesión de prueba y lleva al cuestionario.
  // Con una prueba ya abierta, se sigue con esa.
  const probar = () => (continuar ? continuar() : navigate('/probar'));
  const medir = !continuar;

  // Medición del marketplace: la visita y su canal (?c=), sin datos personales.
  // Quien vuelve desde su prueba ya contó al llegar.
  useEffect(() => {
    if (!medir) return;
    canalDeLaVisita();
    registrarVisitaPortada();
  }, [medir]);

  // En el celular, el botón queda fijo abajo en cuanto el de la portada se
  // pierde de vista.
  const botonPortada = useRef<HTMLDivElement>(null);
  const [botonFijo, setBotonFijo] = useState(false);
  useEffect(() => {
    const el = botonPortada.current;
    if (!el) return;
    const observador = new IntersectionObserver(([entrada]) => setBotonFijo(!entrada.isIntersecting));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const celular = useMemo(() => documentoDeEjemplo('restaurante'), []);

  return (
    <div className="min-h-screen">
      <header className="cabecera-marca sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Wordmark />
          <nav className="flex items-center gap-6" aria-label="Secciones">
            <a href="#como-funciona" className="hidden text-sm text-ink-muted hover:text-ink md:inline">
              Cómo funciona
            </a>
            <a href="#ejemplos" className="hidden text-sm text-ink-muted hover:text-ink md:inline">
              Ejemplos
            </a>
            <a href="#preguntas" className="hidden text-sm text-ink-muted hover:text-ink md:inline">
              Preguntas
            </a>
            <button
              type="button"
              onClick={() => onAcceso('login')}
              className={continuar ? 'text-sm text-ink-muted hover:text-ink' : 'btn btn-ghost'}
            >
              Ingresar
            </button>
            {continuar && (
              <button type="button" onClick={continuar} className="btn btn-primary">
                <span className="sm:hidden">Mi web</span>
                <span className="hidden sm:inline">Continuar con mi web</span>
              </button>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* -------------------------------------------------------- portada */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:pt-14">
          <div className="animate-fade-up text-center lg:text-left">
            <p className="mb-4 text-xs font-medium tracking-[0.2em] text-ink-subtle uppercase">
              Para negocios y emprendedores
            </p>
            <h1 className="text-4xl leading-[1.08] text-balance sm:text-5xl lg:text-6xl">
              La web de tu negocio, lista para ver en un minuto
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg lg:mx-0">
              Responde unas preguntas y mira gratis cómo quedaría, con tu nombre, tu logo y tus colores. Si te
              gusta, un ingeniero de software la construye contigo.
            </p>
            <div
              ref={botonPortada}
              className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start"
            >
              <button type="button" onClick={probar} className="btn btn-primary w-full px-8 py-3 text-base sm:w-auto">
                Pruébalo gratis
              </button>
              <a href="#ejemplos" className="btn btn-ghost w-full px-6 py-3 text-base sm:w-auto">
                Ver ejemplos
              </a>
            </div>
            <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-ink-muted lg:justify-start">
              {['Gratis para ver', 'Sin crear cuenta', 'Decides después'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <span className="text-accent-alt" aria-hidden="true">
                    ✓
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <figure className="animate-fade-up mx-auto w-full max-w-[290px]">
            <div className="rounded-[2.75rem] bg-ink p-3 shadow-[var(--shadow-lifted)]">
              <div className="overflow-hidden rounded-[2.1rem] bg-white">
                {celular && (
                  <MiniVista
                    documento={celular}
                    titulo="Ejemplo de web para un restaurante, vista en el celular"
                    anchoPagina={390}
                    alto={540}
                    inmediata
                  />
                )}
              </div>
            </div>
            <figcaption className="mt-3 text-center text-xs text-ink-subtle">
              Un diseño real de AIB+, con un restaurante de ejemplo
            </figcaption>
          </figure>
        </section>

        {/* ------------------------------------------------- cómo funciona */}
        <section id="como-funciona" className="scroll-mt-24 border-y border-line bg-surface-raised/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-center text-3xl sm:text-4xl">Así de simple</h2>
            <ol className="mt-10 grid gap-5 sm:grid-cols-3">
              {PASOS.map((paso, i) => (
                <li key={paso.titulo} className="card p-6">
                  <span className="font-display text-3xl text-accent-alt">{i + 1}</span>
                  <h3 className="mt-3 text-xl">{paso.titulo}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{paso.texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------------- ejemplos */}
        <Ejemplos />

        <Ingenieros />

        {/* -------------------------------------------- por qué un ingeniero */}
        <section className="mx-auto grid max-w-6xl items-start gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl sm:text-4xl">No es un creador de páginas: es tu web, hecha por un ingeniero</h2>
            <p className="mt-4 text-ink-muted">
              Tu ingeniero recibe tu proyecto con todo lo que respondiste y el diseño que elegiste: no tienes que
              explicarle todo desde cero. Así la conversación empieza por lo importante.
            </p>
            <button type="button" onClick={probar} className="btn btn-primary mt-8 px-8 py-3 text-base">
              Empezar gratis
            </button>
          </div>
          <div className="card p-6">
            <h3 className="text-xl">Lo que verás en tu web</h3>
            <ul className="mt-5 space-y-3">
              {INCLUYE.map((item) => (
                <li key={item} className="flex items-start gap-3 text-ink">
                  <span
                    className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] text-white"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------ preguntas */}
        <section id="preguntas" className="scroll-mt-24 border-t border-line">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
            <h2 className="text-center text-3xl sm:text-4xl">Preguntas frecuentes</h2>
            <div className="mt-10 divide-y divide-line border-y border-line">
              {PREGUNTAS.map((p) => (
                <details key={p.pregunta} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-ink">
                    {p.pregunta}
                    <span
                      className="text-xl leading-none text-accent-alt transition-transform group-open:rotate-45"
                      aria-hidden="true"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-ink-muted">{p.respuesta}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- llamada final */}
        <section className="px-4 pb-20 sm:px-6">
          <div className="mx-auto max-w-4xl rounded-3xl bg-accent px-6 py-12 text-center text-white sm:px-12">
            <h2 className="text-3xl text-balance sm:text-4xl">Tu negocio merece una web que dé confianza</h2>
            <p className="mx-auto mt-3 max-w-lg text-white/75">Mírala hoy, decide después.</p>
            <button
              type="button"
              onClick={probar}
              className="btn mt-8 bg-accent-alt px-8 py-3 text-base text-ink hover:brightness-105"
            >
              Pruébalo gratis
            </button>
          </div>
        </section>
      </main>

      <PiePagina enPortada onIngresar={() => onAcceso('login')} espacioBotonFijo />

      {/* Botón fijo en el celular, cuando el de arriba ya no se ve */}
      <div
        className={
          'fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-base/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform duration-300 sm:hidden ' +
          (botonFijo ? 'translate-y-0' : 'translate-y-full')
        }
        aria-hidden={!botonFijo}
      >
        <button
          type="button"
          onClick={probar}
          tabIndex={botonFijo ? 0 : -1}
          className="btn btn-primary w-full py-3 text-base"
        >
          Pruébalo gratis
        </button>
      </div>
    </div>
  );
}

/** Galería de diseños reales, uno por rubro. Se pinta solo el que se mira. */
function Ejemplos() {
  const [elegido, setElegido] = useState(EJEMPLOS[0].id);
  const documento = useMemo(() => documentoDeEjemplo(elegido), [elegido]);
  const ejemplo = EJEMPLOS.find((e) => e.id === elegido) ?? EJEMPLOS[0];
  // En el celular se enseña la versión móvil: la de escritorio reducida no se leería.
  const [enEscritorio, setEnEscritorio] = useState(() => window.matchMedia('(min-width: 640px)').matches);
  useEffect(() => {
    const consulta = window.matchMedia('(min-width: 640px)');
    const cambiar = () => setEnEscritorio(consulta.matches);
    consulta.addEventListener('change', cambiar);
    return () => consulta.removeEventListener('change', cambiar);
  }, []);

  return (
    <section id="ejemplos" className="scroll-mt-24 mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h2 className="text-center text-3xl sm:text-4xl">Diseños pensados para tu rubro</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-ink-muted">
        Te mostramos los que mejor encajan con tu negocio y eliges el que más te guste. Estos son con negocios de
        ejemplo: el tuyo saldrá con tu nombre, tus colores y tus textos.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Elige un rubro">
        {EJEMPLOS.map((e) => (
          <button
            key={e.id}
            type="button"
            role="tab"
            aria-selected={elegido === e.id}
            onClick={() => setElegido(e.id)}
            className={
              'rounded-full border px-4 py-2 text-sm transition-colors ' +
              (elegido === e.id
                ? 'border-accent bg-accent text-white'
                : 'border-line-strong bg-surface-raised text-ink hover:border-accent/50')
            }
          >
            {e.rubro}
          </button>
        ))}
      </div>

      <div
        className={
          'mt-8 overflow-hidden rounded-2xl border border-line bg-surface-deep shadow-[var(--shadow-lifted)] ' +
          (enEscritorio ? '' : 'mx-auto max-w-[340px]')
        }
      >
        <div className="flex items-center gap-2 border-b border-line bg-surface-overlay px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
            <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
            <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          </span>
          <span className="mx-auto truncate rounded-md bg-surface-deep/70 px-3 py-0.5 text-[11px] text-ink-subtle">
            {ejemplo.negocio} · ejemplo
          </span>
        </div>
        {documento && (
          <MiniVista
            key={elegido + (enEscritorio ? '-escritorio' : '-movil')}
            documento={documento}
            titulo={`Ejemplo de web para ${ejemplo.rubro.toLowerCase()}`}
            anchoPagina={enEscritorio ? 1280 : 390}
            alto={enEscritorio ? 460 : 560}
            inmediata
          />
        )}
      </div>
    </section>
  );
}

/** Los ingenieros aprobados, con sus reseñas. Si aún no hay ninguno, no sale. */
function Ingenieros() {
  const [lista, setLista] = useState<IngenieroPublico[]>([]);

  useEffect(() => {
    let vigente = true;
    void ingenierosDisponibles().then((l) => {
      if (vigente) setLista(l);
    });
    return () => {
      vigente = false;
    };
  }, []);

  if (lista.length === 0) return null;

  return (
    <section id="ingenieros" className="scroll-mt-24 border-y border-line bg-surface-raised/60">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-3xl sm:text-4xl">Conoce a los ingenieros</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-ink-muted">
          Cuando tu web te guste, eliges a uno de ellos para construirla. Sus clientes los califican al terminar.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {lista.slice(0, 6).map((ing) => (
            <TarjetaIngeniero key={ing.id} ingeniero={ing} />
          ))}
        </div>
      </div>
    </section>
  );
}
