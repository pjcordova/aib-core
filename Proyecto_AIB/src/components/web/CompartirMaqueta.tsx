import { useEffect, useState } from 'react';
import { compartirProyecto, dejarDeCompartir, enlaceDelProyecto, urlDeEnlace } from '../../lib/compartir';

type Estado = 'cargando' | 'sin-enlace' | 'creando' | 'con-enlace' | 'desactivando';

interface Props {
  proyectoId: string;
  empresa: string;
  /** La vista previa de un CRM, un ERP…, no una web. */
  deServicio?: boolean;
}

/**
 * Enlace para que el cliente enseñe su maqueta a otra persona. Se crea solo
 * cuando lo pide, porque a partir de ahí cualquiera con el enlace la ve.
 */
export function CompartirMaqueta({ proyectoId, empresa, deServicio = false }: Props) {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vigente = true;
    void enlaceDelProyecto(proyectoId).then((t) => {
      if (!vigente) return;
      setToken(t);
      setEstado(t ? 'con-enlace' : 'sin-enlace');
    });
    return () => {
      vigente = false;
    };
  }, [proyectoId]);

  const crear = async () => {
    setEstado('creando');
    setError(null);
    const { token: nuevo, error: fallo } = await compartirProyecto(proyectoId);
    setToken(nuevo);
    setError(fallo);
    setEstado(nuevo ? 'con-enlace' : 'sin-enlace');
  };

  const desactivar = async () => {
    if (!window.confirm('Quien tenga el enlace dejará de ver tu maqueta. ¿Desactivarlo?')) return;
    setEstado('desactivando');
    setError(null);
    const ok = await dejarDeCompartir(proyectoId);
    if (ok) {
      setToken(null);
      setEstado('sin-enlace');
    } else {
      setError('No pudimos desactivar el enlace. Vuelve a intentarlo.');
      setEstado('con-enlace');
    }
  };

  const url = token ? urlDeEnlace(token) : '';

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  const mensajeWhatsapp = `Mira cómo quedaría ${deServicio ? 'el proyecto' : 'la web'} de ${empresa}: ${url}`;

  return (
    <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
      <p className="text-sm text-ink">
        <strong>Comparte tu maqueta.</strong> Mándasela a tu socio o a tu familia para que te den su opinión.
        Quien abra el enlace verá solo la maqueta, no tus datos, y no necesita cuenta.
      </p>

      {estado === 'cargando' && (
        <p className="mt-3 text-sm text-ink-muted" role="status">
          Cargando…
        </p>
      )}

      {(estado === 'sin-enlace' || estado === 'creando') && (
        <button type="button" onClick={() => void crear()} disabled={estado === 'creando'} className="btn btn-primary mt-3">
          {estado === 'creando' ? 'Creando enlace…' : 'Crear enlace'}
        </button>
      )}

      {(estado === 'con-enlace' || estado === 'desactivando') && token && (
        <>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              readOnly
              value={url}
              aria-label="Enlace para compartir"
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface-deep/70 px-3 py-2 font-mono text-xs text-ink"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => void copiar()} className="btn btn-ghost">
                {copiado ? '✓ Copiado' : 'Copiar'}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(mensajeWhatsapp)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                Enviar por WhatsApp
              </a>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-subtle">
            Si editas la maqueta, el enlace muestra siempre la última versión guardada.{' '}
            <button
              type="button"
              onClick={() => void desactivar()}
              disabled={estado === 'desactivando'}
              className="text-negative hover:underline disabled:opacity-60"
            >
              {estado === 'desactivando' ? 'Desactivando…' : 'Desactivar enlace'}
            </button>
          </p>
        </>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
