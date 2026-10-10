// ---------------------------------------------------------------------------
// La vitrina de la portada
// ---------------------------------------------------------------------------
// Lo que ve quien llega a AIB+ sin cuenta, como en un marketplace: qué
// servicios hay, cuántos ingenieros los ofrecen y desde cuánto, y los diseños
// publicados de los ingenieros (supabase_portada_marketplace.sql).
// ---------------------------------------------------------------------------

import { supabase } from './supabase';
import type { DisenoPublico } from './perfilPublico';
import type { TipoServicio } from './servicios';

export interface ServicioVitrina {
  clave: Exclude<TipoServicio, 'otro'>;
  /** Ingenieros aprobados que lo ofrecen. */
  ingenieros: number;
  /** Diseños publicados de ese servicio. */
  plantillas: number;
  /** El precio «desde» más bajo entre sus diseños. */
  desde: number | null;
}

export interface DisenoVitrina extends DisenoPublico {
  ingeniero: {
    nombre: string;
    foto_url: string | null;
    slug: string | null;
    promedio: number | null;
    resenas: number;
  };
}

export interface Vitrina {
  servicios: ServicioVitrina[];
  plantillas: DisenoVitrina[];
}

/** null si no se pudo leer: la portada se arregla sin ella. */
export async function vitrinaPortada(): Promise<Vitrina | null> {
  const { data, error } = await supabase.rpc('vitrina_portada');
  if (error || !data) {
    if (error) console.warn('[AIB+] No se pudo leer la vitrina:', error.message);
    return null;
  }
  const v = data as Partial<Vitrina>;
  return { servicios: v.servicios ?? [], plantillas: v.plantillas ?? [] };
}

/**
 * Lo que escribe en el buscador → el servicio que más se le parece. Palabras
 * de dueño de negocio, no de informático. null si no se parece a ninguno.
 */
const PALABRAS: [Exclude<TipoServicio, 'otro'>, string[]][] = [
  ['crm', ['crm', 'cliente', 'clientes', 'vendedor', 'vendedores', 'seguimiento', 'cotizacion', 'prospecto', 'cartera']],
  ['erp', ['erp', 'inventario', 'almacen', 'stock', 'factura', 'facturacion', 'contabilidad', 'planilla', 'compras', 'boleta', 'caja']],
  ['automatizacion', ['automatiza', 'automatizar', 'automatico', 'bot', 'chatbot', 'reporte', 'reportes', 'excel', 'correo', 'repetitivo', 'whatsapp']],
  ['app-movil', ['app', 'aplicacion', 'movil', 'celular', 'android', 'iphone', 'ios']],
  ['web', ['web', 'pagina', 'tienda', 'online', 'landing', 'catalogo', 'ecommerce', 'sitio', 'dominio', 'vender por internet']],
];

export function servicioDeBusqueda(texto: string): Exclude<TipoServicio, 'otro'> | null {
  const limpio = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (!limpio.trim()) return null;
  let mejor: { clave: Exclude<TipoServicio, 'otro'>; puntos: number } | null = null;
  for (const [clave, palabras] of PALABRAS) {
    const puntos = palabras.filter((p) => limpio.includes(p)).length;
    if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { clave, puntos };
  }
  return mejor?.clave ?? null;
}

/* -------------------------------------------------------------------------- */
/* Buscador de ingenieros (/explorar)                                         */
/* -------------------------------------------------------------------------- */

export interface PreciosIngeniero {
  id: string;
  creado_en: string;
  /** Diseños publicados (sin los premium). */
  disenos: number;
  /** El precio «desde» más bajo de sus diseños. */
  desde: number | null;
  /** El más bajo de cada servicio: { web: 1500, crm: 2500 }. */
  desde_por_servicio: Record<string, number>;
  /** Proyectos que ya entregó (etapa «Publicada»). */
  entregados: number;
}

/** Por ingeniero: sus diseños, sus precios y lo que ya entregó (supabase_explorar.sql). */
export async function preciosIngenieros(): Promise<Map<string, PreciosIngeniero>> {
  const { data, error } = await supabase.rpc('precios_ingenieros');
  if (error) console.warn('[AIB+] No se pudieron leer los precios de los ingenieros:', error.message);
  return new Map(((data as PreciosIngeniero[] | null) ?? []).map((p) => [p.id, p] as const));
}
