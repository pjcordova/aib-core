import { useState, type ReactNode } from 'react';
import { avisarRespuestaEntrega } from '../../lib/api';
import { enlaceWhatsapp } from '../../lib/contacto';
import {
  ETIQUETA_HITO,
  entregarHito,
  marcarCobroHito,
  responderEntrega,
  textoPlazo,
  type Hito,
} from '../../lib/propuestas';
import { solesEnteros } from '../../lib/servicios';

// ---------------------------------------------------------------------------
// Entregas de una propuesta por etapas
// ---------------------------------------------------------------------------
// Con la propuesta aceptada, el ingeniero entrega cada etapa (una nota y, si
// quiere, un enlace para verla); el cliente la revisa con el enlace de la
// propuesta, la aprueba o pide ajustes, y le paga esa etapa al aprobarla. El
// ingeniero marca lo que cobró (supabase_entregas.sql).
// ---------------------------------------------------------------------------

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'long' });

/** Número, nombre, estado y monto de una etapa; debajo, lo que le toca a cada uno. */
function Etapa({ hito: h, ultima, children }: { hito: Hito; ultima: boolean; children?: ReactNode }) {
  const etiqueta = ETIQUETA_HITO[h.estado];
  const aprobada = h.estado === 'aprobado';
  return (
    <li className={'relative flex gap-3 ' + (ultima ? '' : 'pb-5')}>
      {!ultima && <span aria-hidden="true" className="absolute top-8 bottom-1 left-[13px] w-px bg-line" />}
      <span
        className={
          'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ' +
          (aprobada ? 'bg-positive text-white' : 'bg-accent/10 text-accent')
        }
        aria-hidden="true"
      >
        {aprobada ? '✓' : h.orden}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-medium text-ink">{h.titulo}</p>
          <span className={'rounded-full px-2 py-0.5 text-[11px] font-medium ' + etiqueta.clase}>{etiqueta.texto}</span>
          <span className="ml-auto text-sm text-ink tabular-nums">{solesEnteros(h.monto)}</span>
        </div>
        {children}
      </div>
    </li>
  );
}

