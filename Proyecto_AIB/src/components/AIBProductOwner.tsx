import { useState, useEffect, useCallback, useRef } from 'react';
import type { QAHistory, AIBQuestion } from '../Types/productOwner';
import { generarPreguntas, generarPrototipo, ApiError, type TokenUsage } from '../lib/api';
import { PrototypePreview } from './PrototypePreview';
import { ErrorState, ProgressTrail, QuestionSkeleton } from './ui/Primitives';

interface Props {
  servicioInicial: string;
  onComplete?: (historial: QAHistory[]) => void;
}

/** Fases del flujo. Un estado explícito evita las banderas booleanas cruzadas. */
type Fase = 'preguntando' | 'construyendo' | 'listo' | 'error';

/** Techo de rondas de discovery. Cortafuegos de gasto, no una regla de producto. */
const MAX_RONDAS = 15;

export const AIBProductOwner = ({ servicioInicial, onComplete }: Props) => {
  const [fase, setFase] = useState<Fase>('preguntando');
  const [historial, setHistorial] = useState<QAHistory[]>([]);
  const [preguntas, setPreguntas] = useState<AIBQuestion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [respuestasTexto, setRespuestasTexto] = useState<Record<string, string>>({});
  const [codigo, setCodigo] = useState('');
  const [consumo, setConsumo] = useState<TokenUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Guarda la última acción fallida para que "Reintentar" repita exactamente esa.
  const reintentar = useRef<(() => void) | null>(null);

  // --- Salvaguardas contra peticiones en bucle -----------------------------
  // `onComplete` se recrea en cada render del padre. Si entra como dependencia
  // de un useCallback que a su vez alimenta un useEffect, cada render del padre
  // vuelve a disparar el efecto y se abre una petición nueva: un bucle que gasta
  // dinero real. Guardándolo en una ref, el callback deja de cambiar de
  // identidad y el efecto se ejecuta una sola vez.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  // Cinturón y tirantes: aunque algo vuelva a disparar el efecto, ni se solapan
  // peticiones ni se puede gastar sin techo.
  const enVuelo = useRef(false);
  const rondas = useRef(0);

  const construirPrototipo = useCallback(async (servicio: string, hist: QAHistory[]) => {
    setFase('construyendo');
    setError(null);
    try {
      const { code, usage } = await generarPrototipo(servicio, hist);
      setCodigo(code);
      setConsumo(usage ?? null);
      setFase('listo');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Error inesperado generando el prototipo.');
      setFase('error');
      reintentar.current = () => void construirPrototipo(servicio, hist);
    }
  }, []);

  const pedirPreguntas = useCallback(
    async (servicio: string, hist: QAHistory[]) => {
      // Nunca dos rondas a la vez.
      if (enVuelo.current) return;

      if (rondas.current >= MAX_RONDAS) {
        setError(
          `El discovery superó las ${MAX_RONDAS} rondas sin cerrarse. Se ha detenido para no seguir consumiendo API.`
        );
        setFase('error');
        setCargando(false);
        return;
      }

      enVuelo.current = true;
      rondas.current += 1;
      setCargando(true);
      setError(null);

      try {
        const data = await generarPreguntas(servicio, hist);

        if (data.is_complete) {
          onCompleteRef.current?.(hist);
          await construirPrototipo(servicio, hist);
          return;
        }

        setPreguntas(data.questions ?? []);
        setFase('preguntando');
      } catch (e) {
        setError(
          e instanceof ApiError ? e.message : 'Error inesperado consultando al Product Owner.'
        );
        setFase('error');
        reintentar.current = () => {
          rondas.current = Math.max(0, rondas.current - 1); // el reintento no penaliza
          void pedirPreguntas(servicio, hist);
        };
      } finally {
        enVuelo.current = false;
        setCargando(false);
      }
    },
    [construirPrototipo]
  );

  // Depende solo del servicio: `pedirPreguntas` ya no cambia de identidad.
  useEffect(() => {
    rondas.current = 0;
    void pedirPreguntas(servicioInicial, []);
  }, [servicioInicial, pedirPreguntas]);

  const responder = (pregunta: AIBQuestion, respuesta: string) => {
    const siguiente: QAHistory[] = [
      ...historial,
      { question_id: pregunta.id, question: pregunta.text, answer: respuesta },
    ];
    setHistorial(siguiente);

    const restantes = preguntas.filter((q) => q.id !== pregunta.id);
    if (restantes.length === 0) {
      setPreguntas([]);
      void pedirPreguntas(servicioInicial, siguiente);
    } else {
      setPreguntas(restantes);
    }
  };

  const enviarTexto = (pregunta: AIBQuestion) => {
    const respuesta = respuestasTexto[pregunta.id]?.trim();
    if (!respuesta) return;
    responder(pregunta, respuesta);
  };

  /* ----------------------------------------------------------------- error */

  if (fase === 'error' && error) {
    return (
      <div className="py-16">
        <ErrorState
          message={error}
          onRetry={() => {
            const accion = reintentar.current;
            if (accion) accion();
          }}
        />
      </div>
    );
  }

  /* ------------------------------------------------------------- prototipo */

  if (fase === 'listo' && codigo) {
    return (
      <PrototypePreview
        code={codigo}
        servicio={servicioInicial}
        respuestas={historial.length}
        usage={consumo}
        onRegenerar={() => void construirPrototipo(servicioInicial, historial)}
      />
    );
  }

  /* ---------------------------------------------------------- construyendo */

  if (fase === 'construyendo') {
    return <PantallaConstruyendo respuestas={historial.length} />;
  }

  /* ------------------------------------------------------------- discovery */

  return (
    <div className="mx-auto max-w-3xl py-8">
      <div className="mb-8">
        <ProgressTrail answered={historial.length} label="Discovery en curso" />
      </div>

      {historial.length > 0 && (
        <ol className="mb-8 space-y-2">
          {historial.map((item, idx) => (
            <li
              key={item.question_id + idx}
              className="animate-fade-up rounded-xl border border-line bg-surface-raised/40 px-4 py-3"
            >
              <p className="text-xs text-ink-subtle">{item.question}</p>
              <p className="mt-0.5 font-medium text-ink">{item.answer}</p>
            </li>
          ))}
        </ol>
      )}

      {cargando ? (
        <QuestionSkeleton />
      ) : (
        <div className="space-y-4">
          {preguntas.map((q) => (
            <article key={q.id} className="card animate-fade-up p-6 sm:p-7">
              <h2 className="text-lg font-semibold text-balance">{q.text}</h2>

              {q.type === 'multiple_choice' && q.options?.length ? (
                <div className="mt-5 grid gap-2">
                  {q.options.map((opcion) => (
                    <button
                      key={opcion}
                      type="button"
                      onClick={() => responder(q, opcion)}
                      className="group flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-overlay/50 px-4 py-3 text-left text-[15px] transition-all hover:border-accent/60 hover:bg-surface-overlay"
                    >
                      <span>{opcion}</span>
                      <span
                        aria-hidden="true"
                        className="text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        →
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    enviarTexto(q);
                  }}
                  className="mt-5 flex flex-col gap-2 sm:flex-row"
                >
                  <input
                    type="text"
                    value={respuestasTexto[q.id] ?? ''}
                    onChange={(e) =>
                      setRespuestasTexto({ ...respuestasTexto, [q.id]: e.target.value })
                    }
                    placeholder="Escribe tu respuesta…"
                    className="field flex-1"
                    aria-label={q.text}
                  />
                  <button
                    type="submit"
                    disabled={!respuestasTexto[q.id]?.trim()}
                    className="btn btn-primary"
                  >
                    Enviar
                  </button>
                </form>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */

const PASOS = [
  'Cerrando el discovery',
  'Definiendo la arquitectura de la interfaz',
  'Escribiendo los componentes React',
  'Compilando la vista previa',
];

/**
 * Pantalla de construcción. Generar el dashboard tarda cerca de un minuto, así
 * que en vez de un spinner mudo vamos contando qué está pasando: una espera
 * larga con explicación se percibe bastante más corta que una sin ella.
 */
function PantallaConstruyendo({ respuestas }: { respuestas: number }) {
  const [paso, setPaso] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPaso((p) => Math.min(p + 1, PASOS.length - 1));
    }, 9000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="animate-fade-up mx-auto max-w-lg py-20 text-center">
      <div className="relative mx-auto mb-8 h-16 w-16">
        <div className="absolute inset-0 animate-ping rounded-full bg-accent/20" />
        <div className="absolute inset-0 grid place-items-center rounded-full border border-accent/40 bg-surface-raised">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" />
        </div>
      </div>

      <h2 className="text-2xl font-semibold">Construyendo tu interfaz</h2>
      <p className="mt-2 text-sm text-ink-muted">
        El Product Owner cerró el discovery con {respuestas}{' '}
        {respuestas === 1 ? 'respuesta' : 'respuestas'}. Ahora AIB+ programa y compila el
        código React en tiempo real.
      </p>

      <ul className="mt-9 space-y-3 text-left">
        {PASOS.map((texto, i) => (
          <li key={texto} className="flex items-center gap-3 text-sm">
            <span
              className={
                'grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] transition-colors ' +
                (i < paso
                  ? 'border-positive bg-positive/15 text-positive'
                  : i === paso
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-line text-ink-subtle')
              }
            >
              {i < paso ? '✓' : i + 1}
            </span>
            <span className={i <= paso ? 'text-ink' : 'text-ink-subtle'}>{texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
