import { useEffect, useState } from 'react';
import { dejarResena, miIngeniero, type MiIngeniero } from '../../lib/ingenieros';
import { FotoIngeniero } from './TarjetaIngeniero';

/**
 * En el seguimiento del cliente: quién le construye la web y, cuando ya está
 * publicada, su reseña (estrellas y comentario), que se verá en el perfil del
 * ingeniero. Solo se puede dejar una vez.
 */
export function TuIngeniero({ proyectoId, publicada }: { proyectoId: string; publicada: boolean }) {
  const [ingeniero, setIngeniero] = useState<MiIngeniero | null | undefined>(undefined);
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    void miIngeniero(proyectoId).then((i) => {
      if (vigente) setIngeniero(i);
    });
    return () => {
      vigente = false;
    };
  }, [proyectoId]);

  if (!ingeniero) return null;

  const enviar = async () => {
    if (estrellas < 1 || enviando) {
      setError('Elige de 1 a 5 estrellas.');
      return;
    }
    setEnviando(true);
    setError('');
    const resultado = await dejarResena(proyectoId, estrellas, comentario.trim());
    setEnviando(false);
    if (resultado === 'ok' || resultado === 'ya_existe') {
      setIngeniero({ ...ingeniero, resena: { estrellas, comentario: comentario.trim() } });
    } else if (resultado === 'no_publicada') {
      setError('Podrás calificar cuando tu web esté publicada.');
    } else {
      setError('No pudimos guardar tu reseña. Vuelve a intentarlo.');
    }
  };

  return (
    <div className="mb-5 border-b border-line pb-5">
      <div className="flex items-center gap-3">
        <FotoIngeniero nombre={ingeniero.nombre} foto={ingeniero.foto_url} tamano={44} />
        <div>
          <p className="text-[11px] tracking-wide text-ink-subtle uppercase">Tu ingeniero</p>
          <p className="font-medium text-ink">{ingeniero.nombre}</p>
          {ingeniero.titular && <p className="text-xs text-ink-muted">{ingeniero.titular}</p>}
        </div>
      </div>

      {publicada && ingeniero.resena && (
        <p className="mt-4 text-sm text-ink">
          <span className="text-accent-alt" aria-label={`${ingeniero.resena.estrellas} de 5 estrellas`}>
            {'★'.repeat(ingeniero.resena.estrellas)}
          </span>{' '}
          ¡Gracias por tu reseña! Ayuda a otros negocios a elegir.
        </p>
      )}

      {publicada && !ingeniero.resena && (
        <div className="mt-4 rounded-xl border border-accent-alt/50 bg-accent-alt/10 p-4">
          <p className="font-medium text-ink">¿Cómo te fue con {ingeniero.nombre.split(' ')[0]}?</p>
          <p className="mt-0.5 text-sm text-ink-muted">Tu web ya está publicada. Tu opinión ayuda a otros negocios a elegir.</p>
          <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Estrellas">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={estrellas === n}
                aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`}
                onClick={() => setEstrellas(n)}
                className={'text-3xl leading-none transition-colors ' + (n <= estrellas ? 'text-accent-alt' : 'text-line-strong hover:text-accent-alt/60')}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value.slice(0, 600))}
            rows={3}
            placeholder="Cuéntanos qué tal fue trabajar juntos (opcional)."
            className="field mt-3 w-full resize-y"
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-negative">
              {error}
            </p>
          )}
          <button type="button" onClick={() => void enviar()} disabled={enviando} className="btn btn-primary mt-3">
            {enviando ? 'Enviando…' : 'Enviar reseña'}
          </button>
        </div>
      )}
    </div>
  );
}
