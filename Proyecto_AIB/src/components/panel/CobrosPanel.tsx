import { useCallback, useEffect, useState } from 'react';
import { solesEnteros } from '../../lib/servicios';
import {
  comisionVigente,
  configurarComision,
  estadoCobro,
  ETIQUETA_COBRO,
  listarCobros,
  marcarComisionRecibida,
  marcarPagoCliente,
  textoPorcentaje,
  type CobroDetalle,
} from '../../lib/cobros';

// ---------------------------------------------------------------------------
// Cobros
// ---------------------------------------------------------------------------
// AIB+ no mueve dinero: cada ingeniero le cobra a su cliente y luego le paga
// la comisión al administrador. Aquí cada ingeniero ve sus cuentas y el
// administrador, las de todos, el porcentaje y qué comisiones ya recibió.
// ---------------------------------------------------------------------------

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
const suma = (lista: CobroDetalle[], campo: 'precio' | 'comision') => lista.reduce((s, c) => s + c[campo], 0);

export function CobrosPanel({
  esAdmin,
  onAbrirEncargo,
}: {
  esAdmin: boolean;
  /** Lleva a Encargos con ese encargo abierto (y buscado, por si no está en la primera página). */
  onAbrirEncargo: (id: string, negocio: string | null) => void;
}) {
  const [cobros, setCobros] = useState<CobroDetalle[] | null | undefined>(undefined);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCobros(await listarCobros());
  }, []);

  useEffect(() => {
    let vigente = true;
    void listarCobros().then((c) => {
      if (vigente) setCobros(c);
    });
    return () => {
      vigente = false;
    };
  }, []);

  const accion = async (id: string, hacer: () => Promise<boolean>) => {
    setOcupado(id);
    setError('');
    if (!(await hacer())) setError('No se pudo guardar. Vuelve a intentarlo.');
    await cargar();
    setOcupado(null);
  };

  if (cobros === undefined) return <p className="p-6 text-sm text-ink-subtle">Cargando cobros…</p>;

  const lista = cobros ?? [];
  const conComision = lista.filter((c) => c.porcentaje > 0);
  const porRecibir = conComision.filter((c) => estadoCobro(c) === 'comision_pendiente');
  const porCobrar = conComision.filter((c) => estadoCobro(c) === 'por_cobrar');
  const recibidas = conComision.filter((c) => estadoCobro(c) === 'cerrado');
  const pagados = lista.filter((c) => c.cliente_pago_en);

  return (
    <section className="mx-auto max-w-4xl px-5 py-8">
      <header className="mb-5">
        <h2 className="text-2xl font-semibold">Cobros</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {esAdmin
            ? 'Cada ingeniero le cobra a su cliente y luego te paga la comisión de AIB+. Aquí llevas la cuenta.'
            : 'Tú le cobras a tu cliente, como acuerden. Cuando te pague, le debes la comisión a AIB+.'}
        </p>
      </header>

      {esAdmin && <PorcentajeComision />}

      {cobros === null ? (
        <div className="card p-6 text-sm" role="alert">
          <p className="text-negative">No se pudieron cargar los cobros.</p>
          <button type="button" onClick={() => void cargar()} className="btn btn-ghost mt-3">
            Reintentar
          </button>
        </div>
      ) : lista.length === 0 ? (
        <div className="card p-6 text-center text-sm text-ink-muted">
          Aún no hay cobros. Abre un encargo en «Encargos» y anota el precio que acordaste con el cliente.
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            {esAdmin ? (
              <>
                <Cifra titulo="Ventas anotadas" valor={suma(lista, 'precio')} nota={`${lista.length} encargos`} />
                <Cifra
                  titulo="Comisión por recibir"
                  valor={suma(porRecibir, 'comision')}
                  nota="Sus clientes ya les pagaron"
                  destacada
                />
                <Cifra titulo="Comisión recibida" valor={suma(recibidas, 'comision')} />
              </>
            ) : (
              <>
                <Cifra titulo="Acordado con tus clientes" valor={suma(lista, 'precio')} nota={`${lista.length} encargos`} />
                <Cifra titulo="Ya te pagaron" valor={suma(pagados, 'precio')} />
                <Cifra
                  titulo="Comisión por pagar a AIB+"
                  valor={suma(porRecibir, 'comision')}
                  nota="Págasela al administrador"
                  destacada
                />
              </>
            )}
          </div>
          {porCobrar.length > 0 && (
            <p className="-mt-3 mb-6 text-xs text-ink-subtle tabular-nums">
              Cuando los clientes paguen, se sumarán {solesEnteros(suma(porCobrar, 'comision'))} de comisión.
            </p>
          )}

          {esAdmin && <PorIngeniero cobros={conComision} />}

          {error && (
            <p role="alert" className="mb-3 text-sm text-negative">
              {error}
            </p>
          )}
          <ul className="space-y-2">
            {lista.map((c) => {
              const estado = estadoCobro(c);
              const etiqueta = ETIQUETA_COBRO[estado];
              return (
                <li key={c.id} className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {c.proyecto_id ? (
                        <button
                          type="button"
                          onClick={() => onAbrirEncargo(c.proyecto_id as string, c.negocio)}
                          className="truncate font-semibold text-ink hover:text-accent"
                        >
                          {c.negocio ?? 'Encargo'}
                        </button>
                      ) : (
                        <span className="truncate font-semibold text-ink">{c.negocio ?? 'Encargo'}</span>
                      )}
                      <span className={'rounded-full px-2 py-0.5 text-[11px] font-medium ' + etiqueta.clase}>
                        {esAdmin && estado === 'comision_pendiente' ? 'Comisión por recibir' : etiqueta.texto}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-subtle tabular-nums">
                      {solesEnteros(c.precio)}
                      {c.porcentaje > 0 && ` · comisión ${solesEnteros(c.comision)} (${textoPorcentaje(c.porcentaje)})`}
                      {esAdmin && c.ingeniero && ` · ${c.ingeniero}`}
                      {c.comision_pagada_en
                        ? ` · recibida el ${fecha(c.comision_pagada_en)}`
                        : c.cliente_pago_en
                          ? ` · el cliente pagó el ${fecha(c.cliente_pago_en)}`
                          : ''}
                    </p>
                  </div>

                  {esAdmin && c.porcentaje > 0 ? (
                    <button
                      type="button"
                      disabled={ocupado === c.id}
                      onClick={() => void accion(c.id, () => marcarComisionRecibida(c.id, estado !== 'cerrado'))}
                      className={estado === 'cerrado' ? 'text-sm text-ink-muted underline underline-offset-2' : 'btn btn-ghost'}
                    >
                      {ocupado === c.id ? 'Guardando…' : estado === 'cerrado' ? 'Deshacer' : 'Marcar comisión recibida'}
                    </button>
                  ) : (
                    estado !== 'cerrado' && (
                      <label className="inline-flex items-center gap-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={!!c.cliente_pago_en}
                          disabled={ocupado === c.id}
                          onChange={(e) => void accion(c.id, () => marcarPagoCliente(c.id, e.target.checked))}
                        />
                        El cliente ya pagó
                      </label>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function Cifra({ titulo, valor, nota, destacada }: { titulo: string; valor: number; nota?: string; destacada?: boolean }) {
  return (
    <div className={'rounded-xl border p-4 ' + (destacada ? 'border-accent/30 bg-accent/5' : 'border-line')}>
      <p className="text-xs text-ink-muted">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold text-ink tabular-nums">{solesEnteros(valor)}</p>
      {nota && <p className="mt-0.5 text-[11px] text-ink-subtle">{nota}</p>}
    </div>
  );
}

/** Para el administrador: cuánto le debe cada ingeniero. */
function PorIngeniero({ cobros }: { cobros: CobroDetalle[] }) {
  const grupos = new Map<string, { id: string; nombre: string; encargos: number; porRecibir: number; recibida: number }>();
  for (const c of cobros) {
    const g = grupos.get(c.ingeniero_id) ?? {
      id: c.ingeniero_id,
      nombre: c.ingeniero ?? 'Sin perfil',
      encargos: 0,
      porRecibir: 0,
      recibida: 0,
    };
    g.encargos += 1;
    const estado = estadoCobro(c);
    if (estado === 'comision_pendiente') g.porRecibir += c.comision;
    if (estado === 'cerrado') g.recibida += c.comision;
    grupos.set(c.ingeniero_id, g);
  }
  if (grupos.size === 0) return null;

  return (
    <div className="mb-6 overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-subtle">
          <tr>
            <th className="px-4 py-2 font-medium">Ingeniero</th>
            <th className="px-4 py-2 text-right font-medium">Encargos</th>
            <th className="px-4 py-2 text-right font-medium">Por recibir</th>
            <th className="px-4 py-2 text-right font-medium">Recibida</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {[...grupos.values()]
            .sort((a, b) => b.porRecibir - a.porRecibir)
            .map((g) => (
              <tr key={g.id} className="border-t border-line">
                <td className="px-4 py-2 text-ink">{g.nombre}</td>
                <td className="px-4 py-2 text-right text-ink-muted">{g.encargos}</td>
                <td className="px-4 py-2 text-right font-medium text-ink">{solesEnteros(g.porRecibir)}</td>
                <td className="px-4 py-2 text-right text-ink-muted">{solesEnteros(g.recibida)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

/** El administrador fija el porcentaje. Vale para los precios que se anoten desde ahora. */
function PorcentajeComision() {
  const [actual, setActual] = useState<number | null>(null);
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<'inactivo' | 'guardando' | 'guardado' | 'fallo'>('inactivo');

  useEffect(() => {
    let vigente = true;
    void comisionVigente().then((p) => {
      if (!vigente || p === null) return;
      setActual(p);
      setTexto(String(p));
    });
    return () => {
      vigente = false;
    };
  }, []);

  const valor = Number(texto.replace(',', '.'));
  const valido = texto.trim() !== '' && Number.isFinite(valor) && valor >= 0 && valor <= 50;

  const guardar = async () => {
    setEstado('guardando');
    const ok = await configurarComision(valor);
    if (ok) setActual(Math.round(valor * 10) / 10);
    setEstado(ok ? 'guardado' : 'fallo');
  };

  return (
    <div className="mb-6 rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold tracking-wide text-accent uppercase">Comisión de AIB+</span>
          <span className="relative block w-24">
            <input
              inputMode="decimal"
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value.replace(/[^\d.,]/g, '').slice(0, 4));
                setEstado('inactivo');
              }}
              aria-label="Porcentaje de comisión"
              className="field !w-24 !pr-8 tabular-nums"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-subtle">%</span>
          </span>
        </label>
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={!valido || estado === 'guardando' || valor === actual}
          className="btn btn-primary"
        >
          {estado === 'guardando' ? 'Guardando…' : 'Guardar'}
        </button>
        {estado === 'guardado' && <span className="text-sm text-positive">✓ Guardado</span>}
        {estado === 'fallo' && (
          <span role="alert" className="text-sm text-negative">
            No se pudo guardar.
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-subtle">
        De 0 a 50 %. Vale para los precios que se anoten desde ahora; los ya anotados guardan el suyo. Tus propios
        encargos no llevan comisión.
      </p>
    </div>
  );
}
