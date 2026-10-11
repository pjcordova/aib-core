import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Wordmark } from './ui/Primitives';
import { PiePagina } from './ui/PiePagina';
import { GaleriaDisenos } from './GaleriaDisenos';
import { TarjetaIngeniero } from './ingenieros/TarjetaIngeniero';
import { ingenierosDisponibles, ofreceServicio, type IngenieroPublico } from '../lib/ingenieros';
import { PAGINAS_SERVICIO, paginaServicio, type PaginaServicio as Pagina } from '../lib/paginasServicio';
import { solesEnteros } from '../lib/servicios';
import { vitrinaPortada, type Vitrina } from '../lib/vitrina';

// ---------------------------------------------------------------------------
// /servicios/:slug — la página de un servicio, para quien llega desde Google
// ---------------------------------------------------------------------------
// Los textos son fijos (paginasServicio.json) y al compilar se escriben en
// HTML para Google (scripts/prerender.mjs). Lo que cambia (diseños, precios e
// ingenieros) se lee aquí, como en la portada.
// ---------------------------------------------------------------------------

const PASOS = [
  { titulo: 'Cuéntanos de tu negocio', texto: 'Respondes unas preguntas, casi todas con un clic.' },
  { titulo: 'Mira cómo quedaría', texto: 'En un minuto ves una primera versión con tu nombre y tus colores, gratis.' },
  { titulo: 'Elige a tu ingeniero', texto: 'Te envía su propuesta con precio y plazo, y sigues el avance desde AIB+.' },
];

/** Cambia el título y la descripción de la pestaña mientras se ve la página. */
function useMetadatos(p: Pagina | null) {
  useEffect(() => {
    if (!p) return;
    const descripcion = document.querySelector('meta[name="description"]');
    const antes = { titulo: document.title, descripcion: descripcion?.getAttribute('content') ?? '' };
    document.title = p.titulo;
    descripcion?.setAttribute('content', p.descripcion);
    window.scrollTo(0, 0);
    return () => {
      document.title = antes.titulo;
      descripcion?.setAttribute('content', antes.descripcion);
    };
  }, [p]);
}

