// ---------------------------------------------------------------------------
// Persistencia de proyectos del flujo de discovery
// ---------------------------------------------------------------------------
// Hasta ahora nada del flujo vivo escribía en Supabase: al cerrar la pestaña se
// perdían el discovery y el prototipo, que cuesta más de dos minutos y unos
// 0,20 $ generar. Este módulo lo persiste.
//
// Reutiliza la tabla `proyectos`, cuyo `payload` es JSONB. Para no mezclarse
// con las filas del formulario antiguo, las nuestras se marcan con `tipo`.
// ---------------------------------------------------------------------------

import { supabase } from './supabase';
import type { QAHistory } from '../Types/productOwner';
import type { TokenUsage, Documentacion } from './api';
import type { FichaWeb, TipoServicio } from './servicios';

/** Plantilla del catálogo con la que se hizo la maqueta. */
export interface PlantillaUsada {
  /** Id de la fila en `plantillas` (para los contadores). */
  id: string;
  base: string;
  nombre: string;
}

/** Marca que distingue estas filas de las del formulario antiguo. */
export const TIPO_DISCOVERY = 'aib-discovery';

export interface PayloadDiscovery {
  tipo: typeof TIPO_DISCOVERY;
  version: 1;
  servicio: string;
  historial: QAHistory[];
  /**
   * Tipo de servicio que eligió el cliente. Las filas anteriores a los módulos
   * no lo tienen: eran todas del discovery de software.
   */
  tipo_servicio?: TipoServicio;
  /** Prototipo en React (discovery con IA). */
  react_code?: string;
  /** Cuerpo de la maqueta web en HTML (módulo web). */
  html?: string;
  /** Respuestas del módulo web, logo incluido. */
  ficha?: FichaWeb;
  /** Si la maqueta sale de una plantilla del ingeniero: cuál. */
  plantilla?: PlantillaUsada;
  /**
   * Página completa ya renderizada (plantillas). Se guarda entera y no solo los
   * textos para que el cliente vea siempre la versión que aprobó, aunque la
   * plantilla cambie después.
   */
  documento?: string;
  usage?: TokenUsage | null;
  /** El cliente validó la previsualización: el encargo pasa a ingeniería. */
  aceptado?: boolean;
  aceptado_en?: string;
  /** Documento técnico, generado solo al aceptar. */
  documentacion?: Documentacion | null;
}

export interface ProyectoResumen {
  id: string;
  servicio: string;
  respuestas: number;
  creadoEn: string;
  aceptado: boolean;
  tipoServicio?: TipoServicio;
  empresa?: string;
  presupuesto?: string;
}

export interface ProyectoCompleto extends ProyectoResumen {
  historial: QAHistory[];
  reactCode?: string;
  html?: string;
  ficha?: FichaWeb;
  plantilla?: PlantillaUsada;
  documento?: string;
  usage?: TokenUsage | null;
  documentacion?: Documentacion | null;
}

/** Campos comunes que se leen de cualquier fila del flujo de discovery. */
function resumenDe(id: string, creadoEn: string, p: PayloadDiscovery): ProyectoResumen {
  return {
    id,
    servicio: p.servicio,
    respuestas: p.historial?.length ?? 0,
    creadoEn,
    aceptado: p.aceptado === true,
    tipoServicio: p.tipo_servicio,
    empresa: p.ficha?.empresa,
    presupuesto: p.ficha?.presupuesto,
  };
}

function completoDe(id: string, creadoEn: string, p: PayloadDiscovery): ProyectoCompleto {
  return {
    ...resumenDe(id, creadoEn, p),
    historial: p.historial ?? [],
    reactCode: p.react_code,
    html: p.html,
    ficha: p.ficha,
    plantilla: p.plantilla,
    documento: p.documento,
    usage: p.usage ?? null,
    documentacion: p.documentacion ?? null,
  };
}

/** true si el payload pertenece al flujo de discovery. */
export function esPayloadDiscovery(payload: unknown): payload is PayloadDiscovery {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as { tipo?: unknown }).tipo === TIPO_DISCOVERY
  );
}

/**
 * Guarda un proyecto terminado. Devuelve el id de la fila creada.
 *
 * Nunca lanza: si el guardado falla, el usuario ya tiene su prototipo en
 * pantalla y perderlo por un error de red sería peor que no avisar. El fallo se
 * devuelve para que la interfaz pueda mostrarlo sin bloquear nada.
 */
