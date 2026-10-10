import { useCallback, useEffect, useState } from 'react';
import { cargarProyecto, documentarComoIngeniero } from '../lib/proyectos';
import type { ProyectoCompleto } from '../lib/proyectos';
import { generarDocumentacion, ApiError, type Documentacion } from '../lib/api';
import { enlaceWhatsapp, formatearWhatsapp } from '../lib/contacto';
import {
  obtenerServicio,
  OBJETIVOS_WEB,
  PRESUPUESTOS,
  SERVICIOS,
  etiquetaDe,
  solesEnteros,
  type TipoServicio,
} from '../lib/servicios';
import { construirDocumento } from '../lib/marca';
import { ETAPAS, listarSeguimiento, type CambioEstado, type EstadoEncargo } from '../lib/seguimiento';
import {
  cargarEncargo,
  contarEncargos,
  ENCARGOS_POR_PAGINA,
  listarEncargos,
  SIN_FILTROS,
  type EncargoFila,
  type FiltrosEncargos,
} from '../lib/encargos';
import { ChipEstado, EditorSeguimiento } from './SeguimientoEncargo';
import { conAnimaciones } from '../lib/animaciones';
import { ResponsableEncargo } from './panel/ResponsableEncargo';
import { PropuestaEncargo } from './propuestas/PropuestaEncargo';
import { ResenaEncargo } from './ResenaEncargo';
import { miEquipo, type MiEquipo } from '../lib/planes';

// ---------------------------------------------------------------------------
// Encargos aceptados
// ---------------------------------------------------------------------------
// Lo que ve el ingeniero cuando un cliente valida su previsualización: la
// documentación técnica lista para estimar y construir. Vive aparte del resto
// del dashboard porque procede del flujo de discovery, no del formulario
// antiguo, y mezclarlos habría forzado uno de los dos formatos.
//
// La lista llega de cinco en cinco, ya filtrada por la base de datos
// (lib/encargos.ts); el detalle de cada encargo se pide al abrirlo.
// ---------------------------------------------------------------------------

/** Una página de la lista, con el filtro con el que se pidió. */
interface Lista {
  filtros: FiltrosEncargos;
  filas: EncargoFila[];
  total: number;
  fallo: boolean;
}

const hayFiltro = (f: FiltrosEncargos) => Boolean(f.estado || f.servicio || f.soloReales || f.busqueda.trim());

