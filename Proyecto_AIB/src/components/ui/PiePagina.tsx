import { Link } from 'react-router-dom';
import { Wordmark } from './Primitives';

// ---------------------------------------------------------------------------
// Pie de página de las páginas públicas
// ---------------------------------------------------------------------------
// En el mismo azul que la cabecera, con la línea champán arriba. Dice quién
// está detrás de AIB+: Cordova Solutions.
// ---------------------------------------------------------------------------

export function PiePagina({
  enPortada = false,
  onIngresar,
  espacioBotonFijo = false,
}: {
  /** En la portada, los enlaces van a sus secciones; fuera de ella, a la portada. */
  enPortada?: boolean;
  /** Si no se pasa, «Ingresar» lleva a /ingresar. */
  onIngresar?: () => void;
  /** En el celular, la portada tiene un botón fijo abajo: se deja sitio. */
  espacioBotonFijo?: boolean;
}) {
  const anio = new Date().getFullYear();
  const enlace = 'text-sm text-ink-muted transition-colors hover:text-ink';
  const titulo = 'mb-3 text-xs font-semibold tracking-[0.18em] text-accent uppercase';

  return (
    <footer className="pie-marca">
      <div className="mx-auto max-w-6xl px-4 pt-12 pb-8 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Link to="/" aria-label="Ir a la portada de AIB+" className="inline-block">
              <Wordmark />
            </Link>
            <p className="mt-4 max-w-sm text-sm text-ink-muted">
              La web de tu negocio, lista para ver en un minuto y construida por un ingeniero de verdad.
            </p>
            <p className="mt-4 text-sm text-ink-muted">
              Una plataforma desarrollada por <strong className="font-semibold text-ink">Cordova Solutions</strong>.
            </p>
          </div>

          <nav aria-label="Para negocios">
            <p className={titulo}>Para negocios</p>
            <ul className="space-y-2">
              {enPortada ? (
                <>
                  <li>
                    <a href="#como-funciona" className={enlace}>
                      Cómo funciona
                    </a>
                  </li>
                  <li>
                    <a href="#ejemplos" className={enlace}>
                      Ejemplos de diseños
                    </a>
                  </li>
                  <li>
                    <a href="#preguntas" className={enlace}>
                      Preguntas frecuentes
                    </a>
                  </li>
                </>
              ) : (
                <li>
                  <Link to="/" className={enlace}>
                    Cómo funciona
                  </Link>
                </li>
              )}
              <li>
                <Link to="/probar" className={enlace}>
                  Pruébalo gratis
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Para ingenieros">
            <p className={titulo}>Para ingenieros</p>
            <ul className="space-y-2">
              <li>
                <Link to="/ingenieros" className={enlace}>
                  Únete a AIB+
                </Link>
              </li>
              <li>
                <Link to="/ingenieros#planes" className={enlace}>
                  Planes
                </Link>
              </li>
              <li>
                {onIngresar ? (
                  <button type="button" onClick={onIngresar} className={enlace}>
                    Ingresar
                  </button>
                ) : (
                  <Link to="/ingresar" className={enlace}>
                    Ingresar
                  </Link>
                )}
              </li>
            </ul>
          </nav>
        </div>

        <div
          className={
            'mt-10 flex flex-col items-center justify-between gap-2 border-t border-line pt-6 text-xs text-ink-subtle sm:flex-row ' +
            (espacioBotonFijo ? 'pb-20 sm:pb-0' : '')
          }
        >
          <span>
            © {anio} Cordova Solutions. Todos los derechos reservados.
          </span>
          <span>
            AIB+ es un producto de <span className="text-accent">Cordova Solutions</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