/** Lo que entregó el ingeniero: cuándo, su nota y el enlace. */
function DetalleEntrega({ hito: h }: { hito: Hito }) {
  if (!h.entregado_en) return null;
  return (
    <div className="mt-2 rounded-lg bg-surface-overlay/60 px-3 py-2 text-sm">
      <p className="text-xs text-ink-subtle">Entregada el {fecha(h.entregado_en)}</p>
      {h.entrega_nota && <p className="mt-1 whitespace-pre-line text-ink">{h.entrega_nota}</p>}
      {h.entrega_enlace && (
        <a
          href={h.entrega_enlace}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-1 inline-block font-medium text-accent hover:underline"
        >
          Ver la entrega ↗
        </a>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ cliente

/** En la página de la propuesta: el cliente revisa cada entrega. */
export function EntregasCliente({
  token,
  hitos,
  ingeniero,
  onCambio,
}: {
  token: string;
  hitos: Hito[];
  /** Su primer nombre, o «tu ingeniero». */
  ingeniero: string;
  onCambio: () => Promise<void>;
}) {
  const [ajustando, setAjustando] = useState<string | null>(null);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const aprobadas = hitos.filter((h) => h.estado === 'aprobado').length;
  const Quien = ingeniero.charAt(0).toUpperCase() + ingeniero.slice(1);

  const responder = async (h: Hito, aprueba: boolean) => {
    if (!aprueba && comentario.trim().length < 3) {
      setError(`Cuéntale a ${ingeniero} qué ajustar.`);
      return;
    }
    setEnviando(true);
    setError('');
    const r = await responderEntrega(token, h.id, aprueba, aprueba ? '' : comentario.trim());
    if (r === 'ok') {
      void avisarRespuestaEntrega(token);
      setAjustando(null);
      setComentario('');
    } else {
      setError(
        r === 'no_entregado'
          ? 'Esta entrega ya fue respondida.'
          : 'No pudimos guardar tu respuesta. Vuelve a intentarlo.',
      );
    }
    await onCambio();
    setEnviando(false);
  };

  return (
    <section className="card p-5" aria-label="Entregas">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Entregas</h2>
        <p className="text-sm text-ink-muted tabular-nums">
          {aprobadas} de {hitos.length} aprobadas
        </p>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        {Quien} te avisa cuando termina cada etapa. Revísala: le pagas esa etapa cuando la apruebas.
      </p>

      <ol className="mt-5">
        {hitos.map((h, i) => (
          <Etapa key={h.id} hito={h} ultima={i === hitos.length - 1}>
            {h.estado === 'pendiente' && (
              <p className="mt-0.5 text-sm text-ink-subtle">En camino · {textoPlazo(h.dias)}</p>
            )}
            <DetalleEntrega hito={h} />

            {h.estado === 'entregado' &&
              (ajustando === h.id ? (
                <div className="mt-3">
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium text-ink">¿Qué hay que ajustar?</span>
                    <textarea
                      value={comentario}
                      onChange={(e) => setComentario(e.target.value.slice(0, 500))}
                      rows={3}
                      className="field"
                      placeholder="Ej: Me gustaría el menú en azul y la foto de portada más grande."
                      autoFocus
                    />
                  </label>
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => setAjustando(null)} className="btn btn-ghost">
                      Volver
                    </button>
                    <button
                      type="button"
                      onClick={() => void responder(h, false)}
                      disabled={enviando}
                      className="btn btn-primary"
                    >
                      {enviando ? 'Enviando…' : `Enviar a ${ingeniero}`}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    disabled={enviando}
                    onClick={() => {
                      if (
                        window.confirm(
                          `¿Apruebas la etapa «${h.titulo}»? Corresponde pagarle ${solesEnteros(h.monto)} a ${ingeniero}.`,
                        )
                      ) {
                        void responder(h, true);
                      }
                    }}
                    className="btn btn-primary"
                  >
                    {enviando ? 'Guardando…' : 'Aprobar entrega'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAjustando(h.id);
                      setComentario('');
                      setError('');
                    }}
                    className="btn btn-ghost"
                  >
                    Pedir ajustes
                  </button>
                </div>
              ))}

            {h.estado === 'ajustes' && (
              <p className="mt-2 text-sm text-ink-muted">
                Pediste ajustes{h.respuesta_cliente ? `: «${h.respuesta_cliente}»` : ''}. {Quien} te avisará cuando
                estén listos.
              </p>
            )}
            {h.estado === 'aprobado' && h.respondido_en && (
              <p className="mt-1 text-xs text-ink-subtle">Aprobaste esta etapa el {fecha(h.respondido_en)}.</p>
            )}
          </Etapa>
        ))}
      </ol>

      {error && (
        <p role="alert" className="mt-3 text-sm text-negative">
          {error}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- ingeniero

/** En el encargo: el ingeniero entrega cada etapa y marca lo que cobró. */
export function EntregasIngeniero({
  hitos,
  enlace,
  nombreCliente,
  whatsappCliente,
  onCambio,
}: {
  hitos: Hito[];
  /** El enlace de la propuesta, donde el cliente revisa. */
  enlace: string;
  nombreCliente: string;
  whatsappCliente: string | null;
  onCambio: () => Promise<void>;
}) {
  const [entregando, setEntregando] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [enlaceEntrega, setEnlaceEntrega] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  const aprobadas = hitos.filter((h) => h.estado === 'aprobado').length;
  const cobrado = hitos.reduce((suma, h) => suma + (h.cobrado_en ? h.monto : 0), 0);
  const total = hitos.reduce((suma, h) => suma + h.monto, 0);
  const cliente = nombreCliente || 'El cliente';

  // Se entrega en orden: la siguiente, cuando las anteriores ya se entregaron.
  const puedeEntregar = (i: number) =>
    hitos[i].estado !== 'aprobado' && hitos.slice(0, i).every((h) => h.estado !== 'pendiente');

  const avisoWhatsapp = (h: Hito) =>
    whatsappCliente
      ? enlaceWhatsapp(
          whatsappCliente,
          `Hola ${nombreCliente}, ya está lista la etapa «${h.titulo}». Revísala y apruébala aquí: ${enlace}`,
        )
      : null;

  const abrir = (h: Hito) => {
    setEntregando(h.id);
    setNota(h.estado === 'entregado' ? (h.entrega_nota ?? '') : '');
    setEnlaceEntrega(h.estado === 'entregado' ? (h.entrega_enlace ?? '') : '');
    setError('');
  };

  const entregar = async (h: Hito) => {
    const url = enlaceEntrega.trim();
    if (url && !/^https?:\/\/[^\s<>"]{3,}$/i.test(url)) {
      setError('El enlace debe empezar con https:// (o déjalo vacío).');
      return;
    }
    setOcupado(true);
    setError('');
    const r = await entregarHito(h.id, nota.trim(), url);
    if (r === 'ok') setEntregando(null);
    else
      setError(
        r === 'ya_aprobado'
          ? 'El cliente ya aprobó esta etapa.'
          : 'No se pudo guardar la entrega. Vuelve a intentarlo.',
      );
    await onCambio();
    setOcupado(false);
  };

  const cobrar = async (h: Hito, valor: boolean) => {
    setOcupado(true);
    setError('');
    if (!(await marcarCobroHito(h.id, valor))) setError('No se pudo guardar. Vuelve a intentarlo.');
    await onCambio();
    setOcupado(false);
  };

  return (
    <div className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink">
          ¡Aceptada! Entregas: {aprobadas} de {hitos.length} aprobadas
        </p>
        <p className="text-xs text-ink-muted tabular-nums">
          Cobrado {solesEnteros(cobrado)} de {solesEnteros(total)}
        </p>
      </div>

      <ol className="mt-4">
        {hitos.map((h, i) => {
          const whatsapp = avisoWhatsapp(h);
          return (
            <Etapa key={h.id} hito={h} ultima={i === hitos.length - 1}>
              {h.estado === 'pendiente' && <p className="mt-0.5 text-sm text-ink-subtle">{textoPlazo(h.dias)}</p>}
              <DetalleEntrega hito={h} />

              {h.estado === 'ajustes' && h.respuesta_cliente && (
                <p className="mt-2 rounded-lg border border-accent-alt/50 bg-accent-alt/10 px-3 py-2 text-sm text-ink">
                  <strong>{cliente} pidió ajustes:</strong> «{h.respuesta_cliente}»
                </p>
              )}
              {h.estado === 'aprobado' && h.respondido_en && (
                <p className="mt-1 text-xs text-ink-subtle">
                  {cliente} la aprobó el {fecha(h.respondido_en)}
                  {h.respuesta_cliente ? `: «${h.respuesta_cliente}»` : '.'}
                </p>
              )}

              {entregando === h.id ? (
                <div className="mt-3 space-y-2">
                  <label className="block text-sm">
                    <span className="mb-1 block text-ink-muted">Qué entregas</span>
                    <textarea
                      value={nota}
                      onChange={(e) => setNota(e.target.value.replace(/[<>]/g, '').slice(0, 500))}
                      rows={3}
                      className="field"
                      placeholder="Ej: Te dejo el diseño de la portada y de la página de servicios."
                      autoFocus
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-ink-muted">Enlace para verla (opcional)</span>
                    <input
                      value={enlaceEntrega}
                      onChange={(e) => setEnlaceEntrega(e.target.value.slice(0, 300))}
                      inputMode="url"
                      placeholder="https://"
                      className="field"
                    />
                  </label>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => setEntregando(null)} className="btn btn-ghost">
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void entregar(h)}
                      disabled={ocupado}
                      className="btn btn-primary"
                    >
                      {ocupado ? 'Guardando…' : 'Marcar como entregada'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  {h.estado === 'entregado' ? (
                    <>
                      <span className="text-ink-muted">Esperando que {nombreCliente || 'el cliente'} la revise.</span>
                      {whatsapp && (
                        <a
                          href={whatsapp}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-accent hover:underline"
                        >
                          Avisarle por WhatsApp
                        </a>
                      )}
                      <button type="button" onClick={() => abrir(h)} className="text-ink-muted hover:text-ink">
                        Corregir la entrega
                      </button>
                    </>
                  ) : (
                    puedeEntregar(i) && (
                      <button type="button" onClick={() => abrir(h)} className="btn btn-primary !py-1.5 text-sm">
                        {h.estado === 'ajustes' ? 'Entregar con los ajustes' : 'Marcar como entregada'}
                      </button>
                    )
                  )}
                  <label className="ml-auto inline-flex items-center gap-1.5 text-ink">
                    <input
                      type="checkbox"
                      checked={!!h.cobrado_en}
                      disabled={ocupado}
                      onChange={(e) => void cobrar(h, e.target.checked)}
                    />
                    Cobrada
                  </label>
                </div>
              )}
            </Etapa>
          );
        })}
      </ol>

      {error && (
        <p role="alert" className="mt-3 text-sm text-negative">
          {error}
        </p>
      )}
      <p className="mt-3 text-[11px] text-ink-subtle">
        Al marcarla como entregada, {nombreCliente || 'el cliente'} la revisa con el enlace de la propuesta (si guardó
        su proyecto, le llega un correo). Los cobros solo los ves tú (y tu equipo). AIB+ no cobra comisión.
      </p>
    </div>
  );
}
