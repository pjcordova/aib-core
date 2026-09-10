import { useState } from 'react';
import { SandpackProvider, SandpackPreview, SandpackCodeEditor } from '@codesandbox/sandpack-react';
import type { TokenUsage } from '../lib/api';

interface Props {
  code: string;
  servicio: string;
  respuestas: number;
  usage?: TokenUsage | null;
  onRegenerar?: () => void;
}

type Vista = 'preview' | 'codigo';

/**
 * Vista previa del prototipo generado.
 *
 * Antes esto era un `<Sandpack>` suelto con la barra azul por encima: sin forma
 * de ver el código, sin descargarlo y sin volver atrás. El prototipo es el
 * entregable del producto, así que aquí se trata como tal.
 */
export const PrototypePreview = ({ code, servicio, respuestas, usage, onRegenerar }: Props) => {
  const [vista, setVista] = useState<Vista>('preview');
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  const descargar = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'App.tsx';
    enlace.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-fade-up py-6">
      {/* ---------------------------------------------------------- cabecera */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-positive/30 bg-positive/10 px-2.5 py-0.5 text-[11px] font-medium text-positive">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-positive" />
              Prototipo en vivo
            </span>
            <span className="text-[11px] text-ink-subtle">
              {respuestas} {respuestas === 1 ? 'respuesta' : 'respuestas'} de discovery
            </span>
          </div>
          <h2 className="truncate text-xl font-semibold" title={servicio}>
            {servicio}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-lg border border-line bg-surface-overlay/60 p-0.5"
            role="tablist"
            aria-label="Cambiar vista"
          >
            {(['preview', 'codigo'] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={vista === v}
                onClick={() => setVista(v)}
                className={
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                  (vista === v
                    ? 'bg-accent text-surface-deep'
                    : 'text-ink-muted hover:text-ink')
                }
              >
                {v === 'preview' ? 'Vista previa' : 'Código'}
              </button>
            ))}
          </div>

          <button type="button" onClick={copiar} className="btn btn-ghost">
            {copiado ? '✓ Copiado' : 'Copiar'}
          </button>
          <button type="button" onClick={descargar} className="btn btn-ghost">
            Descargar
          </button>
          {onRegenerar && (
            <button type="button" onClick={onRegenerar} className="btn btn-primary">
              Regenerar
            </button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------ marco */}
      <div className="overflow-hidden rounded-2xl border border-line shadow-[var(--shadow-lifted)]">
        {/* Barra de ventana: da la sensación de app real, no de iframe suelto. */}
        <div className="flex items-center gap-2 border-b border-line bg-surface-overlay px-4 py-2.5">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-negative/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-caution/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-positive/70" />
          </span>
          <span className="mx-auto rounded-md bg-surface-deep/70 px-3 py-0.5 text-[11px] text-ink-subtle">
            {vista === 'preview' ? 'localhost:3000' : 'App.tsx'}
          </span>
        </div>

        <SandpackProvider
          template="react-ts"
          theme="dark"
          files={{ '/App.tsx': code }}
          options={{ externalResources: ['https://cdn.tailwindcss.com'] }}
        >
          {vista === 'preview' ? (
            <SandpackPreview
              showNavigator={false}
              showOpenInCodeSandbox={false}
              showRefreshButton
              style={{ height: 720 }}
            />
          ) : (
            <SandpackCodeEditor
              showLineNumbers
              showTabs={false}
              readOnly
              style={{ height: 720 }}
            />
          )}
        </SandpackProvider>
      </div>

      {usage && (
        <p className="mt-3 text-right text-[11px] text-ink-subtle tabular-nums">
          Generado con {usage.input_tokens.toLocaleString('es')} tokens de entrada y{' '}
          {usage.output_tokens.toLocaleString('es')} de salida
        </p>
      )}
    </div>
  );
};