export async function guardarProyecto(entrada: {
  servicio: string;
  historial: QAHistory[];
  tipoServicio?: TipoServicio;
  reactCode?: string;
  html?: string;
  ficha?: FichaWeb;
  plantilla?: PlantillaUsada;
  documento?: string;
  usage?: TokenUsage | null;
}): Promise<{ id: string | null; error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { id: null, error: 'No hay sesión activa.' };

  const payload: PayloadDiscovery = {
    tipo: TIPO_DISCOVERY,
    version: 1,
    servicio: entrada.servicio,
    historial: entrada.historial,
    tipo_servicio: entrada.tipoServicio,
    react_code: entrada.reactCode,
    html: entrada.html,
    ficha: entrada.ficha,
    plantilla: entrada.plantilla,
    documento: entrada.documento,
    usage: entrada.usage ?? null,
  };

  const { data, error } = await supabase
    .from('proyectos')
    .insert({ user_id: user.id, payload })
    .select('id')
    .single();

  if (error) {
    console.error('[AIB+] No se pudo guardar el proyecto:', error.message);
    return { id: null, error: error.message };
  }

  return { id: data.id as string, error: null };
}

/** Lista los proyectos del usuario, del más reciente al más antiguo. */
export async function listarProyectos(): Promise<ProyectoResumen[]> {
  const { data, error } = await supabase
    .from('proyectos')
    .select('id, payload, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[AIB+] No se pudieron listar los proyectos:', error.message);
    return [];
  }

  return (data ?? [])
    .filter((fila) => esPayloadDiscovery(fila.payload))
    .map((fila) =>
      resumenDe(fila.id as string, fila.created_at as string, fila.payload as PayloadDiscovery)
    );
}

/** Recupera un proyecto completo, con su código, sin volver a generarlo. */
export async function cargarProyecto(id: string): Promise<ProyectoCompleto | null> {
  const { data, error } = await supabase
    .from('proyectos')
    .select('id, payload, created_at')
    .eq('id', id)
    .single();

  if (error || !data || !esPayloadDiscovery(data.payload)) {
    if (error) console.error('[AIB+] No se pudo cargar el proyecto:', error.message);
    return null;
  }

  return completoDe(data.id as string, data.created_at as string, data.payload as PayloadDiscovery);
}

/**
 * Sustituye la maqueta de un proyecto web ya guardado. "Probar otra versión"
 * actualiza la misma fila en vez de crear otra: es el mismo proyecto.
 */
export async function actualizarMaqueta(
  id: string,
  cambios: { html?: string; documento?: string },
  usage?: TokenUsage | null
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error: errorLectura } = await supabase
    .from('proyectos')
    .select('payload')
    .eq('id', id)
    .single();

  if (errorLectura || !data || !esPayloadDiscovery(data.payload)) {
    return { ok: false, error: errorLectura?.message ?? 'No se encontró el proyecto.' };
  }

  const payload: PayloadDiscovery = { ...(data.payload as PayloadDiscovery), ...cambios, usage: usage ?? null };
  const { error } = await supabase.from('proyectos').update({ payload }).eq('id', id);

  if (error) {
    console.error('[AIB+] No se pudo actualizar la maqueta:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}

/** Borra un proyecto. RLS garantiza que solo se puedan borrar los propios. */
export async function eliminarProyecto(id: string): Promise<boolean> {
  const { error } = await supabase.from('proyectos').delete().eq('id', id);

  if (error) {
    console.error('[AIB+] No se pudo eliminar el proyecto:', error.message);
    return false;
  }
  return true;
}

/**
 * Marca un proyecto como aceptado por el cliente y le adjunta la documentación.
 *
 * Se hace con un update sobre el payload existente en vez de insertar una fila
 * nueva: el proyecto es el mismo, lo que cambia es su estado.
 */
export async function aceptarProyecto(
  id: string,
  documentacion: Documentacion
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error: errorLectura } = await supabase
    .from('proyectos')
    .select('payload')
    .eq('id', id)
    .single();

  if (errorLectura || !data || !esPayloadDiscovery(data.payload)) {
    return { ok: false, error: errorLectura?.message ?? 'No se encontró el proyecto.' };
  }

  const payload: PayloadDiscovery = {
    ...(data.payload as PayloadDiscovery),
    aceptado: true,
    aceptado_en: new Date().toISOString(),
    documentacion,
  };

  const { error } = await supabase.from('proyectos').update({ payload }).eq('id', id);

  if (error) {
    console.error('[AIB+] No se pudo aceptar el proyecto:', error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true, error: null };
}

/** Proyectos aceptados, que son los que ve el ingeniero en su dashboard. */
export async function listarAceptados(): Promise<ProyectoCompleto[]> {
  const { data, error } = await supabase
    .from('proyectos')
    .select('id, payload, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[AIB+] No se pudieron listar los proyectos aceptados:', error.message);
    return [];
  }

  return (data ?? [])
    .filter((fila) => esPayloadDiscovery(fila.payload) && (fila.payload as PayloadDiscovery).aceptado)
    .map((fila) =>
      completoDe(fila.id as string, fila.created_at as string, fila.payload as PayloadDiscovery)
    );
}
