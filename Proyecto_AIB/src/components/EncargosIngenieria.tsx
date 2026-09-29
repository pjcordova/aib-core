import { useEffect, useState } from 'react';
import { cargarProyecto, documentarComoIngeniero, listarAceptados } from '../lib/proyectos';
import type { ProyectoCompleto } from '../lib/proyectos';
import { generarDocumentacion, ApiError, type Documentacion } from '../lib/api';
import { enlaceWhatsapp, formatearWhatsapp } from '../lib/contacto';
import { obtenerServicio, PRESUPUESTOS, etiquetaDe, solesEnteros } from '../lib/servicios';
import { construirDocumento } from '../lib/marca';
import { estadoActual, listarSeguimiento, type CambioEstado } from '../lib/seguimiento';
import { ChipEstado, EditorSeguimiento } from './SeguimientoEncargo';

// ---------------------------------------------------------------------------
// Encargos aceptados
// ---------------------------------------------------------------------------
// Lo que ve el ingeniero cuando un cliente valida su previsualización: la
// documentación técnica lista para estimar y construir. Vive aparte del resto
// del dashboard porque procede del flujo de discovery, no del formulario
// antiguo, y mezclarlos habría forzado uno de los dos formatos.
// ---------------------------------------------------------------------------

export function EncargosIngenieria({ onNuevos }: { onNuevos?: (cantidad: number) => void } = {}) {
  const [encargos, setEncargos] = useState<ProyectoCompleto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [seguimiento, setSeguimiento] = useState<Map<string, CambioEstado[]>>(new Map());

  useEffect(() => {
    let activo = true;
    listarAceptados().then(async (lista) => {
      const etapas = await listarSeguimiento(lista.map((e) => e.id));
      if (!activo) return;
      setEncargos(lista);
      setSeguimiento(etapas);
      setCargando(false);
    });
    return () => {
      activo = false;
    };
  }, []);

  // Nuevo = aceptado y todavía en "Recibido": nadie lo ha revisado.
  const nuevos = encargos.filter((e) => estadoActual(seguimiento.get(e.id)) === 'recibido').length;
  useEffect(() => {
    if (!cargando) onNuevos?.(nuevos);
  }, [cargando, nuevos, onNuevos]);

  if (cargando) {
    return <p className="p-6 text-sm text-ink-subtle">Cargando encargos…</p>;
  }

  if (encargos.length === 0) {
    return (
      <div className="card mx-auto my-8 max-w-2xl p-8 text-center">
        <h2 className="text-lg font-semibold">Todavía no hay encargos</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Cuando un cliente acepte su previsualización, su documentación técnica aparecerá
          aquí lista para estimar.
        </p>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-4xl px-5 py-8">
      <header className="mb-6">
        <h2 className="text-2xl font-semibold">Encargos aceptados</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {encargos.length} {encargos.length === 1 ? 'proyecto validado' : 'proyectos validados'} por
          el cliente
          {nuevos > 0 && (
            <span className="font-medium text-caution">
              {' '}
              · {nuevos} {nuevos === 1 ? 'nuevo por revisar' : 'nuevos por revisar'}
            </span>
          )}
        </p>
      </header>

      <div className="space-y-3">
        {encargos.map((e) => {
          const doc = e.documentacion;
          const desplegado = abierto === e.id;

          return (
            <article key={e.id} className="card overflow-hidden">
              <button
                type="button"
                onClick={() => setAbierto(desplegado ? null : e.id)}
                className="flex w-full items-center gap-4 p-5 text-left"
                aria-expanded={desplegado}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold text-ink">{e.servicio}</h3>
                    <EtiquetaServicio proyecto={e} />
                    <ChipEstado cambios={seguimiento.get(e.id) ?? []} tipo={e.tipoServicio} />
                    {e.plantilla && (
                      <span className="rounded-full border border-accent/30 px-2 py-0.5 text-[11px] text-accent">
                        Plantilla: {e.plantilla.nombre}
                        {e.plantilla.precio_desde ? ` · desde ${solesEnteros(e.plantilla.precio_desde)}` : ''}
                      </span>
                    )}
                    {e.presupuesto && (
                      <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-muted">
                        {etiquetaDe(PRESUPUESTOS, e.presupuesto)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-subtle">
                    {e.respuestas} respuestas ·{' '}
                    {new Date(e.creadoEn).toLocaleDateString('es', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {doc?.estimacion?.semanas ? ` · ~${doc.estimacion.semanas} semanas` : ''}
                    {!doc && <span className="text-caution"> · documentación pendiente</span>}
                    {e.contacto && <span> · {e.contacto.nombre}</span>}
                  </p>
                </div>
                <span className="shrink-0 text-ink-subtle">{desplegado ? '−' : '+'}</span>
              </button>

              {desplegado && (
                <div className="animate-fade-up border-t border-line p-5 pt-6">
                  <DatosCliente encargo={e} />
                  <EditorSeguimiento
                    encargo={e}
                    cambios={seguimiento.get(e.id) ?? []}
                    onCambio={(cambio) =>
                      setSeguimiento((previo) => new Map(previo).set(e.id, [...(previo.get(e.id) ?? []), cambio]))
                    }
                  />
                  {!doc ? (
                    <SinDocumentacion
                      encargo={e}
                      onLista={(documentacion) =>
                        setEncargos((lista) =>
                          lista.map((x) => (x.id === e.id ? { ...x, documentacion } : x))
                        )
                      }
                    />
                  ) : (
                    <div className="space-y-6 text-sm">
                      <Bloque titulo="Resumen">
                        <p className="text-ink-muted">{doc.resumen}</p>
                      </Bloque>

                      <Bloque titulo="Objetivo">
                        <p className="text-ink-muted">{doc.objetivo}</p>
                      </Bloque>

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

                      <Bloque titulo="Modelo de datos">
                        <div className="space-y-2">
                          {doc.modelo_datos?.map((m) => (
                            <div
                              key={m.entidad}
                              className="rounded-lg border border-line bg-surface-deep/40 p-3"
                            >
                              <p className="font-medium text-ink">{m.entidad}</p>
                              <p className="mt-1 font-mono text-xs text-ink-muted">
                                {m.campos?.join(', ')}
                              </p>
                              {m.relaciones && (
                                <p className="mt-1 text-xs text-ink-subtle">{m.relaciones}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </Bloque>

                      <Bloque titulo="Flujos críticos">
                        <div className="space-y-3">
                          {doc.flujos_criticos?.map((f) => (
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

                      <Bloque titulo="Criterios de aceptación">
                        <ul className="list-disc space-y-1 pl-5 text-ink-muted">
                          {doc.criterios_aceptacion?.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </Bloque>

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
                          <p className="mt-2 text-xs text-ink-subtle">
                            {doc.stack_sugerido.justificacion}
                          </p>
                        </Bloque>
                      )}

                      <Bloque titulo="Riesgos">
                        <ul className="space-y-1.5">
                          {doc.riesgos?.map((r) => (
                            <li key={r.riesgo}>
                              <strong className="text-ink">{r.riesgo}</strong>
                              <span className="text-ink-muted"> → {r.mitigacion}</span>
                            </li>
                          ))}
                        </ul>
                      </Bloque>

                      {doc.estimacion && (
                        <Bloque titulo={`Estimación: ~${doc.estimacion.semanas} semanas`}>
                          <ul className="list-disc space-y-1 pl-5 text-ink-muted">
                            {doc.estimacion.supuestos?.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </Bloque>
                      )}
                    </div>
                  )}

                  {/* Fuera de la rama anterior: la maqueta se puede descargar
                      aunque la documentación aún no esté. */}
                  <div className="mt-6 flex flex-wrap gap-2">
                    {doc && (
                      <button type="button" onClick={() => descargarDoc(e)} className="btn btn-ghost">
                        Descargar documentación (JSON)
                      </button>
                    )}
                    {(e.documento || e.html) && e.ficha && (
                      <button type="button" onClick={() => descargarMaqueta(e)} className="btn btn-ghost">
                        Descargar maqueta (index.html)
                      </button>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Con quién hablar y lo que más cambia el precio, arriba de todo: es lo
 * primero que el ingeniero necesita para responder al encargo.
 */
function DatosCliente({ encargo }: { encargo: ProyectoCompleto }) {
  const c = encargo.contacto;
  const alcance = encargo.historial.filter((h) => h.question_id.startsWith('alcance-'));

  if (!c) {
    return (
      <p className="mb-6 rounded-lg border border-line px-4 py-3 text-sm text-ink-muted">
        Este encargo se aceptó antes de que pidiéramos los datos de contacto del cliente.
      </p>
    );
  }

  const whatsapp = enlaceWhatsapp(
    c.whatsapp,
    `Hola ${c.nombre}, te escribo de AIB+ por tu proyecto «${encargo.servicio}». ¿Tienes unos minutos para conversar la propuesta?`
  );

  return (
    <div className="mb-6 rounded-xl border border-accent/30 bg-accent/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-accent uppercase">Cliente</p>
          <p className="mt-0.5 font-semibold text-ink">{c.nombre}</p>
          <p className="text-sm break-all text-ink-muted">
            {formatearWhatsapp(c.whatsapp)}
            {c.correo ? ` · ${c.correo}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              Escribir por WhatsApp
            </a>
          )}
          {c.correo && (
            <a
              href={`mailto:${encodeURIComponent(c.correo)}?subject=${encodeURIComponent(`Tu proyecto en AIB+: ${encargo.servicio}`)}`}
              className="btn btn-ghost"
            >
              Enviar correo
            </a>
          )}
        </div>
      </div>

      {alcance.length > 0 && (
        <dl className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
          {alcance.map((a) => (
            <div key={a.question_id}>
              <dt className="text-xs text-ink-subtle">{a.question}</dt>
              <dd className="mt-0.5 text-sm font-medium text-ink">{a.answer}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * Tiempo que se le da a la documentación que se genera en segundo plano al
 * aceptar (tarda cerca de un minuto) antes de ofrecer generarla desde aquí.
 */
const MARGEN_DOCUMENTACION_MS = 3 * 60_000;

/**
 * Encargo aceptado que aún no tiene documentación: o se está generando, o el
 * cliente cerró la página antes de que terminara. En el segundo caso el
 * ingeniero la genera aquí.
 */
function SinDocumentacion({
  encargo,
  onLista,
}: {
  encargo: ProyectoCompleto;
  onLista: (documentacion: Documentacion) => void;
}) {
  const [estado, setEstado] = useState<'inactivo' | 'generando' | 'fallo'>('inactivo');
  const [error, setError] = useState('');
  // Se calcula una vez al montar: basta para decidir si esperar o no.
  const [reciente] = useState(
    () =>
      encargo.aceptadoEn !== undefined &&
      Date.now() - Date.parse(encargo.aceptadoEn) < MARGEN_DOCUMENTACION_MS
  );

  const generar = async () => {
    setEstado('generando');
    try {
      const { documentacion } = await generarDocumentacion(encargo.servicio, encargo.historial);
      const { ok, error: errorGuardado } = await documentarComoIngeniero(encargo.id, documentacion);
      if (errorGuardado) throw new Error(errorGuardado);
      // Si no se guardó es que llegó antes la del cliente: se muestra esa.
      const guardada = ok ? documentacion : (await cargarProyecto(encargo.id))?.documentacion;
      onLista(guardada ?? documentacion);
    } catch (e) {
      console.error('[AIB+] Error generando la documentación:', e);
      setError(e instanceof ApiError ? e.message : 'No se pudo generar la documentación.');
      setEstado('fallo');
    }
  };

  if (estado === 'generando') {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-muted" role="status">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
        Generando la documentación… tarda cerca de un minuto.
      </p>
    );
  }

  if (reciente && estado === 'inactivo') {
    return (
      <p className="text-sm text-ink-muted">
        El cliente acaba de aceptar y la documentación se está generando. Estará lista en
        un minuto: recarga la página para verla.
      </p>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-ink-muted">
        {estado === 'fallo'
          ? error
          : 'Este encargo no tiene documentación: el cliente cerró la página antes de que se generara.'}
      </p>
      <button type="button" onClick={() => void generar()} className="btn btn-primary">
        {estado === 'fallo' ? 'Reintentar' : 'Generar documentación'}
      </button>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold tracking-wide text-accent uppercase">{titulo}</h4>
      {children}
    </div>
  );
}

function descargarDoc(encargo: ProyectoCompleto) {
  const contenido = JSON.stringify(
    { servicio: encargo.servicio, discovery: encargo.historial, documentacion: encargo.documentacion },
    null,
    2
  );
  const url = URL.createObjectURL(new Blob([contenido], { type: 'application/json' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `encargo-${encargo.id.slice(0, 8)}.json`;
  enlace.click();
  URL.revokeObjectURL(url);
}

/** Etiqueta del tipo de servicio. Las filas antiguas no lo tienen: eran de software. */
function EtiquetaServicio({ proyecto }: { proyecto: ProyectoCompleto }) {
  const texto = proyecto.tipoServicio
    ? `${obtenerServicio(proyecto.tipoServicio).icono} ${obtenerServicio(proyecto.tipoServicio).nombre}`
    : '💻 Software';
  return (
    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
      {texto}
    </span>
  );
}

function descargarMaqueta(encargo: ProyectoCompleto) {
  if (!encargo.ficha) return;
  // Las maquetas de plantilla se guardan ya completas; las generadas por IA,
  // solo el cuerpo, y se montan aquí.
  const documento =
    encargo.documento ?? (encargo.html ? construirDocumento(encargo.html, encargo.ficha) : null);
  if (!documento) return;
  const url = URL.createObjectURL(new Blob([documento], { type: 'text/html;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `maqueta-${encargo.id.slice(0, 8)}.html`;
  enlace.click();
  URL.revokeObjectURL(url);
}
