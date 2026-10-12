import { useState, type ReactNode } from 'react';
import type { Documentacion } from '../lib/api';
import type { EtapaNueva } from '../lib/propuestas';

// ---------------------------------------------------------------------------
// La documentación de un encargo, en el panel del ingeniero
// ---------------------------------------------------------------------------
// Arriba lo que necesita antes de construir: qué preguntarle al cliente en la
// primera llamada, qué materiales pedirle y un plan por etapas que puede pasar
// a su propuesta. Debajo, el detalle: en una web, su mapa del sitio, SEO y
// publicación; en un sistema, sus datos, flujos y stack. Las documentaciones
// anteriores (sin `version`) se ven como antes y se pueden regenerar.
// ---------------------------------------------------------------------------

export function DocumentacionTecnica({
  doc,
  onUsarEtapas,
  onRegenerar,
}: {
  doc: Documentacion;
  /** Abre la propuesta «Por etapas» con este plan. */
  onUsarEtapas?: (etapas: EtapaNueva[]) => void;
  /** Vuelve a generarla con el formato nuevo. Lanza si no se pudo. */
  onRegenerar?: () => Promise<void>;
}) {
  const esWeb = doc.tipo === 'web';

  return (
    <div className="space-y-6 text-sm">
      {!doc.version && onRegenerar && <Regenerar onRegenerar={onRegenerar} />}

      <Bloque titulo="Resumen">
        <p className="text-ink-muted">{doc.resumen}</p>
        {doc.objetivo && (
          <p className="mt-2 text-ink-muted">
            <strong className="text-ink">Objetivo:</strong> {doc.objetivo}
          </p>
        )}
      </Bloque>

      {(doc.preguntas_llamada?.length || doc.pedir_al_cliente?.length) && (
        <div className="grid gap-4 rounded-xl border border-accent-alt/50 bg-accent-alt/10 p-4 md:grid-cols-2">
          {!!doc.preguntas_llamada?.length && (
            <Bloque titulo="Para la primera llamada">
              <ol className="list-decimal space-y-1.5 pl-5 text-ink">
                {doc.preguntas_llamada.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ol>
            </Bloque>
          )}
          {!!doc.pedir_al_cliente?.length && (
            <Bloque titulo="Pídele al cliente">
              <ul className="space-y-1.5">
                {doc.pedir_al_cliente.map((m) => (
                  <li key={m.material} className="flex gap-2">
                    <span className="text-accent-alt" aria-hidden="true">
                      ☐
                    </span>
                    <span>
                      <strong className="text-ink">{m.material}</strong>
                      <span className="text-ink-muted"> — {m.detalle}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Bloque>
          )}
        </div>
      )}

      {!!doc.etapas?.length && (
        <Bloque titulo={`Plan por etapas${doc.estimacion?.semanas ? ` · unas ${doc.estimacion.semanas} semanas` : ''}`}>
          <ol className="space-y-2">
            {doc.etapas.map((e, i) => (
              <li key={e.titulo} className="flex gap-3 rounded-lg border border-line p-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <strong className="text-ink">{e.titulo}</strong>
                    <span className="text-xs text-ink-muted tabular-nums">
                      {e.porcentaje} % · {e.dias} {e.dias === 1 ? 'día' : 'días'}
                    </span>
                  </p>
                  {e.entregable && <p className="mt-0.5 text-ink-muted">{e.entregable}</p>}
                </div>
              </li>
            ))}
          </ol>
          {onUsarEtapas && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  onUsarEtapas((doc.etapas ?? []).map((e) => ({ titulo: e.titulo, porcentaje: e.porcentaje, dias: e.dias })))
                }
                className="btn btn-primary !py-1.5 text-sm"
              >
                Usar en mi propuesta
              </button>
              <span className="text-xs text-ink-subtle">Abre la propuesta «Por etapas» con este plan; tú pones el precio.</span>
            </div>
          )}
        </Bloque>
      )}

      <Bloque titulo="Funcionalidades">
        <ul className="space-y-2">
          {doc.funcionalidades?.map((f) => (
            <li key={f.nombre} className="flex gap-3">
              <span
                className={
                  'mt-0.5 h-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ' +
                  (f.prioridad === 'alta'
                    ? 'bg-negative/15 text-negative'
                    : f.prioridad === 'media'
                      ? 'bg-caution/15 text-caution'
                      : 'bg-line text-ink-subtle')
                }
              >
                {f.prioridad}
              </span>
              <span>
                <strong className="text-ink">{f.nombre}</strong>
                <span className="text-ink-muted"> — {f.descripcion}</span>
              </span>
            </li>
          ))}
        </ul>
      </Bloque>

      {!!doc.mapa_sitio?.length && (
        <Bloque titulo="Mapa del sitio">
          <div className="grid gap-3 sm:grid-cols-2">
            {doc.mapa_sitio.map((p) => (
              <div key={p.pagina} className="rounded-lg border border-line bg-surface-deep/40 p-3">
                <p className="font-medium text-ink">{p.pagina}</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-ink-muted">
                  {p.secciones?.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Bloque>
      )}

      {!!doc.usuarios?.length && doc.version && (
        <Bloque titulo="Usuarios">
          <ul className="space-y-1.5">
            {doc.usuarios.map((u) => (
              <li key={u.rol}>
                <strong className="text-ink">{u.rol}</strong>
                <span className="text-ink-muted"> — {u.necesidad}</span>
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      {!!doc.modelo_datos?.length && (
        <Bloque titulo="Modelo de datos">
          <div className="space-y-2">
            {doc.modelo_datos.map((m) => (
              <div key={m.entidad} className="rounded-lg border border-line bg-surface-deep/40 p-3">
                <p className="font-medium text-ink">{m.entidad}</p>
                <p className="mt-1 font-mono text-xs text-ink-muted">{m.campos?.join(', ')}</p>
                {m.relaciones && <p className="mt-1 text-xs text-ink-subtle">{m.relaciones}</p>}
              </div>
            ))}
          </div>
        </Bloque>
      )}

      {!!doc.flujos_criticos?.length && (
        <Bloque titulo="Flujos críticos">
          <div className="space-y-3">
            {doc.flujos_criticos.map((f) => (
              <div key={f.nombre}>
                <p className="font-medium text-ink">{f.nombre}</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-ink-muted">
                  {f.pasos?.map((paso, i) => (
                    <li key={i}>{paso}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Bloque>
      )}

      {!!doc.integraciones?.length && (
        <Bloque titulo="Integraciones">
          <ul className="flex flex-wrap gap-2">
            {doc.integraciones.map((i) => (
              <li key={i} className="rounded-full border border-line px-3 py-1 text-ink">
                {i}
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      {!!doc.seo?.length && <ListaSimple titulo="SEO básico" items={doc.seo} />}

      {doc.stack_sugerido && (
        <Bloque titulo="Stack sugerido">
          <dl className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ['Frontend', doc.stack_sugerido.frontend],
                ['Backend', doc.stack_sugerido.backend],
                ['Datos', doc.stack_sugerido.datos],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line p-3">
                <dt className="text-xs text-ink-subtle">{k}</dt>
                <dd className="mt-0.5 font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-ink-subtle">{doc.stack_sugerido.justificacion}</p>
        </Bloque>
      )}

      {!!doc.publicacion?.length && (
        <Bloque titulo={esWeb ? 'Para publicar' : 'Para ponerlo en marcha'}>
          <ul className="space-y-1.5">
            {doc.publicacion.map((p, i) => (
              <li key={i} className="flex gap-2 text-ink-muted">
                <span className="text-accent-alt" aria-hidden="true">
                  ☐
                </span>
                {p}
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      {!!doc.criterios_aceptacion?.length && <ListaSimple titulo="Criterios de aceptación" items={doc.criterios_aceptacion} />}

      {!!doc.riesgos?.length && (
        <Bloque titulo="Riesgos">
          <ul className="space-y-1.5">
            {doc.riesgos.map((r) => (
              <li key={r.riesgo}>
                <strong className="text-ink">{r.riesgo}</strong>
                <span className="text-ink-muted"> → {r.mitigacion}</span>
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      {doc.estimacion && (
        <ListaSimple
          titulo={doc.etapas?.length ? 'Supuestos' : `Estimación: ~${doc.estimacion.semanas} semanas`}
          items={doc.estimacion.supuestos ?? []}
        />
      )}
    </div>
  );
}

/** Las de antes del formato nuevo: se pueden volver a generar (cuesta lo mismo que la primera). */
function Regenerar({ onRegenerar }: { onRegenerar: () => Promise<void> }) {
  const [estado, setEstado] = useState<'inactivo' | 'generando' | 'fallo'>('inactivo');

  const regenerar = async () => {
    setEstado('generando');
    try {
      await onRegenerar();
      setEstado('inactivo');
    } catch {
      setEstado('fallo');
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4">
      <p className="min-w-0 flex-1 text-ink-muted">
        {estado === 'generando'
          ? 'Regenerando la documentación… tarda cerca de un minuto.'
          : estado === 'fallo'
            ? 'No se pudo regenerar. Vuelve a intentarlo en un momento.'
            : 'Hay un formato nuevo: preguntas para la primera llamada, qué pedirle al cliente y un plan por etapas para tu propuesta.'}
      </p>
      <button type="button" onClick={() => void regenerar()} disabled={estado === 'generando'} className="btn btn-primary !py-1.5 text-sm">
        {estado === 'generando' ? (
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            Generando…
          </span>
        ) : (
          'Regenerar con el formato nuevo'
        )}
      </button>
    </div>
  );
}

function ListaSimple({ titulo, items }: { titulo: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <Bloque titulo={titulo}>
      <ul className="list-disc space-y-1 pl-5 text-ink-muted">
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </Bloque>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold tracking-wide text-accent uppercase">{titulo}</h4>
      {children}
    </div>
  );
}
