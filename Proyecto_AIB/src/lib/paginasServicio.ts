// ---------------------------------------------------------------------------
// Páginas por servicio para Google (/servicios/:slug)
// ---------------------------------------------------------------------------
// Una por lo que busca un dueño de negocio: «páginas web», «tienda online»,
// «CRM»… Los textos viven en src/data/paginasServicio.json porque los usan
// dos: esta app y scripts/prerender.mjs, que al compilar escribe cada página
// en HTML para que Google la lea sin ejecutar JavaScript. Si cambias un
// texto, cambia en los dos sitios a la vez.
// ---------------------------------------------------------------------------

import datos from '../data/paginasServicio.json';
import type { TipoServicio } from './servicios';

export interface PaginaServicio {
  slug: string;
  /** El servicio de AIB+ que se prueba y se filtra (la tienda online es «web»). */
  clave: Exclude<TipoServicio, 'otro'>;
  nombre: string;
  icono: string;
  /** <title> y descripción para Google. */
  titulo: string;
  descripcion: string;
  h1: string;
  intro: string;
  beneficios: string[];
  incluye: string[];
  preguntas: { pregunta: string; respuesta: string }[];
}

export const PAGINAS_SERVICIO = datos as PaginaServicio[];

export const paginaServicio = (slug: string | undefined) => PAGINAS_SERVICIO.find((p) => p.slug === slug) ?? null;

/** La página de un servicio de AIB+ (para enlazarla desde la portada). */
export const paginaDeClave = (clave: string) => PAGINAS_SERVICIO.find((p) => p.clave === clave) ?? null;
