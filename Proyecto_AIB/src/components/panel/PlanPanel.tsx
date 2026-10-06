import { useCallback, useEffect, useState } from 'react';
import { avisarPedidoPlan } from '../../lib/api';
import { solesEnteros } from '../../lib/servicios';
import {
  cancelarPedidoPlan,
  crearEquipo,
  CUPO_EQUIPO,
  enlaceEquipo,
  fechaCorta,
  miEquipo,
  miPlan,
  nombrePlan,
  pedirPlan,
  PLANES,
  quitarMiembro,
  renovarEnlaceEquipo,
  salirDelEquipo,
  type MiEquipo,
  type MiPlan,
  type Plan,
} from '../../lib/planes';

// ---------------------------------------------------------------------------
// Mi plan
// ---------------------------------------------------------------------------
// El ingeniero ve su plan, pide uno (y cómo pagarlo) y, con Negocio, arma su
// equipo. El plan lo activa el administrador cuando ve el pago.
// ---------------------------------------------------------------------------

export function PlanPanel({ onCambio }: { onCambio?: () => void }) {
  const [plan, setPlan] = useState<MiPlan | null | undefined>(undefined);
  const [equipo, setEquipo] = useState<MiEquipo | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const [p, e] = await Promise.all([miPlan(), miEquipo()]);
    setPlan(p);
    setEquipo(e);
  }, []);

  useEffect(() => {
    let vigente = true;
    void Promise.all([miPlan(), miEquipo()]).then(([p, e]) => {
      if (!vigente) return;
      setPlan(p);
      setEquipo(e);
    });
    return () => {
      vigente = false;
    };
  }, []);

  const recargar = async () => {
    await cargar();
    onCambio?.();
  };

  const pedir = async (id: Exclude<Plan, 'free'>) => {
    setOcupado(true);
    setError('');
    if (await pedirPlan(id)) {
      // Si el aviso no sale, el pedido igual le aparece al administrador en su panel.
      void avisarPedidoPlan().catch(() => {});
      await recargar();
    } else {
      setError('No se pudo enviar el pedido. Vuelve a intentarlo.');
    }
    setOcupado(false);
  };

  const cancelar = async () => {
    setOcupado(true);
    await cancelarPedidoPlan();
    await recargar();
    setOcupado(false);
  };

  if (plan === undefined) return <p className="p-6 text-sm text-ink-subtle">Cargando tu plan…</p>;
  if (plan === null) {
    return (
      <p className="p-6 text-sm text-negative" role="alert">
        No se pudo leer tu plan. Recarga la página.
      </p>
    );
  }

  const propioVigente = plan.propio?.vigente ? plan.propio : null;
  const precioDe = (id: Plan) => (id === 'pro' ? plan.precios.pro : id === 'negocio' ? plan.precios.negocio : 0);

  return (
    <section className="mx-auto max-w-5xl px-5 py-8">
      <header className="mb-6">
        <h2 className="text-2xl font-semibold">Mi plan</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {plan.por_equipo ? (
            <>
              Tienes el plan <strong className="text-ink">Negocio</strong> por ser parte del equipo de{' '}
              {equipo?.agencia ?? 'tu equipo'}.
            </>
          ) : propioVigente ? (
            <>
              Tienes el plan <strong className="text-ink">{nombrePlan(propioVigente.plan)}</strong> hasta el{' '}
              {fechaCorta(propioVigente.vence_en)}.
            </>
          ) : plan.propio ? (
            <>
              Tu plan {nombrePlan(plan.propio.plan)} venció el {fechaCorta(plan.propio.vence_en)}: estás en{' '}
              <strong className="text-ink">Free</strong>.
            </>
          ) : (
            <>
              Estás en el plan <strong className="text-ink">Free</strong>.
            </>
          )}
        </p>
      </header>

      {plan.pedido && (
        <div className="mb-6 rounded-xl border border-accent-alt/50 bg-accent-alt/10 p-4 text-sm" role="status">
          <p className="font-medium text-ink">
            Pediste el plan {nombrePlan(plan.pedido.plan)} el {fechaCorta(plan.pedido.creado_en)}.
          </p>
          <p className="mt-1 text-ink-muted">
            {plan.yape ? (
              <>
                Yapea <strong className="text-ink">{solesEnteros(precioDe(plan.pedido.plan))}</strong> al{' '}
                <strong className="text-ink tabular-nums">{plan.yape.numero.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}</strong>
                {plan.yape.titular ? ` (${plan.yape.titular})` : ''} con tu nombre en el mensaje. Tu plan se activa en cuanto el
                administrador vea el pago.
              </>
            ) : (
              'El administrador te escribirá para coordinar el pago. Tu plan se activa en cuanto lo vea.'
            )}
          </p>
          <button
            type="button"
            onClick={() => void cancelar()}
            disabled={ocupado}
            className="mt-2 text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            Cancelar pedido
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mb-4 text-sm text-negative">
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {PLANES.map((p) => {
          const actual = p.id === (plan.por_equipo ? 'negocio' : (propioVigente?.plan ?? 'free'));
          const pedido = plan.pedido?.plan === p.id;
          return (
            <article
              key={p.id}
              className={
                'flex flex-col rounded-2xl border p-5 ' +
                (p.id === 'pro' ? 'border-accent/40 bg-accent/5' : 'border-line bg-surface-raised')
              }
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xl">{p.nombre}</h3>
                {actual && (
                  <span className="rounded-full bg-positive/10 px-2.5 py-0.5 text-[11px] font-medium text-positive">
                    Tu plan
                  </span>
                )}
              </div>
              <p className="mt-2">
                {p.id === 'free' ? (
                  <span className="text-3xl font-semibold text-ink">Gratis</span>
                ) : (
                  <>
                    <span className="text-3xl font-semibold text-ink tabular-nums">{solesEnteros(precioDe(p.id))}</span>
                    <span className="text-sm text-ink-muted"> al mes</span>
                  </>
                )}
              </p>
              <p className="mt-1 text-sm text-ink-muted">{p.resumen}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-ink">
                {p.incluye.map((linea) => (
                  <li key={linea} className="flex gap-2">
                    <span className="text-accent" aria-hidden="true">
                      ✓
                    </span>
                    {linea}
                  </li>
                ))}
              </ul>
              {p.id !== 'free' && !plan.por_equipo && (
                <button
                  type="button"
                  onClick={() => void pedir(p.id as Exclude<Plan, 'free'>)}
                  disabled={ocupado || pedido}
                  className={'btn mt-5 w-full ' + (p.id === 'pro' ? 'btn-primary' : 'btn-ghost')}
                >
                  {pedido
                    ? 'Pedido enviado'
                    : actual
                      ? 'Renovar un mes'
                      : propioVigente
                        ? `Cambiar a ${p.nombre}`
                        : `Quiero ${p.nombre}`}
                </button>
              )}
            </article>
          );
        })}
      </div>

      {(equipo || propioVigente?.plan === 'negocio') && (
        <EquipoSeccion equipo={equipo} onCambio={() => void recargar()} />
      )}
    </section>
  );
}

/** Con Negocio: el enlace para unirse, quiénes están y, si eres miembro, salir. */
function EquipoSeccion({ equipo, onCambio }: { equipo: MiEquipo | null; onCambio: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState('');

  const hacer = async (accion: () => Promise<boolean>) => {
    setOcupado(true);
    setError('');
    if (!(await accion())) setError('No se pudo guardar. Vuelve a intentarlo.');
    setOcupado(false);
    onCambio();
  };

  if (!equipo) {
    return (
      <div className="card mt-8 p-6">
        <h3 className="text-xl">Tu equipo</h3>
        <p className="mt-1 text-sm text-ink-muted">
          Invita hasta {CUPO_EQUIPO - 1} personas: verán tus encargos, tendrán ABI y tú repartes quién lleva cada uno.
        </p>
        <button type="button" onClick={() => void hacer(crearEquipo)} disabled={ocupado} className="btn btn-primary mt-4">
          Armar mi equipo
        </button>
        {error && (
          <p role="alert" className="mt-2 text-sm text-negative">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (equipo.rol === 'miembro') {
    return (
      <div className="card mt-8 p-6">
        <h3 className="text-xl">Tu equipo</h3>
        <p className="mt-1 text-sm text-ink-muted">
          Eres parte del equipo de <strong className="text-ink">{equipo.agencia ?? 'otro ingeniero'}</strong>. Ves sus encargos y
          los que te asigne.
        </p>
        {!equipo.activo && (
          <p className="mt-2 text-sm text-caution">
            El plan Negocio de tu equipo venció: no verás sus encargos hasta que lo renueve.
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            if (window.confirm('¿Seguro que quieres salir del equipo? Dejarás de ver sus encargos.')) void hacer(salirDelEquipo);
          }}
          disabled={ocupado}
          className="mt-4 text-sm text-ink-muted underline underline-offset-2 hover:text-negative"
        >
          Salir del equipo
        </button>
      </div>
    );
  }

  const enlace = equipo.token ? enlaceEquipo(equipo.token) : null;
  const lleno = equipo.miembros.length >= CUPO_EQUIPO - 1;

  const copiar = async () => {
    if (!enlace) return;
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.prompt('Copia el enlace:', enlace);
    }
  };

  return (
    <div className="card mt-8 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl">Tu equipo</h3>
        <span className="text-sm text-ink-muted tabular-nums">
          {equipo.miembros.length + 1} de {CUPO_EQUIPO} personas
        </span>
      </div>
      {!equipo.activo && (
        <p className="mt-2 text-sm text-caution">
          Tu plan Negocio venció: tu equipo no ve tus encargos hasta que lo renueves.
        </p>
      )}

      <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
        <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
          <span className="font-medium text-ink">Tú</span>
          <span className="text-xs text-ink-subtle">Dueño</span>
        </li>
        {equipo.miembros.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="text-ink">
              {m.nombre} <span className="text-xs text-ink-subtle">· desde el {fechaCorta(m.desde)}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`¿Quitar a ${m.nombre} del equipo? Sus encargos vuelven a ti.`)) {
                  void hacer(() => quitarMiembro(m.id));
                }
              }}
              disabled={ocupado}
              className="text-xs text-ink-muted underline underline-offset-2 hover:text-negative"
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>

      {lleno ? (
        <p className="mt-4 text-sm text-ink-muted">Tu equipo está completo.</p>
      ) : (
        enlace && (
          <div className="mt-4">
            <p className="text-sm text-ink">Para sumar a alguien, mándale este enlace:</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-overlay px-3 py-2 text-xs">{enlace}</code>
              <button type="button" onClick={() => void copiar()} className="btn btn-ghost">
                {copiado ? '✓ Copiado' : 'Copiar'}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Únete a mi equipo en AIB+: ${enlace}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                Enviar por WhatsApp
              </a>
            </div>
            <button
              type="button"
              onClick={() => void hacer(renovarEnlaceEquipo)}
              disabled={ocupado}
              className="mt-2 text-xs text-ink-muted underline underline-offset-2 hover:text-ink"
            >
              Cambiar el enlace (el anterior deja de servir)
            </button>
          </div>
        )
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
