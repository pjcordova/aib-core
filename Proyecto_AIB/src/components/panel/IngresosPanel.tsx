import { useCallback, useEffect, useState } from 'react';
import {
  ETIQUETA_ESTADO,
  marcarCobro,
  misIngresos,
  textoPlazo,
  totalesPropuestas,
  type FilaIngreso,
  type MisIngresos,
  type TotalesPropuestas,
} from '../../lib/propuestas';
import { solesEnteros } from '../../lib/servicios';

// ---------------------------------------------------------------------------
// Ingresos
// ---------------------------------------------------------------------------
// Cada ingeniero ve lo suyo: cuánto vendió este mes, cuánto cobró, qué le
// falta cobrar y qué propuestas esperan respuesta. El administrador ve además
// los totales de la plataforma, nunca los montos de cada ingeniero.
// ---------------------------------------------------------------------------

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });

export function IngresosPanel({ esAdmin, onAbrirEncargo }: { esAdmin: boolean; onAbrirEncargo: (id: string, negocio: string | null) => void }) {
  const [datos, setDatos] = useState<MisIngresos | null | undefined>(undefined);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => setDatos(await misIngresos()), []);

  useEffect(() => {
    let vigente = true;
    void misIngresos().then((d) => {
      if (vigente) setDatos(d);
    });
    return () => {
      vigente = false;
    };
  }, []);

  const marcar = async (id: string, tipo: 'adelanto' | 'saldo', valor: boolean) => {
    setOcupado(id);
    await marcarCobro(id, tipo, valor);
    await cargar();
    setOcupado(null);
  };

  return (
    <section className="mx-auto max-w-5xl px-5 py-8">
      <header className="mb-6">
        <h2 className="text-2xl font-semibold">Ingresos</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Lo que vendes con tus propuestas y lo que te falta cobrar. Tus clientes te pagan directo a ti: aquí llevas la cuenta.
        </p>
      </header>

      {esAdmin && <TotalesPlataforma />}

      {datos === undefined ? (
        <p className="text-sm text-ink-subtle">Cargando…</p>
      ) : datos === null ? (
        <p className="text-sm text-negative" role="alert">
          No se pudieron leer tus ingresos.
        </p>
      ) : (
        <>
          {esAdmin && <h3 className="mb-3 text-xs font-semibold tracking-wide text-accent uppercase">Tus ventas</h3>}
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Cifra titulo="Vendido este mes" valor={solesEnteros(datos.vendido_mes)} destacada />
            <Cifra titulo="Cobrado este mes" valor={solesEnteros(datos.cobrado_mes)} />
            <Cifra titulo="Por cobrar" valor={solesEnteros(datos.por_cobrar)} nota="Adelantos y saldos pendientes" />
            <Cifra
              titulo="Esperando respuesta"
              valor={String(datos.esperando)}
              nota={datos.esperando > 0 ? `${solesEnteros(datos.esperando_monto)} en propuestas` : undefined}
            />
          </div>
          {(datos.ticket_promedio || datos.respondidas > 0) && (
            <p className="-mt-3 mb-6 text-xs text-ink-subtle">
              {datos.ticket_promedio ? `Precio promedio de lo que vendes: ${solesEnteros(datos.ticket_promedio)}. ` : ''}
              {datos.respondidas > 0 &&
                `Te aceptan ${Math.round((datos.aceptadas / datos.respondidas) * 100)} % de las propuestas respondidas.`}
            </p>
          )}

          {datos.propuestas.length === 0 ? (
            <div className="card p-6 text-center text-sm text-ink-muted">
              Aún no envías propuestas. Abre un encargo en «Encargos» y pulsa «Armar propuesta».
            </div>
          ) : (
            <ul className="space-y-2">
              {datos.propuestas.map((p) => (
                <FilaPropuesta
                  key={p.id}
                  propuesta={p}
                  ocupado={ocupado === p.id}
                  onAbrir={() => onAbrirEncargo(p.proyecto_id, p.negocio)}
                  onMarcar={(tipo, valor) => void marcar(p.id, tipo, valor)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function FilaPropuesta({
  propuesta: p,
  ocupado,
  onAbrir,
  onMarcar,
}: {
  propuesta: FilaIngreso;
  ocupado: boolean;
  onAbrir: () => void;
  onMarcar: (tipo: 'adelanto' | 'saldo', valor: boolean) => void;
}) {
  const etiqueta = ETIQUETA_ESTADO[p.estado];
  return (
    <li className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onAbrir} className="truncate font-semibold text-ink hover:text-accent">
            {p.negocio ?? 'Encargo'}
          </button>
          <span className={'rounded-full px-2 py-0.5 text-[11px] font-medium ' + etiqueta.clase}>{etiqueta.texto}</span>
        </div>
        <p className="mt-0.5 text-xs text-ink-subtle tabular-nums">
          {solesEnteros(p.precio)} · {textoPlazo(p.plazo_dias)} · enviada el {fecha(p.creada_en)}
          {p.respondida_en && p.estado === 'aceptada' ? ` · aceptada el ${fecha(p.respondida_en)}` : ''}
        </p>
      </div>
      {p.estado === 'aceptada' && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {p.monto_adelanto > 0 && (
            <label className="inline-flex items-center gap-1.5 text-ink">
              <input
                type="checkbox"
                checked={!!p.adelanto_cobrado_en}
                disabled={ocupado}
                onChange={(e) => onMarcar('adelanto', e.target.checked)}
              />
              Adelanto {solesEnteros(p.monto_adelanto)}
            </label>
          )}
          {p.monto_saldo > 0 && (
            <label className="inline-flex items-center gap-1.5 text-ink">
              <input
                type="checkbox"
                checked={!!p.saldo_cobrado_en}
                disabled={ocupado}
                onChange={(e) => onMarcar('saldo', e.target.checked)}
              />
              Saldo {solesEnteros(p.monto_saldo)}
            </label>
          )}
        </div>
      )}
    </li>
  );
}

/** Solo para el administrador: lo que se mueve en toda la plataforma, sin el detalle de cada ingeniero. */
function TotalesPlataforma() {
  const [totales, setTotales] = useState<TotalesPropuestas | null | undefined>(undefined);

  useEffect(() => {
    let vigente = true;
    void totalesPropuestas().then((t) => {
      if (vigente) setTotales(t);
    });
    return () => {
      vigente = false;
    };
  }, []);

  if (!totales) return null;

  const tasa = totales.enviadas > 0 ? Math.round((totales.aceptadas / totales.enviadas) * 100) : null;
  return (
    <div className="mb-8 rounded-2xl border border-accent/30 bg-accent/5 p-5">
      <h3 className="text-xs font-semibold tracking-wide text-accent uppercase">Toda la plataforma</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra titulo="Vendido este mes" valor={solesEnteros(totales.aceptado_mes)} />
        <Cifra titulo="Vendido en total" valor={solesEnteros(totales.aceptado_total)} />
        <Cifra
          titulo="Propuestas aceptadas"
          valor={`${totales.aceptadas} de ${totales.enviadas}`}
          nota={tasa !== null ? `${tasa} % de aceptación` : undefined}
        />
        <Cifra
          titulo="Precio promedio"
          valor={totales.ticket_promedio ? solesEnteros(totales.ticket_promedio) : '—'}
          nota={totales.dias_para_cerrar !== null ? `${totales.dias_para_cerrar} días en cerrar, en promedio` : undefined}
        />
      </div>
      <p className="mt-3 text-xs text-ink-subtle">
        {totales.ingenieros_con_ventas} {totales.ingenieros_con_ventas === 1 ? 'ingeniero con ventas' : 'ingenieros con ventas'}. Los
        montos de cada ingeniero solo los ve él.
      </p>
    </div>
  );
}

function Cifra({ titulo, valor, nota, destacada }: { titulo: string; valor: string; nota?: string; destacada?: boolean }) {
  return (
    <div className={'rounded-xl border p-4 ' + (destacada ? 'border-accent/30 bg-surface-raised' : 'border-line bg-surface-raised')}>
      <p className="text-xs text-ink-muted">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold text-ink tabular-nums">{valor}</p>
      {nota && <p className="mt-0.5 text-[11px] text-ink-subtle">{nota}</p>}
    </div>
  );
}
