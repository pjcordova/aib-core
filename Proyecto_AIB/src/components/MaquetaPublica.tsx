import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { leerMaquetaCompartida, type MaquetaCompartida } from '../lib/compartir';
import { Logo } from './ui/Primitives';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'lista'; maqueta: MaquetaCompartida }
  | { tipo: 'no-existe' }
  | { tipo: 'error' };

/**
 * Maqueta compartida por un cliente (/ver/<código>). Pública: no pide sesión.
 *
 * El iframe va con `sandbox` vacío: dentro no se ejecuta ningún script ni se
 * envía ningún formulario, y la página ya llega sin enlaces hacia fuera
 * (lib/compartir.ts). Es una maqueta de otra persona, no algo nuestro.
 */
export function MaquetaPublica() {
  const { token = '' } = useParams();
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [vista, setVista] = useState<'escritorio' | 'movil'>('escritorio');

  useEffect(() => {
    let vigente = true;
    leerMaquetaCompartida(token)
      .then((maqueta) => {
        if (vigente) setEstado(maqueta ? { tipo: 'lista', maqueta } : { tipo: 'no-existe' });
      })
      .catch(() => {
        if (vigente) setEstado({ tipo: 'error' });
      });
    return () => {
      vigente = false;
    };
  }, [token]);

  // Son maquetas privadas que alguien comparte a mano: no deben salir en buscadores.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const empresa = estado.tipo === 'lista' ? estado.maqueta.empresa : null;
  useEffect(() => {
    if (!empresa) return;
    const anterior = document.title;
    document.title = `${empresa} · Vista previa`;
    return () => {
      document.title = anterior;
    };
  }, [empresa]);

  if (estado.tipo === 'cargando') {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" role="status" aria-label="Cargando" />
      </div>
    );
  }

  if (estado.tipo !== 'lista') {
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <div className="max-w-md text-center">
          <Logo size={40} />
          <h1 className="mt-6 text-2xl font-semibold text-ink">
            {estado.tipo === 'no-existe' ? 'Este enlace ya no está disponible' : 'No pudimos cargar la maqueta'}
          </h1>
          <p className="mt-3 text-sm text-ink-muted">
            {estado.tipo === 'no-existe'
              ? 'Puede que quien te lo envió lo haya desactivado. Pídele que te mande uno nuevo.'
              : 'Revisa tu conexión y vuelve a abrir el enlace en un momento.'}
          </p>
          <Link to="/" className="btn btn-primary mt-8 inline-flex">
            Conoce AIB+
          </Link>
        </div>
      </div>
    );
  }

  const { maqueta } = estado;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface-overlay/80 px-4 py-2.5 sm:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-ink" title={maqueta.empresa}>
            Vista previa de la web de {maqueta.empresa}
          </h1>
          <p className="text-xs text-ink-subtle">Es una maqueta: todavía no es la web publicada.</p>
        </div>

        <div className="flex items-center gap-4">
          <div
            className="hidden rounded-lg border border-line bg-surface-deep/60 p-0.5 sm:flex"
            role="tablist"
            aria-label="Cambiar vista"
          >
            {(
              [
                ['escritorio', 'Escritorio'],
                ['movil', 'Móvil'],
              ] as const
            ).map(([v, texto]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={vista === v}
                onClick={() => setVista(v)}
                className={
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors ' +
                  (vista === v ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink')
                }
              >
                {texto}
              </button>
            ))}
          </div>

          <Link to="/" className="flex items-center gap-2 text-xs text-ink-muted transition-colors hover:text-ink">
            <Logo size={20} />
            <span>
              Hecha con AIB<span className="text-accent-alt">+</span>
              <span className="hidden sm:inline"> · Crea la tuya →</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 justify-center bg-surface-deep/60">
        <iframe
          title={`Maqueta web de ${maqueta.empresa}`}
          srcDoc={maqueta.documento}
          sandbox=""
          referrerPolicy="no-referrer"
          className={
            'h-full border-0 bg-white transition-[width] duration-300 ' +
            (vista === 'movil' ? 'w-[390px] max-w-full border-x border-line' : 'w-full')
          }
        />
      </main>
    </div>
  );
}
