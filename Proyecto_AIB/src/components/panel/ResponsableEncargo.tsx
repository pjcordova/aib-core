import { useState } from 'react';
import { asignarResponsable, type MiEquipo } from '../../lib/planes';

/**
 * Plan Negocio: el dueño del encargo elige quién de su equipo lo lleva. Los
 * demás ven el nombre en la lista de encargos.
 */
export function ResponsableEncargo({
  proyectoId,
  responsableId,
  equipo,
  onCambio,
}: {
  proyectoId: string;
  responsableId: string | null;
  equipo: MiEquipo;
  onCambio: (id: string | null, nombre: string | null) => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState(false);

  const opciones = [
    { id: equipo.dueno_id, nombre: 'Yo' },
    ...equipo.miembros.map((m) => ({ id: m.id, nombre: m.nombre })),
  ];

  const cambiar = async (valor: string) => {
    const id = valor || null;
    setGuardando(true);
    setFallo(false);
    const ok = await asignarResponsable(proyectoId, id);
    setGuardando(false);
    if (!ok) {
      setFallo(true);
      return;
    }
    const nombre = id === equipo.dueno_id ? (equipo.agencia ?? 'Yo') : (opciones.find((o) => o.id === id)?.nombre ?? null);
    onCambio(id, nombre);
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
      <label htmlFor={`responsable-${proyectoId}`} className="text-sm font-medium text-ink">
        ¿Quién de tu equipo lo lleva?
      </label>
      <select
        id={`responsable-${proyectoId}`}
        value={responsableId ?? ''}
        disabled={guardando}
        onChange={(e) => void cambiar(e.target.value)}
        className="field !w-auto min-w-44"
      >
        <option value="">Sin asignar</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
      </select>
      {guardando && <span className="text-xs text-ink-subtle">Guardando…</span>}
      {fallo && (
        <span role="alert" className="text-xs text-negative">
          No se pudo guardar.
        </span>
      )}
      {!equipo.activo && (
        <span className="text-xs text-caution">Tu plan Negocio venció: tu equipo no ve este encargo.</span>
      )}
    </div>
  );
}
