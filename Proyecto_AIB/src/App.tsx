import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import LoginRegistro from './components/LoginRegistro';
import { PrototypePreview } from './components/PrototypePreviewDiferido';
import { ProyectosGuardados } from './components/ProyectosGuardados';
import { Portada } from './components/Portada';
import { conPrecioMostrado, miPrecio } from './lib/pruebaPrecio';
import { ElegirIngeniero } from './components/ingenieros/ElegirIngeniero';
import { ContactoEncargo, type DatosEncargo } from './components/ContactoEncargo';
import { FlujoWeb } from './components/web/FlujoWeb';
import { FlujoServicio } from './components/web/FlujoServicio';
import { WebPreview } from './components/web/WebPreview';
import { SeguimientoCliente } from './components/SeguimientoEncargo';
import { Wordmark, Shell } from './components/ui/Primitives';
import {
  cargarProyecto,
  conPaletaEnHistorial,
  enviarEncargo,
  guardarEdicion,
  type ProyectoCompleto,
} from './lib/proyectos';
import { registrarEvento } from './lib/catalogo';
import { elegirIngeniero as asignarIngeniero } from './lib/ingenieros';
import { miInvitacion, registrarInicioInvitacion, type MiInvitacion } from './lib/invitaciones';
import { leerModoCliente, salirModoCliente } from './lib/modoCliente';
import { serviciosParaCliente, type ServiciosCliente } from './lib/formularios';
import { SERVICIOS, claveServicio, obtenerServicio, type Paleta, type Servicio, type TipoServicio } from './lib/servicios';
import { useAuth } from './hooks/useAuth';
import { usePerfil } from './hooks/usePerfil';

type EstadoAceptacion = 'inactivo' | 'procesando' | 'aceptado' | 'fallo';

const TIPOS: TipoServicio[] = ['web', 'crm', 'erp', 'automatizacion', 'app-movil'];

/**
 * El servicio con el que llega desde la portada o la página de un ingeniero
 * ({ clave: 'crm' } o { clave: 'otro:Chatbots' }). Sin él, elige en la bienvenida.
 */
function servicioDeLaNavegacion(estado: unknown): { tipo: TipoServicio | null; otro: string | null } {
  const clave = (estado as { clave?: unknown } | null)?.clave;
  if (typeof clave !== 'string') return { tipo: null, otro: null };
  if (clave.startsWith('otro:') && clave.length > 7) return { tipo: 'otro', otro: clave.slice(5) };
  return TIPOS.includes(clave as TipoServicio) ? { tipo: clave as TipoServicio, otro: null } : { tipo: null, otro: null };
}

