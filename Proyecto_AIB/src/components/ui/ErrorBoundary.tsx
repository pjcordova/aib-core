import { Component, type ErrorInfo, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// ErrorBoundary
// ---------------------------------------------------------------------------
// Hasta ahora un error de render en cualquier componente dejaba la pantalla en
// blanco, sin más pista que la consola. Esto lo convierte en algo que el
// usuario puede leer y de lo que puede salir.
// ---------------------------------------------------------------------------

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AIB+] Error de render no capturado:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center px-5">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold">La aplicación se ha detenido</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Ha ocurrido un error inesperado al dibujar la pantalla.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface-deep/60 p-3 text-left text-xs text-negative">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.assign('/')}
            className="btn btn-primary mt-6"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }
}
