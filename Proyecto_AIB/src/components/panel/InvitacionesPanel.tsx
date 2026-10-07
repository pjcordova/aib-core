import { useEffect, useState } from 'react';
import {
  cambiarInvitacion,
  cambiarPremium,
  crearInvitacion,
  eliminarInvitacion,
  ETAPAS_INVITACION,
  etapaDe,
  fechaDeEtapa,
  listarInvitaciones,
  mensajeInvitacion,
  urlInvitacion,
  type Invitacion,
} from '../../lib/invitaciones';
import { EmbudoCliente } from './EmbudoCliente';
import { PruebaPrecioPanel } from './PruebaPrecioPanel';
import { EmbudoPortadaPanel } from './EmbudoPortadaPanel';

// ---------------------------------------------------------------------------
// Invitaciones
// ---------------------------------------------------------------------------
// El ingeniero crea un enlace para cada negocio y se lo manda por WhatsApp. El
// cliente entra sin crear cuenta. Arriba, el embudo de todas las invitaciones
// reales (sin las de prueba): es la métrica de validación.
// ---------------------------------------------------------------------------

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
const indiceEtapa = (inv: Invitacion) => ETAPAS_INVITACION.findIndex((e) => e.valor === etapaDe(inv));

/** esAdmin: las métricas de toda la plataforma solo las ve el administrador. */
export function InvitacionesPanel({ esAdmin = false }: { esAdmin?: boolean }) {
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sinConfigurar, setSinConfigurar] = useState(false);
  const [version, setVersion] = useState(0);

  const [negocio, setNegocio] = useState('');
  const [esPrueba, setEsPrueba] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Código de la invitación recién creada, para destacarla. */
  const [recien, setRecien] = useState<string | null>(null);
  /** Qué pasó al eliminar la última invitación. */
  const [eliminada, setEliminada] = useState<{ texto: string; fallo: boolean } | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    void listarInvitaciones().then((r) => {
      if (!vigente) return;
      setInvitaciones(r.invitaciones);
      setSinConfigurar(r.sinConfigurar);
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
  }, [version]);

  const crear = async () => {
    if (!negocio.trim()) return;
    setCreando(true);
    setError(null);
    const { token, error: fallo } = await crearInvitacion(negocio, esPrueba);
    setCreando(false);
    if (!token) {
      setError(fallo);
      return;
    }
    setRecien(token);
    setNegocio('');
    setEsPrueba(false);
    setVersion((v) => v + 1);
  };

  const cambiar = async (inv: Invitacion, cambios: { activa?: boolean; esPrueba?: boolean }) => {
    if (cambios.activa === false && !window.confirm(`¿Desactivar la invitación de ${inv.negocio}? Su enlace dejará de funcionar.`)) {
      return;
    }
    if (await cambiarInvitacion(inv.id, cambios)) setVersion((v) => v + 1);
  };

  const premium = async (inv: Invitacion) => {
    if (await cambiarPremium(inv.id, !inv.con_premium)) setVersion((v) => v + 1);
  };

  // Los encargos aceptados de una invitación real se conservan: para borrar
  // uno hay que marcar antes la invitación como prueba.
  const eliminar = async (inv: Invitacion) => {
    const queSeBorra = inv.es_prueba
      ? 'Se borra también todo lo que generó, incluido el encargo si lo aceptó.'
      : inv.aceptada_en
        ? 'Se borran sus maquetas sin aceptar; el encargo aceptado se queda en «Encargos». Deja de contar en el embudo.'
        : 'Se borran también sus maquetas y deja de contar en el embudo.';
    if (!window.confirm(`¿Eliminar la invitación de ${inv.negocio}? Su enlace dejará de funcionar. ${queSeBorra} No se puede deshacer.`)) {
      return;
    }
    setBorrando(inv.id);
    const r = await eliminarInvitacion(inv.id);
    setBorrando(null);
    if (!r) {
      setEliminada({ texto: `No se pudo eliminar la invitación de ${inv.negocio}. Vuelve a intentarlo.`, fallo: true });
      return;
    }
    const borrados = r.borrados === 1 ? '1 proyecto' : `${r.borrados} proyectos`;
    setEliminada({
      texto:
        `Invitación de ${inv.negocio} eliminada` +
        (r.borrados > 0 ? `, con ${borrados}.` : '.') +
        (r.conservados > 0 ? ' Su encargo aceptado sigue en «Encargos».' : ''),
      fallo: false,
    });
    if (recien === inv.token) setRecien(null);
    setVersion((v) => v + 1);
  };

  if (cargando) return <p className="p-6 text-sm text-ink-subtle">Cargando invitaciones…</p>;

  if (sinConfigurar) {
    return (
      <div className="card mx-auto my-8 max-w-2xl p-8 text-center">
        <h2 className="text-lg font-semibold">Falta preparar la base de datos</h2>
        <p className="mt-2 text-sm text-ink-muted">Ejecuta supabase_invitaciones.sql en el editor SQL de Supabase.</p>
      </div>
    );
  }

  // Las de la portada no son invitaciones enviadas: van en su propio resumen.
  const reales = invitaciones.filter((i) => !i.es_prueba && i.origen !== 'portada');
  // Quien pulsó «Pruébalo gratis» y se fue sin escribir nada no llega a la lista.
  const visibles = invitaciones.filter((i) => i.origen !== 'portada' || i.empezada_en !== null);
  const nueva = invitaciones.find((i) => i.token === recien);

  return (
    <section className="mx-auto max-w-4xl px-5 py-8">
      <header className="mb-6">
        <h2 className="text-2xl font-semibold">Invitaciones</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Crea un enlace para cada negocio y envíaselo por WhatsApp. Tu cliente entra sin crear cuenta, ve su web en un
          minuto y, si le gusta, te llega el encargo.
        </p>
      </header>

      {/* ------------------------------------------------------------ crear */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void crear();
        }}
        className="card mb-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-end"
      >
        <label className="flex-1">
          <span className="mb-1.5 block text-sm text-ink-muted">Nombre del negocio</span>
          <input
            type="text"
            value={negocio}
            onChange={(e) => setNegocio(e.target.value.slice(0, 80))}
            placeholder="Ej: Bodega Doña Rosa"
            className="field w-full"
            required
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-muted sm:pb-2.5">
          <input type="checkbox" checked={esPrueba} onChange={(e) => setEsPrueba(e.target.checked)} />
          Es una prueba mía
        </label>
        <button type="submit" disabled={creando || !negocio.trim()} className="btn btn-primary">
          {creando ? 'Creando…' : 'Crear enlace'}
        </button>
      </form>
      {error && (
        <p role="alert" className="-mt-3 mb-6 text-sm text-negative">
          {error}
        </p>
      )}

      {nueva && (
        <div className="mb-6 rounded-xl border border-positive/40 bg-positive/10 p-4">
          <p className="text-sm text-ink">
            <strong>¡Listo!</strong> Envíale este enlace a {nueva.negocio}:
          </p>
          <AccionesEnlace invitacion={nueva} destacado />
        </div>
      )}

      {/* ----------------------------------------------------------- embudo */}
      {reales.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-accent uppercase">
            Embudo · {reales.length} {reales.length === 1 ? 'invitación real' : 'invitaciones reales'}
          </h3>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {ETAPAS_INVITACION.map((etapa, i) => {
              const llegaron = reales.filter((inv) => indiceEtapa(inv) >= i).length;
              return (
                <li key={etapa.valor} className="rounded-xl border border-line bg-surface-raised/50 p-3">
                  <p className="text-2xl font-semibold text-ink tabular-nums">{llegaron}</p>
                  <p className="text-xs text-ink-muted">{etapa.etiqueta}</p>
                  {i > 0 && (
                    <p className="mt-1 text-[11px] text-ink-subtle tabular-nums">
                      {Math.round((llegaron / reales.length) * 100)}% del total
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-[11px] text-ink-subtle">No cuenta las invitaciones marcadas como prueba.</p>
        </div>
      )}

      {esAdmin && <EmbudoPortadaPanel />}

      {/* Métricas de toda la plataforma: solo el administrador. */}
      {esAdmin && <EmbudoCliente />}
      {esAdmin && <PruebaPrecioPanel />}

      {/* ------------------------------------------------------------ lista */}
      {eliminada && (
        <p
          role={eliminada.fallo ? 'alert' : 'status'}
          className={'mb-3 text-sm ' + (eliminada.fallo ? 'text-negative' : 'text-ink-muted')}
        >
          {eliminada.texto}
        </p>
      )}
      {visibles.length === 0 ? (
        <p className="text-sm text-ink-muted">Todavía no has creado invitaciones.</p>
      ) : (
        <ul className="space-y-3">
          {visibles.map((inv) => {
            const etapa = etapaDe(inv);
            const indice = indiceEtapa(inv);
            const fecha = fechaDeEtapa(inv, etapa);
            return (
              <li key={inv.id} className={'card p-4 ' + (inv.activa ? '' : 'opacity-60')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-ink">{inv.negocio}</p>
                      {inv.es_prueba && (
                        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-subtle">
                          Prueba
                        </span>
                      )}
                      {inv.origen === 'portada' && (
                        <span className="rounded-full border border-accent-alt/60 px-2 py-0.5 text-[11px] text-ink-muted">
                          Desde la portada
                        </span>
                      )}
                      {!inv.activa && (
                        <span className="rounded-full border border-negative/40 px-2 py-0.5 text-[11px] text-negative">
                          Desactivada
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-subtle">Creada el {fechaCorta(inv.created_at)}</p>
                  </div>
                  <span
                    className={
                      'rounded-full border px-2 py-0.5 text-[11px] font-medium ' +
                      (etapa === 'acepto'
                        ? 'border-positive/40 text-positive'
                        : etapa === 'enviada'
                          ? 'border-line text-ink-muted'
                          : 'border-accent/40 text-accent')
                    }
                  >
                    ● {ETAPAS_INVITACION[indice].etiqueta}
                    {fecha && etapa !== 'enviada' ? ` · ${fechaCorta(fecha)}` : ''}
                  </span>
                </div>

                {/* Hasta dónde llegó, de un vistazo */}
                <div className="mt-3 flex gap-1" aria-hidden="true">
                  {ETAPAS_INVITACION.map((e, i) => (
                    <span key={e.valor} className={'h-1.5 flex-1 rounded-full ' + (i <= indice ? 'bg-accent' : 'bg-line')} />
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {/* A quien llegó desde la portada no hay enlace que mandarle. */}
                  {inv.activa && inv.origen !== 'portada' && <AccionesEnlace invitacion={inv} />}
                  <button
                    type="button"
                    onClick={() => void cambiar(inv, { activa: !inv.activa })}
                    className="btn btn-ghost !px-3 !py-1.5 text-xs"
                  >
                    {inv.activa ? 'Desactivar' : 'Reactivar'}
                  </button>
                  {inv.origen !== 'portada' && (
                    <button
                      type="button"
                      onClick={() => void premium(inv)}
                      aria-pressed={!!inv.con_premium}
                      title="Si está habilitado, este cliente también ve tus diseños premium"
                      className={
                        'btn btn-ghost !px-3 !py-1.5 text-xs ' + (inv.con_premium ? '!border-accent-alt bg-accent-alt/15 text-ink' : '')
                      }
                    >
                      {inv.con_premium ? '★ Ve tus premium' : '☆ Habilitar premium'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void cambiar(inv, { esPrueba: !inv.es_prueba })}
                    className="btn btn-ghost !px-3 !py-1.5 text-xs"
                  >
                    {inv.es_prueba ? 'No es una prueba' : 'Marcar como prueba'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void eliminar(inv)}
                    disabled={borrando === inv.id}
                    className="btn btn-ghost !px-3 !py-1.5 text-xs text-negative hover:border-negative/50"
                  >
                    {borrando === inv.id ? 'Eliminando…' : 'Eliminar'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Copiar el enlace o mandarlo por WhatsApp con el mensaje ya escrito. */
function AccionesEnlace({ invitacion, destacado = false }: { invitacion: Invitacion; destacado?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  const url = urlInvitacion(invitacion.token);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(mensajeInvitacion(invitacion))}`;
  const tamano = destacado ? '' : ' !px-3 !py-1.5 text-xs';

  return (
    <div className={'flex flex-wrap items-center gap-2' + (destacado ? ' mt-3' : '')}>
      {destacado && (
        <input
          type="text"
          readOnly
          value={url}
          aria-label="Enlace de invitación"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-deep/70 px-3 py-2 font-mono text-xs text-ink"
        />
      )}
      <button type="button" onClick={() => void copiar()} className={'btn btn-ghost' + tamano}>
        {copiado ? '✓ Copiado' : 'Copiar enlace'}
      </button>
      <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={'btn btn-primary' + tamano}>
        Enviar por WhatsApp
      </a>
    </div>
  );
}
