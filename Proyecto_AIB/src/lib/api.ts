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

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

/** Cuánto esperamos antes de dar una llamada por perdida. */
const TIMEOUT_MS = {
  discovery: 60_000,
  prototype: 180_000, // Generar un dashboard entero puede pasar del minuto.
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

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      'No se pudo contactar con el servidor. Comprueba que el backend esté levantado en ' +
        API_URL,
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
