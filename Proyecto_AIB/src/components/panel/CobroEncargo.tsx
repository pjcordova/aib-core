import { useEffect, useState } from 'react';
import { solesEnteros } from '../../lib/servicios';
import {
  cobroDeEncargo,
  estadoCobro,
  ETIQUETA_COBRO,
  marcarPagoCliente,
  registrarPrecioAcordado,
  textoPorcentaje,
  type CobroEncargo as DatosCobro,
} from '../../lib/cobros';

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });

/**
 * El cobro de un encargo, dentro de su detalle: el ingeniero anota el precio
 * que acordó con el cliente, ve la comisión de AIB+ y marca cuándo le pagaron.
 */
export function CobroEncargo({ proyectoId }: { proyectoId: string }) {
  const [datos, setDatos] = useState<DatosCobro | null | undefined>(undefined);
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    void cobroDeEncargo(proyectoId).then((d) => {
      if (!vigente) return;
      setDatos(d);
      if (d?.cobro) setTexto(String(d.cobro.precio));
    });
    return () => {
      vigente = false;
    };
  }, [proyectoId]);

  // No es suyo o no se pudo leer: no se muestra nada.
  if (!datos) return null;

  const { cobro, porcentaje } = datos;
  const precio = Number(texto.replace(/[^\d]/g, '')) || 0;
  const comision = Math.round((precio * porcentaje) / 100);
  const cerrado = !!cobro?.comision_pagada_en;
  const cambio = precio > 0 && precio !== cobro?.precio;

  const recargar = async () => {
    const d = await cobroDeEncargo(proyectoId);
    if (d) setDatos(d);
  };

  const guardar = async () => {
    if (precio < 1) {
      setError('Pon el precio en soles, sin decimales.');
      return;
    }
    setOcupado(true);
    setError('');
    const r = await registrarPrecioAcordado(proyectoId, precio);
    if (r !== 'ok') {
      setError(
        r === 'cerrado' ? 'AIB+ ya recibió la comisión de este encargo: el precio no se cambia.' : 'No se pudo guardar el precio.'
      );
    }
    await recargar();
    setOcupado(false);
  };

  const marcarPago = async (pagado: boolean) => {
    if (!cobro) return;
    setOcupado(true);
    setError('');
    if (!(await marcarPagoCliente(cobro.id, pagado))) setError('No se pudo guardar. Vuelve a intentarlo.');
    await recargar();
    setOcupado(false);
  };

  const etiqueta = cobro ? ETIQUETA_COBRO[estadoCobro(cobro)] : null;

  return (
    <section className="mb-6 rounded-xl border border-line p-4" aria-label="Cobro del encargo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-wide text-accent uppercase">Cobro</p>
        {etiqueta && (
          <span className={'rounded-full px-2.5 py-0.5 text-[11px] font-medium ' + etiqueta.clase}>{etiqueta.texto}</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-ink-muted">Precio acordado con el cliente</span>
          <span className="relative block w-36">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle">S/</span>
            <input
              inputMode="numeric"
              value={texto}
              onChange={(e) => setTexto(e.target.value.replace(/[^\d]/g, '').slice(0, 7))}
              disabled={cerrado || ocupado}
              placeholder="0"
              className="field !w-36 !pl-9 tabular-nums"
            />
          </span>
        </label>
        {!cerrado && (
          <button type="button" onClick={() => void guardar()} disabled={ocupado || !cambio} className="btn btn-primary">
            {ocupado ? 'Guardando…' : cobro ? 'Corregir' : 'Guardar'}
          </button>
        )}
      </div>

      {precio > 0 && (
        <p className="mt-2 text-sm text-ink-muted tabular-nums">
          {porcentaje === 0 ? (
            'Es tu encargo: no lleva comisión.'
          ) : (
            <>
              Comisión de AIB+ ({textoPorcentaje(porcentaje)}): <span className="whitespace-nowrap text-ink">{solesEnteros(comision)}</span> ·
              Para ti: <span className="font-medium whitespace-nowrap text-ink">{solesEnteros(precio - comision)}</span>
            </>
          )}
        </p>
      )}

      {cobro && !cerrado && (
        <label className="mt-3 inline-flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={!!cobro.cliente_pago_en}
            disabled={ocupado}
            onChange={(e) => void marcarPago(e.target.checked)}
          />
          El cliente ya me pagó
          {cobro.cliente_pago_en && <span className="text-ink-subtle">({fecha(cobro.cliente_pago_en)})</span>}
        </label>
      )}
      {cerrado && cobro?.comision_pagada_en && (
        <p className="mt-3 text-sm text-positive">✓ AIB+ recibió la comisión el {fecha(cobro.comision_pagada_en)}.</p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-negative">
          {error}
        </p>
      )}
      {!cobro && (
        <p className="mt-3 text-[11px] text-ink-subtle">
          AIB+ no le cobra al cliente: le cobras tú, como acuerden. Anota aquí el precio para llevar la cuenta.
        </p>
      )}
    </section>
  );
}
