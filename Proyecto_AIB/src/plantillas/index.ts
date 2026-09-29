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

export const PLANTILLAS_BASE: PlantillaBase[] = [
  modaBoutique as PlantillaBase,
  consultora as PlantillaBase,
  restaurante as PlantillaBase,
  saludBelleza as PlantillaBase,
];

export function obtenerPlantillaBase(id: string): PlantillaBase | null {
  return PLANTILLAS_BASE.find((p) => p.id === id) ?? null;
}
