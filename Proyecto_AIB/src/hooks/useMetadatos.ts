import { useEffect } from 'react';

/**
 * Cambia el título y la descripción de la pestaña mientras se ve la página (y
 * los devuelve al salir). Para las páginas que se escriben en HTML para Google:
 * así coinciden con lo que ya leyó al cargarlas.
 */
export function useMetadatos(p: { titulo: string; descripcion: string } | null) {
  useEffect(() => {
    if (!p) return;
    const descripcion = document.querySelector('meta[name="description"]');
    const antes = { titulo: document.title, descripcion: descripcion?.getAttribute('content') ?? '' };
    document.title = p.titulo;
    descripcion?.setAttribute('content', p.descripcion);
    window.scrollTo(0, 0);
    return () => {
      document.title = antes.titulo;
      descripcion?.setAttribute('content', antes.descripcion);
    };
  }, [p]);
}
