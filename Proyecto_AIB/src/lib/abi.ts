// ---------------------------------------------------------------------------
// ABI — conversación, ajustes, memoria y uso
// ---------------------------------------------------------------------------
// La conversación vive en la pestaña (sessionStorage): sobrevive a cambiar de
// sección o recargar, y se olvida al cerrar. Los ajustes (nombre y enlace de
// agenda), lo que ABI recuerda y el registro de preguntas viven en la base de
// datos (supabase_panel_ingeniero.sql), igual que su estilo con los clientes
// y sus correcciones a los borradores (supabase_abi_estilo.sql).
// ---------------------------------------------------------------------------

import { supabase } from './supabase';
import type { AccionAbi } from './api';

/** Qué hizo el ingeniero con una propuesta de ABI. */
export type ResultadoAccion = { estado: 'hecha'; enlace?: string } | { estado: 'descartada' };

export interface MensajeAbi {
  rol: 'usuario' | 'abi';
  texto: string;
  /** Lo que ABI propuso con esta respuesta. */
  acciones?: AccionAbi[];
  /** Lo que el ingeniero ya confirmó o descartó, por posición en `acciones`. */
  resultados?: Record<number, ResultadoAccion>;
}

export interface AjustesAbi {
  nombre: string;
  enlaceAgenda: string;
  /** El resumen de cada mañana por WhatsApp (server/src/routes/resumenDiario.js). */
  resumenDiario: boolean;
  /** Cómo escribe a sus clientes. null: ABI usa lo de siempre (cercano, corto). */
  trato: 'tu' | 'usted' | null;
  tono: 'cercano' | 'formal' | null;
  largo: 'breve' | 'detallado' | null;
  emojis: boolean | null;
  /** Con qué firma los mensajes; vacía, ABI firma con su nombre. */
  firma: string;
}

const CLAVE = 'abi-conversacion';
/** Lo que se recuerda de la conversación; el servidor solo lee los últimos 20. */
const MAX_GUARDADOS = 30;

function esMensaje(m: unknown): m is MensajeAbi {
  const x = m as MensajeAbi | null;
  return (x?.rol === 'usuario' || x?.rol === 'abi') && typeof x.texto === 'string';
}

export function leerConversacion(): MensajeAbi[] {
  try {
    const guardada: unknown = JSON.parse(sessionStorage.getItem(CLAVE) ?? '[]');
    return Array.isArray(guardada) ? guardada.filter(esMensaje) : [];
  } catch {
    return [];
  }
}

export function guardarConversacion(mensajes: MensajeAbi[]): void {
  try {
    if (mensajes.length === 0) sessionStorage.removeItem(CLAVE);
    else sessionStorage.setItem(CLAVE, JSON.stringify(mensajes.slice(-MAX_GUARDADOS)));
  } catch {
    // Sin almacenamiento: la conversación dura lo que dure la pantalla.
  }
}

export async function leerAjustes(): Promise<AjustesAbi> {
  const { data, error } = await supabase
    .from('ajustes_ingeniero')
    .select('nombre, enlace_agenda, resumen_diario, estilo_trato, estilo_tono, estilo_largo, estilo_emojis, firma')
    .maybeSingle();
  if (error) console.warn('[AIB+] No se pudieron leer los ajustes de ABI:', error.message);
  return {
    nombre: data?.nombre ?? '',
    enlaceAgenda: data?.enlace_agenda ?? '',
    // Sin fila de ajustes, el resumen está activo (como en la base de datos).
    resumenDiario: data?.resumen_diario ?? true,
    trato: data?.estilo_trato ?? null,
    tono: data?.estilo_tono ?? null,
    largo: data?.estilo_largo ?? null,
    emojis: data?.estilo_emojis ?? null,
    firma: data?.firma ?? '',
  };
}

