import { COMPARATIVA, PLANES, type Plan } from '../../lib/planes';

/**
 * Free, Pro y Negocio lado a lado, beneficio por beneficio. En /ingenieros y
 * en «Mi plan», debajo de las tarjetas con el precio.
 */
export function ComparativaPlanes({ actual }: { actual?: Plan | null }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface-raised">
      <table className="w-full min-w-[520px] text-sm">
        <caption className="sr-only">Qué incluye cada plan</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-ink-subtle">
              Incluye
            </th>
            {PLANES.map((p) => (
              <th
                key={p.id}
                scope="col"
                className={
                  'w-28 px-3 py-3 text-center text-sm font-semibold ' +
                  (p.id === 'pro' ? 'bg-accent/5 text-accent' : 'text-ink')
                }
              >
                {p.nombre}
                {actual === p.id && <span className="block text-[10px] font-medium text-positive">Tu plan</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARATIVA.map((fila) => (
            <tr key={fila.beneficio} className="border-b border-line/60 last:border-0">
              <th scope="row" className="px-4 py-2.5 text-left font-normal text-ink">
                {fila.beneficio}
              </th>
              {PLANES.map((p) => {
                const valor = fila[p.id];
                return (
                  <td key={p.id} className={'px-3 py-2.5 text-center ' + (p.id === 'pro' ? 'bg-accent/5' : '')}>
                    {valor === true ? (
                      <span className="text-accent" aria-label="Sí">
                        ✓
                      </span>
                    ) : valor === false ? (
                      <span className="text-ink-subtle" aria-label="No">
                        —
                      </span>
                    ) : (
                      <span className="text-xs text-ink">{valor}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
