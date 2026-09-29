// ---------------------------------------------------------------------------
// Seguimiento de encargos
// ---------------------------------------------------------------------------
// Después de aceptar, cliente e ingeniero ven en qué etapa está el encargo.
// "Recibido" es el momento en que el cliente aceptó; cada etapa posterior la
// marca el ingeniero, con una nota opcional para el cliente. Es un historial
// que no se reescribe (supabase_seguimiento.sql).
// ---------------------------------------------------------------------------

import { supabase } from './supabase';
import type { TipoServicio } from './servicios';

export type EstadoEncargo = 'recibido' | 'en_revision' | 'propuesta_enviada' | 'en_desarrollo' | 'publicada';

export interface Etapa {
  valor: EstadoEncargo;
  etiqueta: string;
  /** Qué significa para el cliente, en una frase. */
  detalle: string;
}

/** En orden: es el camino normal de un encargo. */
export const ETAPAS: Etapa[] = [
  { valor: 'recibido', etiqueta: 'Recibido', detalle: 'El ingeniero ya tiene tu proyecto.' },
  { valor: 'en_revision', etiqueta: 'En revisión', detalle: 'Está estudiando lo que necesitas.' },
  {
    valor: 'propuesta_enviada',
    etiqueta: 'Propuesta enviada',
    detalle: 'Te envió una propuesta con precio y plazos.',
  },
  { valor: 'en_desarrollo', etiqueta: 'En desarrollo', detalle: 'Tu proyecto se está construyendo.' },
  { valor: 'publicada', etiqueta: 'Publicada', detalle: '¡Tu proyecto ya está listo!' },
];

/** Una web se publica; un sistema o una automatización se entregan. */
export function etiquetaEtapa(estado: EstadoEncargo, tipo?: TipoServicio): string {
  if (estado === 'publicada' && tipo && tipo !== 'web') return 'Entregado';
  return ETAPAS.find((e) => e.valor === estado)?.etiqueta ?? estado;
}

export interface CambioEstado {
  estado: EstadoEncargo;
  nota: string | null;
  creadoEn: string;
}

/** Máximo de caracteres de la nota; la base de datos impone el mismo. */
export const MAX_NOTA = 280;

function esEstado(valor: unknown): valor is EstadoEncargo {
  return ETAPAS.some((e) => e.valor === valor);
}

/**
 * Historial de varios encargos de una vez, del cambio más antiguo al más
 * reciente. Cada uno ve solo lo que le deja la base de datos: el cliente, sus
 * proyectos; el ingeniero, todos.
 */
export async function listarSeguimiento(ids: string[]): Promise<Map<string, CambioEstado[]>> {
  const porProyecto = new Map<string, CambioEstado[]>();
  if (ids.length === 0) return porProyecto;

  const { data, error } = await supabase
    .from('seguimiento_encargos')
    .select('proyecto_id, estado, nota, created_at')
    .in('proyecto_id', ids)
    .order('created_at', { ascending: true });

  if (error) {
    // Sin la tabla (script sin ejecutar) todo sigue en "Recibido": no bloquea nada.
    console.warn('[AIB+] No se pudo leer el seguimiento:', error.message);
    return porProyecto;
  }

  for (const fila of data ?? []) {
    if (!esEstado(fila.estado)) continue;
    const lista = porProyecto.get(fila.proyecto_id as string) ?? [];
    lista.push({ estado: fila.estado, nota: (fila.nota as string | null) ?? null, creadoEn: fila.created_at as string });
    porProyecto.set(fila.proyecto_id as string, lista);
  }
  return porProyecto;
}

/** Etapa en la que está el encargo ahora: la última marcada, o "Recibido". */
export function estadoActual(cambios: CambioEstado[] | undefined): EstadoEncargo {
  return cambios?.at(-1)?.estado ?? 'recibido';
}

/** Solo el ingeniero: marca una etapa nueva en un encargo aceptado. */
export async function cambiarEstado(
  proyectoId: string,
  estado: EstadoEncargo,
  nota: string
): Promise<{ cambio: CambioEstado | null; error: string | null }> {
  const limpia = nota.trim().slice(0, MAX_NOTA) || null;
  const { data, error } = await supabase
    .from('seguimiento_encargos')
    .insert({ proyecto_id: proyectoId, estado, nota: limpia })
    .select('estado, nota, created_at')
    .single();

  if (error || !data || !esEstado(data.estado)) {
    console.error('[AIB+] No se pudo cambiar el estado:', error?.message);
    return { cambio: null, error: 'No se pudo guardar la etapa. Vuelve a intentarlo.' };
  }
  return {
    cambio: { estado: data.estado, nota: (data.nota as string | null) ?? null, creadoEn: data.created_at as string },
    error: null,
  };
}
