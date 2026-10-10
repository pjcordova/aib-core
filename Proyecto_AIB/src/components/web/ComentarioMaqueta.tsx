import { useState } from 'react';
import { enviarComentario, MAX_COMENTARIO, REACCIONES, type Reaccion } from '../../lib/comentarios';

/**
 * "¿Qué te parece tu web?" debajo de la maqueta. Una reacción con un clic y,
 * si quiere, qué le faltó. Le llega al ingeniero en su panel.
 */
/** `deServicio`: la vista previa de un CRM, un ERP…, no una web. */
export function ComentarioMaqueta({ proyectoId, deServicio = false }: { proyectoId: string; deServicio?: boolean }) {
  const [reaccion, setReaccion] = useState<Reaccion | null>(null);
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<'inactivo' | 'enviando' | 'enviado' | 'fallo'>('inactivo');

  const enviar = async () => {
    setEstado('enviando');
    const ok = await enviarComentario({ proyectoId, reaccion, texto });
    setEstado(ok ? 'enviado' : 'fallo');
  };

  if (estado === 'enviado') {
    return (
      <div className="mt-5 rounded-xl border border-positive/30 bg-positive/10 p-4 text-sm text-ink">
        ¡Gracias por tu comentario! Ya le llegó al ingeniero.{' '}
        <button
          type="button"
          onClick={() => {
            setReaccion(null);
            setTexto('');
            setEstado('inactivo');
          }}
          className="text-accent hover:underline"
        >
          Enviar otro
        </button>
      </div>
    );
  }

  const puedeEnviar = (!!reaccion || texto.trim().length > 0) && estado !== 'enviando';

  return (
    <section className="card mt-5 p-5" aria-labelledby="titulo-comentario">
      <h3 id="titulo-comentario" className="font-semibold text-ink">
        {deServicio ? '¿Qué te parece?' : '¿Qué te parece tu web?'}
      </h3>
      <p className="mt-1 text-sm text-ink-muted">Tu opinión nos ayuda a mejorarla. Solo la ve el ingeniero.</p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Tu reacción">
        {REACCIONES.map((r) => {
          const elegida = reaccion === r.valor;
          return (
            <button
              key={r.valor}
              type="button"
              onClick={() => setReaccion(elegida ? null : r.valor)}
              aria-pressed={elegida}
              className={
                'flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all ' +
                (elegida
                  ? 'border-accent bg-accent/15 text-ink'
                  : 'border-line bg-surface-overlay/50 text-ink-muted hover:border-accent/50 hover:text-ink')
              }
            >
              <span aria-hidden="true">{r.emoji}</span>
              {r.etiqueta}
            </button>
          );
        })}
      </div>

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value.slice(0, MAX_COMENTARIO))}
        rows={3}
        placeholder="¿Qué te faltó o qué cambiarías? (opcional)"
        aria-label="Tu comentario"
        className="field mt-3 w-full resize-y"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void enviar()} disabled={!puedeEnviar} className="btn btn-primary">
          {estado === 'enviando' ? 'Enviando…' : 'Enviar comentario'}
        </button>
        {estado === 'fallo' && (
          <p role="alert" className="text-sm text-negative">
            No pudimos enviarlo. Vuelve a intentarlo.
          </p>
        )}
      </div>
    </section>
  );
}
