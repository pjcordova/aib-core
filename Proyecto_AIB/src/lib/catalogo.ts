// ---------------------------------------------------------------------------
// Catálogo de plantillas del ingeniero
// ---------------------------------------------------------------------------
// Cada fila de `plantillas` apunta a una plantilla base del código (por su id)
// y guarda lo que es propio de cada ingeniero: si está activa, sus etiquetas y
// sus contadores. Ver supabase_roles_plantillas.sql.
// ---------------------------------------------------------------------------

import { supabase } from './supabase';
import type { CategoriaNegocio, PlantillaBase } from './plantillas';
import { obtenerPlantillaBase } from '../plantillas';
import type { FichaWeb } from './servicios';
import { basePropia, type DisenoPropio, type NivelPlantilla } from './plantillaPropia';

export interface FilaPlantilla {
  id: string;
  ingeniero_id: string;
  base: string;
  nombre: string;
  categoria: CategoriaNegocio;
  estilo: string;
  etiquetas: string[];
  activa: boolean;
  /** Precio orientativo en soles que ve el cliente ("desde S/ X"). null: sin fijar. */
  precio_desde: number | null;
  veces_mostrada: number;
  veces_elegida: number;
  veces_aceptada: number;
  created_at: string;
  /** 'biblioteca': una de AIB+ (base = su id). 'propia': la subió el ingeniero (base = 'propia'). */
  tipo: 'biblioteca' | 'propia';
  /** Para qué servicio es: 'web', 'crm'… u 'otro:<nombre>' (ver claveServicio). */
  servicio: string;
  nivel: NivelPlantilla;
  descripcion: string | null;
  /** El diseño de las propias. En el catálogo del cliente llega aparte (conContenido). */
  html?: string | null;
  css?: string | null;
  fuentes?: string[] | null;
  color_primario: string | null;
  color_secundario: string | null;
  /** Quién la construye, para el cliente que elige (catalogo_cliente). */
  ingeniero?: IngenieroDePlantilla;
}

export interface IngenieroDePlantilla {
  id: string;
  es_admin: boolean;
  nombre: string | null;
  foto_url: string | null;
  promedio: number | null;
  resenas: number;
}

/** Una fila del catálogo junto con su plantilla base, lista para pintar. */
export interface PlantillaDelCatalogo {
  fila: FilaPlantilla;
  base: PlantillaBase;
}

export type EventoPlantilla = 'mostrada' | 'elegida' | 'aceptada';

/** true si el error indica que la tabla aún no se ha creado en Supabase. */
function faltaTabla(codigo: string | undefined): boolean {
  return codigo === '42P01' || codigo === 'PGRST205';
}

/** Une filas con su plantilla base; descarta las que apuntan a una que ya no existe. */
function conBase(filas: FilaPlantilla[]): PlantillaDelCatalogo[] {
  return filas.flatMap((fila) => {
    const f = { ...fila, tipo: fila.tipo ?? 'biblioteca', nivel: fila.nivel ?? 'basica', servicio: fila.servicio ?? 'web' };
    if (f.tipo === 'propia') return [{ fila: f, base: basePropia(f) }];
    const base = obtenerPlantillaBase(f.base);
    return base ? [{ fila: f, base }] : [];
  });
}

/* -------------------------------------------------------------------------- */
/* Ingeniero                                                                  */
/* -------------------------------------------------------------------------- */

export async function listarMisPlantillas(): Promise<{
  plantillas: PlantillaDelCatalogo[];
  sinConfigurar: boolean;
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { plantillas: [], sinConfigurar: false };

  const { data, error } = await supabase
    .from('plantillas')
    .select('*')
    .eq('ingeniero_id', user.id)
    .order('created_at', { ascending: true });

  if (error) {
    if (!faltaTabla(error.code)) console.error('[AIB+] No se pudo leer el catálogo:', error.message);
    return { plantillas: [], sinConfigurar: faltaTabla(error.code) };
  }
  return { plantillas: conBase((data ?? []) as FilaPlantilla[]), sinConfigurar: false };
}

/** Lo que el ingeniero completa al subir su propio diseño. */
export interface DatosPropia {
  servicio: string;
  nombre: string;
  descripcion: string;
  categoria: CategoriaNegocio;
  estilo: string;
  nivel: NivelPlantilla;
  precio_desde: number | null;
  color_primario: string;
  color_secundario: string;
}

