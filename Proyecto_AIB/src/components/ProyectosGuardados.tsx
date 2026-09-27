import { useEffect, useState } from 'react';
import {
  listarProyectos,
  eliminarProyecto,
  type ProyectoResumen,
} from '../lib/proyectos';

interface Props {
  onAbrir: (id: string) => void;
  /** Cambia este valor para forzar una recarga de la lista. */
  recargar?: number;
}

/**
 * Lista de proyectos ya generados. Es la mitad visible de la persistencia:
 * sin ella, guardar en Supabase no se nota, y reabrir un prototipo guardado
 * evita volver a pagar su generación.
 */
export function ProyectosGuardados({ onAbrir, recargar = 0 }: Props) {
  const [proyectos, setProyectos] = useState<ProyectoResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [borrando, setBorrando] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    // No marcamos "cargando" aquí: un setState síncrono dentro del efecto
    // encadena renders, y en una recarga es además preferible mantener la lista
    // anterior en pantalla hasta que llegue la nueva, sin parpadeo.
    listarProyectos().then((lista) => {
      if (!activo) return;
      setProyectos(lista);
      setCargando(false);
    });
    return () => {
      activo = false;
    };
  }, [recargar]);

  const borrar = async (id: string) => {
    setBorrando(id);
    const ok = await eliminarProyecto(id);
    if (ok) setProyectos((previos) => previos.filter((p) => p.id !== id));
    setBorrando(null);
  };

  // Sin proyectos no pintamos nada: un bloque vacío en la portada sobra.
  if (cargando || proyectos.length === 0) return null;

  return (
    <section className="animate-fade-up mx-auto mt-14 max-w-2xl text-left">
      <h2 className="mb-3 text-xs tracking-wide text-ink-subtle uppercase">
        Tus proyectos
      </h2>

      <ul className="space-y-2">
        {proyectos.map((p) => (
          <li
            key={p.id}
            className="group flex items-center gap-3 rounded-xl border border-line bg-surface-raised/50 px-4 py-3 transition-colors hover:border-accent/50"
          >
            <button
              type="button"
              onClick={() => onAbrir(p.id)}
              className="min-w-0 flex-1 text-left"
            >
              <p className="truncate font-medium text-ink" title={p.servicio}>
                {p.servicio}
              </p>
              <p className="mt-0.5 text-xs text-ink-subtle">
                {p.respuestas} {p.respuestas === 1 ? 'respuesta' : 'respuestas'} ·{' '}
                {new Date(p.creadoEn).toLocaleDateString('es', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            </button>

            <button
              type="button"
              onClick={() => void borrar(p.id)}
              disabled={borrando === p.id}
              aria-label={`Eliminar ${p.servicio}`}
              className="shrink-0 rounded-lg px-2 py-1 text-xs text-ink-subtle opacity-0 transition-all group-hover:opacity-100 hover:bg-negative/10 hover:text-negative focus-visible:opacity-100 disabled:opacity-50"
            >
              {borrando === p.id ? '…' : 'Eliminar'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
