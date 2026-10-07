import { useEffect, useState } from 'react';
import {
  cambiarEstado,
  estadoActual,
  etiquetaEtapa,
  ETAPAS,
  listarSeguimiento,
  MAX_NOTA,
  type CambioEstado,
  type EstadoEncargo,
} from '../lib/seguimiento';
import { enlaceWhatsapp } from '../lib/contacto';
import type { TipoServicio } from '../lib/servicios';
import type { ProyectoCompleto } from '../lib/proyectos';
import { TuIngeniero } from './ingenieros/TuIngeniero';
import { PropuestaCliente } from './propuestas/PropuestaCliente';

// ---------------------------------------------------------------------------
// Seguimiento del encargo
// ---------------------------------------------------------------------------
// La misma línea de tiempo la ven el cliente (en su proyecto) y el ingeniero
// (en su panel, con el control para avanzar de etapa).
// ---------------------------------------------------------------------------

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });

interface PropsLinea {
  cambios: CambioEstado[];
  aceptadoEn?: string;
  tipo?: TipoServicio;
}

/** Las cinco etapas, con la actual destacada y la fecha en que se alcanzó cada una. */
export function LineaDeTiempo({ cambios, aceptadoEn, tipo }: PropsLinea) {
  const actual = estadoActual(cambios);
  const indiceActual = ETAPAS.findIndex((e) => e.valor === actual);
  const ultimo = cambios.at(-1);

  // La vez más reciente que se marcó esa etapa: si el encargo volvió atrás,
  // cuenta la última.
  const ultimoCon = (estado: EstadoEncargo) => [...cambios].reverse().find((c) => c.estado === estado);

  const fechaDe = (estado: EstadoEncargo): string | null => {
    const cambio = ultimoCon(estado);
    if (cambio) return fechaCorta(cambio.creadoEn);
    return estado === 'recibido' && aceptadoEn ? fechaCorta(aceptadoEn) : null;
  };

  return (
    <div>
      <ol className="grid gap-3 sm:grid-cols-5 sm:gap-2">
        {ETAPAS.map((etapa, i) => {
          const alcanzada = i <= indiceActual;
          const esActual = i === indiceActual;
          const fecha = alcanzada ? fechaDe(etapa.valor) : null;
          return (
            <li key={etapa.valor} className="flex items-center gap-3 sm:flex-col sm:items-stretch sm:gap-2">
              <div className="flex items-center">
                <span
                  className={
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
                    (esActual
                      ? 'bg-accent text-white ring-4 ring-accent/20'
                      : alcanzada
                        ? 'bg-accent/20 text-accent'
                        : 'border border-line text-ink-subtle')
                  }
                  aria-hidden="true"
                >
                  {alcanzada && !esActual ? '✓' : i + 1}
                </span>
                {i < ETAPAS.length - 1 && (
                  <span
                    className={'ml-2 hidden h-0.5 flex-1 rounded sm:block ' + (i < indiceActual ? 'bg-accent/60' : 'bg-line')}
                    aria-hidden="true"
                  />
                )}
              </div>
              <div className="min-w-0">
                <p
                  className={
                    'text-sm font-medium ' + (esActual ? 'text-accent' : alcanzada ? 'text-ink' : 'text-ink-subtle')
                  }
                  aria-current={esActual ? 'step' : undefined}
                >
                  {etiquetaEtapa(etapa.valor, tipo)}
                </p>
                {fecha && <p className="text-xs text-ink-subtle">{fecha}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 text-sm text-ink-muted">{ETAPAS[indiceActual]?.detalle}</p>
      {ultimo?.nota && (
        <p className="mt-2 rounded-lg border border-line bg-surface-deep/40 px-3 py-2 text-sm text-ink">
          <span className="text-ink-subtle">Mensaje del ingeniero · {fechaCorta(ultimo.creadoEn)}: </span>
          {ultimo.nota}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Cliente                                                                    */
/* -------------------------------------------------------------------------- */

/** Estado del encargo en el proyecto del cliente, una vez aceptado. */
export function SeguimientoCliente({
  proyectoId,
  aceptadoEn,
  tipo,
}: {
  proyectoId: string;
  aceptadoEn?: string;
  tipo?: TipoServicio;
}) {
  const [cambios, setCambios] = useState<CambioEstado[] | null>(null);

  useEffect(() => {
    let vigente = true;
    void listarSeguimiento([proyectoId]).then((mapa) => {
      if (vigente) setCambios(mapa.get(proyectoId) ?? []);
    });
    return () => {
      vigente = false;
    };
  }, [proyectoId]);

  if (!cambios) return null;

  return (
    <section className="card mt-6 p-5" aria-labelledby="titulo-seguimiento">
      <PropuestaCliente proyectoId={proyectoId} />
      <TuIngeniero proyectoId={proyectoId} publicada={estadoActual(cambios) === 'publicada'} />
      <h2 id="titulo-seguimiento" className="mb-4 text-xs font-semibold tracking-wide text-accent uppercase">
        Estado de tu encargo
      </h2>
      <LineaDeTiempo cambios={cambios} aceptadoEn={aceptadoEn} tipo={tipo} />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Ingeniero                                                                  */
/* -------------------------------------------------------------------------- */

/** Etiqueta corta de la etapa actual, para la cabecera de cada encargo. */
export function ChipEstado({ cambios, tipo }: { cambios: CambioEstado[]; tipo?: TipoServicio }) {
  const actual = estadoActual(cambios);
  const colores: Record<EstadoEncargo, string> = {
    recibido: 'border-caution/40 text-caution',
    en_revision: 'border-accent/40 text-accent',
    propuesta_enviada: 'border-accent/40 text-accent',
    en_desarrollo: 'border-accent/40 text-accent',
    publicada: 'border-positive/40 text-positive',
  };
  return (
    <span className={'rounded-full border px-2 py-0.5 text-[11px] font-medium ' + colores[actual]}>
      ● {etiquetaEtapa(actual, tipo)}
    </span>
  );
}

/**
 * Línea de tiempo más el control para marcar la etapa siguiente. Tras
 * guardar, ofrece avisar al cliente por WhatsApp con el mensaje ya escrito:
 * AIB+ no le manda nada por su cuenta.
 */
export function EditorSeguimiento({
  encargo,
  cambios,
  onCambio,
}: {
  encargo: ProyectoCompleto;
  cambios: CambioEstado[];
  onCambio: (cambio: CambioEstado) => void;
}) {
  const actual = estadoActual(cambios);
  const indiceActual = ETAPAS.findIndex((e) => e.valor === actual);
  const siguiente = ETAPAS[Math.min(indiceActual + 1, ETAPAS.length - 1)].valor;

  const [estado, setEstado] = useState<EstadoEncargo>(siguiente);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisar, setAvisar] = useState<string | null>(null);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const { cambio, error: fallo } = await cambiarEstado(encargo.id, estado, nota);
    setGuardando(false);
    if (!cambio) {
      setError(fallo);
      return;
    }
    onCambio(cambio);
    const proxima = ETAPAS[Math.min(ETAPAS.findIndex((e) => e.valor === cambio.estado) + 1, ETAPAS.length - 1)];
    setEstado(proxima.valor);
    setNota('');

    const c = encargo.contacto;
    const mensaje =
      `Hola ${c?.nombre ?? ''}, novedades de tu proyecto «${encargo.servicio}» en AIB+: ahora está en «${etiquetaEtapa(cambio.estado, encargo.tipoServicio)}».` +
      (cambio.nota ? ` ${cambio.nota}` : '') +
      ` Puedes verlo en ${window.location.origin}`;
    setAvisar(c ? enlaceWhatsapp(c.whatsapp, mensaje) : null);
  };

  return (
    <div className="mb-6 rounded-xl border border-line p-4">
      <p className="mb-4 text-[11px] font-semibold tracking-wide text-accent uppercase">Seguimiento</p>
      <LineaDeTiempo cambios={cambios} aceptadoEn={encargo.aceptadoEn} tipo={encargo.tipoServicio} />

      <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor={`etapa-${encargo.id}`} className="text-sm text-ink-muted sm:w-28">
            Nueva etapa
          </label>
          <select
            id={`etapa-${encargo.id}`}
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoEncargo)}
            className="field sm:max-w-xs"
          >
            {ETAPAS.map((e) => (
              <option key={e.valor} value={e.valor} disabled={e.valor === actual}>
                {etiquetaEtapa(e.valor, encargo.tipoServicio)}
                {e.valor === actual ? ' (actual)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor={`nota-${encargo.id}`} className="pt-2 text-sm text-ink-muted sm:w-28">
            Nota para el cliente
          </label>
          <div className="flex-1">
            <textarea
              id={`nota-${encargo.id}`}
              value={nota}
              onChange={(e) => setNota(e.target.value.slice(0, MAX_NOTA))}
              rows={2}
              placeholder="Opcional. Ej: Te envié la propuesta por WhatsApp."
              className="field w-full resize-y"
            />
            <p className="mt-1 text-right text-[11px] text-ink-subtle tabular-nums">
              {nota.length}/{MAX_NOTA}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando || estado === actual}
            className="btn btn-primary"
          >
            {guardando ? 'Guardando…' : 'Guardar etapa'}
          </button>
          {avisar && (
            <a href={avisar} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              Avisar al cliente por WhatsApp
            </a>
          )}
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
        </div>
        <p className="text-xs text-ink-subtle">El cliente ve la etapa y la nota en su proyecto al instante.</p>
      </div>
    </div>
  );
}
