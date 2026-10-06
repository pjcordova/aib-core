import { useEffect, useState } from 'react';
import { leerEmbudoPortada, type EmbudoPortada } from '../../lib/medicionPortada';

// ---------------------------------------------------------------------------
// ¿Llegan solos los dueños de negocio?
// ---------------------------------------------------------------------------
// La medición del modelo marketplace: por cada canal (el ?c= del enlace), las
// visitas a la portada y hasta dónde llegan quienes pulsan «Pruébalo gratis».
// Además, cuántos prefieren publicar la web ellos mismos.
// ---------------------------------------------------------------------------

// Como los enlaces de invitación: el dominio desde el que se abre el panel.
const ORIGEN = window.location.origin;
const CANALES_SUGERIDOS = ['instagram', 'facebook', 'whatsapp', 'maps'];
const fecha = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' });
const pct = (parte: number, total: number) => (total > 0 ? ` (${Math.round((parte / total) * 100)}%)` : '');

export function EmbudoPortadaPanel() {
  const [embudo, setEmbudo] = useState<EmbudoPortada | null | undefined>(undefined);
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    void leerEmbudoPortada().then((e) => {
      if (vigente) setEmbudo(e);
    });
    return () => {
      vigente = false;
    };
  }, []);

  const copiar = async (canal: string) => {
    try {
      await navigator.clipboard.writeText(`${ORIGEN}/?c=${canal}`);
      setCopiado(canal);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setCopiado(null);
    }
  };

  if (embudo === undefined) return <p className="mb-6 text-sm text-ink-subtle">Cargando la portada…</p>;
  if (embudo === null) return <p className="mb-6 text-sm text-negative">No se pudo leer el embudo de la portada.</p>;

  const total = embudo.canales.reduce(
    (t, c) => ({
      visitas: t.visitas + c.visitas,
      pulsaron: t.pulsaron + c.pulsaron,
      empezaron: t.empezaron + c.empezaron,
      maqueta: t.maqueta + c.maqueta,
      aceptaron: t.aceptaron + c.aceptaron,
    }),
    { visitas: 0, pulsaron: 0, empezaron: 0, maqueta: 0, aceptaron: 0 }
  );
  const { quieren, vieron_maqueta } = embudo.publicar_yo;

  return (
    <section className="mb-6 rounded-xl border border-line p-4" aria-labelledby="titulo-embudo-portada">
      <h3 id="titulo-embudo-portada" className="text-xs font-semibold tracking-wide text-accent uppercase">
        Desde la portada, sin invitación
      </h3>
      <p className="mt-1 text-sm text-ink-muted">
        ¿Llegan solos los dueños de negocio? Comparte la portada con un enlace por canal y mira cuál trae clientes.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-ink-subtle">Copiar enlace para:</span>
        {CANALES_SUGERIDOS.map((canal) => (
          <button
            key={canal}
            type="button"
            onClick={() => void copiar(canal)}
            className="btn btn-ghost !px-2.5 !py-1 text-xs"
            title={`${ORIGEN}/?c=${canal}`}
          >
            {copiado === canal ? '✓ Copiado' : canal}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-ink-subtle">
        Para otro canal, cambia el final: <span className="font-mono">{ORIGEN.replace(/^https?:\/\//, '')}/?c=nombre</span>
      </p>

      {total.visitas === 0 && total.pulsaron === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">Todavía no hay visitas. Comparte uno de los enlaces para empezar.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs tabular-nums">
            <thead className="text-ink-subtle">
              <tr>
                <th className="py-1 font-medium">Canal</th>
                <th className="py-1 font-medium">Visitas</th>
                <th className="py-1 font-medium">Pulsaron «Pruébalo»</th>
                <th className="py-1 font-medium">Empezaron</th>
                <th className="py-1 font-medium">Vieron su web</th>
                <th className="py-1 font-medium">Aceptaron</th>
              </tr>
            </thead>
            <tbody>
              {[...embudo.canales, { canal: 'Total', ...total }].map((c) => (
                <tr key={c.canal} className={'border-t border-line ' + (c.canal === 'Total' ? 'font-semibold' : '')}>
                  <td className="py-1.5 text-ink">{c.canal}</td>
                  <td className="py-1.5 text-ink">{c.visitas}</td>
                  <td className="py-1.5 text-ink">
                    {c.pulsaron}
                    <span className="font-normal text-ink-subtle">{pct(c.pulsaron, c.visitas)}</span>
                  </td>
                  <td className="py-1.5 text-ink">{c.empezaron}</td>
                  <td className="py-1.5 text-ink">{c.maqueta}</td>
                  <td className="py-1.5 text-ink">
                    {c.aceptaron}
                    <span className="font-normal text-ink-subtle">{pct(c.aceptaron, c.maqueta)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-sm text-ink">
        <strong>Prefieren publicarla ellos:</strong> {quieren} de {vieron_maqueta} que vieron su web
        {pct(quieren, vieron_maqueta)}.
      </p>
      <p className="mt-2 text-[11px] text-ink-subtle">
        {embudo.desde ? `Visitas desde el ${fecha(embudo.desde)}. ` : ''}Una visita por pestaña, sin cookies ni datos
        personales. No cuentan tus visitas con sesión ni tus pruebas.
      </p>
    </section>
  );
}
