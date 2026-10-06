// ---------------------------------------------------------------------------
// Cliente del backend orquestador
// ---------------------------------------------------------------------------
// Toda llamada al servidor pasa por aquí. Antes los `fetch` vivían sueltos en
// el componente y los fallos acababan en `console.error`, así que el usuario
// veía un spinner eterno sin saber que algo se había roto. Aquí los errores se
// convierten en ApiError con un mensaje legible, y el componente decide cómo
// mostrarlo.
// ---------------------------------------------------------------------------

import type { ProductOwnerResponse, QAHistory } from '../Types/productOwner';
import { supabase } from './supabase';
import type { EstadoEncargo } from './seguimiento';

// En desarrollo el backend vive en otro puerto. En producción (Vercel) la API
// se sirve desde el mismo origen que la web, así que una base vacía produce
// rutas relativas del tipo `/api/…` y no hace falta configurar nada.
const API_URL =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3001' : '');

/** Cuánto esperamos antes de dar una llamada por perdida. */
const TIMEOUT_MS = {
  discovery: 60_000,
  prototype: 180_000, // Generar un dashboard entero puede pasar del minuto.
  documentation: 120_000,
  web: 120_000, // Una maqueta web ronda los 40 s; dejamos margen.
  plantilla: 90_000, // Solo textos: ronda los 20-30 s.
  abi: 150_000, // Puede consultar varias veces tus datos antes de responder.
} as const;

export class ApiError extends Error {
  readonly status: number;
  /** true si reintentar tiene sentido (red caída, rate limit, 5xx). */
  readonly retryable: boolean;

  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryable = retryable;
  }
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

interface DiscoveryPayload extends ProductOwnerResponse {
  usage?: TokenUsage;
}

interface PrototypePayload {
  success: boolean;
  react_code?: string;
  error?: string;
  usage?: TokenUsage;
}

const CONEXION_CORTADA = 'Se cortó la conexión con AIB+. Revisa tu internet y vuelve a intentarlo.';

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // El backend exige sesión: estos endpoints gastan dinero real y no pueden
  // quedar abiertos. Adjuntamos el token que Supabase ya emitió al iniciar
  // sesión; el servidor lo valida contra Supabase en cada petición.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    clearTimeout(timer);
    throw new ApiError('Tu sesión ha caducado. Vuelve a iniciar sesión.', 401, false);
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new ApiError(
        'La IA está tardando más de lo normal. Vuelve a intentarlo.',
        0,
        true
      );
    }
    throw new ApiError(
      import.meta.env.DEV
        ? `No se pudo contactar con el servidor. Comprueba que el backend esté levantado en ${API_URL}`
        : CONEXION_CORTADA,
      0,
      true
    );
  } finally {
    clearTimeout(timer);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Respuesta sin cuerpo JSON: nos quedamos con el código de estado.
  }

  // Las respuestas largas de la IA llegan poco a poco (ver mantenerConexion
  // en el servidor): si la conexión se corta a mitad, el cuerpo queda vacío.
  if (response.ok && payload === null) {
    throw new ApiError(CONEXION_CORTADA, 0, true);
  }

  if (!response.ok) {
    const message =
      (payload as { error?: string } | null)?.error ??
      `El servidor respondió ${response.status}.`;
    throw new ApiError(message, response.status, response.status >= 500 || response.status === 429);
  }

  return payload as T;
}

/** Pide la siguiente ronda de preguntas de discovery. */
export async function generarPreguntas(
  servicio: string,
  historial: QAHistory[]
): Promise<DiscoveryPayload> {
  return post<DiscoveryPayload>(
    '/api/generar-preguntas',
    { servicio, historial },
    TIMEOUT_MS.discovery
  );
}

/** Documento técnico que recibe el ingeniero cuando el cliente acepta. */
export interface Documentacion {
  resumen: string;
  objetivo: string;
  usuarios: { rol: string; necesidad: string }[];
  funcionalidades: { nombre: string; descripcion: string; prioridad: 'alta' | 'media' | 'baja' }[];
  modelo_datos: { entidad: string; campos: string[]; relaciones: string }[];
  flujos_criticos: { nombre: string; pasos: string[] }[];
  criterios_aceptacion: string[];
  stack_sugerido: { frontend: string; backend: string; datos: string; justificacion: string };
  riesgos: { riesgo: string; mitigacion: string }[];
  estimacion: { semanas: number; supuestos: string[] };
}

/** Genera la documentación técnica a partir del discovery ya cerrado. */
export async function generarDocumentacion(
  servicio: string,
  historial: QAHistory[]
): Promise<{ documentacion: Documentacion; usage?: TokenUsage }> {
  const data = await post<{ success: boolean; documentacion?: Documentacion; error?: string; usage?: TokenUsage }>(
    '/api/generar-documentacion',
    { servicio, historial },
    TIMEOUT_MS.documentation
  );

  if (!data.success || !data.documentacion) {
    throw new ApiError(data.error ?? 'La IA no devolvió documentación.', 502, true);
  }

  return { documentacion: data.documentacion, usage: data.usage };
}

/**
 * Avisa al ingeniero de que entró un encargo. El servidor comprueba en la base
 * de datos que el proyecto está aceptado y solo avisa una vez. Nunca falla
 * hacia fuera: el encargo ya está guardado y el ingeniero lo verá en su panel.
 */
export function avisarIngeniero(proyectoId: string): void {
  void post('/api/avisar-encargo', { proyectoId }, 20_000).catch((e) =>
    console.warn('[AIB+] No se pudo avisar al ingeniero:', e instanceof Error ? e.message : e)
  );
}

