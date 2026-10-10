// ---------------------------------------------------------------------------
// Proyectos terminados del ingeniero
// ---------------------------------------------------------------------------
// Hasta 6 trabajos reales (dentro o fuera de AIB+) que salen en su página
// pública, con su enlace en vivo y una imagen (supabase_portafolio.sql).
// ---------------------------------------------------------------------------

import { supabase } from './supabase';

export const MAX_TRABAJOS = 6;

export interface Trabajo {
  id: string;
  titulo: string;
  /** 'web', 'crm'… u 'otro:<nombre>'. */
  servicio: string;
  enlace: string | null;
  descripcion: string | null;
  imagen_url: string | null;
}

export type DatosTrabajo = Omit<Trabajo, 'id'>;

/**
 * Un enlace como lo escriba: «misitio.com», «www.misitio.com» o con
 * http(s)://. Si no trae el protocolo, se le pone https://.
 */
export function normalizarEnlace(texto: string): string {
  const limpio = texto.trim().replace(/\s+/g, '');
  if (!limpio) return '';
  return /^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`;
}

/** Un enlace web con dominio (algo.algo), sin caracteres raros y no muy largo. */
export function enlaceValido(enlace: string): boolean {
  return enlace.length <= 300 && /^https?:\/\/[^\s<>"/]+\.[^\s<>"/]{2,}([/?#][^\s<>"]*)?$/i.test(enlace);
}

/** Los del ingeniero, en el orden en que salen en su página. */
export async function misTrabajos(): Promise<Trabajo[]> {
  const { data, error } = await supabase
    .from('portafolio_ingeniero')
    .select('id, titulo, servicio, enlace, descripcion, imagen_url')
    .order('orden')
    .order('creado_en');
  if (error) {
    console.error('[AIB+] No se pudieron leer tus proyectos:', error.message);
    return [];
  }
  return (data ?? []) as Trabajo[];
}

function mensajeDeError(codigo: string | undefined): string {
  if (codigo === '54000') return `Puedes mostrar hasta ${MAX_TRABAJOS} proyectos.`;
  if (codigo === '23514') return 'Revisa los datos: el título, el enlace o la descripción no tienen el formato esperado.';
  return 'No pudimos guardar el proyecto. Revisa tu conexión y vuelve a intentarlo.';
}

/** Crea uno nuevo o, con `id`, cambia uno que ya estaba. */
export async function guardarTrabajo(datos: DatosTrabajo, id?: string): Promise<{ error: string | null }> {
  const fila = {
    titulo: datos.titulo.trim(),
    servicio: datos.servicio,
    enlace: datos.enlace?.trim() || null,
    descripcion: datos.descripcion?.trim() || null,
    imagen_url: datos.imagen_url,
  };
  const { error } = id
    ? await supabase.from('portafolio_ingeniero').update(fila).eq('id', id)
    : await supabase.from('portafolio_ingeniero').insert(fila);
  if (error) {
    console.error('[AIB+] No se pudo guardar el proyecto:', error.message);
    return { error: mensajeDeError(error.code) };
  }
  return { error: null };
}

export async function borrarTrabajo(id: string): Promise<boolean> {
  const { error } = await supabase.from('portafolio_ingeniero').delete().eq('id', id);
  if (error) console.error('[AIB+] No se pudo quitar el proyecto:', error.message);
  return !error;
}