/** Devuelve un mensaje de error para mostrar, o null si se guardó. */
export async function guardarAjustes(ajustes: AjustesAbi): Promise<string | null> {
  const nombre = ajustes.nombre.trim().slice(0, 80) || null;
  const enlace = ajustes.enlaceAgenda.trim() || null;
  if (enlace && (!/^https:\/\/\S+$/.test(enlace) || enlace.length > 300)) {
    return 'El enlace tiene que empezar con https:// (cópialo tal cual de Google Calendar o Calendly).';
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return 'Tu sesión caducó. Vuelve a iniciar sesión.';

  const { error } = await supabase.from('ajustes_ingeniero').upsert({
    user_id: session.user.id,
    nombre,
    enlace_agenda: enlace,
    resumen_diario: ajustes.resumenDiario,
    estilo_trato: ajustes.trato,
    estilo_tono: ajustes.tono,
    estilo_largo: ajustes.largo,
    estilo_emojis: ajustes.emojis,
    firma: ajustes.firma.trim().slice(0, 120) || null,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error('[AIB+] No se pudieron guardar los ajustes de ABI:', error.message);
    return 'No se pudieron guardar. Vuelve a intentarlo.';
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Memoria                                                                    */
/* -------------------------------------------------------------------------- */

export interface Recuerdo {
  id: number;
  texto: string;
}

export async function listarRecuerdos(): Promise<Recuerdo[]> {
  const { data, error } = await supabase.from('abi_memoria').select('id, texto').order('created_at');
  if (error) console.warn('[AIB+] No se pudo leer la memoria de ABI:', error.message);
  return (data ?? []) as Recuerdo[];
}

export async function guardarRecuerdo(texto: string): Promise<boolean> {
  const { error } = await supabase.from('abi_memoria').insert({ texto: texto.trim().slice(0, 300) });
  if (error) console.error('[AIB+] ABI no pudo guardar el recuerdo:', error.message);
  return !error;
}

export async function olvidarRecuerdo(id: number): Promise<boolean> {
  const { error } = await supabase.from('abi_memoria').delete().eq('id', id);
  if (error) console.error('[AIB+] ABI no pudo olvidar el recuerdo:', error.message);
  return !error;
}

/* -------------------------------------------------------------------------- */
/* Correcciones                                                               */
/* -------------------------------------------------------------------------- */

/** Un borrador de WhatsApp de ABI y cómo lo dejó el ingeniero antes de enviarlo. */
export interface Correccion {
  id: number;
  borrador: string;
  final: string;
}

/** Las últimas 5 (la base de datos borra las más antiguas). */
export async function listarCorrecciones(): Promise<Correccion[]> {
  const { data, error } = await supabase
    .from('abi_correcciones')
    .select('id, borrador, final')
    .order('created_at', { ascending: false });
  if (error) console.warn('[AIB+] No se pudieron leer las correcciones de ABI:', error.message);
  return (data ?? []) as Correccion[];
}

const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * El nombre del cliente no hace falta para aprender un estilo: se cambia por
 * «[cliente]» antes de guardarlo (el nombre completo y, aparte, el primero).
 */
function sinNombre(texto: string, para: string): string {
  const nombre = para.trim();
  if (nombre.length < 3) return texto;
  let limpio = texto.replace(new RegExp(escapar(nombre), 'gi'), '[cliente]');
  const primero = nombre.split(/\s+/)[0];
  if (primero.length >= 3 && primero !== nombre) {
    limpio = limpio.replace(new RegExp(`(?<!\\p{L})${escapar(primero)}(?!\\p{L})`, 'gu'), '[cliente]');
  }
  return limpio;
}

/** Guarda la corrección para que ABI aprenda cómo escribe. */
export async function guardarCorreccion(borrador: string, final: string, para: string): Promise<boolean> {
  const { error } = await supabase.from('abi_correcciones').insert({
    borrador: sinNombre(borrador, para).trim().slice(0, 1500),
    final: sinNombre(final, para).trim().slice(0, 1500),
  });
  if (error) console.error('[AIB+] ABI no pudo guardar la corrección:', error.message);
  return !error;
}

export async function olvidarCorreccion(id: number): Promise<boolean> {
  const { error } = await supabase.from('abi_correcciones').delete().eq('id', id);
  if (error) console.error('[AIB+] ABI no pudo olvidar la corrección:', error.message);
  return !error;
}

/* -------------------------------------------------------------------------- */
/* Uso                                                                        */
/* -------------------------------------------------------------------------- */

/** Preguntas a ABI de los últimos 7 días y su coste estimado (registro del servidor). */
export async function usoDeLaSemana(): Promise<{ preguntas: number; costoUsd: number } | null> {
  const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.from('abi_registro').select('costo_estimado_usd').gte('created_at', desde);
  if (error) {
    console.warn('[AIB+] No se pudo leer el uso de ABI:', error.message);
    return null;
  }
  const filas = (data ?? []) as { costo_estimado_usd: number | string }[];
  return { preguntas: filas.length, costoUsd: filas.reduce((suma, f) => suma + Number(f.costo_estimado_usd), 0) };
}
