import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { empezarSinCuenta, type ResultadoPrueba } from '../lib/invitaciones';
import { Logo } from './ui/Primitives';

// Una sola entrada aunque el efecto se ejecute dos veces (modo estricto de
// React): dos sesiones anónimas a la vez se pisarían.
let entrada: Promise<ResultadoPrueba> | null = null;

function empezarUnaVez(): Promise<ResultadoPrueba> {
  if (!entrada) {
    entrada = empezarSinCuenta();
    // Pase lo que pase, el siguiente clic vuelve a intentarlo.
    void entrada.finally(() => {
      entrada = null;
    });
  }
  return entrada;
}

/**
 * «Pruébalo gratis» en la portada (/probar). Abre una sesión sin cuenta, como
 * la de una invitación, y lleva directo al cuestionario. Si por hoy ya no
 * quedan pruebas, ofrece crear una cuenta gratis.
 */
export function EmpezarPrueba() {
  const navigate = useNavigate();
  const [resultado, setResultado] = useState<ResultadoPrueba | null>(null);

  useEffect(() => {
    let vigente = true;
    void empezarUnaVez().then((r) => {
      if (!vigente) return;
      if (r === 'ok') navigate('/mi-web', { replace: true, state: { directo: true } });
      // Con una cuenta abierta no hace falta probar sin cuenta: a su app.
      else if (r === 'con_cuenta') navigate('/', { replace: true });
      else setResultado(r);
    });
    return () => {
      vigente = false;
    };
  }, [navigate]);

  if (!resultado) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
          <p className="text-sm text-ink-subtle">Preparando tu prueba…</p>
        </div>
      </div>
    );
  }

  const lleno = resultado === 'lleno';
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-md text-center">
        <Logo size={40} />
        <h1 className="mt-6 text-3xl text-ink">
          {lleno ? 'Por hoy se acabaron las pruebas sin cuenta' : 'No pudimos empezar tu prueba'}
        </h1>
        <p className="mt-3 text-sm text-ink-muted">
          {lleno
            ? 'Crea tu cuenta gratis con tu correo y mira tu web igual, en un minuto.'
            : 'Revisa tu conexión y vuelve a intentarlo en un momento.'}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {lleno ? (
            <Link to="/" state={{ acceso: 'registro' }} className="btn btn-primary">
              Crear cuenta gratis
            </Link>
          ) : (
            <button type="button" onClick={() => window.location.reload()} className="btn btn-primary">
              Intentar de nuevo
            </button>
          )}
          <Link to="/" className="btn btn-ghost">
            Volver
          </Link>
        </div>
      </div>
    </div>
  );
}
