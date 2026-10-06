import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// ---------------------------------------------------------------------------
// /ingresar: la puerta de entrada con cuenta, pase lo que pase
// ---------------------------------------------------------------------------
// Si el navegador se quedó con una prueba sin cuenta («Pruébalo gratis» o el
// enlace de una invitación), la app lo trata como cliente y no ofrece el
// login. Este enlace cierra esa sesión anónima y abre el ingreso. Con una
// cuenta de verdad ya abierta, lleva directo a su sitio (el ingeniero, a su
// panel).
// ---------------------------------------------------------------------------

export function Ingresar() {
  const { session, initializing, signOut } = useAuth();
  const navigate = useNavigate();
  const hecho = useRef(false);

  useEffect(() => {
    if (initializing || hecho.current) return;
    hecho.current = true;
    if (session && !session.user.is_anonymous) {
      navigate('/', { replace: true });
      return;
    }
    void (async () => {
      if (session) await signOut();
      navigate('/', { replace: true, state: { acceso: 'login' } });
    })();
  }, [initializing, session, signOut, navigate]);

  return (
    <div className="grid min-h-screen place-items-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
    </div>
  );
}
