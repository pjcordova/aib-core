// ---------------------------------------------------------------------------
// Embudo del cliente
// ---------------------------------------------------------------------------
// Hasta dónde llega cada intento del cuestionario web, para ver en qué paso se
// queda la gente (supabase_panel_ingeniero.sql). Se guarda solo el paso más
// lejano de cada intento, nunca las respuestas. Las pruebas del ingeniero no
// cuentan. También trae cuántas veces se abren los enlaces compartidos.
// ---------------------------------------------------------------------------

import { supabase } from './supabase';

/**
 * Los pasos, en orden. Su posición es el `orden` que se guarda, así que solo
 * se añaden pasos al final de cada bloque si no se quiere mezclar datos viejos
 * con nuevos.
 */
export const HITOS = [
  { id: 'negocio', etiqueta: 'Su negocio' },
  { id: 'objetivo', etiqueta: 'Para qué quiere la web' },
  { id: 'logo', etiqueta: 'Logo' },
  { id: 'paleta', etiqueta: 'Colores' },
  { id: 'secciones', etiqueta: 'Secciones' },
  { id: 'estilo', etiqueta: 'Estilo' },
  { id: 'presupuesto', etiqueta: 'Presupuesto' },
  { id: 'fin-cuestionario', etiqueta: 'Terminó el cuestionario' },
  { id: 'maqueta', etiqueta: 'Vio su maqueta' },
  { id: 'quiso-aceptar', etiqueta: 'Pulsó «¡Me gusta, sigamos!»' },
  { id: 'acepto', etiqueta: 'Aceptó' },
] as const;

export type Hito = (typeof HITOS)[number]['id'];

/** Anota que este intento llegó a `hito`. Es estadística: si falla, no pasa nada. */
export function registrarProgreso(sesion: string, hito: string): void {
  const orden = HITOS.findIndex((h) => h.id === hito);
  if (orden < 0) return;
  void supabase.rpc('registrar_progreso', { p_sesion: sesion, p_paso: hito, p_orden: orden }).then(({ error }) => {
    if (error) console.warn('[AIB+] No se pudo anotar el paso del cuestionario:', error.message);
  });
}

/** Un id al azar por intento del cuestionario. */
export function nuevaSesionDeCuestionario(): string {
  return crypto.randomUUID();
}

export interface Embudo {
  /** Desde cuándo hay datos. */
  desde: string | null;
  intentos: number;
  /** Cada paso con cuántos intentos llegaron hasta él (o más lejos). */
  pasos: { id: string; etiqueta: string; llegaron: number }[];
  enlaces: {
    creados: number;
    abiertos: number;
    aperturas: number;
    lista: { negocio: string | null; aperturas: number; ultima: string | null }[];
  };
}

export async function leerEmbudo(): Promise<Embudo | null> {
  const { data, error } = await supabase.rpc('embudo_cliente');
  if (error || !data) {
    console.error('[AIB+] No se pudo leer el embudo:', error?.message);
    return null;
  }
  const r = data as {
    desde: string | null;
    intentos: number;
    por_orden: Record<string, number>;
    enlaces: Embudo['enlaces'];
  };
  // Llegó a un paso todo intento cuyo paso más lejano es ese o uno posterior.
  const pasos = HITOS.map((h, i) => ({
    id: h.id,
    etiqueta: h.etiqueta,
    llegaron: Object.entries(r.por_orden ?? {})
      .filter(([orden]) => Number(orden) >= i)
      .reduce((suma, [, n]) => suma + Number(n), 0),
  }));
  return {
    desde: r.desde,
    intentos: Number(r.intentos ?? 0),
    pasos,
    enlaces: {
      creados: Number(r.enlaces?.creados ?? 0),
      abiertos: Number(r.enlaces?.abiertos ?? 0),
      aperturas: Number(r.enlaces?.aperturas ?? 0),
      lista: r.enlaces?.lista ?? [],
    },
  };
}
