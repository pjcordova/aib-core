import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePerfil } from '../../hooks/usePerfil';
import { EncargosIngenieria } from '../EncargosIngenieria';
import { Shell, Wordmark } from '../ui/Primitives';
import { CatalogoPlantillas } from './CatalogoPlantillas';
import { InvitacionesPanel } from './InvitacionesPanel';
import { ComentariosPanel } from './ComentariosPanel';

type Pestana = 'encargos' | 'invitaciones' | 'comentarios' | 'catalogo';

/**
 * Panel del ingeniero. Solo entra quien tiene el rol de ingeniero: antes
 * `/dashboard` lo podía abrir cualquiera con la URL.
 */
export function PanelIngeniero() {
  const { session, initializing, signOut } = useAuth();
  const perfil = usePerfil(session?.user.id);
  const [pestana, setPestana] = useState<Pestana>('encargos');
  // Encargos aceptados que aún nadie ha revisado. Lo informa la pestaña de encargos.
  const [nuevos, setNuevos] = useState(0);

  if (initializing || (session && perfil.cargando)) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    );
  }

  if (!session) return <Navigate to="/" replace />;

  if (perfil.sinConfigurar || perfil.rol !== 'ingeniero') {
    return (
      <div className="grid min-h-screen place-items-center px-5">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold">
            {perfil.sinConfigurar ? 'Falta preparar la base de datos' : 'Esta sección es para ingenieros'}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {perfil.sinConfigurar
              ? 'Ejecuta supabase_roles_plantillas.sql en el editor SQL de Supabase y marca tu cuenta como ingeniero.'
              : 'Tu cuenta es de cliente. Si eres el ingeniero, pide que te asignen el rol.'}
          </p>
          <Link to="/" className="btn btn-primary mt-6">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-surface-base/80 backdrop-blur-xl">
        <Shell>
          <div className="flex items-center justify-between gap-4 py-1">
            <Wordmark subtitle="Panel del ingeniero" />
            <div className="flex items-center gap-3">
              <Link to="/" className="btn btn-ghost">
                Ir a la app
              </Link>
              <button type="button" onClick={signOut} className="btn btn-ghost">
                Salir
              </button>
            </div>
          </div>
          {/* En el celular no caben las cuatro: la barra se desliza. */}
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Secciones del panel">
            {(
              [
                ['encargos', 'Encargos', 'Encargos'],
                ['invitaciones', 'Invitaciones', 'Invitaciones'],
                ['comentarios', 'Comentarios', 'Comentarios'],
                ['catalogo', 'Catálogo de plantillas', 'Catálogo'],
              ] as const
            ).map(([id, texto, corto]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPestana(id)}
                aria-current={pestana === id ? 'page' : undefined}
                className={
                  'shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors sm:px-4 ' +
                  (pestana === id
                    ? 'border-accent text-ink'
                    : 'border-transparent text-ink-muted hover:text-ink')
                }
              >
                <span className="sm:hidden">{corto}</span>
                <span className="hidden sm:inline">{texto}</span>
                {id === 'encargos' && nuevos > 0 && (
                  <span
                    className="ml-2 rounded-full bg-caution/15 px-1.5 py-0.5 text-[11px] font-semibold text-caution"
                    aria-label={`${nuevos} ${nuevos === 1 ? 'nuevo' : 'nuevos'}`}
                  >
                    {nuevos}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </Shell>
      </header>

      <main>
        {pestana === 'encargos' ? (
          <EncargosIngenieria onNuevos={setNuevos} />
        ) : pestana === 'invitaciones' ? (
          <InvitacionesPanel />
        ) : pestana === 'comentarios' ? (
          <ComentariosPanel />
        ) : (
          <CatalogoPlantillas />
        )}
      </main>
    </div>
  );
}