export function PaginaServicio() {
  const { slug } = useParams();
  const p = paginaServicio(slug);
  const navigate = useNavigate();
  useMetadatos(p);

  const [vitrina, setVitrina] = useState<Vitrina | null>(null);
  const [ingenieros, setIngenieros] = useState<IngenieroPublico[]>([]);
  useEffect(() => {
    let vigente = true;
    void vitrinaPortada().then((v) => vigente && setVitrina(v));
    void ingenierosDisponibles().then((l) => vigente && setIngenieros(l));
    return () => {
      vigente = false;
    };
  }, []);

  if (!p) return <Navigate to="/" replace />;

  const probar = () => navigate(`/probar?servicio=${p.clave}`);
  const desde = vitrina?.servicios.find((s) => s.clave === p.clave)?.desde ?? null;
  const disenos = (vitrina?.plantillas ?? []).filter((d) => d.servicio === p.clave).slice(0, 6);
  const suyos = ingenieros.filter((i) => ofreceServicio(i, p.clave)).slice(0, 6);
  const otras = PAGINAS_SERVICIO.filter((o) => o.slug !== p.slug);

  return (
    <div className="min-h-screen">
      <header className="cabecera-marca sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="Ir a la portada de AIB+">
            <Wordmark />
          </Link>
          <button type="button" onClick={probar} className="btn btn-primary">
            Pruébalo gratis
          </button>
        </div>
      </header>

      <main>
        {/* ------------------------------------------------------------ portada */}
        <section className="mx-auto max-w-4xl px-4 pt-10 pb-14 text-center sm:px-6">
          <nav aria-label="Ruta" className="text-xs text-ink-subtle">
            <Link to="/" className="hover:text-ink">
              Inicio
            </Link>{' '}
            › <span>Servicios</span> › <span className="text-ink-muted">{p.nombre}</span>
          </nav>
          <p className="mt-6 text-4xl" aria-hidden="true">
            {p.icono}
          </p>
          <h1 className="mt-3 text-4xl leading-tight text-balance sm:text-5xl">{p.h1}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">{p.intro}</p>
          {desde !== null && (
            <p className="mt-4 text-sm text-ink-muted">
              Con los ingenieros de AIB+, <span className="font-semibold text-ink">desde {solesEnteros(desde)}</span>
            </p>
          )}
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={probar} className="btn btn-primary px-6 py-3 text-base">
              Mira gratis cómo quedaría
            </button>
            {suyos.length > 0 && (
              <a href="#ingenieros" className="btn btn-ghost px-6 py-3 text-base">
                Ver ingenieros
              </a>
            )}
          </div>
          <ul className="mx-auto mt-10 grid max-w-3xl gap-3 text-left sm:grid-cols-2">
            {p.beneficios.map((b) => (
              <li key={b} className="flex gap-2 text-sm text-ink-muted">
                <span className="text-accent-alt" aria-hidden="true">
                  ✓
                </span>
                {b}
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------------------ incluye */}
        <section className="border-y border-line bg-surface-raised/60">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 className="text-center text-3xl">Qué puede incluir</h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-ink-muted">
              Lo eliges al contar lo que necesitas, y tu ingeniero lo detalla en su propuesta.
            </p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {p.incluye.map((i) => (
                <li key={i} className="card p-4 text-sm text-ink">
                  {i}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------------ diseños */}
        {disenos.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 className="text-center text-3xl">Diseños de {p.nombre.toLowerCase()} de nuestros ingenieros</h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-ink-muted">
              Cada uno con su precio y quién lo construye. El tuyo saldrá con tu nombre y tus colores.
            </p>
            <GaleriaDisenos disenos={disenos} onProbar={probar} />
          </section>
        )}

        {/* --------------------------------------------------------- ingenieros */}
        {suyos.length > 0 && (
          <section id="ingenieros" className="scroll-mt-24 mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 className="text-center text-3xl">Ingenieros que lo construyen</h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {suyos.map((ing) => (
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
              <Link to={`/explorar?servicio=${p.clave}`} className="btn btn-ghost px-6 py-3">
                Buscar entre todos los ingenieros →
              </Link>
            </p>
          </section>
        )}

        {/* ------------------------------------------------------ cómo funciona */}
        <section className="border-y border-line bg-surface-raised/60">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 className="text-center text-3xl">Cómo funciona</h2>
            <ol className="mt-8 grid gap-5 sm:grid-cols-3">
              {PASOS.map((paso, i) => (
                <li key={paso.titulo} className="card p-5">
                  <span className="text-sm font-semibold text-accent">{i + 1}</span>
                  <p className="mt-1 font-semibold text-ink">{paso.titulo}</p>
                  <p className="mt-1 text-sm text-ink-muted">{paso.texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* -------------------------------------------------------- preguntas */}
        <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <h2 className="text-center text-3xl">Preguntas frecuentes</h2>
          <div className="mt-8 divide-y divide-line border-y border-line">
            {p.preguntas.map((q) => (
              <details key={q.pregunta} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-ink">
                  {q.pregunta}
                  <span
                    className="text-xl leading-none text-accent-alt transition-transform group-open:rotate-45"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">{q.respuesta}</p>
              </details>
            ))}
          </div>
        </section>

        {/* --------------------------------------------------------- final */}
        <section className="mx-auto max-w-4xl px-4 pb-16 text-center sm:px-6">
          <div className="card p-8">
            <h2 className="text-2xl">¿Lo vemos con el nombre de tu negocio?</h2>
            <p className="mt-2 text-ink-muted">Es gratis, no necesitas crear cuenta y decides después.</p>
            <button type="button" onClick={probar} className="btn btn-primary mt-5 px-6 py-3 text-base">
              Mira gratis cómo quedaría
            </button>
          </div>
          <nav aria-label="Otros servicios" className="mt-10">
            <p className="text-sm text-ink-subtle">También hacemos</p>
            <ul className="mt-3 flex flex-wrap justify-center gap-2">
              {otras.map((o) => (
                <li key={o.slug}>
                  <Link
                    to={`/servicios/${o.slug}`}
                    className="inline-block rounded-full border border-line-strong bg-surface-raised px-3.5 py-1.5 text-sm text-ink hover:border-accent/60"
                  >
                    <span aria-hidden="true">{o.icono}</span> {o.nombre}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </section>
      </main>

      <PiePagina />
    </div>
  );
}
