import { useCallback, useState } from 'react';
import LoginRegistro from './components/LoginRegistro';
import { AIBProductOwner } from './components/AIBProductOwner';
import { Wordmark, Shell } from './components/ui/Primitives';
import { useAuth } from './hooks/useAuth';
import type { QAHistory } from './Types/productOwner';

/** Ejemplos que arrancan el discovery con un clic en vez de una página en blanco. */
const EJEMPLOS = [
  'Un ERP para restaurantes con facturación e inventario',
  'Una plataforma de reservas para clínicas dentales',
  'Un CRM para agencias inmobiliarias pequeñas',
  'Un panel de logística para una flota de reparto',
];

export default function Home() {
  const { session, initializing, signOut } = useAuth();
  const [service, setService] = useState('');
  const [started, setStarted] = useState(false);

  // Estable a proposito: si esta funcion cambiara de identidad en cada render,
  // el hijo la veria como una prop nueva. Ese fue justo el origen del bucle de
  // peticiones, asi que aqui se queda fijada.
  const handleComplete = useCallback((history: QAHistory[]) => {
    console.info('[AIB+] Discovery completado con', history.length, 'respuestas');
  }, []);

  // Mientras Supabase resuelve la sesión no decidimos nada: si pintáramos el
  // login aquí, un usuario ya autenticado vería un parpadeo en cada recarga.
  if (initializing) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
          <p className="text-sm text-ink-subtle">Cargando sesión…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginRegistro onAuthSuccess={() => {}} />;
  }

  const empezar = (texto: string) => {
    const limpio = texto.trim();
    if (!limpio) return;
    setService(limpio);
    setStarted(true);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-surface-base/80 backdrop-blur-xl">
        <Shell>
          <div className="flex items-center justify-between gap-4 py-1">
            <Wordmark subtitle="Motor de Proyecto Autónomo" />
            <div className="flex items-center gap-3">
              {started && (
                <button
                  type="button"
                  onClick={() => {
                    setStarted(false);
                    setService('');
                  }}
                  className="btn btn-ghost"
                >
                  <span className="sm:hidden">Nuevo</span>
                  <span className="hidden sm:inline">Nuevo proyecto</span>
                </button>
              )}
              <span className="hidden text-sm text-ink-subtle sm:inline">
                {session.user.email}
              </span>
              <button type="button" onClick={signOut} className="btn btn-ghost">
                Salir
              </button>
            </div>
          </div>
        </Shell>
      </header>

      <main>
        <Shell>
          {!started ? (
            <section className="animate-fade-up mx-auto max-w-2xl py-14 text-center sm:py-20">
              <p className="mb-3 text-sm font-medium tracking-widest text-accent uppercase">
                Discovery guiado por IA
              </p>
              <h1 className="text-4xl font-bold text-balance sm:text-5xl">
                ¿Qué software necesitas construir?
              </h1>
              <p className="mx-auto mt-4 max-w-lg text-base text-ink-muted">
                Descríbelo en una frase. Un Product Owner con IA te hará las preguntas
                justas y, al terminar, verás tu producto funcionando.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  empezar(service);
                }}
                className="mt-9 flex flex-col gap-3 sm:flex-row"
              >
                <input
                  type="text"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  placeholder="Ej: Un ERP para restaurantes con facturación…"
                  className="field flex-1 text-base"
                  autoFocus
                  aria-label="Describe el software que necesitas"
                />
                <button type="submit" disabled={!service.trim()} className="btn btn-primary px-7">
                  Empezar
                </button>
              </form>

              <div className="mt-10">
                <p className="mb-3 text-xs tracking-wide text-ink-subtle uppercase">
                  O parte de un ejemplo
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {EJEMPLOS.map((ejemplo) => (
                    <button
                      key={ejemplo}
                      type="button"
                      onClick={() => empezar(ejemplo)}
                      className="rounded-full border border-line bg-surface-raised/60 px-4 py-2 text-sm text-ink-muted transition-colors hover:border-accent/50 hover:text-ink"
                    >
                      {ejemplo}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <AIBProductOwner servicioInicial={service} onComplete={handleComplete} />
          )}
        </Shell>
      </main>
    </div>
  );
}
