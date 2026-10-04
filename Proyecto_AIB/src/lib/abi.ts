// ---------------------------------------------------------------------------
// ABI — conversación y ajustes
// ---------------------------------------------------------------------------
// La conversación vive en la pestaña (sessionStorage): sobrevive a cambiar de
// sección o recargar, y se olvida al cerrar. Los ajustes (nombre y enlace de
// agenda) se guardan en la base de datos, en ajustes_ingeniero.
// ---------------------------------------------------------------------------

import { supabase } from './supabase';
import type { AccionAbi } from './api';

export interface MensajeAbi {
  rol: 'usuario' | 'abi';
  texto: string;
  /** Borradores que ABI dejó listos con esta respuesta. */
  acciones?: AccionAbi[];
}

export interface AjustesAbi {
  nombre: string;
  enlaceAgenda: string;
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
  const { data, error } = await supabase.from('ajustes_ingeniero').select('nombre, enlace_agenda').maybeSingle();
  if (error) console.warn('[AIB+] No se pudieron leer los ajustes de ABI:', error.message);
  return { nombre: data?.nombre ?? '', enlaceAgenda: data?.enlace_agenda ?? '' };
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
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error('[AIB+] No se pudieron guardar los ajustes de ABI:', error.message);
    return 'No se pudieron guardar. Vuelve a intentarlo.';
  }
  return null;
}