/** Sube un diseño propio al catálogo del ingeniero. Sale publicado. */
export async function anadirPropia(datos: DatosPropia, diseno: DisenoPropio): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No hay sesión activa.' };

  const { error } = await supabase.from('plantillas').insert({
    ingeniero_id: user.id,
    base: 'propia',
    tipo: 'propia',
    ...datos,
    descripcion: datos.descripcion.trim() || null,
    etiquetas: [],
    ...diseno,
  });
  if (error) {
    console.error('[AIB+] No se pudo subir la plantilla:', error.message);
    return { error: mensajeDeError(error.code, error.message) };
  }
  return { error: null };
}

function mensajeDeError(codigo: string | undefined, mensaje: string): string {
  if (codigo === '54000') return 'Llegaste al máximo de 40 plantillas.';
  if (codigo === '23514') return 'Revisa los datos: alguno no tiene el formato esperado (o la página pesa demasiado).';
  return mensaje;
}

/**
 * Las plantillas de la biblioteca que ya tiene algún ingeniero publicadas: el
 * administrador no las vuelve a añadir (saldrían repetidas en la portada).
 */
export async function basesDeBibliotecaEnUso(): Promise<string[]> {
  const { data, error } = await supabase.from('plantillas').select('base').eq('tipo', 'biblioteca').eq('activa', true);
  if (error) {
    console.warn('[AIB+] No se pudo leer la biblioteca en uso:', error.message);
    return [];
  }
  return [...new Set((data ?? []).map((f) => f.base as string))];
}

/** Añade una plantilla de la biblioteca base al catálogo del ingeniero. */
export async function anadirPlantilla(base: PlantillaBase): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No hay sesión activa.' };

  const { error } = await supabase.from('plantillas').insert({
    ingeniero_id: user.id,
    base: base.id,
    nombre: base.nombre,
    categoria: base.categoria,
    estilo: base.estilo,
    etiquetas: base.etiquetas,
  });

  if (error) {
    console.error('[AIB+] No se pudo añadir la plantilla:', error.message);
    return { error: error.code === '23505' ? 'Esa plantilla ya está en tu catálogo.' : error.message };
  }
  return { error: null };
}

export async function actualizarPlantilla(
  id: string,
  cambios: Partial<
    Pick<
      FilaPlantilla,
      | 'activa'
      | 'servicio'
      | 'etiquetas'
      | 'nombre'
      | 'estilo'
      | 'precio_desde'
      | 'nivel'
      | 'descripcion'
      | 'categoria'
      | 'color_primario'
      | 'color_secundario'
      | 'html'
      | 'css'
      | 'fuentes'
    >
  >
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('plantillas').update(cambios).eq('id', id);
  if (error) {
    console.error('[AIB+] No se pudo actualizar la plantilla:', error.message);
    return { error: mensajeDeError(error.code, error.message) };
  }
  return { error: null };
}

export async function quitarPlantilla(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('plantillas').delete().eq('id', id);
  if (error) {
    console.error('[AIB+] No se pudo quitar la plantilla:', error.message);
    return { error: error.message };
  }
  return { error: null };
}

/* -------------------------------------------------------------------------- */
/* Cliente                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Plantillas que se pueden ofrecer al cliente. Si el catálogo aún no existe o
 * falla, devuelve una lista vacía y el flujo sigue con la generación por IA:
 * nunca debe bloquear al cliente.
 */
export async function listarPlantillasActivas(): Promise<PlantillaDelCatalogo[]> {
  // Qué ve cada cliente lo decide la base de datos (catalogo_cliente): el de
  // un ingeniero, solo las suyas; el de la plataforma, las de todos.
  const { data, error } = await supabase.rpc('catalogo_cliente');
  if (error) {
    if (!faltaTabla(error.code)) console.error('[AIB+] No se pudieron leer las plantillas:', error.message);
    return [];
  }
  return conBase(((data as FilaPlantilla[] | null) ?? []).filter((f) => f.activa));
}

/**
 * El catálogo llega sin el diseño de las propias (pesa): se pide solo el de
 * las que se van a enseñar. Las que no llegan se quitan.
 */
