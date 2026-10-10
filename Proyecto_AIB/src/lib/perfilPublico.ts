// ---------------------------------------------------------------------------
// Página pública de cada ingeniero (/ing/:slug)
// ---------------------------------------------------------------------------
// Su perfil, sus diseños con precio y sus reseñas, para compartir. Desde ahí
// el cliente arma su web sin cuenta con ese ingeniero (supabase_perfil_publico.sql).
// ---------------------------------------------------------------------------

import { supabase } from './supabase';
import type { ResenaPublica } from './ingenieros';
import type { FilaPlantilla } from './catalogo';
import type { Trabajo } from './portafolio';
import { basePropia } from './plantillaPropia';
import { renderizarPlantilla } from './plantillas';
import { obtenerPlantillaBase } from '../plantillas';

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
  /** Proyectos que ya hizo, con su enlace en vivo (supabase_portafolio.sql). */
  trabajos?: Trabajo[];
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

/**
 * Lo mismo, pero si ya tenía otra prueba en este navegador le pregunta antes
 * de cambiarla por una con este ingeniero. 'cancelado': prefirió seguir con
 * la que tenía.
 */
export async function empezarConfirmando(
  slug: string,
  nombre: string,
  cerrarSesion: () => Promise<unknown>
): Promise<ResultadoEmpezar | 'cancelado'> {
  const r = await empezarConIngeniero(slug);
  if (r !== 'otra') return r;
  if (!window.confirm(`Ya tienes una prueba abierta en este navegador. ¿Empezar una nueva con ${nombre}?`)) {
    return 'cancelado';
  }
  await cerrarSesion();
  return empezarConIngeniero(slug);
}

/**
 * Un diseño publicado tal como lo vería un cliente: con un negocio de
 * ejemplo y los colores del ingeniero. null si su plantilla ya no existe.
 */
export function documentoDeDiseno(d: DisenoPublico, empresa = 'Tu negocio'): string | null {
  const base = d.tipo === 'propia' ? basePropia(d) : obtenerPlantillaBase(d.base);
  if (!base) return null;
  return renderizarPlantilla(base, base.ejemplo, { empresa, logo: null, paleta: null });
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

/* -------------------------------------------------------------------------- */
/* Estadísticas de la página (supabase_estadisticas_perfil.sql)               */
/* -------------------------------------------------------------------------- */

/**
 * Cuenta la visita una vez por sesión del navegador. Si falla no pasa nada:
 * es estadística, no negocio.
 */
export function registrarVisitaPerfil(slug: string): void {
  const clave = `aib-visita-${slug}`;
  try {
    if (window.sessionStorage.getItem(clave)) return;
    window.sessionStorage.setItem(clave, '1');
  } catch {
    // Sin almacenamiento: se cuenta igual.
  }
  void supabase.rpc('registrar_visita_perfil', { p_slug: slug }).then(({ error }) => {
    if (error) console.warn('[AIB+] No se pudo contar la visita:', error.message);
  });
}

export interface EstadisticasPagina {
  visitas_30: number;
  visitas_7: number;
  /** Pulsaron «Trabajar con…» o «Lo quiero» en sus diseños. */
  empezaron: number;
  /** Llegaron a ver cómo quedaría su proyecto. */
  vieron: number;
  /** Lo aceptaron: el encargo le llegó. */
  eligieron: number;
}

/** Las de los últimos 30 días. null si no se pudieron leer. */
export async function estadisticasMiPagina(): Promise<EstadisticasPagina | null> {
  const { data, error } = await supabase.rpc('estadisticas_mi_pagina');
  if (error) {
    console.warn('[AIB+] No se pudieron leer las estadísticas:', error.message);
    return null;
  }
  return (data as EstadisticasPagina | null) ?? null;
}
