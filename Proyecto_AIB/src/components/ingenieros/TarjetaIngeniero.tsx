import { useState, type ReactNode } from 'react';
import { textoEstrellas, textoServicios, type IngenieroPublico } from '../../lib/ingenieros';
import { CATEGORIAS_NEGOCIO } from '../../lib/plantillas';

const etiquetaRubro = (valor: string) => CATEGORIAS_NEGOCIO.find((c) => c.valor === valor)?.etiqueta ?? valor;

/** Iniciales para cuando el ingeniero aún no subió foto. */
const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

export function FotoIngeniero({ nombre, foto, tamano = 56 }: { nombre: string; foto: string | null; tamano?: number }) {
  return foto ? (
    <img
      src={foto}
      alt=""
      className="shrink-0 rounded-full object-cover ring-2 ring-surface-raised"
      style={{ width: tamano, height: tamano }}
    />
  ) : (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-accent font-display text-white"
      style={{ width: tamano, height: tamano, fontSize: tamano * 0.38 }}
      aria-hidden="true"
    >
      {iniciales(nombre)}
    </span>
  );
}

/**
 * Perfil público de un ingeniero: lo que ve el dueño de un negocio para
 * decidir. «Ver perfil» despliega la presentación, el portafolio y las
 * últimas reseñas.
 */
export function TarjetaIngeniero({
  ingeniero,
  rubroDelCliente,
  accion,
  elegido = false,
  extra,
}: {
  ingeniero: IngenieroPublico;
  /** Si trabaja el rubro del cliente, se destaca. */
  rubroDelCliente?: string;
  accion?: ReactNode;
  elegido?: boolean;
  /** Algo más bajo sus servicios (en el buscador: sus precios y diseños). */
  extra?: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const conoceSuRubro = !!rubroDelCliente && ingeniero.especialidades.includes(rubroDelCliente);

  return (
    <article
      className={
        'card flex flex-col p-5 transition-colors ' + (elegido ? 'border-accent ring-2 ring-accent/30' : '')
      }
    >
      <div className="flex items-start gap-4">
        <FotoIngeniero nombre={ingeniero.nombre} foto={ingeniero.foto_url} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg">{ingeniero.nombre}</h3>
          <p className="text-sm text-ink-muted">{ingeniero.titular}</p>
          <p className="mt-1 text-sm">
            <span className={ingeniero.resenas ? 'font-semibold text-ink' : 'text-ink-subtle'}>
              {textoEstrellas(ingeniero.promedio, ingeniero.resenas)}
            </span>
            {ingeniero.anios_experiencia != null && (
              <span className="text-ink-subtle">
                {' '}
                · {ingeniero.anios_experiencia} {ingeniero.anios_experiencia === 1 ? 'año' : 'años'} de experiencia
              </span>
            )}
            {ingeniero.ciudad && <span className="text-ink-subtle"> · {ingeniero.ciudad}</span>}
          </p>
        </div>
      </div>

      {ingeniero.especialidades.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {ingeniero.especialidades.map((r) => (
            <li
              key={r}
              className={
                'rounded-full px-2.5 py-0.5 text-[11px] ' +
                (r === rubroDelCliente ? 'bg-accent-alt/20 font-medium text-ink' : 'bg-surface-overlay text-ink-muted')
              }
            >
              {etiquetaRubro(r)}
            </li>
          ))}
        </ul>
      )}
      {conoceSuRubro && <p className="mt-2 text-xs text-ink">✓ Trabaja con negocios como el tuyo</p>}
      {ingeniero.servicios && ingeniero.servicios.length > 0 && (
        <p className="mt-2 text-xs text-ink-muted">
          <span className="text-ink-subtle">Ofrece:</span> {textoServicios(ingeniero.servicios, ingeniero.servicios_otros)}
        </p>
      )}
      {extra}

      {abierto && (
        <div className="mt-4 space-y-3 border-t border-line pt-4 text-sm">
          {ingeniero.bio && <p className="whitespace-pre-line text-ink-muted">{ingeniero.bio}</p>}
          {ingeniero.portafolio_url && (
            <a
              href={ingeniero.portafolio_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-block font-medium text-accent underline underline-offset-2"
            >
              Ver su portafolio ↗
            </a>
          )}
          {ingeniero.ultimas.length > 0 && (
            <ul className="space-y-2">
              {ingeniero.ultimas.map((r, i) => (
                <li key={i} className="rounded-lg bg-surface-overlay/60 p-3">
                  <p className="text-xs text-accent-alt" aria-label={`${r.estrellas} de 5 estrellas`}>
                    {'★'.repeat(r.estrellas)}
                    <span className="text-line-strong">{'★'.repeat(5 - r.estrellas)}</span>
                  </p>
                  {r.comentario && <p className="mt-1 text-ink">«{r.comentario}»</p>}
                  <p className="mt-1 text-[11px] text-ink-subtle">
                    {[r.autor, r.negocio].filter(Boolean).join(' · ') || 'Un cliente'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {(ingeniero.bio || ingeniero.portafolio_url || ingeniero.ultimas.length > 0) && (
          <button
            type="button"
            onClick={() => setAbierto((a) => !a)}
            aria-expanded={abierto}
            className="btn btn-ghost !px-3 !py-1.5 text-sm"
          >
            {abierto ? 'Ocultar perfil' : 'Ver perfil'}
          </button>
        )}
        {accion}
      </div>
    </article>
  );
}