export async function conContenido(candidatas: PlantillaDelCatalogo[]): Promise<PlantillaDelCatalogo[]> {
  const ids = candidatas.filter((c) => c.fila.tipo === 'propia').map((c) => c.fila.id);
  if (ids.length === 0) return candidatas;

  const { data, error } = await supabase.rpc('contenido_plantillas', { p_ids: ids });
  if (error) console.warn('[AIB+] No se pudieron leer los diseños:', error.message);
  const contenidos = new Map(
    ((data as ({ id: string } & DisenoPropio)[] | null) ?? []).map((d) => [d.id, d] as const)
  );

  return candidatas.flatMap((c) => {
    if (c.fila.tipo !== 'propia') return [c];
    const d = contenidos.get(c.fila.id);
    if (!d) return [];
    const fila = { ...c.fila, html: d.html, css: d.css, fuentes: d.fuentes };
    return [{ fila, base: basePropia(fila) }];
  });
}

/** Suma uno al contador. Si falla no pasa nada: es estadística, no negocio. */
export async function registrarEvento(plantillaId: string, evento: EventoPlantilla): Promise<void> {
  const { error } = await supabase.rpc('registrar_evento_plantilla', {
    p_plantilla: plantillaId,
    p_evento: evento,
  });
  if (error) console.warn('[AIB+] No se pudo registrar el evento', evento, error.message);
}

/* -------------------------------------------------------------------------- */
/* Emparejamiento                                                             */
/* -------------------------------------------------------------------------- */

/** Minúsculas y sin tildes, para comparar palabras sin que "diseño" ≠ "diseno". */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Puntúa lo bien que encaja cada plantilla con lo que contó el cliente y
 * devuelve las mejores. Es determinista y no gasta tokens:
 *
 *   - el tipo de negocio manda: una plantilla de otra categoría no se ofrece;
 *   - coincidir en estilo suma;
 *   - cada etiqueta que aparece en lo que escribió el cliente suma;
 *   - cada sección pedida que la plantilla sabe mostrar suma.
 *
 * Con pocas plantillas es suficiente. Cuando un ingeniero tenga muchas, el
 * siguiente paso es ordenarlas por significado (Claude o búsqueda vectorial).
 */
export function emparejar(
  candidatas: PlantillaDelCatalogo[],
  cliente: { categoria: CategoriaNegocio | ''; estilo: string } & Pick<FichaWeb, 'rubro' | 'empresa' | 'secciones'>,
  maximo = 6
): PlantillaDelCatalogo[] {
  const texto = normalizar(`${cliente.empresa} ${cliente.rubro}`);

  return candidatas
    .filter((c) => c.fila.servicio === 'web' && c.fila.categoria === cliente.categoria)
    .map((c) => {
      let puntos = 10;
      if (c.fila.estilo === cliente.estilo) puntos += 5;
      for (const etiqueta of c.fila.etiquetas) {
        if (texto.includes(normalizar(etiqueta).replace(/-/g, ' '))) puntos += 2;
      }
      for (const seccion of cliente.secciones) {
        if (c.base.secciones.includes(seccion)) puntos += 1;
      }
      // Desempate por lo que ya demostró funcionar con otros clientes y por
      // las estrellas de quien la construye.
      const tasa = c.fila.veces_mostrada > 0 ? c.fila.veces_aceptada / c.fila.veces_mostrada : 0;
      const estrellas = c.fila.ingeniero?.promedio ? Number(c.fila.ingeniero.promedio) / 10 : 0;
      return { c, puntos: puntos + tasa + estrellas };
    })
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, maximo)
    .map(({ c }) => c);
}

/**
 * Las plantillas de un servicio que no es la web (CRM, ERP…). No se filtra
 * por tipo de negocio: un CRM sirve igual a una pastelería que a un taller.
 * Ordena por lo que ya demostró funcionar, las estrellas de quien la
 * construye y las etiquetas que coinciden con lo que contó el cliente.
 */
export function plantillasDeServicio(
  candidatas: PlantillaDelCatalogo[],
  clave: string,
  cliente: { rubro: string; empresa: string },
  maximo = 6
): PlantillaDelCatalogo[] {
  const texto = normalizar(`${cliente.empresa} ${cliente.rubro}`);

  return candidatas
    .filter((c) => c.fila.servicio === clave)
    .map((c) => {
      let puntos = 0;
      for (const etiqueta of c.fila.etiquetas) {
        if (texto.includes(normalizar(etiqueta).replace(/-/g, ' '))) puntos += 2;
      }
      const tasa = c.fila.veces_mostrada > 0 ? c.fila.veces_aceptada / c.fila.veces_mostrada : 0;
      const estrellas = c.fila.ingeniero?.promedio ? Number(c.fila.ingeniero.promedio) / 10 : 0;
      return { c, puntos: puntos + tasa + estrellas };
    })
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, maximo)
    .map(({ c }) => c);
}