export default function Home() {
  const { session, initializing, signOut } = useAuth();
  const perfil = usePerfil(session?.user.id);
  // El ingeniero solo ve esta pantalla si pidió «Probar como cliente» en su panel.
  const location = useLocation();
  const [modoCliente] = useState(
    () => leerModoCliente() || (location.state as { comoCliente?: boolean } | null)?.comoCliente === true
  );
  // Sin sesión se ve la portada; el login aparece al pulsar «Ingresar» o «Pruébalo gratis».
  // «Crear cuenta gratis» desde /probar llega con { acceso: 'registro' }; quien
  // acaba de empezar una prueba con un servicio ya elegido, con { clave }.
  const [acceso, setAcceso] = useState<'login' | 'registro' | null>(() => {
    const estado = location.state as { acceso?: unknown } | null;
    return estado?.acceso === 'registro' || estado?.acceso === 'login' ? estado.acceso : null;
  });
  const [inicial] = useState(() => servicioDeLaNavegacion(location.state));
  const [tipo, setTipo] = useState<TipoServicio | null>(inicial.tipo);
  // Lo que trae la navegación se usa una sola vez: si se quedara en el
  // historial, al recargar volvería a saltarse la bienvenida.
  const navigate = useNavigate();
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);
  // Con tipo 'otro': el servicio que escribió su ingeniero ("Chatbots").
  const [otro, setOtro] = useState<string | null>(inicial.otro);
  // Qué servicios puede pedir: los de su ingeniero, o los de la plataforma.
  const [disponibles, setDisponibles] = useState<ServiciosCliente | null>(null);
  const [abierto, setAbierto] = useState<ProyectoCompleto | null>(null);
  const [aceptacionAbierto, setAceptacionAbierto] = useState<EstadoAceptacion>('inactivo');
  const [pidiendoContacto, setPidiendoContacto] = useState(false);
  // Al aceptar, el cliente elige ingeniero (salvo si vino con la invitación de uno).
  const [eligiendoIngeniero, setEligiendoIngeniero] = useState(false);
  const [ingenieroElegido, setIngenieroElegido] = useState<string | null>(null);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [cargandoProyecto, setCargandoProyecto] = useState(false);
  // Prueba de precio en una maqueta reabierta que aún no se aceptó.
  const [precioAbierto, setPrecioAbierto] = useState<number | null>(null);
  // Se incrementa al guardar un proyecto para que la lista se recargue.
  const [versionLista, setVersionLista] = useState(0);

  // Estables a propósito: si cambiaran de identidad en cada render, los hijos
  // las verían como props nuevas. Ese fue el origen del bucle de peticiones.
  const refrescarLista = useCallback(() => setVersionLista((v) => v + 1), []);

  const abrirProyecto = useCallback(async (id: string) => {
    setCargandoProyecto(true);
    const proyecto = await cargarProyecto(id);
    const precio = proyecto && proyecto.tipoServicio === 'web' && !proyecto.aceptado ? await miPrecio() : null;
    setCargandoProyecto(false);
    setPrecioAbierto(precio);
    if (proyecto) {
      setAceptacionAbierto(proyecto.aceptado ? 'aceptado' : 'inactivo');
      setPidiendoContacto(false);
      setErrorEnvio(null);
      setAbierto(proyecto);
    }
  }, []);

  // Cliente que entró con el enlace de un ingeniero: sesión anónima, sin
  // cuenta. Ve los servicios de su ingeniero, con la bienvenida de su invitación.
  const esInvitado = session?.user.is_anonymous === true;
  const [invitacion, setInvitacion] = useState<MiInvitacion | null | undefined>(undefined);
  useEffect(() => {
    if (!esInvitado) return;
    let vigente = true;
    void miInvitacion().then((inv) => {
      if (vigente) setInvitacion(inv);
    });
    return () => {
      vigente = false;
    };
  }, [esInvitado, session?.user.id]);

  useEffect(() => {
    if (!session) return;
    let vigente = true;
    void serviciosParaCliente().then((s) => {
      if (vigente) setDisponibles(s);
    });
    return () => {
      vigente = false;
    };
  }, [session]);

  // Quien está en una prueba sin cuenta (sesión anónima) y en realidad tiene
  // cuenta (el ingeniero, por ejemplo): se cierra la prueba y se abre el login.
  const ingresarConCuenta = async (avisar: boolean, modo: 'login' | 'registro' = 'login') => {
    if (avisar && !window.confirm('Saldrás de esta prueba sin cuenta. ¿Ingresar con tu cuenta?')) return;
    setAcceso(modo);
    await signOut();
  };

  // La página principal (/) es siempre la portada, salvo para quien entró con
  // su cuenta. La prueba sin cuenta y la invitación de un ingeniero viven en
  // /mi-web, con un botón para volver a la portada.
  const enMiWeb = location.pathname === '/mi-web';

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
    if (enMiWeb) return <Navigate to="/" replace />;
    if (!acceso) return <Portada onAcceso={setAcceso} />;
    return (
      <LoginRegistro key={acceso} onAuthSuccess={() => {}} modoInicial={acceso} onVolver={() => setAcceso(null)} />
    );
  }

  if (esInvitado && !enMiWeb) {
    return (
      <Portada onAcceso={(modo) => void ingresarConCuenta(true, modo)} continuar={() => navigate('/mi-web')} />
    );
  }
  if (!esInvitado && enMiWeb) return <Navigate to="/" replace />;

  // Esperar al rol evita que el ingeniero vea un instante la pantalla del cliente.
  if (!esInvitado && perfil.cargando) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    );
  }

  // Su portada es el panel, con ABI.
  if (!esInvitado && perfil.rol === 'ingeniero' && !modoCliente) {
    return <Navigate to="/dashboard" replace />;
  }

  if (esInvitado && invitacion === undefined) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    );
  }

  if (esInvitado && !invitacion?.activa) {
    // null: el enlace se abrió en otro navegador y la sesión pasó allí.
    return <InvitacionInactiva enOtroNavegador={invitacion === null} onIngresar={() => void ingresarConCuenta(false)} />;
  }

  const reiniciar = () => {
    setTipo(null);
    setOtro(null);
    setAbierto(null);
    setPidiendoContacto(false);
  };

  const elegirServicio = (t: TipoServicio, nombreOtro: string | null = null) => {
    setTipo(t);
    setOtro(nombreOtro);
  };

  /**
   * Aceptar un proyecto reabierto desde la lista: el cliente pudo cerrar la
   * página sin aceptar y volver otro día. Pasa por el mismo último paso que en
   * el flujo: deja su contacto y el encargo llega al ingeniero al instante.
   */
  const aceptarAbierto = async (datos: DatosEncargo) => {
    if (!abierto || abierto.aceptado) return;
    setAceptacionAbierto('procesando');
    setErrorEnvio(null);
    const { ok } = await enviarEncargo(abierto.id, {
      servicio: abierto.servicio,
      historial: conPrecioMostrado(abierto.historial, precioAbierto),
      ...datos,
    });
    if (!ok) {
      setErrorEnvio('No pudimos enviar tu proyecto. Revisa tu conexión y vuelve a intentarlo.');
      setAceptacionAbierto('inactivo');
      return;
    }
    if (abierto.plantilla) void registrarEvento(abierto.plantilla.id, 'aceptada');
    setAbierto({ ...abierto, aceptado: true });
    setPidiendoContacto(false);
    setAceptacionAbierto('aceptado');
    refrescarLista();
  };

  /** Cambios a mano en un proyecto reabierto: igual que en el flujo, sin IA. */
  const guardarCambiosAbierto = async (cambios: { documento: string; paleta: Paleta }) => {
    if (!abierto) return false;
    const { ok } = await guardarEdicion(abierto.id, cambios);
    if (ok) {
      setAbierto({
        ...abierto,
        documento: cambios.documento,
        ficha: abierto.ficha ? { ...abierto.ficha, paleta: cambios.paleta } : abierto.ficha,
        historial: conPaletaEnHistorial(abierto.historial, cambios.paleta),
      });
    }
    return ok;
  };

  // Si llegó con un servicio que su ingeniero no ofrece (por ejemplo, desde un
  // botón de la portada), elige entre los que sí.
  const ofrecido = (t: TipoServicio, o: string | null) =>
    !disponibles || (t === 'otro' ? disponibles.otros.includes(o ?? '') : disponibles.servicios.includes(t as never));
  const tipoActivo = tipo && ofrecido(tipo, otro) ? tipo : null;

  // Los servicios que puede pedir (la web, mientras se averigua).
  const servicios = SERVICIOS.filter((s) => (disponibles?.servicios ?? ['web']).includes(s.id as never));
  // La vista previa reabierta de otro servicio lleva sus propios textos.
  const servicioAbierto =
    abierto?.tipoServicio && abierto.tipoServicio !== 'web'
      ? {
          nombre: abierto.servicioOtro ?? obtenerServicio(abierto.tipoServicio).nombre,
          icono: obtenerServicio(abierto.tipoServicio).icono,
        }
      : undefined;

  // Quien llegó con la invitación de un ingeniero ya tiene el suyo.
  const vinoConSuIngeniero = esInvitado && invitacion?.origen === 'ingeniero';
  const aceptarConIngeniero = async () => {
    if (vinoConSuIngeniero) {
      setPidiendoContacto(true);
      return;
    }
    // Eligió el diseño propio de un ingeniero: lo construye él, sin pasar por
    // la lista (salvo que ya no esté disponible).
    const autor = abierto?.plantilla?.ingeniero_id;
    if (autor && abierto) {
      const r = await asignarIngeniero(abierto.id, autor);
      if (r === 'ok' || r === 'propio') {
        setIngenieroElegido(r === 'ok' ? (abierto.plantilla?.ingeniero ?? null) : null);
        setPidiendoContacto(true);
        return;
      }
    }
    setEligiendoIngeniero(true);
  };

  return (
    <div className="min-h-screen">
      <header className="cabecera-marca sticky top-0 z-20">
        <Shell>
          <div className="flex items-center justify-between gap-4 py-1">
            {esInvitado ? (
              <Link to="/" aria-label="Ir a la página principal de AIB+">
                <Wordmark subtitle="Tecnología para tu negocio" />
              </Link>
            ) : (
              <Wordmark subtitle="Tecnología para tu negocio" />
            )}
            <div className="flex items-center gap-3">
              {(tipoActivo || abierto) && (
                <button type="button" onClick={reiniciar} className="btn btn-ghost">
                  {esInvitado ? (
                    'Mis diseños'
                  ) : (
                    <>
                      <span className="sm:hidden">Nuevo</span>
                      <span className="hidden sm:inline">Nuevo proyecto</span>
                    </>
                  )}
                </button>
              )}
              {perfil.rol === 'ingeniero' && (
                <Link to="/dashboard" onClick={salirModoCliente} className="btn btn-ghost">
                  <span className="sm:hidden">Panel</span>
                  <span className="hidden sm:inline">Panel del ingeniero</span>
                </Link>
              )}
              {/* El invitado no tiene cuenta: si saliera, perdería su sesión
                  hasta volver a abrir el enlace. Por eso «Ingresar» pregunta antes. */}
              {esInvitado && (
                <Link to="/" className="btn btn-ghost">
                  <span className="sm:hidden">Inicio</span>
                  <span className="hidden sm:inline">Página principal</span>
                </Link>
              )}
              {esInvitado && (
                <button
                  type="button"
                  onClick={() => void ingresarConCuenta(true)}
                  className="text-sm text-ink-muted hover:text-ink"
                >
                  <span className="hidden sm:inline">¿Tienes cuenta? </span>Ingresar
                </button>
              )}
              {!esInvitado && (
                <>
                  <span className="hidden text-sm text-ink-subtle lg:inline">{session.user.email}</span>
                  <button type="button" onClick={signOut} className="btn btn-ghost">
                    Salir
                  </button>
                </>
              )}
            </div>
          </div>
        </Shell>
      </header>

      <main>
        <Shell>
          {abierto ? (
            <>
              {abierto.aceptado && (
                <SeguimientoCliente
                  proyectoId={abierto.id}
                  aceptadoEn={abierto.aceptadoEn}
                  tipo={abierto.tipoServicio}
                />
              )}
              {(abierto.documento || abierto.html) && abierto.ficha ? (
                <WebPreview
                  cuerpo={abierto.html}
                  documento={abierto.documento}
                  plantilla={abierto.plantilla?.nombre}
                  plantillaBase={abierto.plantilla?.base}
                  ficha={abierto.ficha}
                  usage={abierto.usage}
                  guardado="guardado"
                  aceptacion={aceptacionAbierto}
                  onAceptar={aceptarConIngeniero}
                  onGuardarEdicion={guardarCambiosAbierto}
                  proyectoId={abierto.id}
                  conSeguimiento={abierto.aceptado}
                  precio={precioAbierto}
                  servicio={servicioAbierto}
                />
              ) : (
                <PrototypePreview
                  code={abierto.reactCode ?? ''}
                  servicio={abierto.servicio}
                  respuestas={abierto.respuestas}
                  usage={abierto.usage}
                  guardado="guardado"
                  aceptacion={aceptacionAbierto}
                  onAceptar={aceptarConIngeniero}
                />
              )}
            </>
          ) : tipoActivo === 'web' ? (
            <FlujoWeb
              onGuardado={refrescarLista}
              empresaInicial={esInvitado ? (invitacion?.negocio ?? undefined) : undefined}
              elegirIngeniero={!vinoConSuIngeniero}
              onEmpezar={esInvitado ? registrarInicioInvitacion : undefined}
            />
          ) : tipoActivo ? (
            <FlujoServicio
              key={claveServicio(tipoActivo, otro)}
              tipo={tipoActivo}
              otro={otro ?? undefined}
              empresaInicial={esInvitado ? (invitacion?.negocio ?? undefined) : undefined}
              conSuIngeniero={vinoConSuIngeniero}
              onEmpezar={esInvitado ? registrarInicioInvitacion : undefined}
              onGuardado={refrescarLista}
            />
          ) : esInvitado ? (
            <BienvenidaInvitado
              negocio={invitacion?.negocio ?? null}
              desdePortada={invitacion?.origen === 'portada'}
              ingeniero={invitacion?.origen === 'ingeniero' ? (invitacion?.ingeniero ?? null) : null}
              servicios={servicios}
              otros={disponibles?.otros ?? []}
              onElegir={elegirServicio}
              cargandoProyecto={cargandoProyecto}
              onAbrir={abrirProyecto}
              versionLista={versionLista}
            />
          ) : (
            <section className="animate-fade-up mx-auto max-w-3xl py-14 text-center sm:py-20">
              <p className="mb-3 text-sm font-medium tracking-widest text-accent uppercase">
                Empecemos
              </p>
              <h1 className="text-4xl font-bold text-balance sm:text-5xl">
                ¿Qué necesitas para tu negocio?
              </h1>
              <p className="mx-auto mt-4 max-w-lg text-base text-ink-muted">
                Elige una opción y te guiamos paso a paso, sin tecnicismos. Al final
                verás una primera versión de tu proyecto.
              </p>

              <EleccionServicio servicios={servicios} otros={disponibles?.otros ?? []} onElegir={elegirServicio} />

              {/* Al ingeniero que prueba como cliente la lista solo le mostraba sus
                  pruebas: lo suyo lo ve en el panel. */}
              {perfil.rol === 'ingeniero' ? null : cargandoProyecto ? (
                <p className="mt-14 text-sm text-ink-subtle">Abriendo proyecto…</p>
              ) : (
                <ProyectosGuardados onAbrir={abrirProyecto} recargar={versionLista} />
              )}
            </section>
          )}
        </Shell>
      </main>

      {abierto && eligiendoIngeniero && (
        <ElegirIngeniero
          proyectoId={abierto.id}
          rubro={abierto.ficha?.categoria || undefined}
          servicio={abierto.tipoServicio ?? 'web'}
          onElegido={(nombre) => {
            setIngenieroElegido(nombre);
            setEligiendoIngeniero(false);
            setPidiendoContacto(true);
          }}
          onCancelar={() => setEligiendoIngeniero(false)}
        />
      )}
      {abierto && pidiendoContacto && (
        <ContactoEncargo
          ingeniero={ingenieroElegido}
          tipoServicio={abierto.tipoServicio}
          objetivo={abierto.ficha?.objetivo}
          // Si ya respondió las preguntas de su ingeniero en el formulario, no se repiten.
          preguntasDe={abierto.historial.some((h) => h.question_id.startsWith('ing-')) ? null : abierto.id}
          enviando={aceptacionAbierto === 'procesando'}
          error={errorEnvio}
          onEnviar={(datos) => void aceptarAbierto(datos)}
          onCancelar={() => setPidiendoContacto(false)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Portada del cliente que entró con una invitación. Si solo hay web, directo
 * a su web; si su ingeniero (o la plataforma) ofrece más, elige qué quiere.
 */
function BienvenidaInvitado({
  negocio,
  desdePortada,
  ingeniero,
  servicios,
  otros,
  onElegir,
  cargandoProyecto,
  onAbrir,
  versionLista,
}: {
  negocio: string | null;
  /** Llegó por «Pruébalo gratis», no con un enlace del ingeniero. */
  desdePortada: boolean;
  /** El nombre de su ingeniero, si llegó con su enlace o desde su página. */
  ingeniero: string | null;
  servicios: Servicio[];
  otros: string[];
  onElegir: (tipo: TipoServicio, otro?: string | null) => void;
  cargandoProyecto: boolean;
  onAbrir: (id: string) => void;
  versionLista: number;
}) {
  const soloWeb = otros.length === 0 && servicios.length === 1 && servicios[0].id === 'web';
  const queVer = soloWeb ? 'cómo se vería tu página web' : 'cómo quedaría lo que necesitas';
  return (
    <section className="animate-fade-up mx-auto max-w-3xl py-14 text-center sm:py-20">
      <p className="mb-3 text-sm font-medium tracking-widest text-accent uppercase">
        {desdePortada ? 'Tu prueba gratis' : 'Tu invitación'}
      </p>
      <h1 className="text-4xl font-bold text-balance sm:text-5xl">{negocio ? `Hola, ${negocio} 👋` : 'Hola 👋'}</h1>
      <p className="mx-auto mt-4 max-w-lg text-base text-ink-muted">
        {desdePortada
          ? `Mira ${queVer}.`
          : ingeniero
            ? `${ingeniero.split(/\s+/)[0]} te invita a ver ${queVer}.`
            : `Te invitaron a ver ${queVer}.`}{' '}
        Responde unas preguntas rápidas, casi todas con un clic, y en un minuto verás una primera versión con
        tu nombre y tus colores. No necesitas crear cuenta ni pagar nada.
      </p>
      {soloWeb ? (
        <button type="button" onClick={() => onElegir('web')} className="btn btn-primary mt-8 px-8 py-3 text-base">
          Empezar
        </button>
      ) : (
        <EleccionServicio servicios={servicios} otros={otros} onElegir={onElegir} />
      )}
      <p className="mt-4 text-xs text-ink-subtle">
        {desdePortada
          ? 'Puedes volver cuando quieras desde este mismo navegador.'
          : 'Puedes volver cuando quieras con el mismo enlace.'}
      </p>

      {cargandoProyecto ? (
        <p className="mt-14 text-sm text-ink-subtle">Abriendo proyecto…</p>
      ) : (
        <ProyectosGuardados onAbrir={onAbrir} recargar={versionLista} />
      )}
    </section>
  );
}

/**
 * La sesión ya no tiene invitación: o se abrió el enlace en otro navegador (la
 * invitación pasó allí) o el ingeniero la desactivó.
 */
function InvitacionInactiva({ enOtroNavegador, onIngresar }: { enOtroNavegador: boolean; onIngresar: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-ink">
          {enOtroNavegador ? 'Abriste tu enlace en otro navegador' : 'Tu invitación ya no está activa'}
        </h1>
        <p className="mt-3 text-sm text-ink-muted">
          {enOtroNavegador
            ? 'Tu proyecto sigue allí. Para continuar aquí, vuelve a abrir el enlace de tu invitación.'
            : 'Pide a quien te envió el enlace que te mande uno nuevo.'}
        </p>
        <button type="button" onClick={onIngresar} className="mt-6 text-sm text-ink-muted underline underline-offset-2 hover:text-ink">
          ¿Tienes cuenta? Ingresar
        </button>
      </div>
    </div>
  );
}

/**
 * Los servicios para elegir: los estándar (web, CRM…) y los que su ingeniero
 * escribió a mano. La web va primero y destacada: es lo que más se pide.
 */
function EleccionServicio({
  servicios,
  otros,
  onElegir,
}: {
  servicios: Servicio[];
  otros: string[];
  onElegir: (tipo: TipoServicio, otro?: string | null) => void;
}) {
  const otroServicio = obtenerServicio('otro');
  const tarjetas = [
    ...servicios.map((s) => ({
      clave: claveServicio(s.id),
      tipo: s.id,
      otro: null,
      nombre: s.nombre,
      icono: s.icono,
      descripcion: s.descripcion,
    })),
    ...otros.map((o) => ({
      clave: claveServicio('otro', o),
      tipo: 'otro' as const,
      otro: o,
      nombre: o,
      icono: otroServicio.icono,
      descripcion: otroServicio.descripcion,
    })),
  ];

  return (
    <div className={'mt-10 grid gap-4 text-left ' + (tarjetas.length > 2 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      {tarjetas.map((t) => (
        <button
          key={t.clave}
          type="button"
          onClick={() => onElegir(t.tipo, t.otro)}
          className="card group flex flex-col gap-3 p-6 transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-[var(--shadow-glow)]"
        >
          <span className="text-3xl" aria-hidden="true">
            {t.icono}
          </span>
          <span className="text-lg font-semibold text-ink">{t.nombre}</span>
          <span className="text-sm leading-relaxed text-ink-muted">{t.descripcion}</span>
          <span className="mt-auto inline-flex w-fit items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">
            {t.tipo === 'web' ? 'Mira tu web en ~1 minuto' : 'Mira cómo quedaría'}
          </span>
        </button>
      ))}
    </div>
  );
}
