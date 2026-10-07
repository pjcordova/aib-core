import { useState } from 'react';
import { cambiarSlug, urlPerfil } from '../../lib/perfilPublico';

/**
 * En «Mi perfil»: la dirección de su página pública, para copiarla o mandarla
 * por WhatsApp, y la opción de cambiarla (aib…/ing/su-marca).
 */
export function TuPaginaPublica({ slug: inicial }: { slug: string }) {
  const [slug, setSlug] = useState(inicial);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(inicial);
  const [copiado, setCopiado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const enlace = urlPerfil(slug);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.prompt('Copia el enlace:', enlace);
    }
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    const r = await cambiarSlug(texto);
    setGuardando(false);
    if (r.estado === 'ok' && r.slug) {
      setSlug(r.slug);
      setTexto(r.slug);
      setEditando(false);
      return;
    }
    setError(
      r.estado === 'ocupado'
        ? 'Esa dirección ya la tiene otro ingeniero. Prueba con otra.'
        : r.estado === 'invalido'
          ? 'Usa de 3 a 40 letras o números (sin tildes ni espacios).'
          : 'No se pudo guardar. Vuelve a intentarlo.'
    );
  };

  return (
    <div className="card mb-6 p-6">
      <h3 className="text-xl">Tu página pública</h3>
      <p className="mt-1 text-sm text-ink-muted">
        Compártela con tus clientes: ven tu perfil, tus diseños con precio y tus reseñas, y desde ahí arman su web contigo.
        Te llegan directo a ti.
      </p>

      {editando ? (
        <form onSubmit={(e) => void guardar(e)} className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-subtle">{window.location.host}/ing/</span>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value.toLowerCase().slice(0, 40))}
            className="field !w-56"
            aria-label="Dirección de tu página"
            autoFocus
          />
          <button type="submit" disabled={guardando} className="btn btn-primary">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditando(false);
              setTexto(slug);
              setError('');
            }}
            className="btn btn-ghost"
          >
            Cancelar
          </button>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-overlay px-3 py-2 text-sm">{enlace}</code>
          <button type="button" onClick={() => void copiar()} className="btn btn-ghost">
            {copiado ? '✓ Copiado' : 'Copiar'}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Mira mi página en AIB+ y arma tu web conmigo en un minuto: ${enlace}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            Enviar por WhatsApp
          </a>
          <a href={enlace} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
            Ver mi página ↗
          </a>
        </div>
      )}
      {!editando && (
        <button type="button" onClick={() => setEditando(true)} className="mt-2 text-xs text-ink-muted underline underline-offset-2 hover:text-ink">
          Cambiar la dirección (por ejemplo, el nombre de tu marca)
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
