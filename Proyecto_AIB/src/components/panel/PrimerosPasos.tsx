import { useEffect, useState } from 'react';
import { PASOS, misPrimerosPasos, type DestinoPaso, type Paso } from '../../lib/primerosPasos';

const CLAVE_OCULTO = 'aib-primeros-pasos-oculto';

function leerOculto(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_OCULTO) === '1';
  } catch {
    return false;
  }
}

/**
 * Lo que le falta al ingeniero para empezar a recibir clientes, arriba de
 * «Hoy». Desaparece sola cuando completa los cinco pasos; mientras tanto la
 * puede ocultar (solo en este navegador).
 */
export function PrimerosPasos({ onIrA }: { onIrA: (destino: DestinoPaso) => void }) {
  const [pasos, setPasos] = useState<Paso[] | null>(null);
  const [oculto, setOculto] = useState(leerOculto);

  useEffect(() => {
    let vigente = true;
    void misPrimerosPasos().then((p) => {
      if (vigente) setPasos(p);
    });
    return () => {
      vigente = false;
    };
  }, []);

  if (!pasos || pasos.length === 0) return null;
  const hechos = pasos.filter((p) => p.hecho).length;
  if (hechos === pasos.length) return null;

  if (oculto) {
    return (
      <p className="mb-6 text-xs text-ink-subtle">
        Primeros pasos: {hechos} de {pasos.length}.{' '}
        <button
          type="button"
          onClick={() => {
            setOculto(false);
            try {
              window.localStorage.removeItem(CLAVE_OCULTO);
            } catch {
              // Sin almacenamiento: se muestra igual.
            }
          }}
          className="text-accent hover:underline"
        >
          Ver lo que falta
        </button>
      </p>
    );
  }

  // El primero que falta va destacado: es por donde seguir.
  const siguiente = pasos.find((p) => !p.hecho)?.clave;

  return (
    <section className="mb-8 rounded-2xl border border-accent/30 bg-accent/5 p-5" aria-labelledby="titulo-primeros-pasos">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="titulo-primeros-pasos" className="text-lg font-semibold text-ink">
            Tus primeros pasos en AIB+
          </h3>
          <p className="mt-0.5 text-sm text-ink-muted">Complétalos para empezar a recibir clientes.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOculto(true);
            try {
              window.localStorage.setItem(CLAVE_OCULTO, '1');
            } catch {
              // Sin almacenamiento: se oculta solo hasta recargar.
            }
          }}
          className="text-xs text-ink-subtle hover:text-ink"
        >
          Ocultar por ahora
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuenow={hechos}
          aria-valuemax={pasos.length}
          aria-label="Pasos completados"
        >
          <div className="h-full rounded-full bg-accent-alt transition-all" style={{ width: `${(hechos / pasos.length) * 100}%` }} />
        </div>
        <span className="text-xs font-medium text-ink-muted tabular-nums">
          {hechos} de {pasos.length}
        </span>
      </div>

      <ol className="mt-4 space-y-2">
        {pasos.map((p) => {
          const info = PASOS[p.clave];
          return (
            <li
              key={p.clave}
              className={
                'flex flex-wrap items-center gap-3 rounded-xl border p-3 ' +
                (p.hecho ? 'border-line bg-surface-raised/40' : 'border-line bg-surface-raised')
              }
            >
              <span
                className={
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ' +
                  (p.hecho ? 'bg-positive/15 text-positive' : 'border border-line-strong text-ink-subtle')
                }
                aria-hidden="true"
              >
                {p.hecho ? '✓' : ''}
              </span>
              <div className="min-w-0 grow basis-52">
                <p className={'text-sm font-medium ' + (p.hecho ? 'text-ink-subtle line-through' : 'text-ink')}>
                  {info.titulo}
                  {p.hecho && <span className="sr-only"> (hecho)</span>}
                </p>
                {!p.hecho && <p className="mt-0.5 text-xs text-ink-muted">{info.detalle}</p>}
              </div>
              {!p.hecho && (
                <button
                  type="button"
                  onClick={() => onIrA(info.destino)}
                  className={(p.clave === siguiente ? 'btn btn-primary' : 'btn btn-ghost') + ' !px-3 !py-1.5 text-xs'}
                >
                  {info.boton}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
