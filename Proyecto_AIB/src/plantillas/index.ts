// ---------------------------------------------------------------------------
// Biblioteca de plantillas base
// ---------------------------------------------------------------------------
// Las plantillas que vienen con AIB+. El ingeniero las añade a su catálogo con
// un clic; en el catálogo se guarda solo qué plantillas tiene activas, sus
// etiquetas y sus contadores, no el HTML, que vive aquí versionado con el
// código.
// ---------------------------------------------------------------------------

import type { PlantillaBase } from '../lib/plantillas';
import { consultora } from './consultora';
import { modaBoutique } from './moda-boutique';
import { restaurante } from './restaurante';
import { saludBelleza } from './salud-belleza';
import { institucional } from './institucional';
import { BASE_COLORES_PROPIA } from '../lib/plantillaPropia';

export const PLANTILLAS_BASE: PlantillaBase[] = [
  modaBoutique as PlantillaBase,
  consultora as PlantillaBase,
  restaurante as PlantillaBase,
  saludBelleza as PlantillaBase,
  institucional as PlantillaBase,
];

/**
 * La plantilla base por su id. Las propias de cada ingeniero no viven aquí
 * (están en la base de datos): para ellas solo se devuelven sus variables de
 * color, que es lo que hace falta para cambiar la paleta de una maqueta.
 */
export function obtenerPlantillaBase(id: string): PlantillaBase | null {
  if (id === 'propia') return BASE_COLORES_PROPIA;
  return PLANTILLAS_BASE.find((p) => p.id === id) ?? null;
}
