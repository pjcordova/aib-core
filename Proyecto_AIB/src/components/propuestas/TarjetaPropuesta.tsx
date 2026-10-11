import { solesEnteros } from '../../lib/servicios';
import { ETIQUETA_ESTADO, montos, textoPago, textoPlazo, type EstadoPropuesta, type Hito } from '../../lib/propuestas';

const fechaLarga = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es', { day: 'numeric', month: 'long' });

/**
 * Lo esencial de una propuesta: precio, plazo, pago, qué incluye y hasta
 * cuándo vale. Por etapas, el plan de entregas (aceptada, su avance lo
 * muestra quien la usa).
 */
export function TarjetaPropuesta({
  propuesta: p,
  conEstado = true,
}: {
  propuesta: {
    estado: EstadoPropuesta;
    precio: number;
    plazo_dias: number;
    incluye: string[];
    adelanto_pct: number;
    valida_hasta: string;
    nota: string | null;
    hitos?: Pick<Hito, 'id' | 'titulo' | 'porcentaje' | 'monto' | 'dias'>[];
  };
  conEstado?: boolean;
}) {
  const { adelanto, saldo } = montos(p.precio, p.adelanto_pct);
  const etiqueta = ETIQUETA_ESTADO[p.estado];
  const etapas = p.hitos ?? [];
  return (
    <div className="rounded-2xl border border-line bg-surface-raised p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-3xl font-semibold text-ink tabular-nums">{solesEnteros(p.precio)}</p>
          <p className="mt-0.5 text-sm text-ink-muted">Lista en {textoPlazo(p.plazo_dias)}</p>
        </div>
        {conEstado && (
          <span className={'rounded-full px-2.5 py-1 text-xs font-medium ' + etiqueta.clase}>{etiqueta.texto}</span>
        )}
      </div>

      <dl className="mt-4 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-ink-subtle">Forma de pago</dt>
          {etapas.length > 0 ? (
            <>
              <dd className="mt-0.5 text-ink">Por etapas</dd>
              <dd className="text-xs text-ink-muted">Pagas cada etapa al aprobar su entrega</dd>
            </>
          ) : (
            <dd className="mt-0.5 text-ink">{textoPago(p.adelanto_pct)}</dd>
          )}
          {etapas.length === 0 && p.adelanto_pct > 0 && p.adelanto_pct < 100 && (
            <dd className="text-xs text-ink-muted tabular-nums">
              {solesEnteros(adelanto)} al empezar · {solesEnteros(saldo)} al entregar
            </dd>
          )}
        </div>
        <div>
          <dt className="text-xs text-ink-subtle">Válida hasta</dt>
          <dd className="mt-0.5 text-ink">{fechaLarga(p.valida_hasta)}</dd>
        </div>
      </dl>

      {etapas.length > 0 && p.estado !== 'aceptada' && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-xs text-ink-subtle">Etapas</p>
          <ol className="mt-2 space-y-2 text-sm">
            {etapas.map((h, i) => (
              <li key={h.id} className="flex items-baseline gap-3">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent/10 text-[11px] font-semibold text-accent">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 text-ink">
                  {h.titulo}
                  <span className="text-ink-subtle"> · {textoPlazo(h.dias)}</span>
                </span>
                <span className="text-ink tabular-nums">{solesEnteros(h.monto)}</span>
                <span className="w-10 text-right text-xs text-ink-subtle tabular-nums">{h.porcentaje} %</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {p.incluye.length > 0 && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-xs text-ink-subtle">Incluye</p>
          <ul className="mt-2 space-y-1.5 text-sm text-ink">
            {p.incluye.map((linea, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent" aria-hidden="true">
                  ✓
                </span>
                {linea}
              </li>
            ))}
          </ul>
        </div>
      )}

      {p.nota && <p className="mt-4 border-t border-line pt-4 text-sm whitespace-pre-line text-ink-muted">{p.nota}</p>}
    </div>
  );
}
