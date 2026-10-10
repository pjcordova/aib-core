// ---------------------------------------------------------------------------
// Formularios por servicio
// ---------------------------------------------------------------------------
// AIB+ pregunta lo básico de cada servicio (PREGUNTAS_SERVICIO, en
// servicios.ts) y cada ingeniero añade sus propias preguntas. Las guarda y las
// valida la base de datos (supabase_formularios_servicio.sql):
//   - su cliente de enlace las responde junto con las de AIB+;
//   - el de la plataforma, al aceptar, cuando ya eligió quién lo construye.
// ---------------------------------------------------------------------------

import { supabase } from './supabase';
import { miPerfilIngeniero } from './ingenieros';
import { claveServicio, obtenerServicio, type Pregunta, type TipoServicio } from './servicios';

export type TipoPreguntaPropia = 'texto' | 'opcion' | 'multiple';

export interface PreguntaPropia {
  /** p1, p2…: los pone la base de datos según el orden. */
  id: string;
  titulo: string;
  tipo: TipoPreguntaPropia;
  /** De 2 a 8, salvo en las de texto. */
  opciones?: string[];
}

/** Lo que el ingeniero escribe antes de guardar (aún sin id). */
export type BorradorPregunta = Omit<PreguntaPropia, 'id'>;

export const TIPOS_PREGUNTA: { valor: TipoPreguntaPropia; etiqueta: string }[] = [
  { valor: 'opcion', etiqueta: 'Elige una' },
  { valor: 'multiple', etiqueta: 'Marca varias' },
  { valor: 'texto', etiqueta: 'Respuesta escrita' },
];

/** En sus servicios «Otro» no hay preguntas de AIB+: puede poner más. */
export const maximoPreguntas = (clave: string) => (clave.startsWith('otro:') ? 8 : 5);

/**
 * Una pregunta del ingeniero en el formato de las de AIB+. `prefijo` marca su
 * id en el historial: así el panel del ingeniero las destaca.
 */
export function comoPregunta(p: PreguntaPropia, prefijo: string): Pregunta {
  return {
    id: `${prefijo}${p.id}`,
    tipo: p.tipo,
    titulo: p.titulo,
    opciones: p.opciones?.map((o) => ({ valor: o, etiqueta: o })),
    // Las escritas no obligan: un clic basta para seguir.
    opcional: p.tipo === 'texto',
  };
}

/** Lo que llega de la base de datos no se da por bueno. */
function leer(datos: unknown): PreguntaPropia[] {
  if (!Array.isArray(datos)) return [];
  return datos.flatMap((p: Partial<PreguntaPropia> | null) => {
    if (!p || typeof p.id !== 'string' || typeof p.titulo !== 'string') return [];
    if (p.tipo !== 'texto' && p.tipo !== 'opcion' && p.tipo !== 'multiple') return [];
    const opciones = Array.isArray(p.opciones) ? p.opciones.filter((o): o is string => typeof o === 'string') : [];
    if (p.tipo !== 'texto' && opciones.length < 2) return [];
    return [{ id: p.id, titulo: p.titulo, tipo: p.tipo, ...(p.tipo === 'texto' ? {} : { opciones }) }];
  });
}

/* -------------------------------------------------------------------------- */
/* Ingeniero                                                                  */
/* -------------------------------------------------------------------------- */

export interface ServicioDelIngeniero {
  /** 'web', 'crm'… u 'otro:<nombre>'. */
  clave: string;
  nombre: string;
  icono: string;
}

const ESTANDAR: Exclude<TipoServicio, 'otro'>[] = ['web', 'crm', 'erp', 'automatizacion', 'app-movil'];

/**
 * Los servicios que ofrece, como los ve el cliente: la tienda online es una
 * web y «Otro» son los que escribió a mano. El administrador, que no siempre
 * tiene perfil, ofrece todos los de AIB+.
 */
export async function misServicios(esAdmin: boolean): Promise<ServicioDelIngeniero[]> {
  const perfil = await miPerfilIngeniero();
  const suyos = perfil?.servicios ?? ['web'];
  const estandar = ESTANDAR.filter(
    (s) => esAdmin || suyos.includes(s) || (s === 'web' && suyos.includes('tienda-online'))
  );
  return [
    ...estandar.map((s) => ({ clave: claveServicio(s), nombre: obtenerServicio(s).nombre, icono: obtenerServicio(s).icono })),
    ...(perfil?.servicios_otros ?? []).map((o) => ({ clave: claveServicio('otro', o), nombre: o, icono: obtenerServicio('otro').icono })),
  ];
}

