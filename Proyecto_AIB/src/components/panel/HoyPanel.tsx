import { useEffect, useState } from 'react';
import { enlaceWhatsapp } from '../../lib/contacto';
import { REACCIONES } from '../../lib/comentarios';
import {
  cargarHoy,
  diasDesde,
  dondeSeQuedo,
  mensajeSeguimiento,
  tiempoDesde,
  ultimaActividad,
  type EncargoPendiente,
  type ResumenHoy,
} from '../../lib/hoy';
import { AvatarAbi } from './AvatarAbi';
import { ChatAbi } from './ChatAbi';

// ---------------------------------------------------------------------------
// Hoy, con ABI
// ---------------------------------------------------------------------------
// La portada del ingeniero: ABI le pone delante lo que necesita su atención,
// empezando por los clientes que esperan respuesta. De momento son reglas
// fijas sobre sus datos (lib/hoy.ts), sin IA; debajo del saludo puede
// preguntarle a ABI (ChatAbi). Desde aquí no se envía nada: los botones abren
// WhatsApp con el mensaje escrito y el ingeniero decide.
// ---------------------------------------------------------------------------

export interface IrAEncargos {
  /** Abrir este encargo. */
  abrir?: string;
  /** Texto para la búsqueda, para que el encargo aparezca aunque no esté en la primera página. */
  buscar?: string;
  /** Solo los que siguen en "Recibido". */
  soloNuevos?: boolean;
}

