import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Wordmark } from './ui/Primitives';
import { PiePagina } from './ui/PiePagina';
import { GaleriaDisenos } from './GaleriaDisenos';
import { TarjetaIngeniero } from './ingenieros/TarjetaIngeniero';
import { useMetadatos } from '../hooks/useMetadatos';
import { ingenierosDisponibles, ofreceServicio, type IngenieroPublico } from '../lib/ingenieros';
import { PAGINAS_RUBRO, paginaRubro } from '../lib/paginasRubro';
import { PAGINAS_SERVICIO, PASOS_COMO_FUNCIONA as PASOS } from '../lib/paginasServicio';
import { solesEnteros } from '../lib/servicios';
import { disenosDeRubro, vitrinaPortada, type DisenoVitrina, type Vitrina } from '../lib/vitrina';

// ---------------------------------------------------------------------------
// /rubros/:slug — la web para un tipo de negocio, para quien llega desde Google
// ---------------------------------------------------------------------------
// Los textos son fijos (paginasRubro.json) y al compilar se escriben en HTML
// para Google (scripts/prerender.mjs). Los diseños y los ingenieros se leen
// aquí: los de su negocio, por sus palabras clave (disenos_de_rubro), luego
// los de su categoría y, si todavía no hay, los de páginas web.
// ---------------------------------------------------------------------------

export function PaginaRubro() {
  const { slug } = useParams();
  const p = paginaRubro(slug);
  const navigate = useNavigate();
  useMetadatos(p);

  const [vitrina, setVitrina] = useState<Vitrina | null>(null);
  const [delRubro, setDelRubro] = useState<DisenoVitrina[]>([]);
  const [ingenieros, setIngenieros] = useState<IngenieroPublico[]>([]);
  useEffect(() => {
    let vigente = true;
    void vitrinaPortada().then((v) => vigente && setVitrina(v));
    void ingenierosDisponibles().then((l) => vigente && setIngenieros(l));
    return () => {
      vigente = false;
    };
  }, []);
  // Los diseños de este negocio (o de su categoría), entre todos los publicados.
  useEffect(() => {
    if (!p) return;
    let vigente = true;
    void disenosDeRubro(p.palabras, p.categoria).then((l) => vigente && setDelRubro(l));
    return () => {
      vigente = false;
    };
  }, [p]);

  if (!p) return <Navigate to="/" replace />;

  const probar = () => navigate('/probar?servicio=web');

  // Si todavía no hay ninguno de su rubro ni de su categoría, los de web.
  const web = (vitrina?.plantillas ?? []).filter((d) => d.servicio === 'web');
  const disenos = (delRubro.length > 0 ? delRubro : web).slice(0, 6);
  const precios = disenos.map((d) => d.precio_desde).filter((n): n is number => n !== null);
  const desde =
    precios.length > 0 ? Math.min(...precios) : (vitrina?.servicios.find((s) => s.clave === 'web')?.desde ?? null);

  const deWeb = ingenieros.filter((i) => ofreceServicio(i, 'web'));
  const especialistas = deWeb.filter((i) => i.especialidades.includes(p.categoria));
  const suyos = (especialistas.length > 0 ? especialistas : deWeb).slice(0, 6);

  const tambien = p.tambien.flatMap((t) => {
    const pagina = PAGINAS_SERVICIO.find((s) => s.slug === t.servicio);
    return pagina ? [{ ...t, pagina }] : [];
  });
  const otros = PAGINAS_RUBRO.filter((o) => o.slug !== p.slug);
  const nombre = p.nombre.toLowerCase();

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
            ›{' '}
            <Link to="/servicios/paginas-web" className="hover:text-ink">
              Páginas web
            </Link>{' '}
            › <span className="text-ink-muted">{p.nombre}</span>
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
        </section>

        {/* --------------------------------------------------------- necesita */}
        <section className="border-y border-line bg-surface-raised/60">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 className="text-center text-3xl">Lo que no le puede faltar</h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-ink-muted">
              Lo eliges al contar lo que necesitas, y tu ingeniero lo detalla en su propuesta.
            </p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {p.necesita.map((n) => (
                <li key={n} className="card flex gap-2 p-4 text-sm text-ink">
                  <span className="text-accent-alt" aria-hidden="true">
                    ✓
                  </span>
                  {n}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------------ diseños */}
        {disenos.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 className="text-center text-3xl">
              {delRubro.length > 0 ? `Diseños para ${nombre}` : 'Diseños de nuestros ingenieros'}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-ink-muted">
              {delRubro.length > 0
                ? 'Cada uno con su precio y quién lo construye. El tuyo saldrá con tu nombre y tus colores.'
                : 'Tu ingeniero adapta cualquiera a tu negocio. El tuyo saldrá con tu nombre y tus colores.'}
            </p>
            <GaleriaDisenos disenos={disenos} onProbar={probar} />
          </section>
        )}

        {/* --------------------------------------------------------- ingenieros */}
        {suyos.length > 0 && (
          <section id="ingenieros" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-14 sm:px-6">
            <h2 className="text-center text-3xl">
              {especialistas.length > 0 ? `Ingenieros que trabajan con ${nombre}` : 'Ingenieros que hacen páginas web'}
            </h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {suyos.map((ing) => (
                <TarjetaIngeniero
                  key={ing.id}
                  ingeniero={ing}
                  rubroDelCliente={p.categoria}
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
              <Link to={`/explorar?servicio=web&rubro=${p.categoria}`} className="btn btn-ghost px-6 py-3">
                Buscar entre todos los ingenieros →
              </Link>
            </p>
          </section>
        )}

        {/* ---------------------------------------------------- además de la web */}
        {tambien.length > 0 && (
          <section className="border-y border-line bg-surface-raised/60">
            <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
              <h2 className="text-center text-3xl">Además de la web</h2>
              <p className="mx-auto mt-3 max-w-2xl text-center text-ink-muted">
                Los mismos ingenieros también pueden ayudarte con esto.
              </p>
              <ul className="mx-auto mt-8 grid max-w-4xl gap-4 sm:grid-cols-2">
                {tambien.map((t) => (
                  <li key={t.servicio}>
                    <Link to={`/servicios/${t.servicio}`} className="card block h-full p-5 hover:border-accent/60">
                      <p className="font-semibold text-ink">
                        <span aria-hidden="true">{t.pagina.icono}</span> {t.pagina.nombre}
                      </p>
                      <p className="mt-1 text-sm text-ink-muted">{t.texto}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ------------------------------------------------------ cómo funciona */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
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
        </section>

        {/* -------------------------------------------------------- preguntas */}
        <section className="mx-auto max-w-3xl px-4 pb-14 sm:px-6">
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
          <nav aria-label="Otros tipos de negocio" className="mt-10">
            <p className="text-sm text-ink-subtle">También hacemos webs para</p>
            <ul className="mt-3 flex flex-wrap justify-center gap-2">
              {otros.map((o) => (
                <li key={o.slug}>
                  <Link
                    to={`/rubros/${o.slug}`}
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
