// ---------------------------------------------------------------------------
// Lista de encargos del ingeniero
// ---------------------------------------------------------------------------
// El panel no se trae todos los proyectos: pide los encargos de cinco en cinco
// a la vista `encargos` (supabase_seguimiento.sql), que ya filtra, busca y
// trae solo lo que se ve en la lista. El detalle de uno se carga al abrirlo y
// la maqueta completa solo al descargarla.
// ---------------------------------------------------------------------------

import { supabase } from './supabase';
import { esPayloadDiscovery, completoDe, type PayloadDiscovery, type PlantillaUsada, type ProyectoCompleto } from './proyectos';
import type { TipoServicio } from './servicios';
import type { EstadoEncargo } from './seguimiento';

export const ENCARGOS_POR_PAGINA = 5;

/** Una fila de la lista: lo justo para pintar la tarjeta cerrada. */
export interface EncargoFila {
  id: string;
  creadoEn: string;
  servicio: string;
  tipoServicio?: TipoServicio;
  empresa: string | null;
  objetivo: string | null;
  presupuesto: string | null;
  cliente: string | null;
  plantilla: PlantillaUsada | null;
  respuestas: number;
  tieneDocumentacion: boolean;
  semanas: number | null;
  tieneMaqueta: boolean;
  estado: EstadoEncargo;
  /** Hecho por un ingeniero con su cuenta o desde una invitación de prueba. */
  esPrueba: boolean;
}

export interface FiltrosEncargos {
  busqueda: string;
  /** '' = todas las etapas. */
  estado: EstadoEncargo | '';
  /** '' = todos; 'software' = filas anteriores a los módulos, sin tipo. */
  servicio: TipoServicio | 'software' | '';
  /** Sin las pruebas del ingeniero. */
  soloReales: boolean;
}

export const SIN_FILTROS: FiltrosEncargos = { busqueda: '', estado: '', servicio: '', soloReales: false };

const COLUMNAS =
  'id, created_at, servicio, tipo_servicio, empresa, objetivo, presupuesto, cliente, plantilla, ' +
  'respuestas, tiene_documentacion, semanas, tiene_maqueta, estado, es_prueba';

interface FilaVista {
  id: string;
  created_at: string;
  servicio: string | null;
  tipo_servicio: TipoServicio | null;
  empresa: string | null;
  objetivo: string | null;
  presupuesto: string | null;
  cliente: string | null;
  plantilla: PlantillaUsada | null;
  respuestas: number | null;
  tiene_documentacion: boolean | null;
  semanas: unknown;
  tiene_maqueta: boolean | null;
  estado: EstadoEncargo;
  es_prueba: boolean | null;
}

function filaDe(f: FilaVista): EncargoFila {
  return {
    id: f.id,
    creadoEn: f.created_at,
    servicio: f.servicio ?? 'Proyecto',
    tipoServicio: f.tipo_servicio ?? undefined,
    empresa: f.empresa,
    objetivo: f.objetivo,
    presupuesto: f.presupuesto,
    cliente: f.cliente,
    plantilla: f.plantilla,
    respuestas: f.respuestas ?? 0,
    tieneDocumentacion: f.tiene_documentacion === true,
    semanas: typeof f.semanas === 'number' ? f.semanas : null,
    tieneMaqueta: f.tiene_maqueta === true,
    estado: f.estado,
    esPrueba: f.es_prueba === true,
  };
}

/**
 * Lo que escribe el ingeniero, como lo guarda la vista en `busqueda`: en
 * minúsculas y sin tildes. Fuera los comodines, para que busque texto literal.
 */
function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[%_*\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/** Una página de encargos, del más reciente al más antiguo. `total` cuenta todos los que pasan el filtro. */
export async function listarEncargos(
  filtros: FiltrosEncargos,
  desde: number,
  cantidad = ENCARGOS_POR_PAGINA
): Promise<{ filas: EncargoFila[]; total: number } | null> {
  let consulta = supabase
    .from('encargos')
    .select(COLUMNAS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(desde, desde + cantidad - 1);

  if (filtros.estado) consulta = consulta.eq('estado', filtros.estado);
  if (filtros.servicio === 'software') consulta = consulta.is('tipo_servicio', null);
  else if (filtros.servicio) consulta = consulta.eq('tipo_servicio', filtros.servicio);
  if (filtros.soloReales) consulta = consulta.eq('es_prueba', false);
  const busqueda = normalizarBusqueda(filtros.busqueda);
  if (busqueda) consulta = consulta.ilike('busqueda', `%${busqueda}%`);

  const { data, error, count } = await consulta;
  if (error) {
    console.error('[AIB+] No se pudieron listar los encargos:', error.message);
    return null;
  }
  return { filas: ((data ?? []) as unknown as FilaVista[]).map(filaDe), total: count ?? 0 };
}

/**
 * Cuántos encargos hay en total y cuántos de clientes reales siguen en
 * "Recibido" (nuevos por revisar): las pruebas no cuentan como trabajo pendiente.
 */
export async function contarEncargos(): Promise<{ total: number; nuevos: number } | null> {
  const [todos, nuevos] = await Promise.all([
    supabase.from('encargos').select('id', { count: 'exact', head: true }),
    supabase.from('encargos').select('id', { count: 'exact', head: true }).eq('estado', 'recibido').eq('es_prueba', false),
  ]);
  if (todos.error || nuevos.error) {
    console.error('[AIB+] No se pudieron contar los encargos:', (todos.error ?? nuevos.error)?.message);
    return null;
  }
  return { total: todos.count ?? 0, nuevos: nuevos.count ?? 0 };
}

/**
 * Lo que hace falta al abrir un encargo: contacto, respuestas y
 * documentación. Sin la maqueta ni la ficha (logo incluido), que pesan mucho
 * y solo se usan al descargar.
 */
export async function cargarEncargo(id: string): Promise<ProyectoCompleto | null> {
  const { data, error } = await supabase
    .from('proyectos')
    .select(
      'id, created_at, tipo:payload->>tipo, servicio:payload->>servicio, historial:payload->historial, ' +
        'tipo_servicio:payload->>tipo_servicio, plantilla:payload->plantilla, aceptado:payload->aceptado, ' +
        'aceptado_en:payload->>aceptado_en, contacto:payload->contacto, documentacion:payload->documentacion'
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('[AIB+] No se pudo cargar el encargo:', error.message);
    return null;
  }

  const { id: idFila, created_at, ...resto } = data as unknown as Record<string, unknown> & {
    id: string;
    created_at: string;
  };
  // Las claves ausentes llegan como null; el payload real las omite.
  const payload = Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== null));
  if (!esPayloadDiscovery(payload)) return null;
  return completoDe(idFila, created_at, payload as unknown as PayloadDiscovery);
}