/** Sus preguntas, por clave de servicio. */
export async function misFormularios(): Promise<Record<string, PreguntaPropia[]>> {
  const { data, error } = await supabase.from('formularios_ingeniero').select('servicio, preguntas');
  if (error) {
    console.error('[AIB+] No se pudieron leer tus formularios:', error.message);
    return {};
  }
  return Object.fromEntries(
    ((data ?? []) as { servicio: string; preguntas: unknown }[]).map((f) => [f.servicio, leer(f.preguntas)])
  );
}

/** Guarda sus preguntas de un servicio. Una lista vacía las borra. */
export async function guardarFormulario(
  clave: string,
  preguntas: BorradorPregunta[]
): Promise<{ preguntas: PreguntaPropia[] } | { error: string }> {
  const limpias = preguntas.map((p) => ({
    titulo: p.titulo.trim(),
    tipo: p.tipo,
    ...(p.tipo === 'texto' ? {} : { opciones: (p.opciones ?? []).map((o) => o.trim()).filter(Boolean) }),
  }));
  const { data, error } = await supabase.rpc('guardar_formulario', { p_servicio: clave, p_preguntas: limpias });
  if (error) {
    console.error('[AIB+] No se pudo guardar el formulario:', error.message);
    return { error: 'No pudimos guardar tus preguntas. Revisa tu conexión y vuelve a intentarlo.' };
  }
  const r = data as { estado?: string; preguntas?: unknown } | null;
  if (r?.estado === 'ok') return { preguntas: leer(r.preguntas) };
  if (r?.estado === 'no_ofrece') return { error: 'Primero marca este servicio en «Mi perfil».' };
  return {
    error:
      'Revisa tus preguntas: cada una necesita un texto de 3 a 140 caracteres y, si es de opciones, de 2 a 8 opciones. No uses < > { }.',
  };
}

/* -------------------------------------------------------------------------- */
/* Cliente                                                                    */
/* -------------------------------------------------------------------------- */

export interface ServiciosCliente {
  /** 'ingeniero': llegó con el enlace o la página de uno; solo ve los suyos. */
  origen: 'ingeniero' | 'plataforma';
  ingeniero: string | null;
  servicios: Exclude<TipoServicio, 'otro'>[];
  /** Los que su ingeniero escribió a mano («Otro»). */
  otros: string[];
}

const SOLO_WEB: ServiciosCliente = { origen: 'plataforma', ingeniero: null, servicios: ['web'], otros: [] };
const VALIDOS = ['web', 'crm', 'erp', 'automatizacion', 'app-movil'];

/** Qué servicios puede pedir. Si falla, la web: es lo que siempre hubo. */
export async function serviciosParaCliente(): Promise<ServiciosCliente> {
  const { data, error } = await supabase.rpc('servicios_para_cliente');
  if (error || !data) {
    if (error) console.warn('[AIB+] No se pudieron leer los servicios:', error.message);
    return SOLO_WEB;
  }
  const r = data as { origen?: unknown; ingeniero?: unknown; servicios?: unknown; otros?: unknown };
  const servicios = (Array.isArray(r.servicios) ? r.servicios : []).filter((s): s is ServiciosCliente['servicios'][number] =>
    VALIDOS.includes(s as string)
  );
  return {
    origen: r.origen === 'ingeniero' ? 'ingeniero' : 'plataforma',
    ingeniero: typeof r.ingeniero === 'string' ? r.ingeniero : null,
    servicios,
    otros: (Array.isArray(r.otros) ? r.otros : []).filter((o): o is string => typeof o === 'string'),
  };
}

/** Las preguntas de su ingeniero para un servicio (solo si llegó con su enlace). */
export async function formularioServicio(clave: string): Promise<PreguntaPropia[]> {
  const { data, error } = await supabase.rpc('formulario_servicio', { p_servicio: clave });
  if (error) console.warn('[AIB+] No se pudieron leer las preguntas del ingeniero:', error.message);
  return leer(data);
}

/** Las preguntas del ingeniero que se queda con el proyecto, para el último paso. */
export async function preguntasParaEncargo(proyectoId: string): Promise<PreguntaPropia[]> {
  const { data, error } = await supabase.rpc('preguntas_para_encargo', { p_proyecto: proyectoId });
  if (error) console.warn('[AIB+] No se pudieron leer las preguntas del ingeniero:', error.message);
  return leer(data);
}
