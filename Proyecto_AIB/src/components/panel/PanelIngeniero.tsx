import { useCallback, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePerfil } from '../../hooks/usePerfil';
import { EncargosIngenieria } from '../EncargosIngenieria';
import { Shell, Wordmark } from '../ui/Primitives';
import { CatalogoPlantillas } from './CatalogoPlantillas';
import { InvitacionesPanel } from './InvitacionesPanel';
import { ComentariosPanel } from './ComentariosPanel';
import { HoyPanel, type IrAEncargos } from './HoyPanel';
import { IngenierosPanel } from './IngenierosPanel';
import { activarModoCliente } from '../../lib/modoCliente';

type Pestana = 'hoy' | 'encargos' | 'invitaciones' | 'comentarios' | 'catalogo' | 'ingenieros';

/**
 * Panel del ingeniero. Solo entra quien tiene el rol de ingeniero: antes
 * `/dashboard` lo podía abrir cualquiera con la URL. Es su portada: abre en
 * «Hoy», donde ABI le dice qué necesita su atención.
 */
export function PanelIngeniero() {
  const { session, initializing, signOut } = useAuth();
  const perfil = usePerfil(session?.user.id);
  const [pestana, setPestana] = useState<Pestana>('hoy');
  // Encargos de clientes reales que aún nadie ha revisado. Lo informan «Hoy» y Encargos.
  const [nuevos, setNuevos] = useState(0);
  // Cómo se abre la pestaña de encargos. Cambiar `vez` la monta de nuevo con ese filtro.
  const [irEncargos, setIrEncargos] = useState<{ vez: number; destino: IrAEncargos }>({ vez: 0, destino: {} });

  const abrirEncargos = useCallback((destino: IrAEncargos) => {
    setIrEncargos((previo) => ({ vez: previo.vez + 1, destino }));
    setPestana('encargos');
  }, []);

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
              <Link to="/" state={{ comoCliente: true }} onClick={activarModoCliente} className="btn btn-ghost">
                <span className="sm:hidden">Ver como cliente</span>
                <span className="hidden sm:inline">Probar como cliente</span>
              </Link>
              <button type="button" onClick={signOut} className="btn btn-ghost">
                Salir
              </button>
            </div>
          </div>
          {/* En el celular no caben todas: la barra se desliza. */}
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Secciones del panel">
            {(
              [
                ['hoy', 'Hoy con ABI', 'Hoy'],
                ['encargos', 'Encargos', 'Encargos'],
                ['invitaciones', 'Invitaciones', 'Invitaciones'],
                ['comentarios', 'Comentarios', 'Comentarios'],
                // El catálogo que ven los clientes es el del administrador.
                ...(perfil.esAdmin ? ([['catalogo', 'Catálogo de plantillas', 'Catálogo']] as const) : []),
                perfil.esAdmin
                  ? (['ingenieros', 'Ingenieros', 'Ingenieros'] as const)
                  : (['ingenieros', 'Mi perfil', 'Perfil'] as const),
              ] as const
            ).map(([id, texto, corto]) => (
              <button
                key={id}
                type="button"
                onClick={() => (id === 'encargos' ? abrirEncargos({}) : setPestana(id))}
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
        {pestana === 'hoy' ? (
          <HoyPanel
            onEncargos={abrirEncargos}
            onInvitaciones={() => setPestana('invitaciones')}
            onComentarios={() => setPestana('comentarios')}
            onNuevos={setNuevos}
          />
        ) : pestana === 'encargos' ? (
          <EncargosIngenieria
            key={irEncargos.vez}
            onNuevos={setNuevos}
            inicial={{
              abrir: irEncargos.destino.abrir,
              filtros: {
                ...(irEncargos.destino.buscar ? { busqueda: irEncargos.destino.buscar } : {}),
                ...(irEncargos.destino.soloNuevos ? { estado: 'recibido' as const, soloReales: true } : {}),
              },
            }}
          />
        ) : pestana === 'invitaciones' ? (
          <InvitacionesPanel esAdmin={perfil.esAdmin} />
        ) : pestana === 'comentarios' ? (
          <ComentariosPanel />
        ) : pestana === 'ingenieros' ? (
          <IngenierosPanel esAdmin={perfil.esAdmin} />
        ) : perfil.esAdmin ? (
          <CatalogoPlantillas />
        ) : null}
      </main>
    </div>
  );
}
