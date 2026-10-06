import { useEffect, useState } from 'react';
import { elegirIngeniero, ingenierosDisponibles, type IngenieroPublico } from '../../lib/ingenieros';
import { TarjetaIngeniero } from './TarjetaIngeniero';

/**
 * Antes de dejar su contacto, el cliente elige quién le construye la web,
 * como se elige un alojamiento o un conductor: perfil, rubros y estrellas. Si
 * no hay ingenieros con perfil, no se le pregunta (el encargo va al
 * administrador).
 */
export function ElegirIngeniero({
  proyectoId,
  rubro,
  onElegido,
  onCancelar,
}: {
  proyectoId: string;
  /** El rubro de su negocio, para destacar a quien lo trabaja. */
  rubro?: string;
  /** Con el nombre elegido, o null si no hubo que elegir. */
  onElegido: (nombre: string | null) => void;
  onCancelar: () => void;
}) {
  const [lista, setLista] = useState<IngenieroPublico[] | null>(null);
  const [eligiendo, setEligiendo] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    void ingenierosDisponibles().then((l) => {
      if (!vigente) return;
      if (l.length === 0) {
        onElegido(null);
        return;
      }
      // Primero quienes trabajan su rubro; dentro de eso, el orden por estrellas.
      setLista(rubro ? [...l].sort((a, b) => Number(b.especialidades.includes(rubro)) - Number(a.especialidades.includes(rubro))) : l);
    });
    return () => {
      vigente = false;
    };
    // Se carga una vez al abrir; onElegido cambia de identidad en cada render del padre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rubro]);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !eligiendo) onCancelar();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [eligiendo, onCancelar]);

  const elegir = async (ing: IngenieroPublico) => {
    setEligiendo(ing.id);
    setError('');
    const resultado = await elegirIngeniero(proyectoId, ing.id);
    setEligiendo(null);
    if (resultado === 'ok') onElegido(ing.nombre);
    // Llegó con la invitación de un ingeniero: ya tiene el suyo.
    else if (resultado === 'propio') onElegido(null);
    else if (resultado === 'no_disponible') setError(`${ing.nombre} ya no está disponible. Elige a otra persona.`);
    else setError('No pudimos guardar tu elección. Revisa tu conexión y vuelve a intentarlo.');
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-elegir-ingeniero"
    >
      <div className="card animate-fade-up max-h-[92vh] w-full max-w-4xl overflow-y-auto p-6 sm:p-8">
        <p className="text-xs font-medium tracking-widest text-accent uppercase">Paso 1 de 2</p>
        <h2 id="titulo-elegir-ingeniero" className="mt-1.5 text-2xl text-balance">
          Elige al ingeniero que construirá tu web
        </h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          Mira su perfil, los rubros con los que trabaja y lo que dicen sus clientes. Recibirá tu proyecto con todo lo que
          respondiste y te escribirá con una propuesta.
        </p>

        {lista === null ? (
          <p className="mt-8 text-sm text-ink-subtle">Buscando ingenieros disponibles…</p>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {lista.map((ing) => (
              <TarjetaIngeniero
                key={ing.id}
                ingeniero={ing}
                rubroDelCliente={rubro}
                accion={
                  <button
                    type="button"
                    onClick={() => void elegir(ing)}
                    disabled={eligiendo !== null}
                    className="btn btn-primary !px-4 !py-1.5 text-sm"
                  >
                    {eligiendo === ing.id ? 'Guardando…' : `Elegir a ${ing.nombre.split(' ')[0]}`}
                  </button>
                }
              />
            ))}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-negative">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onCancelar} disabled={eligiendo !== null} className="btn btn-ghost">
            Volver a mi web
          </button>
        </div>
      </div>
    </div>
  );
}
