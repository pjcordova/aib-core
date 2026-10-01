import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { entrarConInvitacion, type ResultadoEntrada } from '../lib/invitaciones';
import { Logo } from './ui/Primitives';

// Una sola entrada por código aunque el efecto se ejecute dos veces (modo
// estricto de React): dos sesiones anónimas a la vez se pisarían.
const entradas = new Map<string, Promise<ResultadoEntrada>>();

function entrarUnaVez(token: string): Promise<ResultadoEntrada> {
  let entrada = entradas.get(token);
  if (!entrada) {
    entrada = entrarConInvitacion(token);
    entradas.set(token, entrada);
    // Si falla, se puede reintentar recargando la página.
    void entrada.then((r) => {
      if (r.estado !== 'ok') entradas.delete(token);
    });
  }
  return entrada;
}

/**
 * Enlace de invitación (/i/<código>). Abre la sesión del cliente sin pedirle
 * cuenta y lo lleva a la app, donde ya le espera su bienvenida.
 */
export function EntradaInvitacion() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [resultado, setResultado] = useState<ResultadoEntrada | null>(null);

  useEffect(() => {
    let vigente = true;
    void entrarUnaVez(token).then((r) => {
      if (!vigente) return;
      if (r.estado === 'ok') navigate('/', { replace: true });
      else setResultado(r);
    });
    return () => {
      vigente = false;
    };
  }, [token, navigate]);

  if (!resultado) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
          <p className="text-sm text-ink-subtle">Preparando tu espacio…</p>
        </div>
      </div>
    );
  }

  const textos = {
    no_existe: {
      titulo: 'Este enlace ya no está disponible',
      detalle: 'Puede que haya caducado o que lo hayan desactivado. Pide a quien te lo envió uno nuevo.',
    },
    con_cuenta: {
      titulo: 'Este enlace es para tu cliente',
      detalle:
        'Tienes tu sesión de AIB+ abierta en este navegador. Para ver lo que verá tu cliente, abre el enlace en una ventana de incógnito.',
    },
    error: {
      titulo: 'No pudimos abrir tu invitación',
      detalle: 'Revisa tu conexión y vuelve a abrir el enlace en un momento.',
    },
  }[resultado.estado === 'ok' ? 'error' : resultado.estado];

  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-md text-center">
        <Logo size={40} />
        <h1 className="mt-6 text-2xl font-semibold text-ink">{textos.titulo}</h1>
        <p className="mt-3 text-sm text-ink-muted">{textos.detalle}</p>
        {resultado.estado === 'con_cuenta' ? (
          <Link to="/dashboard" className="btn btn-primary mt-8 inline-flex">
            Ir a mi panel
          </Link>
        ) : (
          <Link to="/" className="btn btn-ghost mt-8 inline-flex">
            Conoce AIB+
          </Link>
        )}
      </div>
    </div>
  );
}
