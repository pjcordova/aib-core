// ---------------------------------------------------------------------------
// Medición de la portada
// ---------------------------------------------------------------------------
// Qué canal trae a los dueños de negocio y hasta dónde llegan
// (supabase_medicion_portada.sql). El canal va en el enlace que se comparte:
// aib-core.vercel.app/?c=instagram. No hay cookies ni datos personales: solo
// se cuenta la visita y se guarda el canal en la prueba sin cuenta.
// ---------------------------------------------------------------------------

import { supabase } from './supabase';

const CLAVE_CANAL = 'aib-canal';
const CLAVE_VISITA = 'aib-visita-contada';

function limpiar(canal: string | null): string | null {
  const limpio = (canal ?? '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,30}$/.test(limpio) ? limpio : null;
}

/**
 * El canal de esta visita: el ?c= del enlace (o utm_source, por si el enlace
 * viene de un anuncio). Se recuerda en la pestaña para cuando pulse
 * «Pruébalo gratis».
 */
export function canalDeLaVisita(): string | null {
  const params = new URLSearchParams(window.location.search);
  const delEnlace = limpiar(params.get('c') ?? params.get('utm_source'));
  try {
    if (delEnlace) sessionStorage.setItem(CLAVE_CANAL, delEnlace);
    return delEnlace ?? limpiar(sessionStorage.getItem(CLAVE_CANAL));
  } catch {
    return delEnlace;
  }
}

/**
 * Cuenta una visita a la portada, una sola vez por pestaña. En desarrollo no
 * cuenta: la app local usa la misma base de datos que producción.
 */
export function registrarVisitaPortada(): void {
  if (import.meta.env.DEV) return;
  try {
    if (sessionStorage.getItem(CLAVE_VISITA)) return;
    sessionStorage.setItem(CLAVE_VISITA, '1');
  } catch {
    // Sin almacenamiento se cuenta igual: a lo sumo, una recarga suma de más.
  }
  void supabase.rpc('registrar_visita_portada', { p_canal: canalDeLaVisita() }).then(({ error }) => {
    if (error) console.warn('[AIB+] No se pudo contar la visita:', error.message);
  });
}

/** El cliente pulsó «Prefiero publicarla yo». Estadística: si falla, no pasa nada. */
export function registrarInteres(tipo: 'publicar-yo'): void {
  void supabase.rpc('registrar_interes', { p_tipo: tipo }).then(({ error }) => {
    if (error) console.warn('[AIB+] No se pudo registrar el interés:', error.message);
  });
}

export interface CanalPortada {
  canal: string;
  visitas: number;
  pulsaron: number;
  empezaron: number;
  maqueta: number;
  aceptaron: number;
}

export interface EmbudoPortada {
  desde: string | null;
  canales: CanalPortada[];
  publicar_yo: { quieren: number; vieron_maqueta: number };
}

/** Para el ingeniero. */
export async function leerEmbudoPortada(): Promise<EmbudoPortada | null> {
  const { data, error } = await supabase.rpc('embudo_portada');
  if (error || !data) {
    console.warn('[AIB+] No se pudo leer el embudo de la portada:', error?.message);
    return null;
  }
  return data as EmbudoPortada;
}
