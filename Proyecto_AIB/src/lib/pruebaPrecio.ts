// ---------------------------------------------------------------------------
// Prueba de precio
// ---------------------------------------------------------------------------
// El ingeniero pone 2 o 3 precios y cada cliente ve uno solo, siempre el
// mismo, junto a su maqueta. Luego se compara cuántos aceptan con cada uno
// (supabase_prueba_precio.sql). El cliente nunca ve los otros precios.
// ---------------------------------------------------------------------------

import { supabase } from './supabase';
import { solesEnteros } from './servicios';
import type { QAHistory } from '../Types/productOwner';

/** El precio que le toca a quien llama, o null si no hay prueba activa. */
export async function miPrecio(): Promise<number | null> {
  const { data, error } = await supabase.rpc('mi_precio');
  if (error) {
    console.warn('[AIB+] No se pudo leer el precio:', error.message);
    return null;
  }
  return typeof data === 'number' && data > 0 ? data : null;
}

/**
 * Deja en el historial del encargo el precio que vio el cliente, para que el
 * ingeniero sepa de qué cifra parte la conversación.
 */
export function conPrecioMostrado(historial: QAHistory[], precio: number | null): QAHistory[] {
  if (!precio) return historial;
  return [
    ...historial.filter((h) => h.question_id !== 'precio-orientativo'),
    {
      question_id: 'precio-orientativo',
      question: 'Precio que vio el cliente junto a su maqueta (prueba de precio)',
      answer: `Desde ${solesEnteros(precio)}`,
    },
  ];
}

export interface ResultadoPrecio {
  precio: number;
  /** Clientes reales a los que les tocó este precio. */
  vieron: number;
  /** Pulsaron «¡Me gusta, sigamos!». */
  quisieron: number;
  aceptaron: number;
}

export interface PruebaPrecio {
  activa: boolean;
  precios: number[];
  /** Desde cuándo cuentan los resultados: cambia al cambiar los precios. */
  ronda: string | null;
  resultados: ResultadoPrecio[];
}

/** Configuración y resultados, para el ingeniero. */
export async function leerPruebaPrecio(): Promise<PruebaPrecio | null> {
  const { data, error } = await supabase.rpc('embudo_precios');
  if (error || !data) {
    console.warn('[AIB+] No se pudo leer la prueba de precio:', error?.message);
    return null;
  }
  return data as PruebaPrecio;
}

export async function configurarPruebaPrecio(
  activa: boolean,
  precios: number[]
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('configurar_prueba_precio', { p_activa: activa, p_precios: precios });
  return error ? { ok: false, error: error.message } : { ok: true };
}
