import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, preguntarAbi, type AccionAbi } from '../../lib/api';
import {
  guardarAjustes,
  guardarConversacion,
  guardarRecuerdo,
  leerAjustes,
  leerConversacion,
  listarRecuerdos,
  olvidarRecuerdo,
  usoDeLaSemana,
  type AjustesAbi,
  type MensajeAbi,
  type Recuerdo,
  type ResultadoAccion,
} from '../../lib/abi';
import { cambiarEstado, etiquetaEtapa } from '../../lib/seguimiento';
import { crearInvitacion, mensajeInvitacion, urlInvitacion } from '../../lib/invitaciones';
import { AvatarAbi } from './AvatarAbi';

// ---------------------------------------------------------------------------
// Pregúntale a ABI
// ---------------------------------------------------------------------------
// El chat con ABI dentro de «Hoy». ABI lee los datos del ingeniero y propone:
// mensajes de WhatsApp, cambios de etapa, invitaciones y cosas que recordar.
// Cada propuesta es una tarjeta con su botón y la hace el ingeniero, con sus
// propios permisos. Los botones de WhatsApp solo abren el chat con el texto.
// ---------------------------------------------------------------------------

export function ChatAbi({ sugerencias, onCambio }: { sugerencias: string[]; onCambio?: () => void }) {
  const [mensajes, setMensajes] = useState<MensajeAbi[]>(leerConversacion);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verAjustes, setVerAjustes] = useState(false);
  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    guardarConversacion(mensajes);
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [mensajes]);

  const preguntar = async (pregunta: string) => {
    const limpia = pregunta.trim();
    if (!limpia || pensando) return;
    const conPregunta: MensajeAbi[] = [...mensajes, { rol: 'usuario', texto: limpia }];
    setMensajes(conPregunta);
    setTexto('');
    setError(null);
    setPensando(true);
    try {
      const { respuesta, acciones } = await preguntarAbi(conPregunta.map(({ rol, texto: t }) => ({ rol, texto: t })));
      setMensajes([...conPregunta, { rol: 'abi', texto: respuesta, acciones }]);
    } catch (e) {
      // La pregunta vuelve a la caja para reintentar sin reescribirla.
      setMensajes(mensajes);
      setTexto(limpia);
      setError(e instanceof ApiError ? e.message : 'ABI no pudo responder. Vuelve a intentarlo.');
    } finally {
      setPensando(false);
    }
  };

  const marcarResultado = (mensaje: number, accion: number, resultado: ResultadoAccion) =>
    setMensajes((previos) =>
      previos.map((m, i) => (i === mensaje ? { ...m, resultados: { ...m.resultados, [accion]: resultado } } : m))
    );

  return (
    <div className="card mb-8 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-accent uppercase">Pregúntale a ABI</h3>
        <div className="flex gap-1">
          {mensajes.length > 0 && !pensando && (
            <button
              type="button"
              onClick={() => {
                setMensajes([]);
                setError(null);
              }}
              className="rounded-lg px-2 py-1 text-xs text-ink-muted hover:bg-surface-overlay hover:text-ink"
            >
              Nueva conversación
            </button>
          )}
          <button
            type="button"
            onClick={() => setVerAjustes((v) => !v)}
            aria-expanded={verAjustes}
            className="rounded-lg px-2 py-1 text-xs text-ink-muted hover:bg-surface-overlay hover:text-ink"
          >
            Ajustes
          </button>
        </div>
      </div>

      {verAjustes && <AjustesAbiForm onListo={() => setVerAjustes(false)} />}

      {mensajes.length === 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {sugerencias.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void preguntar(s)}
              disabled={pensando}
              className="rounded-full border border-line px-3 py-1.5 text-left text-xs text-ink-muted transition-colors hover:border-accent/50 hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      ) : (
        <div ref={lista} className="mb-3 max-h-[32rem] space-y-4 overflow-y-auto pr-1" aria-live="polite">
          {mensajes.map((m, i) =>
            m.rol === 'usuario' ? (
              <p
                key={i}
                className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-accent/15 px-3.5 py-2 text-sm break-words whitespace-pre-wrap text-ink"
              >
                {m.texto}
              </p>
            ) : (
              <div key={i} className="flex gap-2.5">
                <AvatarAbi tamano={28} />
                <div className="min-w-0 flex-1 space-y-3">
                  <TextoAbi texto={m.texto} />
                  {m.acciones?.map((a, j) => (
                    <TarjetaAccion
                      key={j}
                      accion={a}
                      resultado={m.resultados?.[j]}
                      onResultado={(r) => {
                        marcarResultado(i, j, r);
                        if (r.estado === 'hecha' && a.tipo !== 'recuerdo') onCambio?.();
                      }}
                    />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {pensando && (
        <p className="mb-3 flex items-center gap-2 text-sm text-ink-muted" role="status">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
          ABI está revisando tus datos…
        </p>
      )}
      {error && (
        <p role="alert" className="mb-3 text-sm text-negative">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void preguntar(texto);
        }}
        className="flex items-end gap-2"
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Tu pregunta para ABI</span>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void preguntar(texto);
              }
            }}
            rows={2}
            placeholder="Ej: ¿Qué le respondo a Iris? · Propón una reunión a Atarashi"
            className="field resize-none"
            disabled={pensando}
          />
        </label>
        <button type="submit" disabled={pensando || !texto.trim()} className="btn btn-primary shrink-0">
          Preguntar
        </button>
      </form>
      <p className="mt-2 text-[11px] text-ink-subtle">
        ABI lee tus encargos e invitaciones y te deja los mensajes listos. Nunca envía nada por su cuenta.
      </p>
    </div>
  );
}

/** La tarjeta de cada propuesta de ABI, según lo que propone. */
function TarjetaAccion({
  accion,
  resultado,
  onResultado,
}: {
  accion: AccionAbi;
  resultado: ResultadoAccion | undefined;
  onResultado: (resultado: ResultadoAccion) => void;
}) {
  switch (accion.tipo) {
    case 'whatsapp':
      return <BorradorWhatsapp accion={accion} />;
    case 'etapa':
      return (
        <Propuesta
          titulo={`Cambiar etapa · ${accion.para}`}
          textoConfirmar="Confirmar"
          resultado={resultado}
          onResultado={onResultado}
          hacer={async () => {
            const { cambio, error } = await cambiarEstado(accion.encargoId, accion.etapa, accion.nota);
            return cambio ? { estado: 'hecha' } : (error ?? 'No se pudo cambiar la etapa.');
          }}
          hecho={<>Listo: ahora está en «{etiquetaEtapa(accion.etapa)}».</>}
        >
          <p className="text-sm text-ink">
            {etiquetaEtapa(accion.etapaActual)} → <strong>{etiquetaEtapa(accion.etapa)}</strong>
          </p>
          {accion.nota && (
            <p className="mt-1 text-sm text-ink-muted">
              Nota para el cliente: «{accion.nota}»
            </p>
          )}
        </Propuesta>
      );
    case 'invitacion':
      return (
        <Propuesta
          titulo={`Crear invitación${accion.esPrueba ? ' de prueba' : ''}`}
          textoConfirmar="Crear invitación"
          resultado={resultado}
          onResultado={onResultado}
          hacer={async () => {
            const { token, error } = await crearInvitacion(accion.negocio, accion.esPrueba);
            return token ? { estado: 'hecha', enlace: token } : (error ?? 'No se pudo crear la invitación.');
          }}
          hecho={
            resultado?.estado === 'hecha' && resultado.enlace ? (
              <EnlaceCreado negocio={accion.negocio} token={resultado.enlace} />
            ) : (
              <>Invitación creada.</>
            )
          }
        >
          <p className="text-sm text-ink">{accion.negocio}</p>
        </Propuesta>
      );
    case 'recuerdo':
      return (
        <Propuesta
          titulo="¿Lo recuerdo?"
          textoConfirmar="Recordar"
          resultado={resultado}
          onResultado={onResultado}
          hacer={async () => ((await guardarRecuerdo(accion.texto)) ? { estado: 'hecha' } : 'No se pudo guardar.')}
          hecho={<>Lo recordaré. Puedes verlo u olvidarlo en Ajustes.</>}
        >
          <p className="text-sm text-ink">«{accion.texto}»</p>
        </Propuesta>
      );
  }
}

/**
 * Una propuesta pendiente: se ve qué pasará y no ocurre nada hasta que el
 * ingeniero pulsa el botón. `hacer` devuelve el resultado o un mensaje de error.
 */
function Propuesta({
  titulo,
  textoConfirmar,
  resultado,
  onResultado,
  hacer,
  hecho,
  children,
}: {
  titulo: string;
  textoConfirmar: string;
  resultado: ResultadoAccion | undefined;
  onResultado: (resultado: ResultadoAccion) => void;
  hacer: () => Promise<ResultadoAccion | string>;
  hecho: ReactNode;
  children: ReactNode;
}) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmar = async () => {
    setTrabajando(true);
    setError(null);
    const r = await hacer();
    setTrabajando(false);
    if (typeof r === 'string') setError(r);
    else onResultado(r);
  };

  return (
    <div
      className={
        'rounded-xl border p-3 ' +
        (resultado?.estado === 'hecha' ? 'border-positive/30 bg-positive/5' : 'border-accent/30 bg-accent/5')
      }
    >
      <p
        className={
          'text-[11px] font-semibold tracking-wide uppercase ' +
          (resultado?.estado === 'hecha' ? 'text-positive' : 'text-accent')
        }
      >
        {titulo}
      </p>
      <div className="mt-1.5">{children}</div>
      {resultado?.estado === 'hecha' ? (
        <div className="mt-2 text-sm text-positive">✓ {hecho}</div>
      ) : resultado?.estado === 'descartada' ? (
        <p className="mt-2 text-xs text-ink-subtle">Descartado.</p>
      ) : (
        <>
          {error && (
            <p role="alert" className="mt-2 text-sm text-negative">
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void confirmar()}
              disabled={trabajando}
              className="btn btn-primary !px-3 !py-1.5 text-xs"
            >
              {trabajando ? 'Un momento…' : textoConfirmar}
            </button>
            <button
              type="button"
              onClick={() => onResultado({ estado: 'descartada' })}
              disabled={trabajando}
              className="btn btn-ghost !px-3 !py-1.5 text-xs"
            >
              Descartar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** La invitación recién creada desde ABI, lista para mandarla. */
function EnlaceCreado({ negocio, token }: { negocio: string; token: string }) {
  const [copiado, setCopiado] = useState(false);
  const url = urlInvitacion(token);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };
  return (
    <span className="block">
      Invitación creada.
      <span className="mt-1 block font-mono text-xs break-all text-ink-muted">{url}</span>
      <span className="mt-2 flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(mensajeInvitacion({ negocio, token }))}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary !px-3 !py-1.5 text-xs"
        >
          Enviar por WhatsApp
        </a>
        <button type="button" onClick={() => void copiar()} className="btn btn-ghost !px-3 !py-1.5 text-xs">
          {copiado ? '✓ Copiado' : 'Copiar enlace'}
        </button>
      </span>
    </span>
  );
}

/** Un borrador de WhatsApp: se abre con el texto escrito y el ingeniero decide si lo envía. */
function BorradorWhatsapp({ accion }: { accion: Extract<AccionAbi, { tipo: 'whatsapp' }> }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(accion.mensaje);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };
  return (
    <div className="rounded-xl border border-positive/30 bg-positive/5 p-3">
      <p className="text-[11px] font-semibold tracking-wide text-positive uppercase">WhatsApp para {accion.para}</p>
      <p className="mt-1.5 text-sm break-words whitespace-pre-wrap text-ink">{accion.mensaje}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={accion.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary !px-3 !py-1.5 text-xs">
          Abrir en WhatsApp
        </a>
        <button type="button" onClick={() => void copiar()} className="btn btn-ghost !px-3 !py-1.5 text-xs">
          {copiado ? '✓ Copiado' : 'Copiar texto'}
        </button>
      </div>
    </div>
  );
}

function AjustesAbiForm({ onListo }: { onListo: () => void }) {
  const [ajustes, setAjustes] = useState<AjustesAbi | null>(null);
  const [recuerdos, setRecuerdos] = useState<Recuerdo[]>([]);
  const [uso, setUso] = useState<{ preguntas: number; costoUsd: number } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    void Promise.all([leerAjustes(), listarRecuerdos(), usoDeLaSemana()]).then(([a, r, u]) => {
      if (!vigente) return;
      setAjustes(a);
      setRecuerdos(r);
      setUso(u);
    });
    return () => {
      vigente = false;
    };
  }, []);

  const olvidar = async (id: number) => {
    setError(null);
    if (await olvidarRecuerdo(id)) setRecuerdos((previos) => previos.filter((r) => r.id !== id));
    else setError('No se pudo olvidar. Vuelve a intentarlo.');
  };

  if (!ajustes) return <p className="mb-4 text-sm text-ink-subtle">Cargando ajustes…</p>;

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const fallo = await guardarAjustes(ajustes);
    setGuardando(false);
    if (fallo) setError(fallo);
    else onListo();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
      className="mb-4 space-y-3 rounded-xl border border-line p-4"
    >
      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-muted">Tu nombre (ABI firma con él los mensajes)</span>
        <input
          type="text"
          value={ajustes.nombre}
          onChange={(e) => setAjustes({ ...ajustes, nombre: e.target.value.slice(0, 80) })}
          placeholder="Ej: Piero"
          className="field"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-muted">Tu enlace para agendar reuniones</span>
        <input
          type="url"
          value={ajustes.enlaceAgenda}
          onChange={(e) => setAjustes({ ...ajustes, enlaceAgenda: e.target.value.slice(0, 300) })}
          placeholder="https://calendar.app.google/…"
          className="field"
        />
        <span className="mt-1.5 block text-[11px] text-ink-subtle">
          Créalo gratis en Google Calendar («Agenda de citas») o en Calendly. ABI lo pone en los mensajes para que el
          cliente elija el horario.
        </span>
      </label>
      <div>
        <p className="mb-1.5 text-sm text-ink-muted">Lo que ABI recuerda</p>
        {recuerdos.length === 0 ? (
          <p className="text-[11px] text-ink-subtle">
            Nada todavía. Dile «recuerda que…» y te propondrá guardarlo.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {recuerdos.map((r) => (
              <li
                key={r.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm text-ink"
              >
                <span className="min-w-0 break-words">{r.texto}</span>
                <button
                  type="button"
                  onClick={() => void olvidar(r.id)}
                  className="shrink-0 text-xs text-ink-subtle hover:text-negative"
                >
                  Olvidar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {uso && (
        <p className="text-[11px] text-ink-subtle">
          Últimos 7 días: {uso.preguntas} {uso.preguntas === 1 ? 'pregunta' : 'preguntas'} a ABI · unos{' '}
          {uso.costoUsd.toFixed(2)} USD (estimado con los tokens que usó)
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={guardando} className="btn btn-primary !px-3 !py-1.5 text-xs">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onListo} className="btn btn-ghost !px-3 !py-1.5 text-xs">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/**
 * Lo que escribe ABI, con el formato sencillo que se le pide: párrafos,
 * listas con guion o número y **negritas**. Sin HTML: se construye con nodos.
 */
function TextoAbi({ texto }: { texto: string }) {
  const bloques: ReactNode[] = [];
  let lista: { ordenada: boolean; items: string[] } | null = null;
  let parrafo: string[] = [];

  const cerrarParrafo = () => {
    if (parrafo.length) {
      bloques.push(
        <p key={bloques.length} className="whitespace-pre-wrap">
          {conNegritas(parrafo.join('\n'))}
        </p>
      );
    }
    parrafo = [];
  };
  const cerrarLista = () => {
    if (lista) {
      const items = lista.items.map((item, i) => <li key={i}>{conNegritas(item)}</li>);
      bloques.push(
        lista.ordenada ? (
          <ol key={bloques.length} className="list-decimal space-y-1 pl-5">
            {items}
          </ol>
        ) : (
          <ul key={bloques.length} className="list-disc space-y-1 pl-5">
            {items}
          </ul>
        )
      );
    }
    lista = null;
  };

  for (const linea of texto.split('\n')) {
    const vineta = /^\s*[-*•]\s+(.*)$/.exec(linea);
    const numero = /^\s*\d+[.)]\s+(.*)$/.exec(linea);
    if (vineta || numero) {
      cerrarParrafo();
      const ordenada = Boolean(numero);
      if (!lista || lista.ordenada !== ordenada) {
        cerrarLista();
        lista = { ordenada, items: [] };
      }
      lista.items.push((vineta ?? numero)![1]);
    } else if (!linea.trim()) {
      cerrarParrafo();
      cerrarLista();
    } else {
      cerrarLista();
      parrafo.push(linea);
    }
  }
  cerrarParrafo();
  cerrarLista();

  return <div className="space-y-2 text-sm break-words text-ink-muted [&_strong]:text-ink">{bloques}</div>;
}

/** **negritas** y *cursivas*; el resto, texto tal cual. */
function conNegritas(texto: string): ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g).map((parte, i) => {
    if (parte.startsWith('**') && parte.endsWith('**') && parte.length > 4) {
      return <strong key={i}>{parte.slice(2, -2)}</strong>;
    }
    if (parte.startsWith('*') && parte.endsWith('*') && parte.length > 2) {
      return <em key={i}>{parte.slice(1, -1)}</em>;
    }
    return parte;
  });
}
