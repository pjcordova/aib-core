// ---------------------------------------------------------------------------
// Recordatorios y reseñas con enlace
// ---------------------------------------------------------------------------
// CallMeBot solo le escribe al ingeniero, no a sus clientes: AIB+ le recuerda
// (WhatsApp de las 8:00 y «Hoy») pedir una reseña, la propuesta que vence o
// su plan, y él le manda al cliente el mensaje ya escrito con un toque. La
// reseña se deja con un enlace sin cuenta: /resena/<token>
// (supabase_recordatorios.sql).
// ---------------------------------------------------------------------------

import { supabase } from './supabase';
import { urlPropuesta } from './propuestas';

interface ConCliente {
  proyectoId: string;
  negocio: string;
  /** Nombre de pila. */
  cliente: string | null;
  /** Solo dígitos, listo para wa.me. */
  whatsapp: string | null;
  token: string;
}

export interface ResenaPendiente extends ConCliente {
  publicadaEn: string;
}

export interface PropuestaPorVencer extends ConCliente {
  /** AAAA-MM-DD. */
  validaHasta: string;
}

export interface MisRecordatorios {
  plan: { plan: 'pro' | 'negocio'; venceEn: string; dias: number } | null;
  resenas: ResenaPendiente[];
  propuestas: PropuestaPorVencer[];
}

export const NOMBRE_PLAN: Record<string, string> = { pro: 'Pro', negocio: 'Negocio' };

export const urlResena = (token: string) => `${window.location.origin}/resena/${token}`;

/** «hoy», «mañana», «en 3 días». */
export const cuando = (dias: number) => (dias <= 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`);

/** El mensaje para pedirle la reseña al cliente. */
export function mensajeResena(r: Pick<ConCliente, 'cliente' | 'negocio' | 'token'>): string {
  return (
    `Hola${r.cliente ? ` ${r.cliente}` : ''}, ¡qué gusto haber trabajado en el proyecto de ${r.negocio}! 🎉 ` +
    `¿Me regalas un minuto para contar cómo te fue? Tu opinión ayuda a otros negocios a elegir: ${urlResena(r.token)}`
  );
}

/** El de la propuesta que está por vencer. */
export function mensajePropuestaPorVencer(p: Pick<PropuestaPorVencer, 'cliente' | 'negocio' | 'token'>, dias: number): string {
  return (
    `Hola${p.cliente ? ` ${p.cliente}` : ''}, te recuerdo que la propuesta para ${p.negocio} vence ${cuando(dias)}. ` +
    `Aquí puedes verla y aceptarla o pedirme cambios: ${urlPropuesta(p.token)}`
  );
}

/** Días que faltan para una fecha AAAA-MM-DD, contados en Lima. */
export function diasHasta(fecha: string): number {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  return Math.round((Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
}

interface FilaCliente {
  proyecto_id: string;
  negocio: string | null;
  cliente: string | null;
  whatsapp: string | null;
  token: string;
}

const conCliente = (f: FilaCliente): ConCliente => ({
  proyectoId: f.proyecto_id,
  negocio: f.negocio ?? 'tu cliente',
  cliente: f.cliente,
  whatsapp: f.whatsapp,
  token: f.token,
});

/** Lo pendiente del ingeniero para «Hoy». null si no se pudo leer. */
export async function misRecordatorios(): Promise<MisRecordatorios | null> {
  const { data, error } = await supabase.rpc('mis_recordatorios');
  const r = data as {
    estado?: string;
    plan?: { plan: 'pro' | 'negocio'; vence_en: string; dias: number } | null;
    resenas?: (FilaCliente & { publicada_en: string })[];
    propuestas?: (FilaCliente & { valida_hasta: string })[];
  } | null;
  if (error || r?.estado !== 'ok') {
    if (error) console.warn('[AIB+] No se pudieron leer los recordatorios:', error.message);
    return null;
  }
  return {
    plan: r.plan ? { plan: r.plan.plan, venceEn: r.plan.vence_en, dias: r.plan.dias } : null,
    resenas: (r.resenas ?? []).map((f) => ({ ...conCliente(f), publicadaEn: f.publicada_en })),
    propuestas: (r.propuestas ?? []).map((f) => ({ ...conCliente(f), validaHasta: f.valida_hasta })),
  };
}

/* -------------------------------------------------------------------------- */
/* Reseña de un encargo (panel del ingeniero)                                 */
/* -------------------------------------------------------------------------- */

export type EnlaceResena =
  | { estado: 'ok'; token: string }
  | { estado: 'ya_resenada'; resena: { estrellas: number; comentario: string | null } }
  | { estado: 'no_publicada' | 'no_existe' | 'error' };

/** El enlace para pedirle la reseña al cliente (lo crea la primera vez). */
export async function enlaceResena(proyectoId: string): Promise<EnlaceResena> {
  const { data, error } = await supabase.rpc('enlace_resena', { p_proyecto: proyectoId });
  if (error) {
    console.warn('[AIB+] No se pudo preparar el enlace de la reseña:', error.message);
    return { estado: 'error' };
  }
  return (data as EnlaceResena | null) ?? { estado: 'error' };
}

/* -------------------------------------------------------------------------- */
/* La página del cliente (/resena/:token)                                     */
/* -------------------------------------------------------------------------- */

export interface ResenaPorEnlace {
  negocio: string | null;
  cliente: string | null;
  tipo_servicio: string | null;
  ingeniero: { nombre: string; foto_url: string | null; slug: string | null };
  /** El proyecto está «Publicada»: ya se puede calificar. */
  publicada: boolean;
  resena: { estrellas: number; comentario: string | null } | null;
}

/** null si el enlace no existe. */
export async function resenaPorToken(token: string): Promise<ResenaPorEnlace | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const { data, error } = await supabase.rpc('resena_por_token', { p_token: token });
  if (error) {
    console.warn('[AIB+] No se pudo leer la reseña:', error.message);
    return null;
  }
  return (data as ResenaPorEnlace | null) ?? null;
}

export type ResultadoResena = 'ok' | 'ya_existe' | 'propia' | 'no_publicada' | 'invalida' | 'no_existe' | 'error';

export async function dejarResenaPorToken(token: string, estrellas: number, comentario: string): Promise<ResultadoResena> {
  const { data, error } = await supabase.rpc('dejar_resena_por_token', {
    p_token: token,
    p_estrellas: estrellas,
    p_comentario: comentario,
  });
  if (error) {
    console.error('[AIB+] No se pudo guardar la reseña:', error.message);
    return 'error';
  }
  return ((data as { estado?: ResultadoResena } | null)?.estado ?? 'error') as ResultadoResena;
}
