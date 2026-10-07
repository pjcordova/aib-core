import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { propuestaDeEncargo, textoPlazo, type Propuesta } from '../../lib/propuestas';
import { solesEnteros } from '../../lib/servicios';

/**
 * En el seguimiento del cliente: si su ingeniero le mandó una propuesta, un
 * aviso con el resumen y el enlace para verla y responder.
 */
export function PropuestaCliente({ proyectoId }: { proyectoId: string }) {
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);

  useEffect(() => {
    let vigente = true;
    void propuestaDeEncargo(proyectoId).then((p) => {
      if (vigente) setPropuesta(p);
    });
    return () => {
      vigente = false;
    };
  }, [proyectoId]);

  if (!propuesta || propuesta.estado === 'retirada' || propuesta.estado === 'reemplazada') return null;

  const pendiente = propuesta.estado === 'enviada';
  return (
    <div
      className={
        'mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ' +
        (pendiente ? 'border-accent-alt/60 bg-accent-alt/10' : 'border-line')
      }
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">
          {pendiente
            ? '📄 Tienes una propuesta por responder'
            : propuesta.estado === 'aceptada'
              ? '✓ Aceptaste la propuesta'
              : propuesta.estado === 'cambios'
                ? 'Pediste cambios en la propuesta'
                : 'La propuesta venció'}
        </p>
        <p className="text-sm text-ink-muted tabular-nums">
          {solesEnteros(propuesta.precio)} · lista en {textoPlazo(propuesta.plazo_dias)}
        </p>
      </div>
      <Link to={`/propuesta/${propuesta.token}`} className={pendiente ? 'btn btn-primary' : 'btn btn-ghost'}>
        {pendiente ? 'Ver y responder' : 'Ver propuesta'}
      </Link>
    </div>
  );
}
