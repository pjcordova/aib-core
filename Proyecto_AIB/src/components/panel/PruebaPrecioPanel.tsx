import { useEffect, useState } from 'react';
import { solesEnteros } from '../../lib/servicios';
import { configurarPruebaPrecio, leerPruebaPrecio, type PruebaPrecio } from '../../lib/pruebaPrecio';

// ---------------------------------------------------------------------------
// Prueba de precio
// ---------------------------------------------------------------------------
// El ingeniero pone 2 o 3 precios; cada cliente ve uno solo, siempre el mismo,
// junto a su maqueta («Tu web, desde S/ X»). Aquí se configura y se ve cuántos
// aceptan con cada precio. Solo cuentan clientes reales de la ronda actual.
// ---------------------------------------------------------------------------

const HUECOS = 3;
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });

export function PruebaPrecioPanel() {
  const [prueba, setPrueba] = useState<PruebaPrecio | null | undefined>(undefined);
  const [textos, setTextos] = useState<string[]>(Array(HUECOS).fill(''));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const mostrar = (p: PruebaPrecio | null) => {
    setPrueba(p);
    if (p) setTextos(Array.from({ length: HUECOS }, (_, i) => (p.precios[i] ? String(p.precios[i]) : '')));
  };

  useEffect(() => {
    let vigente = true;
    void leerPruebaPrecio().then((p) => {
      if (!vigente) return;
      setPrueba(p);
      if (p) setTextos(Array.from({ length: HUECOS }, (_, i) => (p.precios[i] ? String(p.precios[i]) : '')));
    });
    return () => {
      vigente = false;
    };
  }, []);

  const precios = textos.map((t) => Number(t.replace(/[^\d]/g, ''))).filter((n) => n > 0);
  const cambiaron = !!prueba && precios.join(',') !== [...prueba.precios].sort((a, b) => a - b).join(',');

  const guardar = async (activa: boolean) => {
    setGuardando(true);
    setError('');
    const { ok, error: fallo } = await configurarPruebaPrecio(activa, precios);
    setGuardando(false);
    if (!ok) {
      setError(fallo ?? 'No se pudo guardar.');
      return;
    }
    mostrar(await leerPruebaPrecio());
  };

  if (prueba === undefined) return <p className="mb-6 text-sm text-ink-subtle">Cargando la prueba de precio…</p>;
  if (prueba === null) {
    return <p className="mb-6 text-sm text-negative">No se pudo leer la prueba de precio.</p>;
  }

  const total = prueba.resultados.reduce((s, r) => s + r.vieron, 0);

  return (
    <section className="mb-6 rounded-xl border border-line p-4" aria-labelledby="titulo-prueba-precio">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="titulo-prueba-precio" className="text-xs font-semibold tracking-wide text-accent uppercase">
          Prueba de precio
        </h3>
        <span
          className={
            'rounded-full px-2.5 py-0.5 text-[11px] font-medium ' +
            (prueba.activa ? 'bg-positive/10 text-positive' : 'bg-surface-overlay text-ink-subtle')
          }
        >
          {prueba.activa ? 'En marcha' : 'Apagada'}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        Pon 2 o 3 precios. Cada cliente ve uno solo, siempre el mismo, junto a su maqueta: «Tu web, desde S/ X».
        Así sabes con cuál aceptan más.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        {textos.map((t, i) => (
          <label key={i} className="flex flex-col gap-1 text-[11px] text-ink-subtle">
            Precio {String.fromCharCode(65 + i)}
            {i === HUECOS - 1 ? ' (opcional)' : ''}
            <span className="flex items-center gap-1.5">
              <span className="text-sm text-ink-muted">S/</span>
              <input
                inputMode="numeric"
                value={t}
                onChange={(e) => setTextos(textos.map((x, j) => (j === i ? e.target.value.replace(/[^\d]/g, '').slice(0, 6) : x)))}
                placeholder="—"
                aria-label={`Precio ${String.fromCharCode(65 + i)} en soles`}
                className="field !w-28 !py-2"
              />
            </span>
          </label>
        ))}
        <div className="flex gap-2">
          {prueba.activa ? (
            <>
              {cambiaron && (
                <button type="button" onClick={() => void guardar(true)} disabled={guardando} className="btn btn-primary">
                  Guardar precios
                </button>
              )}
              <button type="button" onClick={() => void guardar(false)} disabled={guardando} className="btn btn-ghost">
                Apagar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void guardar(true)}
              disabled={guardando || precios.length < 2}
              title={precios.length < 2 ? 'Pon al menos 2 precios' : undefined}
              className="btn btn-primary"
            >
              Empezar la prueba
            </button>
          )}
        </div>
      </div>
      {cambiaron && prueba.activa && (
        <p className="mt-2 text-[11px] text-caution">
          Al guardar precios nuevos empieza otra ronda: los resultados se cuentan desde cero. Quien ya vio un precio lo
          seguirá viendo.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-negative">
          {error}
        </p>
      )}

      {prueba.precios.length > 0 && (
        <>
          <p className="mt-4 text-[11px] text-ink-subtle">
            Resultados{prueba.ronda ? ` desde el ${fecha(prueba.ronda)}` : ''}: solo clientes reales, no cuenta tus
            pruebas.
          </p>
          {total === 0 ? (
            <p className="mt-1 text-sm text-ink-muted">Todavía ningún cliente ha visto un precio.</p>
          ) : (
            <table className="mt-2 w-full text-left text-xs tabular-nums">
              <thead className="text-ink-subtle">
                <tr>
                  <th className="py-1 font-medium">Precio</th>
                  <th className="py-1 font-medium">Lo vieron</th>
                  <th className="py-1 font-medium">Pulsaron «Me gusta»</th>
                  <th className="py-1 font-medium">Aceptaron</th>
                </tr>
              </thead>
              <tbody>
                {prueba.resultados.map((r) => (
                  <tr key={r.precio} className="border-t border-line">
                    <td className="py-1.5 font-semibold text-ink">{solesEnteros(r.precio)}</td>
                    <td className="py-1.5 text-ink">{r.vieron}</td>
                    <td className="py-1.5 text-ink">
                      {r.quisieron}
                      {r.vieron > 0 && <span className="text-ink-subtle"> ({Math.round((r.quisieron / r.vieron) * 100)}%)</span>}
                    </td>
                    <td className="py-1.5 text-ink">
                      {r.aceptaron}
                      {r.vieron > 0 && <span className="text-ink-subtle"> ({Math.round((r.aceptaron / r.vieron) * 100)}%)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {total > 0 && total < 10 && (
            <p className="mt-2 text-[11px] text-ink-subtle">
              Con tan pocos clientes la diferencia puede ser casualidad: espera a tener más antes de decidir.
            </p>
          )}
        </>
      )}
    </section>
  );
}
