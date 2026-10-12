// ---------------------------------------------------------------------------
// Los diseños base de AIB+, bajo demanda
// ---------------------------------------------------------------------------
// src/plantillas trae el HTML y el CSS de los diseños de la biblioteca: unos
// 300 KB. La portada, las páginas por servicio y por rubro y la página de cada
// ingeniero solo los usan para las miniaturas de esos diseños, así que los
// bajan aparte y en paralelo con sus datos, en vez de dentro del código que
// necesitan para mostrarse. El cuestionario y el panel los importan directo.
// ---------------------------------------------------------------------------

import type { PlantillaBase } from './plantillas';

type Biblioteca = typeof import('../plantillas');

let biblioteca: Biblioteca | null = null;
let cargando: Promise<void> | null = null;

/** Empieza a bajarlos (una sola vez). Si falla, se puede volver a intentar. */
export function cargarPlantillasBase(): Promise<void> {
  cargando ??= import('../plantillas').then(
    (m) => {
      biblioteca = m;
    },
    (error: unknown) => {
      cargando = null;
      console.warn('[AIB+] No se pudieron cargar los diseños base:', error);
    }
  );
  return cargando;
}

/** La plantilla base, si ya se bajaron; null mientras tanto. */
export function plantillaBaseCargada(id: string): PlantillaBase | null {
  return biblioteca?.obtenerPlantillaBase(id) ?? null;
}

/**
 * Antes de mostrar estos diseños: espera los diseños base si alguno es de la
 * biblioteca. `cargaPrevia` es la carga que se lanzó junto con la consulta.
 */
export async function conPlantillasBase<T extends { tipo: string }>(
  disenos: T[],
  cargaPrevia: Promise<void> = cargarPlantillasBase()
): Promise<T[]> {
  if (disenos.some((d) => d.tipo !== 'propia')) await cargaPrevia;
  return disenos;
}
