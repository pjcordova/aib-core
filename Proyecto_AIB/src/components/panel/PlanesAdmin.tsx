import { useCallback, useEffect, useState } from 'react';
import { solesEnteros } from '../../lib/servicios';
import {
  activarPlan,
  configurarPlanes,
  descartarPedidoPlan,
  fechaCorta,
  nombrePlan,
  planesParaAdmin,
  quitarPlan,
  type IngenieroPlan,
  type Plan,
  type PlanesAdmin as DatosPlanes,
} from '../../lib/planes';

// ---------------------------------------------------------------------------
// Planes (administrador)
// ---------------------------------------------------------------------------
// Cuánto entra, a qué precio y a dónde se paga, los pedidos por atender y el
// plan de cada ingeniero. Activar = 30 días más; «Regalar» lo activa sin
// contarlo como ingreso.
// ---------------------------------------------------------------------------

export function PlanesAdmin() {
  const [datos, setDatos] = useState<DatosPlanes | null | undefined>(undefined);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => setDatos(await planesParaAdmin()), []);

  useEffect(() => {
    let vigente = true;
    void planesParaAdmin().then((d) => {
      if (vigente) setDatos(d);
    });
    return () => {
      vigente = false;
    };
  }, []);

  const hacer = async (id: string, accion: () => Promise<boolean>) => {
    setOcupado(id);
    setError('');
    if (!(await accion())) setError('No se pudo guardar. Vuelve a intentarlo.');
    await cargar();
    setOcupado(null);
  };

  if (datos === undefined) return <p className="p-6 text-sm text-ink-subtle">Cargando planes…</p>;
  if (datos === null) {
    return (
      <div className="card m-6 p-6 text-sm" role="alert">
        <p className="text-negative">No se pudieron cargar los planes.</p>
        <button type="button" onClick={() => void cargar()} className="btn btn-ghost mt-3">
          Reintentar
        </button>
      </div>
    );
  }

  const pedidos = datos.ingenieros.filter((i) => i.pedido);
  const { ingresos } = datos;

  return (
    <section className="mx-auto max-w-5xl px-5 py-8">
      <header className="mb-6">
        <h2 className="text-2xl font-semibold">Planes</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Los ingenieros piden un plan, te yapean y tú lo activas por 30 días. Los clientes no pagan nada.
        </p>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Cifra titulo="Ingreso mensual" valor={solesEnteros(ingresos.mensual)} nota="Con los planes vigentes" destacada />
        <Cifra titulo="Cobrado este mes" valor={solesEnteros(ingresos.cobrado_mes)} />
        <Cifra
          titulo="Suscriptores"
          valor={String(ingresos.pro + ingresos.negocio)}
          nota={`${ingresos.pro} Pro · ${ingresos.negocio} Negocio`}
        />
      </div>

      <Configuracion config={datos.config} onGuardado={() => void cargar()} />

      {error && (
        <p role="alert" className="mb-3 text-sm text-negative">
          {error}
        </p>
      )}

      {pedidos.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-3 text-xs font-semibold tracking-wide text-accent uppercase">
            Pedidos por atender ({pedidos.length})
          </h3>
          <ul className="space-y-2">
            {pedidos.map((i) => {
              const plan = i.pedido!.plan;
              const precio = plan === 'pro' ? datos.config.precio_pro : datos.config.precio_negocio;
              return (
                <li key={i.user_id} className="card flex flex-wrap items-center gap-x-4 gap-y-2 border-accent-alt/50 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{i.nombre}</p>
                    <p className="text-xs text-ink-subtle">
                      Quiere {nombrePlan(plan)} ({solesEnteros(precio)}) · pedido el {fechaCorta(i.pedido!.creado_en)}
                      {i.correo ? ` · ${i.correo}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={ocupado === i.user_id}
                    onClick={() => void hacer(i.user_id, () => activarPlan(i.user_id, plan, 1, false))}
                    className="btn btn-primary"
                  >
                    Ya pagó: activar
                  </button>
                  <button
                    type="button"
                    disabled={ocupado === i.user_id}
                    onClick={() => void hacer(i.user_id, () => descartarPedidoPlan(i.user_id))}
                    className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
                  >
                    Descartar
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <h3 className="mb-3 text-xs font-semibold tracking-wide text-accent uppercase">Ingenieros</h3>
      {datos.ingenieros.length === 0 ? (
        <p className="card p-6 text-center text-sm text-ink-muted">
          Aún no hay otros ingenieros. Cuando apruebes a alguien, aparecerá aquí con su plan.
        </p>
      ) : (
        <ul className="space-y-2">
          {datos.ingenieros.map((i) => (
            <FilaIngeniero
              key={i.user_id}
              ingeniero={i}
              ocupado={ocupado === i.user_id}
              onActivar={(plan, cortesia) => void hacer(i.user_id, () => activarPlan(i.user_id, plan, 1, cortesia))}
              onQuitar={() => {
                if (window.confirm(`¿Pasar a ${i.nombre} al plan Free desde ya?`)) {
                  void hacer(i.user_id, () => quitarPlan(i.user_id));
                }
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function FilaIngeniero({
  ingeniero: i,
  ocupado,
  onActivar,
  onQuitar,
}: {
  ingeniero: IngenieroPlan;
  ocupado: boolean;
  onActivar: (plan: Exclude<Plan, 'free'>, cortesia: boolean) => void;
  onQuitar: () => void;
}) {
  // El plan que vale coincide con el que pagó solo mientras no ha vencido.
  const vigente = !!i.propio && i.plan === i.propio;
  const [plan, setPlan] = useState<Exclude<Plan, 'free'>>(vigente && i.propio ? i.propio : 'pro');

  return (
    <li className="card flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink">{i.nombre}</span>
          <span
            className={
              'rounded-full px-2 py-0.5 text-[11px] font-medium ' +
              (i.plan === 'free' ? 'bg-surface-overlay text-ink-subtle' : 'bg-accent/10 text-accent')
            }
          >
            {nombrePlan(i.plan)}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-ink-subtle">
          {vigente && i.vence_en
            ? `Vence el ${fechaCorta(i.vence_en)}`
            : i.equipo_de
              ? `En el equipo de ${i.equipo_de}`
              : i.vence_en
                ? `Venció el ${fechaCorta(i.vence_en)}`
                : 'Nunca ha pagado'}
          {i.miembros > 0 ? ` · equipo de ${i.miembros + 1}` : ''}
          {i.correo ? ` · ${i.correo}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value as Exclude<Plan, 'free'>)}
          aria-label={`Plan para ${i.nombre}`}
          className="field !w-auto"
        >
          <option value="pro">Pro</option>
          <option value="negocio">Negocio</option>
        </select>
        <button type="button" disabled={ocupado} onClick={() => onActivar(plan, false)} className="btn btn-ghost">
          {vigente && i.propio === plan ? '+1 mes' : 'Activar 1 mes'}
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => onActivar(plan, true)}
          className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
          title="Lo activa sin contarlo como ingreso"
        >
          Regalar
        </button>
        {vigente && (
          <button
            type="button"
            disabled={ocupado}
            onClick={onQuitar}
            className="text-sm text-ink-muted underline underline-offset-2 hover:text-negative"
          >
            Quitar
          </button>
        )}
      </div>
    </li>
  );
}

function Cifra({ titulo, valor, nota, destacada }: { titulo: string; valor: string; nota?: string; destacada?: boolean }) {
  return (
    <div className={'rounded-xl border p-4 ' + (destacada ? 'border-accent/30 bg-accent/5' : 'border-line')}>
      <p className="text-xs text-ink-muted">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold text-ink tabular-nums">{valor}</p>
      {nota && <p className="mt-0.5 text-[11px] text-ink-subtle">{nota}</p>}
    </div>
  );
}

/** Precios y a dónde se yapea. El número lo ven los ingenieros al pedir un plan. */
function Configuracion({ config, onGuardado }: { config: DatosPlanes['config']; onGuardado: () => void }) {
  const [pro, setPro] = useState(String(config.precio_pro));
  const [negocio, setNegocio] = useState(String(config.precio_negocio));
  const [yape, setYape] = useState(config.yape_numero ?? '');
  const [titular, setTitular] = useState(config.yape_titular ?? '');
  const [estado, setEstado] = useState<'inactivo' | 'guardando' | 'guardado' | 'fallo'>('inactivo');

  const numero = yape.replace(/\D/g, '');
  const precioPro = Number(pro);
  const precioNegocio = Number(negocio);
  const valido =
    precioPro >= 1 && precioPro <= 10000 && precioNegocio >= 1 && precioNegocio <= 10000 && (!numero || /^9\d{8}$/.test(numero));

  const guardar = async () => {
    setEstado('guardando');
    const ok = await configurarPlanes({ precioPro, precioNegocio, yapeNumero: numero, yapeTitular: titular });
    setEstado(ok ? 'guardado' : 'fallo');
    if (ok) onGuardado();
  };

  const cambio = (f: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    f(e.target.value);
    setEstado('inactivo');
  };

  return (
    <div className="mb-8 rounded-xl border border-line p-4">
      <h3 className="text-xs font-semibold tracking-wide text-accent uppercase">Precios y pago</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block text-ink-muted">Pro (S/ al mes)</span>
          <input inputMode="numeric" value={pro} onChange={cambio((v) => setPro(v.replace(/\D/g, '').slice(0, 5)))} className="field tabular-nums" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-ink-muted">Negocio (S/ al mes)</span>
          <input inputMode="numeric" value={negocio} onChange={cambio((v) => setNegocio(v.replace(/\D/g, '').slice(0, 5)))} className="field tabular-nums" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-ink-muted">Tu número de Yape</span>
          <input inputMode="tel" value={yape} onChange={cambio((v) => setYape(v.slice(0, 15)))} placeholder="9XX XXX XXX" className="field tabular-nums" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-ink-muted">A nombre de</span>
          <input value={titular} onChange={cambio((v) => setTitular(v.slice(0, 80)))} placeholder="Como sale en Yape" className="field" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void guardar()} disabled={!valido || estado === 'guardando'} className="btn btn-primary">
          {estado === 'guardando' ? 'Guardando…' : 'Guardar'}
        </button>
        {estado === 'guardado' && <span className="text-sm text-positive">✓ Guardado</span>}
        {estado === 'fallo' && (
          <span role="alert" className="text-sm text-negative">
            No se pudo guardar.
          </span>
        )}
        {!valido && numero && !/^9\d{8}$/.test(numero) && (
          <span className="text-sm text-negative">El Yape es un celular de 9 dígitos que empieza con 9.</span>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-subtle">
        El número de Yape solo lo ven los ingenieros cuando piden un plan. Un precio nuevo vale para las activaciones
        que hagas desde ahora.
      </p>
    </div>
  );
}
