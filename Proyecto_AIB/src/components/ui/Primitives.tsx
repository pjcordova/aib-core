// ---------------------------------------------------------------------------
// Primitivas de UI
// ---------------------------------------------------------------------------
// Piezas pequeñas que se repetían copiadas en varios componentes: la marca, los
// estados de error y vacío, el indicador de progreso. Tenerlas aquí es lo que
// hace que la app se vea como un solo producto y no como cuatro pantallas
// hechas en momentos distintos.
// ---------------------------------------------------------------------------

import type { ReactNode } from 'react';

/* -------------------------------------------------------------------------- */

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="aib-logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" />
          <stop offset="100%" stopColor="var(--color-accent-alt)" />
        </linearGradient>
      </defs>
      <path d="M16 3 L27 16 L16 29 L5 16 Z" fill="url(#aib-logo-gradient)" />
      <path d="M16 9 L22 16 L16 23 L10 16 Z" fill="var(--color-surface-base)" opacity="0.55" />
    </svg>
  );
}

export function Wordmark({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex shrink-0 items-center gap-3">
      <Logo size={30} />
      <div className="leading-tight">
        <div className="text-lg font-bold tracking-tight text-ink">
          AIB<span className="text-accent">+</span>
        </div>
        {/* En móvil el subtítulo se partía en tres líneas y descuadraba la
            cabecera: ahí la marca sola ya identifica el producto. */}
        {subtitle && (
          <div className="hidden text-[11px] whitespace-nowrap tracking-wide text-ink-subtle sm:block">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Estado de error visible. Antes los fallos de red solo se veían en la consola
 * del navegador, de modo que el usuario se quedaba mirando un spinner.
 */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="animate-fade-up flex flex-col items-center gap-4 rounded-2xl border border-negative/30 bg-negative/10 px-6 py-8 text-center"
    >
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="var(--color-negative)" strokeWidth="1.5" />
        <path d="M12 7.5v5" stroke="var(--color-negative)" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="16" r="1" fill="var(--color-negative)" />
      </svg>
      <div>
        <p className="font-semibold text-ink">Algo se ha roto</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{message}</p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-ghost">
          Reintentar
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Barra de avance del discovery: cuántas respuestas lleva el cliente. */
export function ProgressTrail({ answered, label }: { answered: number; label: string }) {
  // El discovery no tiene un número fijo de preguntas, así que en vez de un
  // porcentaje falso mostramos progreso real acumulado.
  const segments = Math.max(6, answered + 3);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium tracking-wide text-ink-muted uppercase">{label}</span>
        <span className="text-ink-subtle tabular-nums">{answered} respondidas</span>
      </div>
      <div className="flex gap-1" role="presentation">
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
              i < answered ? 'bg-accent' : 'bg-line'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Esqueleto de carga de las tarjetas de pregunta. */
export function QuestionSkeleton() {
  return (
    <div className="card animate-fade-up space-y-4 p-6" aria-busy="true" aria-label="Cargando preguntas">
      <div className="skeleton h-5 w-3/4" />
      <div className="skeleton h-5 w-1/2" />
      <div className="space-y-2 pt-2">
        <div className="skeleton h-11 w-full" />
        <div className="skeleton h-11 w-full" />
        <div className="skeleton h-11 w-5/6" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8">{children}</div>;
}
