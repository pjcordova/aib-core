// ---------------------------------------------------------------------------
// Páginas por rubro para Google (/rubros/:slug)
// ---------------------------------------------------------------------------
// Así busca el dueño de un negocio: «página web para restaurante», «web para
// mi consultorio»… Cada página muestra lo que necesita la web de ese negocio,
// los diseños de su rubro y los ingenieros que trabajan con él. Como las de
// servicio, los textos viven en src/data/paginasRubro.json porque también los
// usa scripts/prerender.mjs para escribir el HTML que lee Google.
// ---------------------------------------------------------------------------

import datos from '../data/paginasRubro.json';
import type { CategoriaNegocio } from './plantillas';

export interface PaginaRubro {
  slug: string;
  /** El rubro de los diseños y de las especialidades de los ingenieros. */
  categoria: Exclude<CategoriaNegocio, 'otro'>;
  nombre: string;
  icono: string;
  /** <title> y descripción para Google. */
  titulo: string;
  descripcion: string;
  h1: string;
  intro: string;
  /** Lo que suele necesitar la web de este negocio. */
  necesita: string[];
  /** Otros servicios de AIB+ que le sirven (slug de su página de servicio). */
  tambien: { servicio: string; texto: string }[];
  preguntas: { pregunta: string; respuesta: string }[];
}

export const PAGINAS_RUBRO = datos as PaginaRubro[];

export const paginaRubro = (slug: string | undefined) => PAGINAS_RUBRO.find((p) => p.slug === slug) ?? null;
