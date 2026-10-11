// ---------------------------------------------------------------------------
// Propuestas formales (cotización) e ingresos del ingeniero
// ---------------------------------------------------------------------------
// El ingeniero arma la propuesta desde el encargo y se la manda al cliente
// con un enlace (/propuesta/:token). El cliente la acepta o pide cambios. AIB+
// no mueve dinero: el ingeniero marca lo que cobró (supabase_propuestas.sql).
//
// También puede ir por etapas (supabase_entregas.sql): el ingeniero entrega
// cada una, el cliente la aprueba o pide ajustes con el mismo enlace y le
// paga esa etapa al aprobarla.
// ---------------------------------------------------------------------------

import { supabase } from './supabase';
import { despertarAvisosCliente } from './api';

export type EstadoPropuesta = 'enviada' | 'aceptada' | 'cambios' | 'retirada' | 'reemplazada' | 'vencida';

export type EstadoHito = 'pendiente' | 'entregado' | 'aprobado' | 'ajustes';

/** Una etapa de una propuesta por etapas. */
export interface Hito {
  id: string;
  orden: number;
  titulo: string;
  porcentaje: number;
  monto: number;
  dias: number;
  estado: EstadoHito;
  entrega_nota: string | null;
  entrega_enlace: string | null;
  entregado_en: string | null;
  respuesta_cliente: string | null;
  respondido_en: string | null;
  /** Solo lo ve el ingeniero (y su equipo). */
  cobrado_en?: string | null;
}

export interface Propuesta {
  id: string;
  token: string;
  proyecto_id: string;
  precio: number;
  plazo_dias: number;
  incluye: string[];
  adelanto_pct: number;
  valida_hasta: string;
  nota: string | null;
  estado: EstadoPropuesta;
  comentario_cliente: string | null;
  creada_en: string;
  respondida_en: string | null;
  adelanto_cobrado_en: string | null;
  saldo_cobrado_en: string | null;
  /** Vacío si es de adelanto y saldo. */
  hitos: Hito[];
}

/** Lo que ve el cliente con el enlace. */
export interface PropuestaPublica
  extends Pick<
    Propuesta,
    | 'id'
    | 'estado'
    | 'precio'
    | 'plazo_dias'
    | 'incluye'
    | 'adelanto_pct'
    | 'valida_hasta'
    | 'nota'
    | 'comentario_cliente'
    | 'creada_en'
    | 'respondida_en'
    | 'hitos'
  > {
  negocio: string | null;
  cliente: string | null;
  ingeniero: { nombre: string; titular: string | null; foto_url: string | null; slug: string | null };
}

/** Texto y color de la etiqueta de cada estado. */
export const ETIQUETA_ESTADO: Record<EstadoPropuesta, { texto: string; clase: string }> = {
  enviada: { texto: 'Esperando respuesta', clase: 'bg-caution/15 text-caution' },
  aceptada: { texto: 'Aceptada', clase: 'bg-positive/10 text-positive' },
  cambios: { texto: 'Pidió cambios', clase: 'bg-accent-alt/20 text-ink' },
  vencida: { texto: 'Vencida', clase: 'bg-surface-overlay text-ink-subtle' },
  retirada: { texto: 'Retirada', clase: 'bg-surface-overlay text-ink-subtle' },
  reemplazada: { texto: 'Reemplazada', clase: 'bg-surface-overlay text-ink-subtle' },
};

export const ETIQUETA_HITO: Record<EstadoHito, { texto: string; clase: string }> = {
  pendiente: { texto: 'Por entregar', clase: 'bg-surface-overlay text-ink-subtle' },
  entregado: { texto: 'Por revisar', clase: 'bg-caution/15 text-caution' },
  aprobado: { texto: 'Aprobada', clase: 'bg-positive/10 text-positive' },
  ajustes: { texto: 'En ajustes', clase: 'bg-accent-alt/20 text-ink' },
};

export const urlPropuesta = (token: string) => `${window.location.origin}/propuesta/${token}`;

/** «3 semanas», «10 días», «1 día». */
export function textoPlazo(dias: number): string {
  if (dias % 7 === 0) return dias === 7 ? '1 semana' : `${dias / 7} semanas`;
  return dias === 1 ? '1 día' : `${dias} días`;
}

/** Cuánto es el adelanto y cuánto el saldo, en soles enteros. */
export function montos(precio: number, adelantoPct: number): { adelanto: number; saldo: number } {
  const adelanto = Math.round((precio * adelantoPct) / 100);
  return { adelanto, saldo: precio - adelanto };
}