/** Pide el componente React del prototipo. Devuelve el código listo para Sandpack. */
export async function generarPrototipo(
  servicio: string,
  historial: QAHistory[]
): Promise<{ code: string; usage?: TokenUsage }> {
  const data = await post<PrototypePayload>(
    '/api/generar-prototipo',
    { servicio, historial },
    TIMEOUT_MS.prototype
  );

  if (!data.success || !data.react_code) {
    throw new ApiError(data.error ?? 'La IA no devolvió código.', 502, true);
  }

  return { code: data.react_code, usage: data.usage };
}

/** Lo que el servidor necesita de la ficha. El logo no viaja: se pone en el cliente. */
export interface FichaParaServidor {
  empresa: string;
  rubro: string;
  estilo: string;
  secciones: string[];
  paleta: { nombre: string; primario: string; secundario: string };
  objetivo?: string;
}

/** Genera el cuerpo HTML de la maqueta web. */
export async function generarPreviewWeb(
  ficha: FichaParaServidor
): Promise<{ html: string; usage?: TokenUsage }> {
  const data = await post<{ success: boolean; html?: string; error?: string; usage?: TokenUsage }>(
    '/api/generar-preview-web',
    { ficha },
    TIMEOUT_MS.web
  );

  if (!data.success || !data.html) {
    throw new ApiError(data.error ?? 'La IA no devolvió la maqueta.', 502, true);
  }

  return { html: data.html, usage: data.usage };
}

/**
 * Pide los textos de una plantilla para un cliente. Devuelve un objeto con la
 * forma que espera esa plantilla; el HTML lo pone el frontend.
 */
export async function rellenarPlantilla<T>(
  plantilla: string,
  ficha: { empresa: string; rubro: string; estilo: string; secciones: string[]; objetivo?: string }
): Promise<{ textos: T; usage?: TokenUsage }> {
  const data = await post<{ success: boolean; textos?: T; error?: string; usage?: TokenUsage }>(
    '/api/rellenar-plantilla',
    { plantilla, ficha },
    TIMEOUT_MS.plantilla
  );
  if (!data.success || !data.textos) {
    throw new ApiError(data.error ?? 'No llegaron los textos de la plantilla.', 502, true);
  }
  return { textos: data.textos, usage: data.usage };
}

/**
 * Lo que ABI propone. Nada de esto está hecho todavía: el panel lo enseña
 * como una tarjeta y lo hace el ingeniero con su botón (y con sus permisos).
 */
export type AccionAbi =
  | {
      tipo: 'whatsapp';
      /** A quién va: el cliente o el negocio. */
      para: string;
      mensaje: string;
      /** Enlace wa.me con el texto ya escrito. Abrirlo no envía nada. */
      url: string;
    }
  | {
      tipo: 'etapa';
      encargoId: string;
      para: string;
      etapaActual: EstadoEncargo;
      etapa: EstadoEncargo;
      /** Nota para el cliente; vacía si no hace falta. */
      nota: string;
    }
  | { tipo: 'invitacion'; negocio: string; esPrueba: boolean }
  | { tipo: 'recuerdo'; texto: string };

const ETAPAS_VALIDAS: EstadoEncargo[] = ['recibido', 'en_revision', 'propuesta_enviada', 'en_desarrollo', 'publicada'];
const ID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Solo se aceptan acciones con la forma esperada: lo que no encaja, se descarta. */
function esAccionValida(a: unknown): a is AccionAbi {
  const x = a as Record<string, unknown> | null;
  if (!x || typeof x !== 'object') return false;
  const texto = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  switch (x.tipo) {
    case 'whatsapp':
      return texto(x.para, 200) && texto(x.mensaje, 1500) && typeof x.url === 'string' && x.url.startsWith('https://wa.me/');
    case 'etapa':
      return (
        typeof x.encargoId === 'string' &&
        ID_VALIDO.test(x.encargoId) &&
        texto(x.para, 200) &&
        ETAPAS_VALIDAS.includes(x.etapa as EstadoEncargo) &&
        ETAPAS_VALIDAS.includes(x.etapaActual as EstadoEncargo) &&
        typeof x.nota === 'string' &&
        x.nota.length <= 280
      );
    case 'invitacion':
      return texto(x.negocio, 80) && typeof x.esPrueba === 'boolean';
    case 'recuerdo':
      return texto(x.texto, 300);
    default:
      return false;
  }
}

/** Le pasa la conversación a ABI y devuelve su respuesta y lo que propone. */
export async function preguntarAbi(
  conversacion: { rol: 'usuario' | 'abi'; texto: string }[]
): Promise<{ respuesta: string; acciones: AccionAbi[] }> {
  const data = await post<{ success: boolean; respuesta?: string; acciones?: unknown[]; error?: string }>(
    '/api/abi',
    { conversacion },
    TIMEOUT_MS.abi
  );
  if (!data.success || typeof data.respuesta !== 'string') {
    throw new ApiError(data.error ?? 'ABI no pudo responder. Vuelve a intentarlo.', 502, true);
  }
  return { respuesta: data.respuesta, acciones: (data.acciones ?? []).filter(esAccionValida) };
}

/** El ingeniero se manda un WhatsApp de prueba para comprobar sus avisos. */
export async function probarWhatsappIngeniero(): Promise<void> {
  await post<{ success: boolean }>('/api/avisos/probar-whatsapp', {}, 20_000);
}
