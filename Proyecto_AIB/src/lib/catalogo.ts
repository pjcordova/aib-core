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

export interface FilaPlantilla {
  id: string;
  ingeniero_id: string;
  base: string;
  nombre: string;
  categoria: CategoriaNegocio;
  estilo: string;
  etiquetas: string[];
  activa: boolean;
  veces_mostrada: number;
  veces_elegida: number;
  veces_aceptada: number;
  created_at: string;
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
    const base = obtenerPlantillaBase(fila.base);
    return base ? [{ fila, base }] : [];
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
  cambios: Partial<Pick<FilaPlantilla, 'activa' | 'etiquetas' | 'nombre' | 'estilo'>>
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('plantillas').update(cambios).eq('id', id);
  if (error) {
    console.error('[AIB+] No se pudo actualizar la plantilla:', error.message);
    return { error: error.message };
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
  const { data, error } = await supabase.from('plantillas').select('*').eq('activa', true);
  if (error) {
    if (!faltaTabla(error.code)) console.error('[AIB+] No se pudieron leer las plantillas:', error.message);
    return [];
  }
  return conBase((data ?? []) as FilaPlantilla[]);
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
  maximo = 3
): PlantillaDelCatalogo[] {
  const texto = normalizar(`${cliente.empresa} ${cliente.rubro}`);

  return candidatas
    .filter((c) => c.fila.categoria === cliente.categoria)
    .map((c) => {
      let puntos = 10;
      if (c.fila.estilo === cliente.estilo) puntos += 5;
      for (const etiqueta of c.fila.etiquetas) {
        if (texto.includes(normalizar(etiqueta).replace(/-/g, ' '))) puntos += 2;
      }
      for (const seccion of cliente.secciones) {
        if (c.base.secciones.includes(seccion)) puntos += 1;
      }
      // Desempate por lo que ya demostró funcionar con otros clientes.
      const tasa = c.fila.veces_mostrada > 0 ? c.fila.veces_aceptada / c.fila.veces_mostrada : 0;
      return { c, puntos: puntos + tasa };
    })
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, maximo)
    .map(({ c }) => c);
}