export function HoyPanel({
  onEncargos,
  onInvitaciones,
  onComentarios,
  onNuevos,
}: {
  onEncargos: (destino: IrAEncargos) => void;
  onInvitaciones: () => void;
  onComentarios: () => void;
  onNuevos?: (cantidad: number) => void;
}) {
  const [resumen, setResumen] = useState<ResumenHoy | null>(null);
  // Sube cuando ABI cambia algo (una etapa, una invitación): se vuelve a leer.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    void cargarHoy().then((r) => {
      if (vigente) setResumen(r);
    });
    return () => {
      vigente = false;
    };
  }, [version]);

  useEffect(() => {
    if (resumen) onNuevos?.(resumen.totalEsperando);
  }, [resumen, onNuevos]);

  if (!resumen) {
    return (
      <section className="mx-auto max-w-4xl px-5 py-8">
        <div className="flex items-center gap-4">
          <AvatarAbi />
          <p className="text-sm text-ink-muted" role="status">
            ABI está revisando tus encargos…
          </p>
        </div>
      </section>
    );
  }

  const r = resumen;
  const masAntiguo = r.esperando[0];
  // Atajos para preguntarle a ABI, con los clientes de verdad.
  const sugerencias = [
    ...(masAntiguo
      ? [
          `¿Qué le respondo a ${nombreDe(masAntiguo)}?`,
          `Propón una reunión a ${nombreDe(masAntiguo)}`,
          `¿Cuánto debería cobrarle a ${nombreDe(masAntiguo)}?`,
        ]
      : []),
    ...(r.totalInvitaciones > 0 ? ['¿Qué invitaciones debería reactivar y cómo?'] : []),
    'Resume mi semana para el informe de Santander X',
  ];

  return (
    <section className="mx-auto max-w-4xl px-5 py-8">
      {/* ---------------------------------------------------------- saludo */}
      <header className="mb-8 flex items-start gap-4">
        <AvatarAbi />
        <div className="min-w-0">
          <p className="text-sm text-ink-subtle first-letter:uppercase">
            {saludo()} · {new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-balance text-ink">{titular(r)}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Soy ABI.{' '}
            {masAntiguo
              ? `${nombreDe(masAntiguo)} es quien más lleva esperando: ${tiempoDesde(masAntiguo.desde)}.`
              : r.totalInvitaciones > 0
                ? `${r.totalInvitaciones === 1 ? 'Una invitación se quedó' : `${r.totalInvitaciones} invitaciones se quedaron`} a medio camino: un mensaje puede reactivarlas.`
                : 'Buen momento para enviar invitaciones nuevas.'}
          </p>
        </div>
      </header>

      {r.incompleto && (
        <p role="alert" className="mb-6 rounded-lg border border-caution/40 px-4 py-3 text-sm text-caution">
          No pude leer todo; puede faltar algo. Recarga la página en un momento.
        </p>
      )}

      <ChatAbi sugerencias={sugerencias} onCambio={() => setVersion((v) => v + 1)} />

      <div className="space-y-8">
        {/* ------------------------------------------------ esperan respuesta */}
        {r.totalEsperando > 0 && (
          <Seccion
            titulo="Esperan tu respuesta"
            nota="Cuando le escribas, marca el encargo «En revisión» para que deje de aparecer aquí."
            verTodos={
              r.totalEsperando > r.esperando.length
                ? { texto: `Ver los ${r.totalEsperando}`, onClick: () => onEncargos({ soloNuevos: true }) }
                : undefined
            }
          >
            {r.esperando.map((e) => (
              <Tarjeta key={e.id}>
                <div className="min-w-0 grow basis-56">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-ink">{nombreDe(e)}</p>
                    <ChipEspera desde={e.desde} />
                  </div>
                  <p className="mt-0.5 text-xs text-ink-subtle">
                    {e.servicio}
                    {e.cliente && e.cliente !== e.empresa ? ` · ${e.cliente}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {e.whatsapp && (
                    <BotonWhatsapp
                      href={enlaceWhatsapp(
                        e.whatsapp,
                        `Hola${e.cliente ? ` ${e.cliente}` : ''}, te escribo de AIB+ por tu proyecto «${e.servicio}». ¿Tienes unos minutos para conversar la propuesta?`
                      )}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onEncargos({ abrir: e.id, buscar: buscarDe(e) })}
                    className="btn btn-ghost !px-3 !py-1.5 text-xs"
                  >
                    Abrir encargo
                  </button>
                </div>
              </Tarjeta>
            ))}
          </Seccion>
        )}

        {/* ------------------------------------------- invitaciones a medias */}
        {r.totalInvitaciones > 0 && (
          <Seccion
            titulo="Invitaciones a medio camino"
            verTodos={{ texto: 'Ver invitaciones', onClick: onInvitaciones }}
          >
            {r.invitaciones.map((inv) => (
              <Tarjeta key={inv.id}>
                <div className="min-w-0 grow basis-56">
                  <p className="truncate font-semibold text-ink">{inv.negocio}</p>
                  <p className="mt-0.5 text-xs text-ink-subtle">
                    {dondeSeQuedo(inv)} · hace {tiempoDesde(ultimaActividad(inv))}
                  </p>
                </div>
                <BotonWhatsapp
                  href={`https://wa.me/?text=${encodeURIComponent(mensajeSeguimiento(inv))}`}
                  texto="Escribirle por WhatsApp"
                />
              </Tarjeta>
            ))}
          </Seccion>
        )}

        {/* ---------------------------------------------- sin documentación */}
        {r.totalSinDocumentacion > 0 && (
          <Seccion titulo="Encargos sin documentación técnica">
            {r.sinDocumentacion.map((e) => (
              <Tarjeta key={e.id}>
                <div className="min-w-0 grow basis-56">
                  <p className="truncate font-semibold text-ink">{nombreDe(e)}</p>
                  <p className="mt-0.5 text-xs text-ink-subtle">Sin ella no puedes estimar precio ni plazos.</p>
                </div>
                <button
                  type="button"
                  onClick={() => onEncargos({ abrir: e.id, buscar: buscarDe(e) })}
                  className="btn btn-ghost !px-3 !py-1.5 text-xs"
                >
                  Generarla
                </button>
              </Tarjeta>
            ))}
          </Seccion>
        )}

        {/* --------------------------------------------------- comentarios */}
        {r.comentarios.length > 0 && (
          <Seccion titulo="Comentarios de esta semana" verTodos={{ texto: 'Ver todos', onClick: onComentarios }}>
            {r.comentarios.map((c) => {
              const reaccion = REACCIONES.find((x) => x.valor === c.reaccion);
              return (
                <Tarjeta key={c.id}>
                  <div className="min-w-0 grow basis-56">
                    <p className="font-semibold text-ink">
                      {reaccion && <span aria-hidden="true">{reaccion.emoji} </span>}
                      {c.empresa ?? 'Un cliente'}
                      {reaccion && <span className="font-normal text-ink-muted"> · {reaccion.etiqueta}</span>}
                    </p>
                    {c.texto && <p className="mt-1 text-sm break-words text-ink-muted">«{c.texto}»</p>}
                    <p className="mt-1 text-xs text-ink-subtle">hace {tiempoDesde(c.creadoEn)}</p>
                  </div>
                </Tarjeta>
              );
            })}
          </Seccion>
        )}

        {/* --------------------------------------------------------- semana */}
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-accent uppercase">Últimos 7 días</h3>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ['Invitaciones enviadas', r.semana.enviadas],
                ['Abrieron su enlace', r.semana.abrieron],
                ['Aceptaron', r.semana.aceptaron],
                ['Comentarios', r.semana.comentarios],
              ] as const
            ).map(([texto, valor]) => (
              <div key={texto} className="rounded-xl border border-line bg-surface-raised/50 p-3">
                <dd className="text-2xl font-semibold text-ink tabular-nums">{valor}</dd>
                <dt className="text-xs text-ink-muted">{texto}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11px] text-ink-subtle">Solo clientes reales: no cuenta tus pruebas.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onInvitaciones} className="btn btn-primary">
            Crear una invitación
          </button>
          <button type="button" onClick={() => onEncargos({})} className="btn btn-ghost">
            Ver todos los encargos
          </button>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function titular(r: ResumenHoy): string {
  if (r.totalEsperando === 1) return 'Un cliente espera tu respuesta';
  if (r.totalEsperando > 1) return `${r.totalEsperando} clientes esperan tu respuesta`;
  return 'Todo al día: ningún cliente está esperando';
}

function saludo(): string {
  const hora = new Date().getHours();
  if (hora < 6) return 'Buenas noches';
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

const nombreDe = (e: EncargoPendiente) => e.empresa ?? e.cliente ?? e.servicio;
const buscarDe = (e: EncargoPendiente) => e.empresa ?? e.cliente ?? e.servicio;

/** Ámbar desde el primer día de espera, rojo a partir del tercero. */
function ChipEspera({ desde }: { desde: string }) {
  const dias = diasDesde(desde);
  const tono =
    dias >= 3 ? 'border-negative/40 text-negative' : dias >= 1 ? 'border-caution/40 text-caution' : 'border-line text-ink-muted';
  return (
    <span className={'rounded-full border px-2 py-0.5 text-[11px] font-medium ' + tono}>
      Esperando {tiempoDesde(desde)}
    </span>
  );
}

function Seccion({
  titulo,
  nota,
  verTodos,
  children,
}: {
  titulo: string;
  nota?: string;
  verTodos?: { texto: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-accent uppercase">{titulo}</h3>
        {verTodos && (
          <button type="button" onClick={verTodos.onClick} className="text-xs text-ink-muted hover:text-ink">
            {verTodos.texto} →
          </button>
        )}
      </div>
      <ul className="space-y-2">{children}</ul>
      {nota && <p className="mt-2 text-[11px] text-ink-subtle">{nota}</p>}
    </div>
  );
}

function Tarjeta({ children }: { children: React.ReactNode }) {
  return <li className="card flex flex-wrap items-center gap-3 p-4">{children}</li>;
}

function BotonWhatsapp({ href, texto = 'Escribir por WhatsApp' }: { href: string | null; texto?: string }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="btn btn-primary !px-3 !py-1.5 text-xs">
      {texto}
    </a>
  );
}
