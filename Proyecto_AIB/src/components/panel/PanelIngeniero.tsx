import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePerfil } from '../../hooks/usePerfil';
import { EncargosIngenieria } from '../EncargosIngenieria';
import { Shell, Wordmark } from '../ui/Primitives';
import { CatalogoPlantillas } from './CatalogoPlantillas';
import { IngresosPanel } from './IngresosPanel';
import { InvitacionesPanel } from './InvitacionesPanel';
import { ComentariosPanel } from './ComentariosPanel';
import { HoyPanel, type IrAEncargos } from './HoyPanel';
import { IngenierosPanel } from './IngenierosPanel';
import { PlanPanel } from './PlanPanel';
import { PlanesAdmin } from './PlanesAdmin';
import { miPlan } from '../../lib/planes';
import { activarModoCliente } from '../../lib/modoCliente';

// Solo el administrador la abre, y trae los gráficos: se carga aparte.
const MetricasPanel = lazy(() => import('./MetricasPanel'));

type Pestana = 'hoy' | 'encargos' | 'ingresos' | 'invitaciones' | 'comentarios' | 'catalogo' | 'ingenieros' | 'plan' | 'metricas';

/**
 * Panel del ingeniero. Solo entra quien tiene el rol de ingeniero: antes
 * `/dashboard` lo podía abrir cualquiera con la URL. Es su portada: abre en
 * «Hoy», donde ABI le dice qué necesita su atención.
 */
/** Cómo terminó la conexión con Google Calendar. */
const AVISOS_CALENDARIO: Record<string, string> = {
  conectado: '✓ Conectaste tu Google Calendar. Pídele a ABI, por ejemplo: «Agenda una reunión con mi último cliente».',
  cancelado: 'No se conectó tu Google Calendar: cancelaste el permiso en Google.',
  permisos:
    'Faltan permisos: vuelve a conectar tu Google Calendar desde los ajustes de ABI y marca las dos casillas (ver tu disponibilidad y crear eventos).',
  error: 'No pudimos conectar tu Google Calendar. Vuelve a intentarlo desde los ajustes de ABI.',
};

