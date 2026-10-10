import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { textoEstrellas, textoServicios } from '../../lib/ingenieros';
import {
  documentoDeDiseno,
  empezarConfirmando,
  perfilPublico,
  type DisenoPublico,
  type PerfilPublico as Perfil,
} from '../../lib/perfilPublico';
import { etiquetaNivel } from '../../lib/plantillaPropia';
import { CATEGORIAS_NEGOCIO } from '../../lib/plantillas';
import { iconoDeClave, nombreDeClave, solesEnteros } from '../../lib/servicios';
import { MiniVista } from '../panel/MiniVista';
import { PiePagina } from '../ui/PiePagina';
import { Wordmark } from '../ui/Primitives';
import { FotoIngeniero } from './TarjetaIngeniero';

// ---------------------------------------------------------------------------
// Página pública del ingeniero (/ing/:slug)
// ---------------------------------------------------------------------------
// La que comparte con sus clientes: quién es, qué ofrece, sus diseños con
// precio y lo que dicen sus clientes. «Trabajar con…» (o «Lo quiero» en un
// diseño) abre la prueba sin cuenta atada a él: ve solo sus servicios y sus
// diseños, y el encargo le llega directo.
// ---------------------------------------------------------------------------

const etiquetaRubro = (v: string) => CATEGORIAS_NEGOCIO.find((c) => c.valor === v)?.etiqueta ?? v;

/** Solo hace webs (o tiendas): el botón lo dice y lleva directo a la web. */
const soloWeb = (p: Perfil) =>
  p.servicios_otros.length === 0 && p.servicios.every((s) => s === 'web' || s === 'tienda-online');

