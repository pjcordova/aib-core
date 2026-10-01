import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { normalizarWhatsapp } from '../lib/contacto';
import { PREGUNTAS_ENCARGO, type TipoServicio } from '../lib/servicios';
import type { QAHistory } from '../Types/productOwner';

export interface DatosEncargo {
  contacto: { nombre: string; whatsapp: string };
  /** Respuestas de alcance, en el formato del historial. */
  respuestas: QAHistory[];
}

interface Props {
  /** Las preguntas de dominio y venta en línea solo salen para páginas web. */
  tipoServicio?: TipoServicio;
  /**
   * Para qué quiere la web (se pregunta al inicio). Si no es para vender, no se
   * le pregunta cómo quiere vender.
   */
  objetivo?: string;
  enviando: boolean;
  error: string | null;
  onEnviar: (datos: DatosEncargo) => void;
  onCancelar: () => void;
}

/**
 * Último paso al aceptar: cómo contactar al cliente y lo que más cambia el
 * precio. Sin esto el ingeniero recibía el encargo sin forma de responder.
 */
export function ContactoEncargo({ tipoServicio, objetivo, enviando, error, onEnviar, onCancelar }: Props) {
  const { session } = useAuth();
  const [nombre, setNombre] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [whatsappTocado, setWhatsappTocado] = useState(false);
  const [elegidas, setElegidas] = useState<Record<string, string>>({});

  const preguntas = PREGUNTAS_ENCARGO.filter((p) => !p.soloWeb || tipoServicio === 'web')
    .filter((p) => p.id !== 'alcance-venta' || !objetivo || objetivo === 'vender')
    .map((p) =>
      // Ya dijo que quiere vender: solo falta saber cómo.
      p.id === 'alcance-venta' && objetivo === 'vender'
        ? { ...p, titulo: '¿Cómo quieres vender por tu web?', opciones: p.opciones.filter((o) => o.valor !== 'vitrina') }
        : p
    );
  const numero = normalizarWhatsapp(whatsapp);
  const completo = nombre.trim().length >= 2 && !!numero && preguntas.every((p) => elegidas[p.id]);

  // Escape cierra, como cualquier diálogo; no mientras se envía.
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !enviando) onCancelar();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [enviando, onCancelar]);

  const enviar = () => {
    if (!completo || !numero || enviando) return;
    onEnviar({
      contacto: { nombre: nombre.trim(), whatsapp: numero },
      respuestas: preguntas.map((p) => ({
        question_id: p.id,
        question: p.titulo,
        answer: p.opciones.find((o) => o.valor === elegidas[p.id])?.etiqueta ?? elegidas[p.id],
      })),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-contacto"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
        className="card animate-fade-up max-h-[92vh] w-full max-w-lg overflow-y-auto p-6 sm:p-8"
      >
        <p className="text-xs font-medium tracking-widest text-accent uppercase">Último paso</p>
        <h2 id="titulo-contacto" className="mt-1.5 text-xl font-semibold text-balance">
          ¿Cómo te contacta el ingeniero?
        </h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          Te escribirá para mostrarte la propuesta. Estos datos solo los ve el ingeniero de tu
          proyecto.
        </p>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Tu nombre</span>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={80}
              autoComplete="name"
              autoFocus
              className="field w-full"
              placeholder="Ej: María Torres"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Tu WhatsApp</span>
            <input
              type="tel"
              inputMode="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              onBlur={() => setWhatsappTocado(true)}
              maxLength={20}
              autoComplete="tel"
              className="field w-full"
              placeholder="Ej: 987 654 321"
              aria-invalid={whatsappTocado && !numero}
              aria-describedby="ayuda-whatsapp"
            />
            <span
              id="ayuda-whatsapp"
              className={'mt-1 block text-xs ' + (whatsappTocado && !numero ? 'text-negative' : 'text-ink-subtle')}
            >
              {whatsappTocado && !numero
                ? 'Escribe un celular de 9 dígitos, o uno de otro país empezando por +.'
                : 'Celular peruano de 9 dígitos. Si es de otro país, empieza por +.'}
            </span>
          </label>
        </div>

        {preguntas.map((p) => (
          <fieldset key={p.id} className="mt-6">
            <legend className="mb-2 text-sm font-medium text-ink">{p.titulo}</legend>
            <div className="flex flex-wrap gap-2">
              {p.opciones.map((o) => {
                const elegida = elegidas[p.id] === o.valor;
                return (
                  <button
                    key={o.valor}
                    type="button"
                    onClick={() => setElegidas((prev) => ({ ...prev, [p.id]: o.valor }))}
                    aria-pressed={elegida}
                    className={
                      'rounded-full border px-3.5 py-1.5 text-sm transition-colors ' +
                      (elegida
                        ? 'border-accent bg-accent/15 text-ink'
                        : 'border-line bg-surface-overlay/50 text-ink-muted hover:border-accent/50 hover:text-ink')
                    }
                  >
                    {elegida ? '✓ ' : ''}
                    {o.etiqueta}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        {session?.user.email && (
          <p className="mt-6 text-xs text-ink-subtle">
            También te escribiremos a {session.user.email}.
          </p>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancelar} disabled={enviando} className="btn btn-ghost">
            Volver
          </button>
          <button type="submit" disabled={!completo || enviando} className="btn btn-primary">
            {enviando ? 'Enviando…' : 'Enviar al ingeniero'}
          </button>
        </div>
      </form>
    </div>
  );
}
