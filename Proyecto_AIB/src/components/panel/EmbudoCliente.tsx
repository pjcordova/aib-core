import { useEffect, useState } from 'react';
import { leerEmbudo, type Embudo } from '../../lib/embudo';

// ---------------------------------------------------------------------------
// Dónde se quedan los clientes
// ---------------------------------------------------------------------------
// El embudo paso a paso del cuestionario web (solo intentos de clientes
// reales) y cuánto circulan los enlaces compartidos. Es lo que mide si los
// clientes abandonan y en qué punto, para los experimentos de validación.
// ---------------------------------------------------------------------------

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });

function haceCuanto(iso: string): string {
  const horas = (Date.now() - Date.parse(iso)) / 3_600_000;
  if (horas < 1) return 'hace menos de una hora';
  if (horas < 24) return `hace ${Math.floor(horas)} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}

export function EmbudoCliente() {
  const [embudo, setEmbudo] = useState<Embudo | null | undefined>(undefined);

  useEffect(() => {
    let vigente = true;
    void leerEmbudo().then((e) => {
      if (vigente) setEmbudo(e);
    });
    return () => {
      vigente = false;
    };
  }, []);

  if (embudo === undefined) return <p className="mb-6 text-sm text-ink-subtle">Cargando el embudo…</p>;
  if (embudo === null) {
    return <p className="mb-6 text-sm text-negative">No se pudo leer el embudo del cuestionario.</p>;
  }

  const { intentos, pasos, enlaces } = embudo;
  // El paso donde más gente se va: la mayor caída respecto al anterior.
  const caidas = pasos.map((p, i) => (i === 0 ? 0 : pasos[i - 1].llegaron - p.llegaron));
  const mayorCaida = Math.max(0, ...caidas);

  return (
    <section className="mb-6 rounded-xl border border-line p-4" aria-labelledby="titulo-embudo-cliente">
      <h3 id="titulo-embudo-cliente" className="text-xs font-semibold tracking-wide text-accent uppercase">
        Dónde se quedan en el cuestionario
      </h3>
      {intentos === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">
          Todavía no hay datos{embudo.desde ? ` (se mide desde el ${fecha(embudo.desde)})` : ''}. Cuando un cliente
          abra el cuestionario, aquí verás hasta qué paso llega.
        </p>
      ) : (
        <>
          <p className="mt-1 text-[11px] text-ink-subtle">
            {intentos} {intentos === 1 ? 'intento' : 'intentos'} de clientes reales
            {embudo.desde ? ` desde el ${fecha(embudo.desde)}` : ''}. No cuenta tus pruebas ni guarda respuestas.
          </p>
          <ol className="mt-3 space-y-1.5">
            {pasos.map((p, i) => {
              const pct = Math.round((p.llegaron / intentos) * 100);
              const esLaMayor = mayorCaida > 0 && caidas[i] === mayorCaida;
              return (
                <li key={p.id} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-xs">
                  <span className={'truncate ' + (esLaMayor ? 'font-semibold text-caution' : 'text-ink-muted')}>
                    {p.etiqueta}
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
                    <span
                      className={'block h-full rounded-full ' + (esLaMayor ? 'bg-caution' : 'bg-accent')}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="text-right text-ink tabular-nums">
                    {p.llegaron} <span className="text-ink-subtle">({pct}%)</span>
                    {caidas[i] > 0 && <span className={esLaMayor ? ' text-caution' : ' text-ink-subtle'}> −{caidas[i]}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          {mayorCaida > 0 && (
            <p className="mt-2 text-[11px] text-caution">
              Donde más gente se va: «{pasos[caidas.indexOf(mayorCaida)].etiqueta}».
            </p>
          )}
        </>
      )}

      <h3 className="mt-5 text-xs font-semibold tracking-wide text-accent uppercase">Enlaces compartidos</h3>
      <p className="mt-1 text-sm text-ink-muted tabular-nums">
        {enlaces.creados} {enlaces.creados === 1 ? 'creado' : 'creados'} · {enlaces.abiertos}{' '}
        {enlaces.abiertos === 1 ? 'abierto' : 'abiertos'} por otra persona · {enlaces.aperturas}{' '}
        {enlaces.aperturas === 1 ? 'apertura' : 'aperturas'} en total
      </p>
      {enlaces.lista.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-ink-muted">
          {enlaces.lista.slice(0, 5).map((e, i) => (
            <li key={i}>
              <span className="text-ink">{e.negocio ?? 'Un cliente'}</span>: {e.aperturas}{' '}
              {e.aperturas === 1 ? 'apertura' : 'aperturas'}
              {e.ultima ? `, la última ${haceCuanto(e.ultima)}` : ''}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-ink-subtle">
        Solo enlaces de clientes reales. No cuentan las veces que lo abres tú o su dueño; recargar sí suma.
      </p>
    </section>
  );
}