export function PerfilPublico() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [perfil, setPerfil] = useState<Perfil | null | undefined>(undefined);
  const [empezando, setEmpezando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    void perfilPublico(slug).then((p) => {
      if (vigente) setPerfil(p);
    });
    return () => {
      vigente = false;
    };
  }, [slug]);

  useEffect(() => {
    if (perfil) document.title = `${perfil.nombre} · Ingeniero en AIB+`;
  }, [perfil]);

  const primerNombre = perfil?.nombre.split(/\s+/)[0] ?? '';

  /**
   * Abre la prueba atada a este ingeniero. `clave`: el servicio con el que
   * empieza («Lo quiero» en un diseño); sin ella elige entre los suyos.
   */
  const empezar = async (clave?: string) => {
    if (!perfil) return;
    setEmpezando(true);
    setError('');
    const r = await empezarConfirmando(slug, primerNombre, signOut);
    if (r === 'cancelado') {
      setEmpezando(false);
      return;
    }
    if (r === 'ok') {
      const servicio = clave ?? (soloWeb(perfil) ? 'web' : undefined);
      navigate('/mi-web', { state: servicio ? { clave: servicio } : null });
      return;
    }
    if (r === 'con_cuenta') {
      navigate('/');
      return;
    }
    setEmpezando(false);
    setError(
      r === 'lleno'
        ? `${primerNombre} recibió muchas solicitudes hoy. Vuelve a intentarlo mañana.`
        : 'No pudimos empezar. Revisa tu conexión y vuelve a intentarlo.'
    );
  };

  if (perfil === undefined) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    );
  }

  if (perfil === null) {
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-3xl text-ink">Este perfil no está disponible</h1>
          <p className="mt-3 text-sm text-ink-muted">Puede que la dirección haya cambiado o que el ingeniero aún no esté publicado.</p>
          <Link to="/" className="btn btn-primary mt-6 inline-flex">
            Ir a AIB+
          </Link>
        </div>
      </div>
    );
  }

  // Si hace más que webs, el cliente elige después cuál de sus servicios quiere.
  const textoBoton = soloWeb(perfil) ? `Quiero mi web con ${primerNombre}` : `Trabajar con ${primerNombre}`;
  const boton = (
    <button type="button" onClick={() => void empezar()} disabled={empezando} className="btn btn-primary px-6 py-3 text-base">
      {empezando ? 'Preparando…' : textoBoton}
    </button>
  );

  return (
    <div className="min-h-screen">
      <header className="cabecera-marca sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="Ir a la portada de AIB+">
            <Wordmark />
          </Link>
          <button type="button" onClick={() => void empezar()} disabled={empezando} className="btn btn-primary">
            <span className="sm:hidden">Empezar</span>
            <span className="hidden sm:inline">{textoBoton}</span>
          </button>
        </div>
      </header>

      <main>
        {/* ---------------------------------------------------------- quién es */}
        <section className="mx-auto max-w-6xl px-4 pt-10 pb-12 sm:px-6">
          <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-start sm:text-left">
            <FotoIngeniero nombre={perfil.nombre} foto={perfil.foto_url} tamano={120} />
            <div className="min-w-0 flex-1">
              <p className="mb-2 text-xs font-medium tracking-[0.2em] text-ink-subtle uppercase">Ingeniero en AIB+</p>
              <h1 className="text-4xl leading-tight text-balance sm:text-5xl">{perfil.nombre}</h1>
              {perfil.titular && <p className="mt-2 text-lg text-ink-muted">{perfil.titular}</p>}
              <p className="mt-3 text-sm text-ink-muted">
                {[
                  textoEstrellas(perfil.promedio, perfil.resenas),
                  perfil.publicadas > 0 && `${perfil.publicadas} ${perfil.publicadas === 1 ? 'web publicada' : 'webs publicadas'}`,
                  perfil.ciudad,
                  perfil.anios_experiencia ? `${perfil.anios_experiencia} años de experiencia` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {perfil.servicios.length > 0 && (
                <p className="mt-3 text-sm text-ink">
                  <span className="text-ink-subtle">Ofrece:</span> {textoServicios(perfil.servicios, perfil.servicios_otros)}
                </p>
              )}
              {perfil.especialidades.length > 0 && (
                <ul className="mt-3 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                  {perfil.especialidades.map((r) => (
                    <li key={r} className="rounded-full bg-surface-overlay px-2.5 py-0.5 text-xs text-ink-muted">
                      {etiquetaRubro(r)}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
                {boton}
                {perfil.disenos.length > 0 && (
                  <a href="#disenos" className="btn btn-ghost px-6 py-3 text-base">
                    Ver sus diseños
                  </a>
                )}
              </div>
              <p className="mt-2 text-xs text-ink-subtle">
                Gratis y sin crear cuenta: respondes unas preguntas y en un minuto ves cómo quedaría.
              </p>
              {error && (
                <p role="alert" className="mt-2 text-sm text-negative">
                  {error}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- sus diseños */}
        {perfil.disenos.length > 0 && (
          <section id="disenos" className="scroll-mt-24 border-y border-line bg-surface-raised/60">
            <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
              <h2 className="text-3xl">Sus diseños</h2>
              <p className="mt-2 text-ink-muted">Cada diseño saldrá con tu nombre, tus colores y tus textos.</p>
              <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {perfil.disenos.map((d) => (
                  <TarjetaDiseno key={d.id} diseno={d} empezando={empezando} onQuiero={() => void empezar(d.servicio)} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------- sobre él */}
        {(perfil.bio || perfil.portafolio_url) && (
          <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
            <h2 className="text-3xl">Sobre {primerNombre}</h2>
            {perfil.bio && <p className="mt-4 whitespace-pre-line text-ink">{perfil.bio}</p>}
            {perfil.portafolio_url && (
              <a
                href={perfil.portafolio_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block font-medium text-accent hover:underline"
              >
                Ver su portafolio ↗
              </a>
            )}
          </section>
        )}

        {/* ---------------------------------------------------------- reseñas */}
        <section className="mx-auto max-w-3xl px-4 pb-14 sm:px-6">
          <h2 className="text-3xl">Lo que dicen sus clientes</h2>
          {perfil.ultimas.length === 0 ? (
            <p className="mt-3 text-ink-muted">
              {primerNombre} es nuevo en AIB+: sus clientes lo califican cuando su web queda publicada.
            </p>
          ) : (
            <ul className="mt-6 space-y-4">
              {perfil.ultimas.map((r, i) => (
                <li key={i} className="card p-5">
                  <p className="text-accent-alt" aria-label={`${r.estrellas} de 5 estrellas`}>
                    {'★'.repeat(r.estrellas)}
                    <span className="text-line-strong">{'★'.repeat(5 - r.estrellas)}</span>
                  </p>
                  {r.comentario && <p className="mt-2 text-ink">«{r.comentario}»</p>}
                  <p className="mt-2 text-xs text-ink-subtle">
                    {[r.autor, r.negocio].filter(Boolean).join(' · ') || 'Cliente de AIB+'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ------------------------------------------------------ llamada final */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="rounded-3xl bg-accent px-6 py-12 text-center text-white">
            <h2 className="text-3xl text-white">{soloWeb(perfil) ? '¿Empezamos tu web?' : '¿Empezamos tu proyecto?'}</h2>
            <p className="mx-auto mt-2 max-w-md text-white/80">
              Míralo gratis en un minuto. Si te gusta, {primerNombre} lo construye contigo.
            </p>
            <button
              type="button"
              onClick={() => void empezar()}
              disabled={empezando}
              className="btn mt-6 bg-accent-alt px-6 py-3 text-base text-ink hover:brightness-105"
            >
              {empezando ? 'Preparando…' : textoBoton}
            </button>
          </div>
        </section>
      </main>

      <PiePagina />
    </div>
  );
}

function TarjetaDiseno({
  diseno: d,
  empezando,
  onQuiero,
}: {
  diseno: DisenoPublico;
  empezando: boolean;
  /** Empieza con este ingeniero y el servicio del diseño. */
  onQuiero: () => void;
}) {
  const documento = useMemo(() => documentoDeDiseno(d), [d]);
  if (!documento) return null;
  return (
    <article className="card overflow-hidden">
      <MiniVista documento={documento} titulo={`Diseño ${d.nombre}`} alto={260} inmediata interactiva />
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink">{d.nombre}</p>
          {d.nivel !== 'basica' && (
            <span className="rounded-full bg-accent-alt/20 px-2 py-0.5 text-[11px] font-medium text-ink">{etiquetaNivel(d.nivel)}</span>
          )}
        </div>
        {d.descripcion && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{d.descripcion}</p>}
        <p className="mt-1 text-xs text-ink-subtle">
          {/* Los de otros servicios (CRM, ERP…) dicen cuál; las webs, su rubro. */}
          {d.servicio && d.servicio !== 'web' ? `${iconoDeClave(d.servicio)} ${nombreDeClave(d.servicio)}` : etiquetaRubro(d.categoria)}
        </p>
        {d.precio_desde !== null && (
          <p className="mt-3 text-base font-semibold text-ink tabular-nums">desde {solesEnteros(d.precio_desde)}</p>
        )}
        <button type="button" onClick={onQuiero} disabled={empezando} className="btn btn-primary mt-4 w-full">
          Lo quiero
        </button>
      </div>
    </article>
  );
}
