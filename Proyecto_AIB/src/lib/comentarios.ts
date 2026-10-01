// ---------------------------------------------------------------------------
// Comentarios de los clientes sobre su maqueta
// ---------------------------------------------------------------------------
// El cliente dice qué le parece su web y qué le faltó; el ingeniero lo lee en
// su panel (supabase_comentarios.sql). Es el feedback que antes llegaba suelto
// por WhatsApp y se perdía.
// ---------------------------------------------------------------------------

import { supabase } from './supabase';

export type Reaccion = 'encanta' | 'bien' | 'no_convence';

export const REACCIONES: { valor: Reaccion; emoji: string; etiqueta: string }[] = [
  { valor: 'encanta', emoji: '😍', etiqueta: 'Me encanta' },
  { valor: 'bien', emoji: '🙂', etiqueta: 'Está bien' },
  { valor: 'no_convence', emoji: '😕', etiqueta: 'No me convence' },
];

/** Máximo de caracteres; la base de datos impone el mismo. */
export const MAX_COMENTARIO = 1000;

export async function enviarComentario(entrada: {
  proyectoId: string;
  reaccion: Reaccion | null;
  texto: string;
}): Promise<boolean> {
  const texto = entrada.texto.trim().slice(0, MAX_COMENTARIO) || null;
  if (!entrada.reaccion && !texto) return false;

  const { error } = await supabase
    .from('comentarios')
    .insert({ proyecto_id: entrada.proyectoId, reaccion: entrada.reaccion, texto });
  if (error) console.error('[AIB+] No se pudo enviar el comentario:', error.message);
  return !error;
}

/* -------------------------------------------------------------------------- */
/* Ingeniero                                                                  */
/* -------------------------------------------------------------------------- */

export interface Comentario {
  id: number;
  created_at: string;
  reaccion: Reaccion | null;
  texto: string | null;
  proyecto: { empresa: string | null; aceptado: string | null } | null;
}

export async function listarComentarios(): Promise<{ comentarios: Comentario[]; sinConfigurar: boolean }> {
  const { data, error } = await supabase
    .from('comentarios')
    .select('id, created_at, reaccion, texto, proyecto:proyectos(empresa:payload->ficha->>empresa, aceptado:payload->>aceptado)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    const sinConfigurar = error.code === '42P01' || error.code === 'PGRST205';
    if (!sinConfigurar) console.error('[AIB+] No se pudieron leer los comentarios:', error.message);
    return { comentarios: [], sinConfigurar };
  }
  return { comentarios: (data ?? []) as unknown as Comentario[], sinConfigurar: false };
}
