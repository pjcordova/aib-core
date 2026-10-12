import { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from 'chart.js';
import {
  EMBUDO,
  SERIES,
  descargarExcel,
  etiquetaSemana,
  leerLlegadas,
  leerMetricas,
  nombreCanal,
  nombrePagina,
  numero,
  resumenTexto,
  soles,
  total,
  valor,
  type ClaveSerie,
  type Llegadas,
  type Metricas,
} from '../../lib/metricas';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

// ---------------------------------------------------------------------------
// Métricas (solo el administrador) — para los informes de Santander X
// ---------------------------------------------------------------------------
// Arriba, la semana en curso contra la anterior; luego el embudo del periodo,
// la evolución semanal de un número a la vez y la tabla completa. Se copia
// como texto para el informe o se descarga en Excel.
// ---------------------------------------------------------------------------

const PERIODOS = [4, 8, 12];
const TARJETAS: ClaveSerie[] = ['visitas', 'pruebas', 'encargos', 'aceptadas', 'vendido', 'ingresos'];

/** El color de la marca, leído del tema (el mismo azul de los botones). */
function colorMarca(variable: string, respaldo: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || respaldo;
}

function cambio(actual: number, anterior: number): string {
  if (anterior === 0) return actual === 0 ? 'igual que la semana anterior' : 'nuevo esta semana';
  const pct = Math.round(((actual - anterior) / anterior) * 100);
  if (pct === 0) return 'igual que la semana anterior';
  return `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}% vs semana anterior`;
}

export default function MetricasPanel() {
  const [semanas, setSemanas] = useState(8);
  const [metricas, setMetricas] = useState<Metricas | null | undefined>(undefined);
  const [serie, setSerie] = useState<ClaveSerie>('encargos');
  const [copiado, setCopiado] = useState(false);
  // De dónde llegan: si no se puede leer, el resto de las métricas se ve igual.
  const [llegadas, setLlegadas] = useState<Llegadas | null>(null);

  useEffect(() => {
    let vigente = true;
    void leerMetricas(semanas).then((m) => vigente && setMetricas(m));
    void leerLlegadas(semanas).then((l) => vigente && setLlegadas(l));
    return () => {
      vigente = false;
    };
  }, [semanas]);

  const datosGrafico = useMemo(() => {
    if (!metricas) return null;
    const azul = colorMarca('--color-accent', '#1a2d4d');
    return {
      labels: metricas.semanas.map((s) => etiquetaSemana(s.semana)),
      datasets: [
        {
          label: SERIES.find((s) => s.clave === serie)?.nombre ?? serie,
          data: metricas.semanas.map((s) => s[serie]),
          backgroundColor: azul,
          hoverBackgroundColor: colorMarca('--color-accent-alt', '#c4a26a'),
          borderRadius: 4,
          borderSkipped: 'bottom' as const,
          maxBarThickness: 36,
        },
      ],
    };
  }, [metricas, serie]);

  if (metricas === undefined) return <p className="p-6 text-sm text-ink-subtle">Cargando métricas…</p>;
  if (metricas === null) {
    return <p className="p-6 text-sm text-negative">No se pudieron leer las métricas. Recarga la página.</p>;
  }

  const actual = metricas.semanas.at(-1);
  const anterior = metricas.semanas.at(-2);
  const a = metricas.actual;
  const infoSerie = SERIES.find((s) => s.clave === serie)!;
  const tinta = colorMarca('--color-ink-muted', '#525b69');
  const linea = colorMarca('--color-line', '#e4e1d8');

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(resumenTexto(metricas, llegadas));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  };

  const embudo = EMBUDO.map((clave) => ({ clave, n: total(metricas, clave) }));
  const maxEmbudo = Math.max(1, ...embudo.map((e) => e.n));

  return (
    <section className="mx-auto max-w-6xl px-5 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Métricas</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Para tus informes de Santander X. Semanas de lunes a domingo, hora de Lima. No cuentan las pruebas que hacen los
            ingenieros como clientes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-ink-muted">
            <span className="sr-only">Periodo</span>
            <select value={semanas} onChange={(e) => setSemanas(Number(e.target.value))} className="field !py-1.5 text-sm">
              {PERIODOS.map((p) => (
                <option key={p} value={p}>
                  Últimas {p} semanas
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => void copiar()} className="btn btn-ghost !py-1.5 text-sm">
            {copiado ? '✓ Copiado' : 'Copiar resumen'}
          </button>
          <button type="button" onClick={() => void descargarExcel(metricas, llegadas)} className="btn btn-primary !py-1.5 text-sm">
            Descargar Excel
          </button>
        </div>
      </header>

      {/* ------------------------------------------------------- esta semana */}
      {actual && (
        <>
          <h3 className="mt-8 mb-3 text-xs font-semibold tracking-wide text-accent uppercase">
            Esta semana · {etiquetaSemana(actual.semana, true)} (hasta hoy)
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {TARJETAS.map((clave) => {
              const s = SERIES.find((x) => x.clave === clave)!;
              return (
                <div key={clave} className="card p-4" title={s.ayuda}>
                  <p className="text-xs text-ink-muted">{s.nombre}</p>
                  <p className="mt-1 text-2xl font-semibold text-ink tabular-nums">{valor(clave, actual[clave])}</p>
                  {anterior && <p className="mt-1 text-[11px] text-ink-subtle">{cambio(actual[clave], anterior[clave])}</p>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ------------------------------------------------------------- embudo */}
      <h3 className="mt-10 mb-3 text-xs font-semibold tracking-wide text-accent uppercase">
        Embudo de las últimas {semanas} semanas
      </h3>
      <div className="card p-5">
        <ol className="space-y-3">
          {embudo.map((paso, i) => {
            const s = SERIES.find((x) => x.clave === paso.clave)!;
            const previo = i > 0 ? embudo[i - 1].n : null;
            return (
              <li key={paso.clave} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[9rem_1fr_9rem]">
                <span className="text-ink-muted" title={s.ayuda}>
                  {s.nombre}
                </span>
                <span className="h-3 overflow-hidden rounded-full bg-surface-overlay">
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${paso.n > 0 ? Math.max(2, (paso.n / maxEmbudo) * 100) : 0}%` }}
                  />
                </span>
                <span className="text-right tabular-nums">
                  <span className="font-semibold text-ink">{numero(paso.n)}</span>
                  {previo !== null && previo > 0 && (
                    <span className="ml-1 text-xs text-ink-subtle">({Math.round((paso.n / previo) * 100)}%)</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 text-xs text-ink-subtle">
          Entre paréntesis, cuántos pasan del paso anterior. Vendido en el periodo:{' '}
          <span className="font-medium text-ink">{soles(total(metricas, 'vendido'))}</span> (lo cobran los ingenieros).
        </p>
      </div>

      {/* ---------------------------------------------------- de dónde llegan */}
      {llegadas && <DeDondeLlegan llegadas={llegadas} semanas={semanas} />}

      {/* ---------------------------------------------------- semana a semana */}
      <h3 className="mt-10 mb-3 text-xs font-semibold tracking-wide text-accent uppercase">Semana a semana</h3>
      <div className="card p-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Qué número ver">
          {SERIES.map((s) => (
            <button
              key={s.clave}
              type="button"
              onClick={() => setSerie(s.clave)}
              aria-pressed={serie === s.clave}
              className={
                'rounded-full border px-3 py-1 text-xs transition-colors ' +
                (serie === s.clave
                  ? 'border-accent bg-accent text-white'
                  : 'border-line-strong bg-surface-raised text-ink hover:border-accent/50')
              }
            >
              {s.nombre}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          <span className="font-medium text-ink">{infoSerie.nombre}</span> — {infoSerie.ayuda.toLowerCase()}. Total del
          periodo: <span className="font-medium text-ink">{valor(serie, total(metricas, serie))}</span>.
        </p>
        {datosGrafico && (
          <div className="mt-4 h-64">
            <Bar
              data={datosGrafico}
              options={{
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      title: (items) => `Semana del ${etiquetaSemana(metricas.semanas[items[0].dataIndex].semana, true)}`,
                      label: (item) => `${infoSerie.nombre}: ${valor(serie, Number(item.raw))}`,
                    },
                  },
                },
                scales: {
                  x: { grid: { display: false }, ticks: { color: tinta } },
                  y: {
                    beginAtZero: true,
                    border: { display: false },
                    grid: { color: linea },
                    ticks: { color: tinta, precision: 0, callback: (v) => (infoSerie.soles ? `S/ ${v}` : v) },
                  },
                },
              }}
            />
          </div>
        )}
      </div>

      {/* ------------------------------------------------- situación actual */}
      <h3 className="mt-10 mb-3 text-xs font-semibold tracking-wide text-accent uppercase">Situación actual</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Dato
          titulo="Ingenieros aprobados"
          valor={numero(a.ingenieros_aprobados)}
          detalle={`${a.ingenieros_verificados} verificados · ${a.ingenieros_con_disenos} con diseños${a.ingenieros_pendientes ? ` · ${a.ingenieros_pendientes} por revisar` : ''}`}
        />
        <Dato titulo="Diseños publicados" valor={numero(a.disenos_publicados)} />
        <Dato
          titulo="Clientes con cuenta"
          valor={numero(a.clientes_con_cuenta)}
          detalle={`${a.encargos} encargos en total · ${a.resenas} reseñas${a.promedio ? ` (${a.promedio} ★)` : ''}`}
        />
        <Dato
          titulo="Ingreso mensual de AIB+"
          valor={soles(a.ingreso_mensual)}
          detalle={`${a.planes_pro} Pro · ${a.planes_negocio} Negocio activos`}
        />
      </div>

      {/* --------------------------------------------------------------- tabla */}
      <details className="card mt-10 p-5">
        <summary className="cursor-pointer text-sm font-medium text-ink">Ver la tabla completa</summary>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-subtle">
                <th className="py-2 pr-3 font-medium">Semana del</th>
                {SERIES.map((s) => (
                  <th key={s.clave} className="px-2 py-2 text-right font-medium" title={s.ayuda}>
                    {s.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricas.semanas.map((s) => (
                <tr key={s.semana} className="border-b border-line/60">
                  <td className="py-2 pr-3 whitespace-nowrap text-ink-muted">{etiquetaSemana(s.semana, true)}</td>
                  {SERIES.map((serieTabla) => (
                    <td key={serieTabla.clave} className="px-2 py-2 text-right tabular-nums text-ink">
                      {valor(serieTabla.clave, s[serieTabla.clave])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function Dato({ titulo, valor: v, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-ink-muted">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold text-ink tabular-nums">{v}</p>
      {detalle && <p className="mt-1 text-xs text-ink-subtle">{detalle}</p>}
    </div>
  );
}

/** Por canal (Google, redes, directo…) y por página de entrada, en el periodo. */
function DeDondeLlegan({ llegadas, semanas }: { llegadas: Llegadas; semanas: number }) {
  const google = llegadas.canales.find((c) => c.canal === 'google');
  const maxVisitas = Math.max(1, ...llegadas.canales.map((c) => c.visitas));
  const paginas = llegadas.paginas.filter((p) => p.visitas > 0 || p.pruebas > 0);

  return (
    <>
      <h3 className="mt-10 mb-3 text-xs font-semibold tracking-wide text-accent uppercase">
        De dónde llegan · últimas {semanas} semanas
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Dato
          titulo="Visitas desde Google"
          valor={numero(google?.visitas ?? 0)}
          detalle={`${numero(google?.pruebas ?? 0)} empezaron su prueba · ${numero(google?.encargos ?? 0)} enviaron su encargo`}
        />
        <Dato
          titulo="Páginas de servicios y rubros"
          valor={numero(
            llegadas.paginas.filter((p) => /^(servicios|rubros)\//.test(p.pagina)).reduce((s, p) => s + p.visitas, 0)
          )}
          detalle="Visitas que entraron por una de ellas"
        />
        <Dato
          titulo="Canales con visitas"
          valor={numero(llegadas.canales.filter((c) => c.visitas > 0).length)}
          detalle={llegadas.canales
            .filter((c) => c.visitas > 0)
            .slice(0, 3)
            .map((c) => nombreCanal(c.canal))
            .join(' · ')}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="card overflow-x-auto p-5">
          <p className="mb-3 text-sm font-medium text-ink">Por canal</p>
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-subtle">
                <th className="py-2 pr-3 font-medium">Canal</th>
                <th className="px-2 py-2 text-right font-medium">Visitas</th>
                <th className="px-2 py-2 text-right font-medium" title="Empezaron a ver cómo quedaría lo suyo">
                  Pruebas
                </th>
                <th className="px-2 py-2 text-right font-medium" title="Vieron su maqueta">
                  Maqueta
                </th>
                <th className="py-2 pl-2 text-right font-medium" title="Enviaron su encargo a un ingeniero">
                  Encargos
                </th>
              </tr>
            </thead>
            <tbody>
              {llegadas.canales.map((c) => (
                <tr key={c.canal} className="border-b border-line/60">
                  <td className="py-2 pr-3">
                    <span className={c.canal === 'google' ? 'font-semibold text-ink' : 'text-ink'}>{nombreCanal(c.canal)}</span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-overlay" aria-hidden="true">
                      <span
                        className={'block h-full rounded-full ' + (c.canal === 'google' ? 'bg-accent-alt' : 'bg-accent')}
                        style={{ width: `${c.visitas > 0 ? Math.max(2, (c.visitas / maxVisitas) * 100) : 0}%` }}
                      />
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-ink">{numero(c.visitas)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-ink">{numero(c.pruebas)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-ink">{numero(c.maqueta)}</td>
                  <td className="py-2 pl-2 text-right tabular-nums text-ink">{numero(c.encargos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card overflow-x-auto p-5">
          <p className="mb-3 text-sm font-medium text-ink">Por página de entrada</p>
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-subtle">
                <th className="py-2 pr-3 font-medium">Página</th>
                <th className="px-2 py-2 text-right font-medium">Visitas</th>
                <th className="px-2 py-2 text-right font-medium">Desde Google</th>
                <th className="py-2 pl-2 text-right font-medium">Pruebas</th>
              </tr>
            </thead>
            <tbody>
              {paginas.map((p) => (
                <tr key={p.pagina} className="border-b border-line/60">
                  <td className="py-2 pr-3 text-ink">{nombrePagina(p.pagina)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-ink">{numero(p.visitas)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-ink">{numero(p.google)}</td>
                  <td className="py-2 pl-2 text-right tabular-nums text-ink">{numero(p.pruebas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-subtle">
        Google y las demás webs se distinguen desde el 12 de octubre de 2026; antes, todo figura como «Directo» y en la portada.
        «Directo» es quien escribió la dirección o abrió un enlace desde WhatsApp u otra app que no dice de dónde viene. Una
        visita cuenta una vez por pestaña, en la primera página que abre. Para ver qué buscaron en Google, usa Search Console.
      </p>
    </>
  );
}
