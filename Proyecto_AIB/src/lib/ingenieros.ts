// ---------------------------------------------------------------------------
// Ingenieros del marketplace
// ---------------------------------------------------------------------------
// Perfiles, solicitudes, elección por parte del cliente y reseñas
// (supabase_marketplace.sql). El cliente nunca ve el WhatsApp ni el correo de
// un ingeniero: solo su perfil público.
// ---------------------------------------------------------------------------

import { supabase } from './supabase';

export type EstadoIngeniero = 'pendiente' | 'aprobado' | 'rechazado' | 'pausado';

/** Los servicios que puede ofrecer un ingeniero. */
export const SERVICIOS_INGENIERO: { valor: string; etiqueta: string }[] = [
  { valor: 'web', etiqueta: 'Página web' },
  { valor: 'tienda-online', etiqueta: 'Tienda online' },
  { valor: 'crm', etiqueta: 'CRM' },
  { valor: 'erp', etiqueta: 'ERP' },
  { valor: 'automatizacion', etiqueta: 'Automatizaciones' },
  { valor: 'app-movil', etiqueta: 'App móvil' },
  { valor: 'otro', etiqueta: 'Otro' },
];

export const etiquetaServicio = (v: string) => SERVICIOS_INGENIERO.find((s) => s.valor === v)?.etiqueta ?? v;

/** «Página web · CRM · Chatbots»: los marcados, con los que escribió a mano en lugar de «Otro». */
export function textoServicios(servicios: string[] = [], otros: string[] = []): string {
  return servicios
    .flatMap((s) => (s === 'otro' && otros.length > 0 ? otros : [etiquetaServicio(s)]))
    .join(' · ');
}

/** «chatbots, landing pages» → ["chatbots", "landing pages"] (como mucho 5, sin repetir). */
export function leerServiciosOtros(texto: string): string[] {
  const limpios = texto
    .split(/[,;\n]+/)
    .map((t) => t.replace(/[<>{}]/g, '').trim().slice(0, 60))
    .filter((t) => t.length >= 2);
  return [...new Set(limpios)].slice(0, 5);
}

/** Lo que el propio ingeniero escribe en su perfil. */
export interface DatosPerfil {
  nombre: string;
  titular: string;
  bio: string;
  especialidades: string[];
  anios_experiencia: number | null;
  ciudad: string | null;
  portafolio_url: string | null;
  foto_url: string | null;
  whatsapp: string | null;
}

export interface MiPerfil extends DatosPerfil {
  estado: EstadoIngeniero;
  servicios: string[];
  /** Lo que escribió al marcar «Otro»: AIB+ prepara su formulario. */
  servicios_otros: string[];
}

export interface ResenaPublica {
  estrellas: number;
  comentario: string;
  autor: string | null;
  negocio: string | null;
  fecha: string;
}

/** Perfil público: lo que ve el cliente al elegir. */
export interface IngenieroPublico {
  id: string;
  nombre: string;
  titular: string;
  bio: string;
  especialidades: string[];
  anios_experiencia: number | null;
  ciudad: string | null;
  portafolio_url: string | null;
  foto_url: string | null;
  promedio: number | null;
  resenas: number;
  ultimas: ResenaPublica[];
  servicios?: string[];
  servicios_otros?: string[];
}

/** Lo que ve el administrador de cada ingeniero o solicitud. */
export interface IngenieroAdmin extends DatosPerfil {
  user_id: string;
  correo: string | null;
  estado: EstadoIngeniero;
  es_admin: boolean;
  creado_en: string;
  encargos: number;
  resenas: number;
  promedio: number | null;
  servicios?: string[];
  servicios_otros?: string[];
}

export async function miPerfilIngeniero(): Promise<MiPerfil | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('perfiles_ingeniero')
    .select('nombre, titular, bio, especialidades, anios_experiencia, ciudad, portafolio_url, foto_url, whatsapp, estado, servicios, servicios_otros')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    console.warn('[AIB+] No se pudo leer tu perfil de ingeniero:', error.message);
    return null;
  }
  return (data as MiPerfil | null) ?? null;
}

export async function guardarPerfilIngeniero(
  datos: DatosPerfil
): Promise<{ ok: true; estado: EstadoIngeniero } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('guardar_perfil_ingeniero', {
    p_nombre: datos.nombre,
    p_titular: datos.titular,
    p_bio: datos.bio,
    p_especialidades: datos.especialidades,
    p_anios: datos.anios_experiencia,
    p_ciudad: datos.ciudad,
    p_portafolio: datos.portafolio_url,
    p_foto: datos.foto_url,
    p_whatsapp: datos.whatsapp,
  });
  if (error) {
    console.error('[AIB+] No se pudo guardar el perfil:', error.message);
    return {
      ok: false,
      error:
        error.code === '23514'
          ? 'Revisa los datos: alguno no tiene el formato esperado.'
          : 'No pudimos guardar tu perfil. Vuelve a intentarlo.',
    };
  }
  return { ok: true, estado: ((data as { estado?: EstadoIngeniero } | null)?.estado ?? 'pendiente') as EstadoIngeniero };
}

