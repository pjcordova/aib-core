import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePerfil } from '../../hooks/usePerfil';
import { EncargosIngenieria } from '../EncargosIngenieria';
import { Shell, Wordmark } from '../ui/Primitives';
import { CatalogoPlantillas } from './CatalogoPlantillas';
import { InvitacionesPanel } from './InvitacionesPanel';
import { ComentariosPanel } from './ComentariosPanel';
import { HoyPanel, type IrAEncargos } from './HoyPanel';
import { IngenierosPanel } from './IngenierosPanel';
import { PlanPanel } from './PlanPanel';
import { PlanesAdmin } from './PlanesAdmin';
import { miPlan } from '../../lib/planes';
import { activarModoCliente } from '../../lib/modoCliente';

type Pestana = 'hoy' | 'encargos' | 'invitaciones' | 'comentarios' | 'catalogo' | 'ingenieros' | 'plan';

/**
 * Panel del ingeniero. Solo entra quien tiene el rol de ingeniero: antes
 * `/dashboard` lo podía abrir cualquiera con la URL. Es su portada: abre en
 * «Hoy», donde ABI le dice qué necesita su atención.
 */
export function PanelIngeniero() {
  const { session, initializing, signOut } = useAuth();
  const perfil = usePerfil(session?.user.id);
  const navigate = useNavigate();
  const [pestana, setPestana] = useState<Pestana>('hoy');
  // Encargos de clientes reales que aún nadie ha revisado. Lo informan «Hoy» y Encargos.
  const [nuevos, setNuevos] = useState(0);
  // Cómo se abre la pestaña de encargos. Cambiar `vez` la monta de nuevo con ese filtro.
  const [irEncargos, setIrEncargos] = useState<{ vez: number; destino: IrAEncargos }>({ vez: 0, destino: {} });

  // ABI viene con Pro y Negocio. null mientras se consulta.
  const [conAbi, setConAbi] = useState<boolean | null>(null);
  const [versionPlan, setVersionPlan] = useState(0);
  const esIngeniero = perfil.rol === 'ingeniero';

  useEffect(() => {
    if (!esIngeniero) return;
    let vigente = true;
    // Si no se puede leer, se deja usar: el servidor igual lo comprueba.
    void miPlan().then((p) => {
      if (vigente) setConAbi(p ? p.plan !== 'free' : true);
    });
    return () => {
      vigente = false;
    };
  }, [esIngeniero, session?.user.id, versionPlan]);

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
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link to="/" className="btn btn-ghost">
              Volver al inicio
            </Link>
            {/* Por ejemplo, el ingeniero que se quedó con una prueba sin cuenta abierta. */}
            <button
              type="button"
              onClick={() => {
                void signOut().then(() => navigate('/', { replace: true, state: { acceso: 'login' } }));
              }}
              className="btn btn-primary"
            >
              Entrar con mi cuenta de ingeniero
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="cabecera-marca sticky top-0 z-20">
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
                // Cada ingeniero sube sus diseños; el administrador además tiene la biblioteca.
                perfil.esAdmin
                  ? (['catalogo', 'Catálogo de plantillas', 'Catálogo'] as const)
                  : (['catalogo', 'Mis plantillas', 'Plantillas'] as const),
                perfil.esAdmin
                  ? (['ingenieros', 'Ingenieros', 'Ingenieros'] as const)
                  : (['ingenieros', 'Mi perfil', 'Perfil'] as const),
                perfil.esAdmin ? (['plan', 'Planes', 'Planes'] as const) : (['plan', 'Mi plan', 'Plan'] as const),
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
            conAbi={conAbi}
            onVerPlan={() => setPestana('plan')}
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
        ) : pestana === 'plan' ? (
          perfil.esAdmin ? (
            <PlanesAdmin />
          ) : (
            <PlanPanel onCambio={() => setVersionPlan((v) => v + 1)} />
          )
        ) : pestana === 'invitaciones' ? (
          <InvitacionesPanel esAdmin={perfil.esAdmin} />
        ) : pestana === 'comentarios' ? (
          <ComentariosPanel />
        ) : pestana === 'ingenieros' ? (
          <IngenierosPanel esAdmin={perfil.esAdmin} />
        ) : (
          <CatalogoPlantillas esAdmin={perfil.esAdmin} />
        )}
      </main>
    </div>
  );
}