/** «50 % al empezar y 50 % al entregar». */
export function textoPago(adelantoPct: number): string {
  if (adelantoPct === 0) return 'Todo al entregar';
  if (adelantoPct === 100) return 'Todo al empezar';
  return `${adelantoPct} % al empezar y ${100 - adelantoPct} % al entregar`;
}

/** Una etapa nueva, al armar la propuesta. */
export interface EtapaNueva {
  titulo: string;
  porcentaje: number;
  dias: number;
}

/** Para no empezar de cero: tres etapas que suman 3 semanas. */
export const ETAPAS_SUGERIDAS: EtapaNueva[] = [
  { titulo: 'Diseño', porcentaje: 30, dias: 7 },
  { titulo: 'Desarrollo', porcentaje: 40, dias: 10 },
  { titulo: 'Publicación', porcentaje: 30, dias: 4 },
];

/** Cuánto es cada etapa: como en la base de datos, la última se lleva el redondeo. */
export function montosEtapas(precio: number, porcentajes: number[]): number[] {
  let acumulado = 0;
  return porcentajes.map((pct, i) => {
    const monto = i === porcentajes.length - 1 ? precio - acumulado : Math.round((precio * pct) / 100);
    acumulado += monto;
    return monto;
  });
}

/** Vencida si sigue esperando y ya pasó su fecha (la base de datos hace lo mismo). Las etapas, en orden. */
function conVencimiento(p: Propuesta): Propuesta {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const hitos = [...(p.hitos ?? [])].sort((a, b) => a.orden - b.orden);
  return { ...p, hitos, estado: p.estado === 'enviada' && p.valida_hasta < hoy ? 'vencida' : p.estado };
}

const COLUMNAS =
  'id, token, proyecto_id, precio, plazo_dias, incluye, adelanto_pct, valida_hasta, nota, estado, comentario_cliente, ' +
  'creada_en, respondida_en, adelanto_cobrado_en, saldo_cobrado_en, ' +
  'hitos:hitos_propuesta(id, orden, titulo, porcentaje, monto, dias, estado, entrega_nota, entrega_enlace, entregado_en, ' +
  'respuesta_cliente, respondido_en, cobrado_en)';

/** La última propuesta de un encargo (sin las reemplazadas). null si no hay. */
export async function propuestaDeEncargo(proyecto: string): Promise<Propuesta | null> {
  const { data, error } = await supabase
    .from('propuestas')
    .select(COLUMNAS)
    .eq('proyecto_id', proyecto)
    .neq('estado', 'reemplazada')
    .order('creada_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[AIB+] No se pudo leer la propuesta:', error.message);
    return null;
  }
  return data ? conVencimiento(data as unknown as Propuesta) : null;
}

export interface DatosPropuesta {
  precio: number;
  plazo_dias: number;
  incluye: string[];
  adelanto_pct: number;
  valida_hasta: string;
  nota: string;
  /** Por etapas: el plazo es la suma de sus días y no hay adelanto. */
  etapas?: EtapaNueva[];
}

export async function enviarPropuesta(
  proyecto: string,
  d: DatosPropuesta
): Promise<{ estado: 'ok' | 'no_existe' | 'ya_aceptada' | 'error'; token?: string; error?: string }> {
  const { data, error } = d.etapas?.length
    ? await supabase.rpc('enviar_propuesta_por_etapas', {
        p_proyecto: proyecto,
        p_precio: d.precio,
        p_incluye: d.incluye,
        p_valida_hasta: d.valida_hasta,
        p_nota: d.nota,
        p_hitos: d.etapas,
      })
    : await supabase.rpc('enviar_propuesta', {
        p_proyecto: proyecto,
        p_precio: d.precio,
        p_plazo_dias: d.plazo_dias,
        p_incluye: d.incluye,
        p_adelanto_pct: d.adelanto_pct,
        p_valida_hasta: d.valida_hasta,
        p_nota: d.nota,
      });
  if (error) {
    console.error('[AIB+] No se pudo enviar la propuesta:', error.message);
    return {
      estado: 'error',
      error: error.code === '22023' ? error.message : error.code === '23514' ? 'Revisa los datos de la propuesta.' : undefined,
    };
  }
  const r = data as { estado: 'ok' | 'no_existe' | 'ya_aceptada'; token?: string };
  // La etapa pasó a «Propuesta enviada»: si el cliente tiene cuenta, le llega por correo.
  if (r.estado === 'ok') despertarAvisosCliente();
  return r;
}

export async function retirarPropuesta(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('retirar_propuesta', { p_propuesta: id });
  if (error) console.error('[AIB+] No se pudo retirar la propuesta:', error.message);
  return data === true;
}

export async function marcarCobro(id: string, tipo: 'adelanto' | 'saldo', valor: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('marcar_cobro_propuesta', { p_propuesta: id, p_tipo: tipo, p_valor: valor });
  if (error) console.error('[AIB+] No se pudo marcar el cobro:', error.message);
  return data === true;
}

