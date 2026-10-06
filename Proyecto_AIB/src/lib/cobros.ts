// ---------------------------------------------------------------------------
// Cobros y comisión de AIB+
// ---------------------------------------------------------------------------
// AIB+ no mueve dinero: el cliente le paga a su ingeniero como acuerden. El
// ingeniero anota aquí el precio y cuándo le pagaron; el administrador marca
// la comisión como recibida (supabase_cobros.sql).
// ---------------------------------------------------------------------------

import { supabase } from './supabase';

export interface Cobro {
  id: string;
  precio: number;
  porcentaje: number;
  comision: number;
  cliente_pago_en: string | null;
  comision_pagada_en: string | null;
}

/** Un cobro en la lista del panel. */
export interface CobroDetalle extends Cobro {
  proyecto_id: string | null;
  ingeniero_id: string;
  ingeniero: string | null;
  negocio: string | null;
  creado_en: string;
}

/** El cobro de un encargo y el porcentaje que le toca (0 si es del administrador). */
export interface CobroEncargo {
  porcentaje: number;
  cobro: Cobro | null;
}

export type EstadoCobro = 'por_cobrar' | 'comision_pendiente' | 'cerrado' | 'sin_comision';

/** Texto y color de la etiqueta de cada estado. */
export const ETIQUETA_COBRO: Record<EstadoCobro, { texto: string; clase: string }> = {
  por_cobrar: { texto: 'Por cobrar al cliente', clase: 'bg-caution/15 text-caution' },
  comision_pendiente: { texto: 'Comisión por pagar', clase: 'bg-accent/10 text-accent' },
  cerrado: { texto: 'Comisión pagada', clase: 'bg-positive/10 text-positive' },
  sin_comision: { texto: 'Sin comisión', clase: 'bg-surface-overlay text-ink-subtle' },
};

export function estadoCobro(c: Cobro): EstadoCobro {
  if (c.comision_pagada_en) return 'cerrado';
  if (Number(c.porcentaje) === 0) return 'sin_comision';
  return c.cliente_pago_en ? 'comision_pendiente' : 'por_cobrar';
}

export async function cobroDeEncargo(proyecto: string): Promise<CobroEncargo | null> {
  const { data, error } = await supabase.rpc('cobro_de_encargo', { p_proyecto: proyecto });
  if (error) {
    console.warn('[AIB+] No se pudo leer el cobro:', error.message);
    return null;
  }
  if (!data) return null;
  const d = data as CobroEncargo;
  return { porcentaje: Number(d.porcentaje), cobro: d.cobro };
}

export async function registrarPrecioAcordado(
  proyecto: string,
  precio: number
): Promise<'ok' | 'cerrado' | 'no_existe' | 'error'> {
  const { data, error } = await supabase.rpc('registrar_precio_acordado', { p_proyecto: proyecto, p_precio: precio });
  if (error) {
    console.error('[AIB+] No se pudo guardar el precio:', error.message);
    return 'error';
  }
  const estado = (data as { estado?: string } | null)?.estado;
  return estado === 'ok' || estado === 'cerrado' || estado === 'no_existe' ? estado : 'error';
}

export async function marcarPagoCliente(cobro: string, pagado: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('marcar_pago_cliente', { p_cobro: cobro, p_pagado: pagado });
  if (error) console.error('[AIB+] No se pudo marcar el pago:', error.message);
  return data === true;
}

export async function marcarComisionRecibida(cobro: string, recibida: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('marcar_comision_recibida', { p_cobro: cobro, p_recibida: recibida });
  if (error) console.error('[AIB+] No se pudo marcar la comisión:', error.message);
  return data === true;
}

/** Los cobros que puede ver: los suyos o, el administrador, todos. */
export async function listarCobros(): Promise<CobroDetalle[] | null> {
  const { data, error } = await supabase
    .from('cobros_detalle')
    .select(
      'id, proyecto_id, ingeniero_id, ingeniero, negocio, precio, porcentaje, comision, cliente_pago_en, comision_pagada_en, creado_en'
    )
    .order('creado_en', { ascending: false });
  if (error) {
    console.warn('[AIB+] No se pudieron leer los cobros:', error.message);
    return null;
  }
  return ((data as CobroDetalle[] | null) ?? []).map((c) => ({ ...c, porcentaje: Number(c.porcentaje) }));
}

export async function comisionVigente(): Promise<number | null> {
  const { data, error } = await supabase.rpc('comision_vigente');
  if (error || data === null) return null;
  return Number(data);
}

export async function configurarComision(porcentaje: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('configurar_comision', { p_porcentaje: porcentaje });
  if (error) console.error('[AIB+] No se pudo cambiar la comisión:', error.message);
  return data === true;
}

/** «15 %» o «12.5 %». */
export const textoPorcentaje = (p: number) => `${Number(p).toLocaleString('es', { maximumFractionDigits: 1 })} %`;
