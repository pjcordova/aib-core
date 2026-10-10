// ---------------------------------------------------------------------------
// Página pública de cada ingeniero (/ing/:slug)
// ---------------------------------------------------------------------------
// Su perfil, sus diseños con precio y sus reseñas, para compartir. Desde ahí
// el cliente arma su web sin cuenta con ese ingeniero (supabase_perfil_publico.sql).
// ---------------------------------------------------------------------------

import { supabase } from './supabase';
import type { ResenaPublica } from './ingenieros';
import type { FilaPlantilla } from './catalogo';

export type DisenoPublico = Pick<
  FilaPlantilla,
  | 'id'
  | 'tipo'
  | 'servicio'
  | 'base'
  | 'nombre'
  | 'descripcion'
  | 'categoria'
  | 'estilo'
  | 'etiquetas'
  | 'nivel'
  | 'precio_desde'
  | 'color_primario'
  | 'color_secundario'
  | 'html'
  | 'css'
  | 'fuentes'
>;

export interface PerfilPublico {
  id: string;
  slug: string;
  nombre: string;
  titular: string;
  bio: string;
  especialidades: string[];
  servicios: string[];
  servicios_otros: string[];
  anios_experiencia: number | null;
  ciudad: string | null;
  portafolio_url: string | null;
  foto_url: string | null;
  promedio: number | null;
  resenas: number;
  /** Webs suyas que ya están publicadas. */
  publicadas: number;
  ultimas: ResenaPublica[];
  disenos: DisenoPublico[];
}

export const urlPerfil = (slug: string) => `${window.location.origin}/ing/${slug}`;

/** null si no existe o el ingeniero no está aprobado. */
export async function perfilPublico(slug: string): Promise<PerfilPublico | null> {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const { data, error } = await supabase.rpc('perfil_publico', { p_slug: slug });
  if (error) {
    console.warn('[AIB+] No se pudo leer el perfil:', error.message);
    return null;
  }
  return (data as PerfilPublico | null) ?? null;
}

export type ResultadoEmpezar = 'ok' | 'otra' | 'lleno' | 'no_existe' | 'con_cuenta' | 'error';

/**
 * «Quiero mi web con él»: abre la sesión sin cuenta (si no hay) y la ata a
 * ese ingeniero. 'otra': ya tiene otra prueba en marcha en este navegador.
 */
export async function empezarConIngeniero(slug: string): Promise<ResultadoEmpezar> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session && !session.user.is_anonymous) return 'con_cuenta';

  let abrioSesion = false;
  if (!session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error('[AIB+] No se pudo abrir la sesión de prueba:', error.message);
      return 'error';
    }
    abrioSesion = true;
  }

  const { data, error } = await supabase.rpc('empezar_con_ingeniero', { p_slug: slug });
  const estado = (data as { estado?: string } | null)?.estado;
  if (!error && estado === 'ok') return 'ok';

  // Sin prueba, la sesión recién abierta no sirve para nada: se cierra.
  if (abrioSesion) await supabase.auth.signOut();
  if (error) console.error('[AIB+] No se pudo empezar con el ingeniero:', error.message);
  return estado === 'otra' || estado === 'lleno' || estado === 'no_existe' ? estado : 'error';
}

/** El ingeniero cambia la dirección de su página. */
export async function cambiarSlug(slug: string): Promise<{ estado: 'ok' | 'invalido' | 'ocupado' | 'error'; slug?: string }> {
  const { data, error } = await supabase.rpc('cambiar_slug', { p_slug: slug });
  if (error) {
    console.error('[AIB+] No se pudo cambiar la dirección:', error.message);
    return { estado: 'error' };
  }
  return data as { estado: 'ok' | 'invalido' | 'ocupado'; slug?: string };
}