/**
 * El ingeniero entrega una etapa, con una nota y, si quiere, un enlace para
 * verla. Si el cliente tiene cuenta, le llega un correo para revisarla.
 */
export async function entregarHito(
  id: string,
  nota: string,
  enlace: string
): Promise<'ok' | 'no_existe' | 'no_aceptada' | 'ya_aprobado' | 'error'> {
  const { data, error } = await supabase.rpc('entregar_hito', { p_hito: id, p_nota: nota, p_enlace: enlace });
  if (error) {
    console.error('[AIB+] No se pudo marcar la entrega:', error.message);
    return 'error';
  }
  if (data === 'ok') despertarAvisosCliente();
  return data === 'ok' || data === 'no_existe' || data === 'no_aceptada' || data === 'ya_aprobado' ? data : 'error';
}

export async function marcarCobroHito(id: string, valor: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('marcar_cobro_hito', { p_hito: id, p_valor: valor });
  if (error) console.error('[AIB+] No se pudo marcar el cobro:', error.message);
  return data === true;
}

// ----------------------------------------------------------------- cliente

export async function propuestaPorToken(token: string): Promise<PropuestaPublica | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const { data, error } = await supabase.rpc('propuesta_por_token', { p_token: token });
  if (error) {
    console.warn('[AIB+] No se pudo leer la propuesta:', error.message);
    return null;
  }
  return (data as PropuestaPublica | null) ?? null;
}

export async function responderPropuesta(
  token: string,
  acepta: boolean,
  comentario: string
): Promise<'ok' | 'no_existe' | 'vencida' | 'ya_respondida' | 'error'> {
  const { data, error } = await supabase.rpc('responder_propuesta', {
    p_token: token,
    p_acepta: acepta,
    p_comentario: comentario,
  });
  if (error) {
    console.error('[AIB+] No se pudo responder la propuesta:', error.message);
    return 'error';
  }
  const estado = (data as { estado?: string } | null)?.estado;
  return estado === 'ok' || estado === 'no_existe' || estado === 'vencida' || estado === 'ya_respondida' ? estado : 'error';
}

/** El cliente aprueba una entrega o pide ajustes (con un comentario). */
export async function responderEntrega(
  token: string,
  hito: string,
  aprueba: boolean,
  comentario: string
): Promise<'ok' | 'no_existe' | 'no_entregado' | 'error'> {
  const { data, error } = await supabase.rpc('responder_entrega', {
    p_token: token,
    p_hito: hito,
    p_aprueba: aprueba,
    p_comentario: comentario,
  });
  if (error) {
    console.error('[AIB+] No se pudo responder la entrega:', error.message);
    return 'error';
  }
  return data === 'ok' || data === 'no_existe' || data === 'no_entregado' ? data : 'error';
}

// ---------------------------------------------------------------- ingresos

export interface FilaIngreso {
  id: string;
  token: string;
  proyecto_id: string;
  negocio: string | null;
  estado: EstadoPropuesta;
  precio: number;
  plazo_dias: number;
  adelanto_pct: number;
  monto_adelanto: number;
  monto_saldo: number;
  creada_en: string;
  respondida_en: string | null;
  adelanto_cobrado_en: string | null;
  saldo_cobrado_en: string | null;
  /** Por etapas: lo que se cobra en cada una. */
  hitos: Pick<Hito, 'id' | 'orden' | 'titulo' | 'monto' | 'estado' | 'cobrado_en'>[];
}

export interface MisIngresos {
  vendido_mes: number;
  cobrado_mes: number;
  por_cobrar: number;
  esperando: number;
  esperando_monto: number;
  aceptadas: number;
  respondidas: number;
  ticket_promedio: number | null;
  propuestas: FilaIngreso[];
}

export async function misIngresos(): Promise<MisIngresos | null> {
  const { data, error } = await supabase.rpc('mis_ingresos');
  if (error) {
    console.warn('[AIB+] No se pudieron leer tus ingresos:', error.message);
    return null;
  }
  return data as MisIngresos;
}

export interface TotalesPropuestas {
  aceptado_total: number;
  aceptado_mes: number;
  enviadas: number;
  aceptadas: number;
  ticket_promedio: number | null;
  dias_para_cerrar: number | null;
  ingenieros_con_ventas: number;
}

export async function totalesPropuestas(): Promise<TotalesPropuestas | null> {
  const { data, error } = await supabase.rpc('totales_propuestas');
  if (error) {
    console.warn('[AIB+] No se pudieron leer los totales:', error.message);
    return null;
  }
  return data as TotalesPropuestas;
}
