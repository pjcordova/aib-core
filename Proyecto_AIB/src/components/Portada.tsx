// ---------------------------------------------------------------------------
// Portada pública
// ---------------------------------------------------------------------------
// Lo primero que ve un dueño de negocio que llega a AIB+ sin invitación. Es un
// marketplace de tecnología: elige lo que necesita (web, tienda, CRM, ERP,
// automatización o app), ve los diseños reales de los ingenieros con sus
// precios y reseñas, y en un minuto mira cómo quedaría con su nombre. Todo lo
// que promete aquí existe en la app; los datos salen de vitrina_portada()
// (supabase_portada_marketplace.sql).
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wordmark } from './ui/Primitives';
import { MiniVista } from './panel/MiniVista';
import { useAuth } from '../hooks/useAuth';
import { canalDeLaVisita, registrarVisitaPortada } from '../lib/medicionPortada';
import { ingenierosDisponibles, textoEstrellas, type IngenieroPublico } from '../lib/ingenieros';
import { documentoDeDiseno, empezarConfirmando } from '../lib/perfilPublico';
import { etiquetaNivel } from '../lib/plantillaPropia';
import { obtenerServicio, solesEnteros, type TipoServicio } from '../lib/servicios';
import { servicioDeBusqueda, vitrinaPortada, type DisenoVitrina, type Vitrina } from '../lib/vitrina';
import { FotoIngeniero, TarjetaIngeniero } from './ingenieros/TarjetaIngeniero';
import { PiePagina } from './ui/PiePagina';

type Acceso = 'login' | 'registro';
type Clave = Exclude<TipoServicio, 'otro'>;

const CLAVES: Clave[] = ['web', 'crm', 'erp', 'automatizacion', 'app-movil'];

/** Negocios inventados para los diseños de la biblioteca: son ejemplos, no clientes. */
const NEGOCIOS_EJEMPLO: Record<string, string> = {
  restaurante: 'Sazón de la Casa',
  'moda-boutique': 'Alma Boutique',
  'salud-belleza': 'Spa Armonía',
  consultora: 'Norte Consultores',
  institucional: 'Asociación Las Flores',
};

const PASOS = [
  {
    titulo: 'Elige lo que necesitas',
    texto: 'Una web, una tienda online, un CRM, un ERP, una automatización o una app. Respondes unas preguntas, casi todas con un clic.',
  },
  {
    titulo: 'Mira cómo quedaría',
    texto: 'Ves los diseños de los ingenieros con tu nombre y tus colores, y comparas precios y reseñas.',
  },
  {
    titulo: 'Elige a tu ingeniero',
    texto: 'Te envía su propuesta con precio y plazo. La aceptas con un clic y sigues el avance desde la app.',
  },
];

const INCLUYE = [
  'Ves cómo quedaría antes de pagar nada',
  'Ingenieros con perfil, diseños y reseñas de sus clientes',
  'Propuesta formal con precio, plazo y lo que incluye',
  'Sigues el avance de tu proyecto paso a paso',
  'Pagas directo a tu ingeniero: AIB+ no te cobra nada',
];

const PREGUNTAS = [
  {
    pregunta: '¿Qué puedo pedir?',
    respuesta:
      'Páginas web y tiendas online, CRM para tus clientes y ventas, ERP para inventario y facturación, automatizaciones y apps móviles. Cada ingeniero muestra en su perfil lo que ofrece.',
  },
  {
    pregunta: '¿Cuánto cuesta?',
    respuesta:
      'Verlo es gratis. Cada diseño muestra su precio «desde» y el ingeniero te envía una propuesta con el precio final según lo que necesites. No pagas nada por verlo ni por recibir la propuesta.',
  },
  {
    pregunta: '¿Necesito saber de tecnología?',
    respuesta: 'No. Casi todas las preguntas se responden con un clic, y el ingeniero se encarga de la parte técnica.',
  },
  {
    pregunta: '¿Tengo que crear una cuenta?',
    respuesta:
      'No. Pulsas «Pruébalo gratis» y empiezas. Si vuelves desde el mismo navegador, tu proyecto te estará esperando.',
  },
  {
    pregunta: '¿Cómo elijo a mi ingeniero?',
    respuesta:
      'Por su perfil, sus diseños, sus precios y lo que opinan sus clientes. Si te gusta un diseño, lo construye quien lo hizo. Al terminar, tú también lo calificas.',
  },
  {
    pregunta: '¿Qué pasa cuando digo «Me gusta, sigamos»?',
    respuesta:
      'Dejas tu nombre y tu WhatsApp. Tu ingeniero recibe tu proyecto con todo lo que respondiste, te envía su propuesta y la aceptas o pides cambios con un clic.',
  },
  {
    pregunta: 'Soy ingeniero, ¿puedo ofrecer mis servicios?',
    respuesta:
      'Sí. Crea tu perfil en «Únete como ingeniero», sube tus diseños con su precio y recibe clientes con su proyecto ya descrito.',
  },
];

