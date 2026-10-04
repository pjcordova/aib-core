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
import { avisarIngeniero, generarDocumentacion, type TokenUsage, type Documentacion } from './api';
import type { FichaWeb, Paleta, TipoServicio } from './servicios';

/** Plantilla del catálogo con la que se hizo la maqueta. */
export interface PlantillaUsada {
  /** Id de la fila en `plantillas` (para los contadores). */
  id: string;
  base: string;
  nombre: string;
  /** Precio orientativo que vio el cliente al elegirla, si el ingeniero lo había fijado. */
  precio_desde?: number | null;
}

/**
 * Cómo contactar al cliente. Se guarda en el proyecto, no en el historial: el
 * historial viaja a la IA para documentar, y su teléfono no tiene por qué.
 */
export interface ContactoCliente {
  nombre: string;
  /** Formato internacional sin símbolos, listo para wa.me: "51987654321". */
  whatsapp: string;
  correo: string | null;
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
  /** Lo deja el cliente al aceptar. Los encargos anteriores no lo tienen. */
  contacto?: ContactoCliente;
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
  /** Cuándo aceptó el cliente; sirve para saber si la documentación sigue en camino. */
  aceptadoEn?: string;
  contacto?: ContactoCliente;
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

export function completoDe(id: string, creadoEn: string, p: PayloadDiscovery): ProyectoCompleto {
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
    aceptadoEn: p.aceptado_en,
    contacto: p.contacto,
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
 * Mezcla `cambios` en el payload de un proyecto propio. El payload es un solo
 * JSONB, así que hay que leerlo, combinarlo y escribirlo entero.
 */
async function modificarPayload(
  id: string,
  cambios: Partial<PayloadDiscovery> | ((actual: PayloadDiscovery) => Partial<PayloadDiscovery>),
  accion: string
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error: errorLectura } = await supabase
    .from('proyectos')
    .select('payload')
    .eq('id', id)
    .single();

  if (errorLectura || !data || !esPayloadDiscovery(data.payload)) {
    return { ok: false, error: errorLectura?.message ?? 'No se encontró el proyecto.' };
  }

  const actual = data.payload as PayloadDiscovery;
  const payload: PayloadDiscovery = {
    ...actual,
    ...(typeof cambios === 'function' ? cambios(actual) : cambios),
  };
  const { error } = await supabase.from('proyectos').update({ payload }).eq('id', id);

  if (error) {
    console.error(`[AIB+] No se pudo ${accion}:`, error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}

/**
 * Sustituye la maqueta de un proyecto web ya guardado. "Probar otra versión"
 * actualiza la misma fila en vez de crear otra: es el mismo proyecto.
 */
export function actualizarMaqueta(
  id: string,
  cambios: { html?: string; documento?: string },
  usage?: TokenUsage | null
): Promise<{ ok: boolean; error: string | null }> {
  return modificarPayload(id, { ...cambios, usage: usage ?? null }, 'actualizar la maqueta');
}

/**
 * Borra un proyecto. RLS garantiza que solo se puedan borrar los propios y
 * nunca un encargo ya aceptado, que es trabajo del ingeniero (supabase_encargos.sql):
 * en ese caso no se borra ninguna fila y se devuelve false.
 */
export async function eliminarProyecto(id: string): Promise<boolean> {
  const { data, error } = await supabase.from('proyectos').delete().eq('id', id).select('id');

  if (error) {
    console.error('[AIB+] No se pudo eliminar el proyecto:', error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Guarda lo que el cliente cambió a mano en su maqueta (textos y colores). No
 * pasa por la IA ni toca el consumo registrado. Si cambió la paleta, se
 * actualiza también en la ficha y en el historial, que es lo que después lee
 * la documentación del ingeniero.
 */
export function guardarEdicion(
  id: string,
  { documento, paleta }: { documento: string; paleta: Paleta }
): Promise<{ ok: boolean; error: string | null }> {
  return modificarPayload(
    id,
    (actual) => ({
      documento,
      ficha: actual.ficha ? { ...actual.ficha, paleta } : actual.ficha,
      historial: conPaletaEnHistorial(actual.historial ?? [], paleta),
    }),
    'guardar los cambios de la maqueta'
  );
}

/** El historial con la respuesta de colores al día. */
export function conPaletaEnHistorial(historial: QAHistory[], paleta: Paleta): QAHistory[] {
  return historial.map((h) =>
    h.question_id === 'paleta'
      ? { ...h, answer: `${paleta.nombre} (${paleta.primario} y ${paleta.secundario})` }
      : h
  );
}

/**
 * El cliente acepta y el encargo pasa al ingeniero con lo que necesita para
 * escribirle (contacto) y para cotizar (respuestas de alcance, que se suman al
 * historial). Es inmediato a propósito: la documentación tarda cerca de un
 * minuto y el cliente no tiene por qué esperarla, así que se genera después.
 */
export async function enviarEncargo(
  id: string,
  datos: {
    servicio: string;
    historial: QAHistory[];
    contacto: Omit<ContactoCliente, 'correo'>;
    respuestas: QAHistory[];
  }
): Promise<{ ok: boolean; error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Si reintenta, las respuestas de alcance sustituyen a las anteriores.
  const historial = [
    ...datos.historial.filter((h) => !h.question_id.startsWith('alcance-')),
    ...datos.respuestas,
  ];

  const resultado = await modificarPayload(
    id,
    {
      aceptado: true,
      aceptado_en: new Date().toISOString(),
      contacto: { ...datos.contacto, correo: user?.email ?? null },
      historial,
    },
    'enviar el encargo'
  );

  if (resultado.ok) {
    avisarIngeniero(id);
    documentarEnSegundoPlano(id, datos.servicio, historial);
  }
  return resultado;
}

/**
 * Genera la documentación técnica de un proyecto recién aceptado y se la
 * adjunta, sin que nadie espere. Si el cliente cierra la pestaña antes de que
 * termine, el encargo queda sin documentación y el ingeniero la puede generar
 * desde su panel con `documentarComoIngeniero`.
 */
export function documentarEnSegundoPlano(id: string, servicio: string, historial: QAHistory[]): void {
  void generarDocumentacion(servicio, historial)
    .then(({ documentacion }) => modificarPayload(id, { documentacion }, 'adjuntar la documentación'))
    .catch((e) => console.error('[AIB+] No se pudo generar la documentación:', e));
}

/**
 * Adjunta la documentación a un encargo ajeno, desde el panel del ingeniero.
 * El ingeniero no puede escribir en `proyectos`: pasa por una función de la
 * base de datos que solo rellena la documentación de encargos aceptados que
 * aún no la tienen. Devuelve false si otro ya la había adjuntado.
 */
export async function documentarComoIngeniero(
  id: string,
  documentacion: Documentacion
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('adjuntar_documentacion', {
    p_proyecto: id,
    p_documentacion: documentacion,
  });

  if (error) {
    console.error('[AIB+] No se pudo adjuntar la documentación:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: data === true, error: null };
}
