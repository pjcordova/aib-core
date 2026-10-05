import { lazy, Suspense, type ComponentProps } from 'react';

// ---------------------------------------------------------------------------
// Visor de prototipos, bajo demanda
// ---------------------------------------------------------------------------
// El visor (Sandpack) pesa cientos de KB y solo lo usan ERP y Automatización.
// Con esto se descarga la primera vez que hace falta, no al abrir AIB+: el
// cliente que viene por su página web nunca lo baja.
// ---------------------------------------------------------------------------

const Visor = lazy(() => import('./PrototypePreview').then((m) => ({ default: m.PrototypePreview })));

export function PrototypePreview(props: ComponentProps<typeof Visor>) {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[40vh] place-items-center" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
        </div>
      }
    >
      <Visor {...props} />
    </Suspense>
  );
}