export function Portada({
  onAcceso,
  continuar,
}: {
  onAcceso: (modo: Acceso) => void;
  /** Quien ya tiene una prueba o una invitación abierta: vuelve a ella. */
  continuar?: () => void;
}) {
  const navigate = useNavigate();
  const medir = !continuar;

  /**
   * Sin cuenta, /probar abre una sesión de prueba; con una ya abierta, se
   * sigue con esa. `clave`: el servicio con el que empieza (sin ella, elige).
   */
  const probar = (clave?: Clave) => {
    if (continuar) navigate('/mi-web', { state: clave ? { clave } : null });
    else navigate(clave ? `/probar?servicio=${clave}` : '/probar');
  };

  // Medición del marketplace: la visita y su canal (?c=), sin datos personales.
  // Quien vuelve desde su prueba ya contó al llegar.
  useEffect(() => {
    if (!medir) return;
    canalDeLaVisita();
    registrarVisitaPortada();
  }, [medir]);

  // undefined mientras carga; null si no se pudo leer (la portada sigue sin ella).
  const [vitrina, setVitrina] = useState<Vitrina | null | undefined>(undefined);
  useEffect(() => {
    let vigente = true;
    void vitrinaPortada().then((v) => {
      if (vigente) setVitrina(v);
    });
    return () => {
      vigente = false;
    };
  }, []);

  // Los servicios que alguien ofrece. Mientras carga, todos (sin cifras).
  const servicios = useMemo(() => {
    const datos = new Map((vitrina?.servicios ?? []).map((s) => [s.clave, s] as const));
    return CLAVES.filter((c) => !vitrina || (datos.get(c)?.ingenieros ?? 0) > 0).map((c) => ({
      ...obtenerServicio(c),
      clave: c,
      datos: datos.get(c),
    }));
  }, [vitrina]);

  // En el celular, el botón queda fijo abajo en cuanto el buscador se pierde de vista.
  const buscador = useRef<HTMLDivElement>(null);
  const [botonFijo, setBotonFijo] = useState(false);
  useEffect(() => {
    const el = buscador.current;
    if (!el) return;
    const observador = new IntersectionObserver(([entrada]) => setBotonFijo(!entrada.isIntersecting));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const destacado = useMemo(
    () => vitrina?.plantillas.find((d) => d.servicio === 'web' && d.precio_desde) ?? vitrina?.plantillas[0],
    [vitrina]
  );

  return (
    <div className="min-h-screen">
      <header className="cabecera-marca sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Wordmark />
          <nav className="flex items-center gap-6" aria-label="Secciones">
            {(
              [
                ['#servicios', 'Servicios'],
                ['#plantillas', 'Diseños'],
                ['#ingenieros', 'Ingenieros'],
                ['#preguntas', 'Preguntas'],
              ] as const
            ).map(([href, texto]) => (
              <a key={href} href={href} className="hidden text-sm text-ink-muted hover:text-ink md:inline">
                {texto}
              </a>
            ))}
            <button
              type="button"
              onClick={() => onAcceso('login')}
              className={continuar ? 'text-sm text-ink-muted hover:text-ink' : 'btn btn-ghost'}
            >
              Ingresar
            </button>
            {continuar && (
              <button type="button" onClick={continuar} className="btn btn-primary">
                <span className="sm:hidden">Mi proyecto</span>
                <span className="hidden sm:inline">Continuar mi proyecto</span>
              </button>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* -------------------------------------------------------- portada */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[1.25fr_1fr] lg:pt-14">
          <div className="animate-fade-up text-center lg:text-left">
            <p className="mb-4 text-xs font-medium tracking-[0.2em] text-ink-subtle uppercase">
              Marketplace de tecnología para negocios
            </p>
            <h1 className="text-4xl leading-[1.08] text-balance sm:text-5xl lg:text-6xl">
              La tecnología que tu negocio necesita, hecha por ingenieros
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg lg:mx-0">
              Páginas web, tiendas online, CRM, ERP, automatizaciones y apps. Mira gratis cómo quedaría con tu nombre y
              tus colores, compara ingenieros y recibe su propuesta.
            </p>

            <div ref={buscador} className="mt-8">
              <Buscador onElegir={probar} />
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-2 lg:justify-start" aria-label="Servicios">
              {servicios.map((s) => (
                <button
                  key={s.clave}
                  type="button"
                  onClick={() => probar(s.clave)}
                  className="rounded-full border border-line-strong bg-surface-raised px-3.5 py-1.5 text-sm text-ink transition-colors hover:border-accent/60"
                >
                  <span aria-hidden="true">{s.icono}</span> {s.nombre}
                </button>
              ))}
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

          <Destacado diseno={destacado} cargando={vitrina === undefined} />
        </section>

        {/* -------------------------------------------------------- servicios */}
        <section id="servicios" className="scroll-mt-24 border-y border-line bg-surface-raised/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-center text-3xl sm:text-4xl">¿Qué necesita tu negocio?</h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-ink-muted">
              Elige un servicio: respondes unas preguntas y ves gratis cómo quedaría, con los diseños de los ingenieros.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {servicios.map((s) => (
                <button
                  key={s.clave}
                  type="button"
                  onClick={() => probar(s.clave)}
                  className="card group flex flex-col gap-3 p-6 text-left transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-[var(--shadow-glow)]"
                >
                  <span className="text-3xl" aria-hidden="true">
                    {s.icono}
                  </span>
                  <span className="text-xl text-ink">{s.nombre}</span>
                  <span className="text-sm leading-relaxed text-ink-muted">{s.descripcion}</span>
                  {s.datos && (
                    <span className="text-xs text-ink-subtle">
                      {s.datos.ingenieros} {s.datos.ingenieros === 1 ? 'ingeniero' : 'ingenieros'}
                      {s.datos.plantillas > 0 &&
                        ` · ${s.datos.plantillas} ${s.datos.plantillas === 1 ? 'diseño' : 'diseños'}`}
                      {s.datos.desde ? (
                        <>
                          {' · '}
                          <span className="font-semibold text-ink">desde {solesEnteros(s.datos.desde)}</span>
                        </>
                      ) : null}
                    </span>
                  )}
                  <span className="mt-auto text-sm font-medium text-accent group-hover:underline">Empezar gratis →</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- diseños */}
        {vitrina && vitrina.plantillas.length > 0 && <Disenos disenos={vitrina.plantillas} onProbar={probar} />}

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

        <Ingenieros />

        {/* -------------------------------------------- por qué un ingeniero */}
        <section className="mx-auto grid max-w-6xl items-start gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl sm:text-4xl">No es un creador de páginas: son ingenieros de verdad</h2>
            <p className="mt-4 text-ink-muted">
              Tu ingeniero recibe tu proyecto con todo lo que respondiste y el diseño que elegiste: no tienes que
              explicarle todo desde cero. Así la conversación empieza por lo importante.
            </p>
            <button type="button" onClick={() => probar()} className="btn btn-primary mt-8 px-8 py-3 text-base">
              Empezar gratis
            </button>
          </div>
          <div className="card p-6">
            <h3 className="text-xl">Lo que tienes con AIB+</h3>
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

        {/* ------------------------------------------------- para ingenieros */}
        <section className="px-4 pb-16 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 rounded-3xl border border-line bg-surface-raised p-8 text-center sm:flex-row sm:text-left">
            <div>
              <h2 className="text-2xl">¿Eres ingeniero de software?</h2>
              <p className="mt-2 max-w-2xl text-sm text-ink-muted">
                Ofrece tus servicios en AIB+: sube tus diseños con su precio, recibe clientes con su proyecto ya descrito y
                lleva tus propuestas y cobros en un solo lugar.
              </p>
            </div>
            <Link to="/ingenieros" className="btn btn-ghost shrink-0 px-6 py-3">
              Únete como ingeniero
            </Link>
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
            <h2 className="text-3xl text-balance sm:text-4xl">Tu negocio, con la tecnología que necesita</h2>
            <p className="mx-auto mt-3 max-w-lg text-white/75">Míralo hoy, decide después.</p>
            <button
              type="button"
              onClick={() => probar()}
              className="btn mt-8 bg-accent-alt px-8 py-3 text-base text-ink hover:brightness-105"
            >
              Pruébalo gratis
            </button>
          </div>
        </section>
      </main>

      <PiePagina enPortada onIngresar={() => onAcceso('login')} espacioBotonFijo />

      {/* Botón fijo en el celular, cuando el buscador ya no se ve */}
      <div
        className={
          'fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-base/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform duration-300 sm:hidden ' +
          (botonFijo ? 'translate-y-0' : 'translate-y-full')
        }
        aria-hidden={!botonFijo}
      >
        <button
          type="button"
          onClick={() => probar()}
          tabIndex={botonFijo ? 0 : -1}
          className="btn btn-primary w-full py-3 text-base"
        >
          Pruébalo gratis
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * «¿Qué necesitas?» con sus palabras. Si se parece a un servicio, empieza por
 * ese; si no, le pide que elija uno.
 */
function Buscador({ onElegir }: { onElegir: (clave?: Clave) => void }) {
  const [texto, setTexto] = useState('');
  const [sinCoincidencia, setSinCoincidencia] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const clave = servicioDeBusqueda(texto);
        if (clave) onElegir(clave);
        else if (!texto.trim()) onElegir();
        else setSinCoincidencia(true);
      }}
      className="mx-auto max-w-xl lg:mx-0"
      role="search"
    >
      <div className="flex flex-col gap-2 rounded-2xl border border-line-strong bg-surface-raised p-2 shadow-[var(--shadow-lifted)] sm:flex-row">
        <input
          type="search"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setSinCoincidencia(false);
          }}
          placeholder="¿Qué necesitas? Ej: controlar mi inventario"
          aria-label="¿Qué necesita tu negocio?"
          className="min-w-0 flex-1 rounded-xl bg-transparent px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-subtle"
        />
        <button type="submit" className="btn btn-primary px-6 py-2.5 text-base">
          Pruébalo gratis
        </button>
      </div>
      {sinCoincidencia && (
        <p className="mt-2 text-sm text-ink-muted" role="status">
          No lo encontramos tal cual: elige el servicio que más se parezca.
        </p>
      )}
    </form>
  );
}

/** Un diseño real de un ingeniero, en un celular, con quién lo hizo y su precio. */
function Destacado({ diseno, cargando }: { diseno: DisenoVitrina | undefined; cargando: boolean }) {
  const documento = useMemo(
    () => (diseno ? documentoDeDiseno(diseno, NEGOCIOS_EJEMPLO[diseno.base] ?? 'Tu negocio') : null),
    [diseno]
  );
  if (!cargando && !documento) return null;

  return (
    <figure className="animate-fade-up mx-auto w-full max-w-[290px]">
      <div className="rounded-[2.75rem] bg-ink p-3 shadow-[var(--shadow-lifted)]">
        <div className="overflow-hidden rounded-[2.1rem] bg-white">
          {documento ? (
            <MiniVista
              documento={documento}
              titulo={`Diseño ${diseno?.nombre ?? ''}, visto en el celular`}
              anchoPagina={390}
              alto={540}
              inmediata
              interactiva
            />
          ) : (
            <div className="h-[540px] animate-pulse bg-surface-overlay" />
          )}
        </div>
      </div>
      {diseno && (
        <figcaption className="mt-3 flex items-center justify-center gap-2 text-xs text-ink-subtle">
          <FotoIngeniero nombre={diseno.ingeniero.nombre} foto={diseno.ingeniero.foto_url} tamano={24} />
          <span>
            Diseño de <span className="font-medium text-ink-muted">{diseno.ingeniero.nombre.split(/\s+/)[0]}</span>
            {diseno.precio_desde ? ` · desde ${solesEnteros(diseno.precio_desde)}` : ''}
            <span className="block font-medium text-ink-muted">Desliza dentro para recorrerlo ↕</span>
          </span>
        </figcaption>
      )}
    </figure>
  );
}

/**
 * Los diseños de los ingenieros, por servicio. «Lo quiero» empieza la prueba
 * con quien lo hizo y en ese servicio: ve sus diseños con su nombre.
 */
function Disenos({ disenos, onProbar }: { disenos: DisenoVitrina[]; onProbar: (clave?: Clave) => void }) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const conDisenos = CLAVES.filter((c) => disenos.some((d) => d.servicio === c));
  const [servicio, setServicio] = useState<Clave>(conDisenos[0] ?? 'web');
  const [empezando, setEmpezando] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loQuiero = async (d: DisenoVitrina) => {
    const clave = d.servicio as Clave;
    if (!d.ingeniero.slug) {
      onProbar(clave);
      return;
    }
    setEmpezando(d.id);
    setError('');
    const nombre = d.ingeniero.nombre.split(/\s+/)[0];
    const r = await empezarConfirmando(d.ingeniero.slug, nombre, signOut);
    setEmpezando(null);
    if (r === 'ok') navigate('/mi-web', { state: { clave } });
    else if (r === 'con_cuenta') navigate('/');
    else if (r === 'lleno') setError(`${nombre} recibió muchas solicitudes hoy. Prueba con otro diseño o vuelve mañana.`);
    else if (r !== 'cancelado') setError('No pudimos empezar. Revisa tu conexión y vuelve a intentarlo.');
  };

  return (
    <section id="plantillas" className="scroll-mt-24 mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h2 className="text-center text-3xl sm:text-4xl">Diseños de nuestros ingenieros</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-ink-muted">
        Cada uno con su precio y quién lo construye. El tuyo saldrá con tu nombre, tus colores y tus textos.
      </p>

      {conDisenos.length > 1 && (
        <div className="mt-8 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Elige un servicio">
          {conDisenos.map((c) => {
            const s = obtenerServicio(c);
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={servicio === c}
                onClick={() => setServicio(c)}
                className={
                  'rounded-full border px-4 py-2 text-sm transition-colors ' +
                  (servicio === c
                    ? 'border-accent bg-accent text-white'
                    : 'border-line-strong bg-surface-raised text-ink hover:border-accent/50')
                }
              >
                <span aria-hidden="true">{s.icono}</span> {s.nombre}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-6 text-center text-sm text-negative">
          {error}
        </p>
      )}

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {disenos
          .filter((d) => d.servicio === servicio)
          .map((d) => (
            <TarjetaDiseno
              key={d.id}
              diseno={d}
              empezando={empezando === d.id}
              ocupado={empezando !== null}
              onQuiero={() => void loQuiero(d)}
            />
          ))}
      </div>
      <p className="mt-6 text-center text-sm">
        <button type="button" onClick={() => onProbar(servicio)} className="font-medium text-accent hover:underline">
          Ver todos los de {obtenerServicio(servicio).nombre} con mi nombre →
        </button>
      </p>
    </section>
  );
}

function TarjetaDiseno({
  diseno: d,
  empezando,
  ocupado,
  onQuiero,
}: {
  diseno: DisenoVitrina;
  empezando: boolean;
  ocupado: boolean;
  onQuiero: () => void;
}) {
  const documento = useMemo(() => documentoDeDiseno(d, NEGOCIOS_EJEMPLO[d.base] ?? 'Tu negocio'), [d]);
  if (!documento) return null;
  const nombre = d.ingeniero.nombre;

  return (
    <article className="card flex flex-col overflow-hidden">
      <MiniVista documento={documento} titulo={`Diseño ${d.nombre}`} alto={240} interactiva />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink">{d.nombre}</p>
          {d.nivel !== 'basica' && (
            <span className="rounded-full bg-accent-alt/20 px-2 py-0.5 text-[11px] font-medium text-ink">
              {etiquetaNivel(d.nivel)}
            </span>
          )}
        </div>
        {d.descripcion && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{d.descripcion}</p>}
        <div className="mt-3 flex items-center gap-2">
          <FotoIngeniero nombre={nombre} foto={d.ingeniero.foto_url} tamano={28} />
          <p className="min-w-0 text-xs text-ink-muted">
            Lo construye <span className="font-medium text-ink">{nombre}</span>
            <span className="block">{textoEstrellas(d.ingeniero.promedio, d.ingeniero.resenas)}</span>
          </p>
        </div>
        {d.precio_desde !== null && (
          <p className="mt-3 text-base font-semibold text-ink tabular-nums">desde {solesEnteros(d.precio_desde)}</p>
        )}
        <div className="mt-auto flex gap-2 pt-4">
          <button type="button" onClick={onQuiero} disabled={ocupado} className="btn btn-primary flex-1">
            {empezando ? 'Preparando…' : 'Lo quiero'}
          </button>
          {d.ingeniero.slug && (
            <Link to={`/ing/${d.ingeniero.slug}`} className="btn btn-ghost">
              Ver ingeniero
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

/** Si ofrece el servicio. La tienda online cuenta como web. */
const ofrece = (ing: IngenieroPublico, clave: Clave) =>
  (ing.servicios ?? ['web']).includes(clave) || (clave === 'web' && (ing.servicios ?? []).includes('tienda-online'));

/** Los ingenieros aprobados, con sus reseñas y filtro por servicio. Si aún no hay ninguno, no sale. */
function Ingenieros() {
  const [lista, setLista] = useState<IngenieroPublico[]>([]);
  const [filtro, setFiltro] = useState<Clave | ''>('');

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

  const filtros = CLAVES.filter((c) => lista.some((i) => ofrece(i, c)));
  const visibles = filtro ? lista.filter((i) => ofrece(i, filtro)) : lista;

  return (
    <section id="ingenieros" className="scroll-mt-24 mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h2 className="text-center text-3xl sm:text-4xl">Conoce a los ingenieros</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-ink-muted">
        Mira su perfil, sus diseños y lo que dicen sus clientes. Sus clientes los califican al terminar.
      </p>
      {filtros.length > 1 && (
        <div className="mt-8 flex flex-wrap justify-center gap-2" role="group" aria-label="Filtrar por servicio">
          {[{ clave: '' as const, nombre: 'Todos', icono: '' }, ...filtros.map((c) => ({ clave: c, ...obtenerServicio(c) }))].map(
            (f) => (
              <button
                key={f.clave || 'todos'}
                type="button"
                onClick={() => setFiltro(f.clave)}
                aria-pressed={filtro === f.clave}
                className={
                  'rounded-full border px-3.5 py-1.5 text-sm transition-colors ' +
                  (filtro === f.clave
                    ? 'border-accent bg-accent text-white'
                    : 'border-line-strong bg-surface-raised text-ink hover:border-accent/50')
                }
              >
                {f.icono && <span aria-hidden="true">{f.icono} </span>}
                {f.nombre}
              </button>
            )
          )}
        </div>
      )}
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visibles.slice(0, 6).map((ing) => (
          <TarjetaIngeniero
            key={ing.id}
            ingeniero={ing}
            accion={
              ing.slug ? (
                <Link to={`/ing/${ing.slug}`} className="btn btn-ghost w-full">
                  Ver su página
                </Link>
              ) : undefined
            }
          />
        ))}
      </div>
      <p className="mt-8 text-center">
        <Link to={filtro ? `/explorar?servicio=${filtro}` : '/explorar'} className="btn btn-ghost px-6 py-3">
          Buscar entre todos los ingenieros →
        </Link>
      </p>
    </section>
  );
}