/** Los servicios que ofrece (se guarda aparte del perfil). */
export async function guardarServicios(servicios: string[], otros: string[] = []): Promise<boolean> {
  const { data, error } = await supabase.rpc('guardar_servicios_ingeniero', { p_servicios: servicios, p_otros: otros });
  if (error) console.error('[AIB+] No se pudieron guardar los servicios:', error.message);
  return data === true;
}

export async function ingenierosDisponibles(): Promise<IngenieroPublico[]> {
  const { data, error } = await supabase.rpc('ingenieros_disponibles');
  if (error) {
    console.warn('[AIB+] No se pudieron leer los ingenieros:', error.message);
    return [];
  }
  return (data as IngenieroPublico[] | null) ?? [];
}

export async function ingenierosParaAdmin(): Promise<IngenieroAdmin[] | null> {
  const { data, error } = await supabase.rpc('ingenieros_para_admin');
  if (error) {
    console.warn('[AIB+] No se pudieron leer las solicitudes:', error.message);
    return null;
  }
  return (data as IngenieroAdmin[] | null) ?? [];
}

export async function revisarIngeniero(
  usuario: string,
  accion: 'aprobar' | 'rechazar' | 'pausar' | 'reactivar'
): Promise<boolean> {
  const { data, error } = await supabase.rpc('revisar_ingeniero', { p_usuario: usuario, p_accion: accion });
  if (error) console.error('[AIB+] No se pudo revisar al ingeniero:', error.message);
  return data === true;
}

/** El cliente elige ingeniero para su proyecto, antes de aceptarlo. */
export async function elegirIngeniero(
  proyecto: string,
  ingeniero: string
): Promise<'ok' | 'propio' | 'no_disponible' | 'no_existe' | 'error'> {
  const { data, error } = await supabase.rpc('elegir_ingeniero', { p_proyecto: proyecto, p_ingeniero: ingeniero });
  if (error) {
    console.error('[AIB+] No se pudo elegir ingeniero:', error.message);
    return 'error';
  }
  const estado = (data as { estado?: string } | null)?.estado;
  return estado === 'ok' || estado === 'propio' || estado === 'no_disponible' || estado === 'no_existe'
    ? estado
    : 'error';
}

export interface MiIngeniero {
  nombre: string;
  titular: string | null;
  foto_url: string | null;
  resena: { estrellas: number; comentario: string } | null;
}

/** El ingeniero de un encargo, para su cliente. null si aún no tiene. */
export async function miIngeniero(proyecto: string): Promise<MiIngeniero | null> {
  const { data, error } = await supabase.rpc('mi_ingeniero', { p_proyecto: proyecto });
  if (error || !data) return null;
  return data as MiIngeniero;
}

export async function dejarResena(
  proyecto: string,
  estrellas: number,
  comentario: string
): Promise<'ok' | 'ya_existe' | 'no_publicada' | 'no_existe' | 'error'> {
  const { data, error } = await supabase.rpc('dejar_resena', {
    p_proyecto: proyecto,
    p_estrellas: estrellas,
    p_comentario: comentario,
  });
  if (error) {
    console.error('[AIB+] No se pudo guardar la reseña:', error.message);
    return 'error';
  }
  const estado = (data as { estado?: string } | null)?.estado;
  return estado === 'ok' || estado === 'ya_existe' || estado === 'no_publicada' || estado === 'no_existe'
    ? estado
    : 'error';
}

/** «4.8 ★ (12)», o «Nuevo en AIB+» si aún no tiene reseñas. */
export function textoEstrellas(promedio: number | null, resenas: number): string {
  if (!resenas || promedio === null) return 'Nuevo en AIB+';
  return `${Number(promedio).toFixed(1)} ★ (${resenas} ${resenas === 1 ? 'reseña' : 'reseñas'})`;
}

/**
 * La clave de CallMeBot del ingeniero, para que le lleguen sus avisos por
 * WhatsApp. Nadie la puede leer desde la app; vacía, la borra.
 */
export async function guardarAvisoWhatsapp(apikey: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('guardar_aviso_ingeniero', { p_apikey: apikey });
  if (error) {
    console.error('[AIB+] No se pudo guardar la clave de avisos:', error.message);
    throw new Error(
      error.code === '23514' ? 'La clave solo tiene letras y números.' : 'No pudimos guardar la clave. Vuelve a intentarlo.'
    );
  }
  return data === true;
}

/** ¿Tiene los avisos listos? (clave guardada y WhatsApp en su perfil) */
export async function tengoAvisoWhatsapp(): Promise<boolean> {
  const { data } = await supabase.rpc('tengo_aviso_ingeniero');
  return data === true;
}
