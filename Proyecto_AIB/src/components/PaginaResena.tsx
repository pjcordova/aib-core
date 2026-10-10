import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { dejarResenaPorToken, resenaPorToken, type ResenaPorEnlace } from '../lib/recordatorios';
import { FotoIngeniero } from './ingenieros/TarjetaIngeniero';
import { PiePagina } from './ui/PiePagina';
import { Wordmark } from './ui/Primitives';

// ---------------------------------------------------------------------------
// La reseña del cliente (/resena/:token)
// ---------------------------------------------------------------------------
// Se abre desde el WhatsApp de su ingeniero, sin cuenta y desde cualquier
// celular: pone sus estrellas y un comentario. Una por proyecto.
// ---------------------------------------------------------------------------

export function PaginaResena() {
  const { token = '' } = useParams();
  const [datos, setDatos] = useState<ResenaPorEnlace | null | undefined>(undefined);
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    void resenaPorToken(token).then((d) => {
      if (vigente) setDatos(d);
    });
    return () => {
      vigente = false;
    };
  }, [token]);

  useEffect(() => {
    if (datos) document.title = `Califica a ${datos.ingeniero.nombre.split(/\s+/)[0]} · AIB+`;
  }, [datos]);

  const enviar = async () => {
    if (!datos) return;
    if (estrellas < 1) {
      setError('Elige de 1 a 5 estrellas.');
      return;
    }
    setEnviando(true);
    setError('');
    const r = await dejarResenaPorToken(token, estrellas, comentario.trim());
    setEnviando(false);
    if (r === 'ok' || r === 'ya_existe') {
      setDatos({ ...datos, resena: datos.resena ?? { estrellas, comentario: comentario.trim() } });
      return;
    }
    setError(
      r === 'propia'
        ? 'Esta reseña es para tu cliente: tú no puedes calificarte.'
        : r === 'no_publicada'
          ? 'Tu proyecto todavía no está terminado. Podrás calificarlo cuando tu ingeniero lo entregue.'
          : 'No pudimos guardar tu reseña. Vuelve a intentarlo.'
    );
  };

  if (datos === undefined) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    );
  }

  if (datos === null) {
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-3xl text-ink">No encontramos este enlace</h1>
          <p className="mt-3 text-sm text-ink-muted">Revisa el enlace o pídele a tu ingeniero que te lo envíe de nuevo.</p>
          <Link to="/" className="btn btn-primary mt-6 inline-flex">
            Ir a AIB+
          </Link>
        </div>
      </div>
    );
  }

  const ing = datos.ingeniero;
  const primerNombre = ing.nombre === 'AIB+' ? 'tu ingeniero' : ing.nombre.split(/\s+/)[0];

  return (
    <div className="min-h-screen">
      <header className="cabecera-marca sticky top-0 z-20">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="Ir a la portada de AIB+">
            <Wordmark />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="flex flex-col items-center text-center">
          {ing.nombre !== 'AIB+' && <FotoIngeniero nombre={ing.nombre} foto={ing.foto_url} tamano={72} />}
          <p className="mt-4 text-xs font-medium tracking-[0.2em] text-ink-subtle uppercase">
            {datos.negocio ? `Proyecto de ${datos.negocio}` : 'Tu proyecto'}
          </p>
          <h1 className="mt-2 text-3xl text-balance sm:text-4xl">
            {datos.cliente ? `${datos.cliente}, ¿c` : '¿C'}ómo te fue con {primerNombre}?
          </h1>
        </div>

        {datos.resena ? (
          <div className="card mt-8 p-6 text-center" role="status">
            <p className="text-3xl text-accent-alt" aria-label={`${datos.resena.estrellas} de 5 estrellas`}>
              {'★'.repeat(datos.resena.estrellas)}
              <span className="text-line-strong">{'★'.repeat(5 - datos.resena.estrellas)}</span>
            </p>
            <p className="mt-3 font-medium text-ink">¡Gracias por tu reseña!</p>
            <p className="mt-1 text-sm text-ink-muted">Ayuda a otros negocios a elegir a su ingeniero.</p>
            {ing.slug && (
              <Link to={`/ing/${ing.slug}`} className="btn btn-ghost mt-5 inline-flex">
                Ver la página de {primerNombre}
              </Link>
            )}
          </div>
        ) : !datos.publicada ? (
          <p className="card mt-8 p-6 text-center text-sm text-ink-muted" role="status">
            Tu proyecto todavía no está terminado. Podrás calificarlo cuando {primerNombre} te lo entregue.
          </p>
        ) : (
          <div className="card mt-8 p-6">
            <p className="text-center text-sm text-ink-muted">Toma un minuto. Tu opinión ayuda a otros negocios a elegir.</p>
            <div className="mt-4 flex justify-center gap-1" role="radiogroup" aria-label="Estrellas">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={estrellas === n}
                  aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`}
                  onClick={() => setEstrellas(n)}
                  className={
                    'text-5xl leading-none transition-colors ' +
                    (n <= estrellas ? 'text-accent-alt' : 'text-line-strong hover:text-accent-alt/60')
                  }
                >
                  ★
                </button>
              ))}
            </div>
            <label className="mt-6 block text-sm">
              <span className="mb-1.5 block font-medium text-ink">¿Qué tal fue trabajar juntos? (opcional)</span>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value.slice(0, 600))}
                rows={4}
                className="field w-full resize-y"
                placeholder="Ej: Cumplió los plazos y me explicó todo con paciencia."
              />
            </label>
            {error && (
              <p role="alert" className="mt-3 text-sm text-negative">
                {error}
              </p>
            )}
            <button type="button" onClick={() => void enviar()} disabled={enviando} className="btn btn-primary mt-5 w-full py-3 text-base">
              {enviando ? 'Enviando…' : 'Enviar mi reseña'}
            </button>
          </div>
        )}
      </main>

      <PiePagina />
    </div>
  );
}