export function PanelIngeniero() {
  const { session, initializing, signOut } = useAuth();
  const perfil = usePerfil(session?.user.id);
  const navigate = useNavigate();
  const [pestana, setPestana] = useState<Pestana>('hoy');
  // Encargos de clientes reales que aún nadie ha revisado. Lo informan «Hoy» y Encargos.
  const [nuevos, setNuevos] = useState(0);
  // Cómo se abre la pestaña de encargos. Cambiar `vez` la monta de nuevo con ese filtro.
  const [irEncargos, setIrEncargos] = useState<{ vez: number; destino: IrAEncargos }>({ vez: 0, destino: {} });

  // Al volver de conectar su Google Calendar (/api/calendario/volver).
  const [avisoCalendario, setAvisoCalendario] = useState<string | null>(() => {
    const resultado = new URLSearchParams(window.location.search).get('calendario');
    if (resultado) window.history.replaceState(null, '', window.location.pathname);
    return resultado ? (AVISOS_CALENDARIO[resultado] ?? AVISOS_CALENDARIO.error) : null;
  });

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
    // En el celular la página nunca se desliza hacia los lados: lo ancho (tablas,
    // pestañas) se desliza dentro de su propia caja.
    <div className="min-h-screen overflow-x-clip">
      <header className="cabecera-marca sticky top-0 z-20">
        <Shell>
          {/* Si con la letra grande del celular no cabe, los botones bajan a otra línea. */}
          <div className="flex flex-wrap items-center justify-between gap-2 py-1 sm:gap-4">
            <Wordmark subtitle="Panel del ingeniero" />
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <Link
                to="/"
                state={{ comoCliente: true }}
                onClick={activarModoCliente}
                className="btn btn-ghost px-3 py-2 text-sm sm:px-[1.125rem] sm:py-2.5 sm:text-[0.9375rem]"
              >
                <span className="sm:hidden">Ver como cliente</span>
                <span className="hidden sm:inline">Probar como cliente</span>
              </Link>
              <button
                type="button"
                onClick={signOut}
                className="btn btn-ghost px-3 py-2 text-sm sm:px-[1.125rem] sm:py-2.5 sm:text-[0.9375rem]"
              >
                Salir
              </button>
            </div>
          </div>
          <BarraPestanas activa={pestana}>
            {(
              [
                ['hoy', 'Hoy con ABI', 'Hoy'],
                ['encargos', 'Encargos', 'Encargos'],
                ['ingresos', 'Ingresos', 'Ingresos'],
                ['invitaciones', 'Invitaciones', 'Invitaciones'],
                ['comentarios', 'Comentarios', 'Comentarios'],
                // Cada ingeniero sube sus diseños; el administrador además tiene la biblioteca.
                perfil.esAdmin
                  ? (['catalogo', 'Catálogo', 'Catálogo'] as const)
                  : (['catalogo', 'Mis plantillas', 'Plantillas'] as const),
                perfil.esAdmin
                  ? (['ingenieros', 'Ingenieros', 'Ingenieros'] as const)
                  : (['ingenieros', 'Mi perfil', 'Perfil'] as const),
                perfil.esAdmin ? (['plan', 'Planes', 'Planes'] as const) : (['plan', 'Mi plan', 'Plan'] as const),
                ...(perfil.esAdmin ? ([['metricas', 'Métricas', 'Métricas']] as const) : []),
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
          </BarraPestanas>
        </Shell>
      </header>

      {/* Correos, enlaces y textos largos saltan de línea en vez de ensanchar la
          página: en el celular, nada se desliza hacia los lados. */}
      <main className="[overflow-wrap:anywhere]">
        {avisoCalendario && (
          <div className="mx-auto mt-4 max-w-4xl px-5">
            <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-ink">
              <p>{avisoCalendario}</p>
              <button
                type="button"
                onClick={() => setAvisoCalendario(null)}
                className="shrink-0 text-ink-muted hover:text-ink"
                aria-label="Cerrar aviso"
              >
                ✕
              </button>
            </div>
          </div>
        )}
        {pestana === 'hoy' ? (
          <HoyPanel
            onEncargos={abrirEncargos}
            onInvitaciones={() => setPestana('invitaciones')}
            onComentarios={() => setPestana('comentarios')}
            onNuevos={setNuevos}
            conAbi={conAbi}
            onVerPlan={() => setPestana('plan')}
            onIrA={setPestana}
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
        ) : pestana === 'ingresos' ? (
          <IngresosPanel
            esAdmin={perfil.esAdmin}
            onAbrirEncargo={(id, negocio) => abrirEncargos({ abrir: id, buscar: negocio ?? undefined })}
          />
        ) : pestana === 'invitaciones' ? (
          <InvitacionesPanel esAdmin={perfil.esAdmin} />
        ) : pestana === 'comentarios' ? (
          <ComentariosPanel />
        ) : pestana === 'ingenieros' ? (
          <IngenierosPanel esAdmin={perfil.esAdmin} />
        ) : pestana === 'metricas' && perfil.esAdmin ? (
          <Suspense fallback={<p className="p-6 text-sm text-ink-subtle">Cargando métricas…</p>}>
            <MetricasPanel />
          </Suspense>
        ) : (
          <CatalogoPlantillas esAdmin={perfil.esAdmin} />
        )}
      </main>
    </div>
  );
}

/**
 * Barra de pestañas. Si no caben todas (en el celular, o en la PC con las del
 * administrador), se desliza con el dedo, con la rueda del mouse o con las
 * flechas que aparecen en el lado donde quedan pestañas ocultas.
 */
function BarraPestanas({ activa, children }: { activa: string; children: ReactNode }) {
  const barra = useRef<HTMLElement>(null);
  const [ocultas, setOcultas] = useState({ izquierda: false, derecha: false });

  const medir = useCallback(() => {
    const el = barra.current;
    if (!el) return;
    const izquierda = el.scrollLeft > 2;
    const derecha = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setOcultas((previo) =>
      previo.izquierda === izquierda && previo.derecha === derecha ? previo : { izquierda, derecha },
    );
  }, []);

  // La pestaña elegida queda a la vista.
  useEffect(() => {
    barra.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activa]);

  // El aviso de encargos nuevos cambia el ancho de las pestañas.
  useEffect(medir);

  useEffect(() => {
    const el = barra.current;
    if (!el) return;
    // La rueda del mouse mueve hacia abajo: aquí desliza la barra, hasta su borde.
    const rueda = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const tope = el.scrollWidth - el.clientWidth;
      if (tope <= 0 || (e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= tope)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('scroll', medir, { passive: true });
    el.addEventListener('wheel', rueda, { passive: false });
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => {
      el.removeEventListener('scroll', medir);
      el.removeEventListener('wheel', rueda);
      observador.disconnect();
    };
  }, [medir]);

  const deslizar = (sentido: 1 | -1) => {
    const el = barra.current;
    el?.scrollBy({ left: sentido * el.clientWidth * 0.7, behavior: 'smooth' });
  };

  return (
    <div className="relative -mb-px">
      <nav
        ref={barra}
        className="flex scroll-px-10 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Secciones del panel"
      >
        {children}
      </nav>
      {ocultas.izquierda && (
        <button
          type="button"
          onClick={() => deslizar(-1)}
          className="absolute inset-y-0 left-0 flex w-10 items-center justify-start bg-gradient-to-r from-[#1a2d4d] from-50% to-transparent text-ink hover:text-accent"
          aria-label="Ver las pestañas anteriores"
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="M12.5 15 7.5 10l5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {ocultas.derecha && (
        <button
          type="button"
          onClick={() => deslizar(1)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-end bg-gradient-to-l from-[#1a2d4d] from-50% to-transparent text-ink hover:text-accent"
          aria-label="Ver más pestañas"
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="m7.5 5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