export function EncargosIngenieria({
  onNuevos,
  inicial,
}: {
  onNuevos?: (cantidad: number) => void;
  /** Para llegar desde ABI con un filtro puesto o un encargo ya abierto. */
  inicial?: { filtros?: Partial<FiltrosEncargos>; abrir?: string };
} = {}) {
  const [filtros, setFiltros] = useState<FiltrosEncargos>(() => ({ ...SIN_FILTROS, ...inicial?.filtros }));
  /** Lo que hay en la caja de búsqueda; pasa a `filtros` cuando se deja de escribir. */
  const [texto, setTexto] = useState(inicial?.filtros?.busqueda ?? '');
  const [lista, setLista] = useState<Lista | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [falloMas, setFalloMas] = useState(false);
  const [conteo, setConteo] = useState<{ total: number; nuevos: number } | null>(null);
  const [versionConteo, setVersionConteo] = useState(0);
  const [abierto, setAbierto] = useState<string | null>(inicial?.abrir ?? null);
  const [seguimiento, setSeguimiento] = useState<Map<string, CambioEstado[]>>(new Map());
  const [detalles, setDetalles] = useState<Map<string, ProyectoCompleto>>(new Map());
  // Plan Negocio: el dueño reparte los encargos entre su equipo.
  const [equipo, setEquipo] = useState<MiEquipo | null>(null);

  useEffect(() => {
    let vigente = true;
    void miEquipo().then((e) => {
      if (vigente) setEquipo(e);
    });
    return () => {
      vigente = false;
    };
  }, []);

  // Se está pidiendo la primera página de un filtro nuevo.
  const cargando = lista?.filtros !== filtros;

  // Totales del encabezado y aviso de nuevos: no dependen del filtro.
  useEffect(() => {
    let vigente = true;
    void contarEncargos().then((c) => {
      if (vigente && c) setConteo(c);
    });
    return () => {
      vigente = false;
    };
  }, [versionConteo]);

  useEffect(() => {
    if (conteo) onNuevos?.(conteo.nuevos);
  }, [conteo, onNuevos]);

  // La búsqueda sale cuando el ingeniero deja de escribir, no con cada letra.
  useEffect(() => {
    const espera = setTimeout(() => setFiltros((f) => (f.busqueda === texto ? f : { ...f, busqueda: texto })), 300);
    return () => clearTimeout(espera);
  }, [texto]);

  // Primera página: al entrar y cada vez que cambia el filtro.
  useEffect(() => {
    let vigente = true;
    void listarEncargos(filtros, 0).then(async (r) => {
      const etapas = r ? await listarSeguimiento(r.filas.map((f) => f.id)) : new Map<string, CambioEstado[]>();
      if (!vigente) return;
      setLista({ filtros, filas: r?.filas ?? [], total: r?.total ?? 0, fallo: !r });
      setSeguimiento(etapas);
      setFalloMas(false);
    });
    return () => {
      vigente = false;
    };
  }, [filtros]);

  const cargarMas = async () => {
    if (!lista) return;
    setCargandoMas(true);
    setFalloMas(false);
    const r = await listarEncargos(filtros, lista.filas.length);
    const etapas = r ? await listarSeguimiento(r.filas.map((f) => f.id)) : null;
    setCargandoMas(false);
    if (!r || !etapas) {
      setFalloMas(true);
      return;
    }
    setLista((previa) => {
      if (!previa || previa.filtros !== filtros) return previa;
      // Si entró un encargo nuevo mientras tanto, el desplazamiento repite uno: fuera.
      const nuevas = r.filas.filter((f) => !previa.filas.some((p) => p.id === f.id));
      return { ...previa, filas: [...previa.filas, ...nuevas], total: r.total };
    });
    setSeguimiento((previo) => new Map([...previo, ...etapas]));
  };

  const cambiarFiltro = (cambios: Partial<FiltrosEncargos>) => setFiltros((f) => ({ ...f, ...cambios }));
  const quitarFiltros = () => {
    setTexto('');
    setFiltros(SIN_FILTROS);
  };

  const guardarDetalle = useCallback(
    (d: ProyectoCompleto) => setDetalles((previo) => new Map(previo).set(d.id, d)),
    []
  );

  const actualizarFila = (id: string, cambios: Partial<EncargoFila>) =>
    setLista((previa) =>
      previa ? { ...previa, filas: previa.filas.map((f) => (f.id === id ? { ...f, ...cambios } : f)) } : previa
    );

  if (!conteo && !lista) {
    return <p className="p-6 text-sm text-ink-subtle">Cargando encargos…</p>;
  }

  if (conteo?.total === 0) {
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

  const filas = lista?.filas ?? [];
  const restantes = (lista?.total ?? 0) - filas.length;

  return (
    <section className="mx-auto max-w-4xl px-5 py-8">
      <header className="mb-5">
        <h2 className="text-2xl font-semibold">Encargos aceptados</h2>
        {conteo && (
          <p className="mt-1 text-sm text-ink-muted">
            {conteo.total} {conteo.total === 1 ? 'proyecto validado' : 'proyectos validados'} por el cliente
            {conteo.nuevos > 0 && (
              <span className="font-medium text-caution">
                {' '}
                · {conteo.nuevos} {conteo.nuevos === 1 ? 'nuevo por revisar' : 'nuevos por revisar'}
              </span>
            )}
          </p>
        )}
      </header>

      {/* ------------------------------------------------- búsqueda y filtros */}
      <div className="mb-5 space-y-2" role="search">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar encargos</span>
            <svg
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value.slice(0, 60))}
              placeholder="Buscar por negocio o cliente"
              className="field !pl-10"
            />
          </label>
          <select
            value={filtros.estado}
            onChange={(e) => cambiarFiltro({ estado: e.target.value as EstadoEncargo | '' })}
            aria-label="Filtrar por etapa"
            className="field sm:!w-56 sm:shrink-0"
          >
            <option value="">Todas las etapas</option>
            {ETAPAS.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.valor === 'recibido' ? 'Nuevos por revisar' : e.valor === 'publicada' ? 'Publicada o entregada' : e.etiqueta}
              </option>
            ))}
          </select>
          <select
            value={filtros.servicio}
            onChange={(e) => cambiarFiltro({ servicio: e.target.value as FiltrosEncargos['servicio'] })}
            aria-label="Filtrar por servicio"
            className="field sm:!w-56 sm:shrink-0"
          >
            <option value="">Todos los servicios</option>
            {SERVICIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
            <option value="software">Software (anteriores)</option>
          </select>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={filtros.soloReales}
            onChange={(e) => cambiarFiltro({ soloReales: e.target.checked })}
          />
          Ocultar mis pruebas
        </label>
      </div>

      {/* --------------------------------------------------------------- lista */}
      {cargando ? (
        <p className="py-6 text-sm text-ink-subtle" role="status">
          Buscando encargos…
        </p>
      ) : lista?.fallo ? (
        <div className="card p-6 text-sm" role="alert">
          <p className="text-negative">No se pudieron cargar los encargos.</p>
          <button type="button" onClick={() => setFiltros((f) => ({ ...f }))} className="btn btn-ghost mt-3">
            Reintentar
          </button>
        </div>
      ) : filas.length === 0 ? (
        <div className="card p-6 text-center text-sm">
          <p className="text-ink-muted">Ningún encargo coincide con la búsqueda o los filtros.</p>
          {hayFiltro(filtros) && (
            <button type="button" onClick={quitarFiltros} className="btn btn-ghost mt-3">
              Quitar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filas.map((f) => {
            const desplegado = abierto === f.id;
            return (
              <article key={f.id} className="card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAbierto(desplegado ? null : f.id)}
                  className="flex w-full items-center gap-4 p-5 text-left"
                  aria-expanded={desplegado}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold text-ink">{f.servicio}</h3>
                      <EtiquetaServicio tipo={f.tipoServicio} />
                      {f.esPrueba && (
                        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-subtle">
                          Prueba
                        </span>
                      )}
                      <ChipEstado cambios={seguimiento.get(f.id) ?? []} tipo={f.tipoServicio} />
                      {f.plantilla && (
                        <span className="rounded-full border border-accent/30 px-2 py-0.5 text-[11px] text-accent">
                          Plantilla: {f.plantilla.nombre}
                          {f.plantilla.precio_desde ? ` · desde ${solesEnteros(f.plantilla.precio_desde)}` : ''}
                        </span>
                      )}
                      {f.objetivo && (
                        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-muted">
                          Objetivo: {etiquetaDe(OBJETIVOS_WEB, f.objetivo)}
                        </span>
                      )}
                      {f.presupuesto && (
                        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-muted">
                          {etiquetaDe(PRESUPUESTOS, f.presupuesto)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-subtle">
                      {f.respuestas} respuestas ·{' '}
                      {new Date(f.creadoEn).toLocaleDateString('es', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {f.semanas ? ` · ~${f.semanas} semanas` : ''}
                      {!f.tieneDocumentacion && <span className="text-caution"> · documentación pendiente</span>}
                      {f.cliente && <span> · {f.cliente}</span>}
                      {f.ingeniero && <span> · lo lleva {f.ingeniero}</span>}
                      {f.responsable && <span> · a cargo de {f.responsable}</span>}
                    </p>
                  </div>
                  <span className="shrink-0 text-ink-subtle">{desplegado ? '−' : '+'}</span>
                </button>

                {desplegado && (
                  <DetalleEncargo
                    fila={f}
                    detalle={detalles.get(f.id)}
                    onDetalle={guardarDetalle}
                    cambios={seguimiento.get(f.id) ?? []}
                    equipo={equipo}
                    onResponsable={(id, nombre) => actualizarFila(f.id, { responsableId: id, responsable: nombre })}
                    onCambio={(cambio) => {
                      setSeguimiento((previo) => new Map(previo).set(f.id, [...(previo.get(f.id) ?? []), cambio]));
                      actualizarFila(f.id, { estado: cambio.estado });
                      setVersionConteo((v) => v + 1);
                    }}
                    onDocumentada={(documentacion) =>
                      actualizarFila(f.id, {
                        tieneDocumentacion: true,
                        semanas: documentacion.estimacion?.semanas ?? null,
                      })
                    }
                  />
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* ---------------------------------------------------------- cargar más */}
      {!cargando && filas.length > 0 && (
        <div className="mt-5 flex flex-col items-center gap-2">
          <p className="text-xs text-ink-subtle tabular-nums">
            Mostrando {filas.length} de {lista?.total ?? filas.length}
          </p>
          {restantes > 0 && (
            <button type="button" onClick={() => void cargarMas()} disabled={cargandoMas} className="btn btn-ghost">
              {cargandoMas ? 'Cargando…' : `Cargar ${Math.min(ENCARGOS_POR_PAGINA, restantes)} más`}
            </button>
          )}
          {falloMas && (
            <p role="alert" className="text-xs text-negative">
              No se pudieron cargar más. Vuelve a intentarlo.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Lo que se ve al abrir un encargo. Lo pide la primera vez que se abre (sin
 * la maqueta, que solo se baja al descargarla) y lo guarda el padre.
 */
function DetalleEncargo({
  fila,
  detalle,
  onDetalle,
  cambios,
  equipo,
  onResponsable,
  onCambio,
  onDocumentada,
}: {
  fila: EncargoFila;
  detalle: ProyectoCompleto | undefined;
  onDetalle: (detalle: ProyectoCompleto) => void;
  cambios: CambioEstado[];
  equipo: MiEquipo | null;
  onResponsable: (id: string | null, nombre: string | null) => void;
  onCambio: (cambio: CambioEstado) => void;
  onDocumentada: (documentacion: Documentacion) => void;
}) {
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    if (detalle) return;
    let vigente = true;
    void cargarEncargo(fila.id).then((d) => {
      if (!vigente) return;
      if (d) onDetalle(d);
      else setFallo(true);
    });
    return () => {
      vigente = false;
    };
  }, [fila.id, detalle, onDetalle]);

  if (!detalle) {
    return (
      <p className="border-t border-line p-5 text-sm text-ink-subtle" role={fallo ? 'alert' : 'status'}>
        {fallo ? 'No se pudo abrir el encargo. Ciérralo y vuelve a abrirlo.' : 'Abriendo el encargo…'}
      </p>
    );
  }

  const doc = detalle.documentacion;

  return (
    <div className="animate-fade-up border-t border-line p-5 pt-6">
      <DatosCliente encargo={detalle} />
      {equipo?.rol === 'dueno' && fila.ingenieroId === equipo.dueno_id && (
        <ResponsableEncargo
          proyectoId={fila.id}
          responsableId={fila.responsableId}
          equipo={equipo}
          onCambio={onResponsable}
        />
      )}
      <PropuestaEncargo encargo={detalle} />
      <ResenaEncargo encargo={detalle} publicada={cambios.at(-1)?.estado === 'publicada'} />
      <EditorSeguimiento encargo={detalle} cambios={cambios} onCambio={onCambio} />
      {!doc ? (
        <SinDocumentacion
          encargo={detalle}
          onLista={(documentacion) => {
            onDetalle({ ...detalle, documentacion });
            onDocumentada(documentacion);
          }}
        />
      ) : (
        <DocumentacionTecnica doc={doc} />
      )}

      {/* Fuera de la rama anterior: la maqueta se puede descargar
          aunque la documentación aún no esté. */}
      <div className="mt-6 flex flex-wrap gap-2">
        {doc && (
          <button type="button" onClick={() => descargarDoc(detalle)} className="btn btn-ghost">
            Descargar documentación (JSON)
          </button>
        )}
        {fila.tieneMaqueta && <BotonMaqueta id={fila.id} />}
      </div>
    </div>
  );
}

/** La maqueta completa pesa unos 100 KB: se pide solo al descargarla. */
function BotonMaqueta({ id }: { id: string }) {
  const [estado, setEstado] = useState<'listo' | 'preparando' | 'fallo'>('listo');

  const descargar = async () => {
    setEstado('preparando');
    const completo = await cargarProyecto(id);
    setEstado(completo && descargarMaqueta(completo) ? 'listo' : 'fallo');
  };

  return (
    <button type="button" onClick={() => void descargar()} disabled={estado === 'preparando'} className="btn btn-ghost">
      {estado === 'preparando'
        ? 'Preparando la maqueta…'
        : estado === 'fallo'
          ? 'No se pudo descargar: reintentar'
          : 'Descargar maqueta (index.html)'}
    </button>
  );
}

/** La documentación técnica, por bloques. */
function DocumentacionTecnica({ doc }: { doc: Documentacion }) {
  return (
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
            <div key={m.entidad} className="rounded-lg border border-line bg-surface-deep/40 p-3">
              <p className="font-medium text-ink">{m.entidad}</p>
              <p className="mt-1 font-mono text-xs text-ink-muted">{m.campos?.join(', ')}</p>
              {m.relaciones && <p className="mt-1 text-xs text-ink-subtle">{m.relaciones}</p>}
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
          <p className="mt-2 text-xs text-ink-subtle">{doc.stack_sugerido.justificacion}</p>
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
  );
}

/**
 * Con quién hablar y lo que más cambia el precio, arriba de todo: es lo
 * primero que el ingeniero necesita para responder al encargo.
 */
function DatosCliente({ encargo }: { encargo: ProyectoCompleto }) {
  const c = encargo.contacto;
  // También las preguntas propias del ingeniero ("ing-"), que su cliente de
  // enlace responde en el formulario.
  const alcance = encargo.historial.filter((h) => h.question_id.startsWith('alcance-') || h.question_id.startsWith('ing-'));

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
function EtiquetaServicio({ tipo }: { tipo?: TipoServicio }) {
  const texto = tipo ? `${obtenerServicio(tipo).icono} ${obtenerServicio(tipo).nombre}` : '💻 Software';
  return (
    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
      {texto}
    </span>
  );
}

/** false si el proyecto no tiene maqueta que descargar. */
function descargarMaqueta(encargo: ProyectoCompleto): boolean {
  if (!encargo.ficha) return false;
  // Las maquetas de plantilla se guardan ya completas; las generadas por IA,
  // solo el cuerpo, y se montan aquí.
  const documento =
    (encargo.documento ? conAnimaciones(encargo.documento) : null) ??
    (encargo.html ? construirDocumento(encargo.html, encargo.ficha) : null);
  if (!documento) return false;
  const url = URL.createObjectURL(new Blob([documento], { type: 'text/html;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `maqueta-${encargo.id.slice(0, 8)}.html`;
  enlace.click();
  URL.revokeObjectURL(url);
  return true;
}
