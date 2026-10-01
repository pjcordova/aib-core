import { useEffect, useState } from 'react';
import { listarComentarios, REACCIONES, type Comentario } from '../../lib/comentarios';

/** Lo que dicen los clientes de su maqueta, del más reciente al más antiguo. */
export function ComentariosPanel() {
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sinConfigurar, setSinConfigurar] = useState(false);

  useEffect(() => {
    let vigente = true;
    void listarComentarios().then((r) => {
      if (!vigente) return;
      setComentarios(r.comentarios);
      setSinConfigurar(r.sinConfigurar);
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
  }, []);

  if (cargando) return <p className="p-6 text-sm text-ink-subtle">Cargando comentarios…</p>;

  if (sinConfigurar) {
    return (
      <div className="card mx-auto my-8 max-w-2xl p-8 text-center">
        <h2 className="text-lg font-semibold">Falta preparar la base de datos</h2>
        <p className="mt-2 text-sm text-ink-muted">Ejecuta supabase_comentarios.sql en el editor SQL de Supabase.</p>
      </div>
    );
  }

  const conteo = REACCIONES.map((r) => ({ ...r, total: comentarios.filter((c) => c.reaccion === r.valor).length }));

  return (
    <section className="mx-auto max-w-4xl px-5 py-8">
      <header className="mb-6">
        <h2 className="text-2xl font-semibold">Comentarios</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Lo que dicen tus clientes de su maqueta, debajo de «¿Qué te parece tu web?».
        </p>
      </header>

      {comentarios.length === 0 ? (
        <p className="text-sm text-ink-muted">Todavía no hay comentarios.</p>
      ) : (
        <>
          <ul className="mb-6 flex flex-wrap gap-2" aria-label="Resumen de reacciones">
            {conteo.map((r) => (
              <li key={r.valor} className="rounded-full border border-line px-3 py-1 text-sm text-ink-muted">
                <span aria-hidden="true">{r.emoji}</span> {r.etiqueta}: <strong className="text-ink">{r.total}</strong>
              </li>
            ))}
          </ul>

          <ul className="space-y-3">
            {comentarios.map((c) => {
              const reaccion = REACCIONES.find((r) => r.valor === c.reaccion);
              return (
                <li key={c.id} className="card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink">
                      {c.proyecto?.empresa ?? 'Proyecto eliminado'}
                      {c.proyecto?.aceptado === 'true' && (
                        <span className="ml-2 rounded-full border border-positive/40 px-2 py-0.5 text-[11px] font-medium text-positive">
                          Aceptó
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-ink-subtle">
                      {new Date(c.created_at).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {reaccion && (
                    <p className="mt-2 text-sm text-ink">
                      <span aria-hidden="true">{reaccion.emoji}</span> {reaccion.etiqueta}
                    </p>
                  )}
                  {c.texto && <p className="mt-2 text-sm whitespace-pre-line text-ink-muted">«{c.texto}»</p>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
