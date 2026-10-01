import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import LoginRegistro from './components/LoginRegistro';
import { AIBProductOwner } from './components/AIBProductOwner';
import { PrototypePreview } from './components/PrototypePreview';
import { ProyectosGuardados } from './components/ProyectosGuardados';
import { ContactoEncargo, type DatosEncargo } from './components/ContactoEncargo';
import { FlujoWeb } from './components/web/FlujoWeb';
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
import { miInvitacion, registrarInicioInvitacion } from './lib/invitaciones';
import { SERVICIOS, obtenerServicio, type Paleta, type TipoServicio } from './lib/servicios';
import { useAuth } from './hooks/useAuth';
import { usePerfil } from './hooks/usePerfil';
import type { QAHistory } from './Types/productOwner';

type EstadoAceptacion = 'inactivo' | 'procesando' | 'aceptado' | 'fallo';

export default function Home() {
  const { session, initializing, signOut } = useAuth();
  const perfil = usePerfil(session?.user.id);
  const [tipo, setTipo] = useState<TipoServicio | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [iniciado, setIniciado] = useState(false);
  const [abierto, setAbierto] = useState<ProyectoCompleto | null>(null);
  const [aceptacionAbierto, setAceptacionAbierto] = useState<EstadoAceptacion>('inactivo');
  const [pidiendoContacto, setPidiendoContacto] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [cargandoProyecto, setCargandoProyecto] = useState(false);
  // Se incrementa al guardar un proyecto para que la lista se recargue.
  const [versionLista, setVersionLista] = useState(0);

  // Estables a propósito: si cambiaran de identidad en cada render, los hijos
  // las verían como props nuevas. Ese fue el origen del bucle de peticiones.
  const refrescarLista = useCallback(() => setVersionLista((v) => v + 1), []);

  const handleComplete = useCallback(
    (history: QAHistory[]) => {
      console.info('[AIB+] Discovery completado con', history.length, 'respuestas');
      refrescarLista();
    },
    [refrescarLista]
  );

  const abrirProyecto = useCallback(async (id: string) => {
    setCargandoProyecto(true);
    const proyecto = await cargarProyecto(id);
    setCargandoProyecto(false);
    if (proyecto) {
      setAceptacionAbierto(proyecto.aceptado ? 'aceptado' : 'inactivo');
      setPidiendoContacto(false);
      setErrorEnvio(null);
      setAbierto(proyecto);
    }
  }, []);

  // Cliente que entró con el enlace de un ingeniero: sesión anónima, sin
  // cuenta. Solo ve el módulo web, con la bienvenida de su invitación.
  const esInvitado = session?.user.is_anonymous === true;
  const [invitacion, setInvitacion] = useState<{ negocio: string; activa: boolean } | null | undefined>(undefined);
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

  if (esInvitado && invitacion === undefined) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    );
  }

  if (esInvitado && !invitacion?.activa) {
    return <InvitacionInactiva />;
  }

  const reiniciar = () => {
    setTipo(null);
    setDescripcion('');
    setIniciado(false);
    setAbierto(null);
    setPidiendoContacto(false);
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
      historial: abierto.historial,
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

  const servicio = tipo ? obtenerServicio(tipo) : null;

  const empezarIA = (texto: string) => {
    const limpio = texto.trim();
    if (!limpio || !servicio) return;
    // El tipo de servicio va delante para que el discovery sepa por dónde tirar.
    setDescripcion(`${servicio.nombre}: ${limpio}`);
    setIniciado(true);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-surface-base/80 backdrop-blur-xl">
        <Shell>
          <div className="flex items-center justify-between gap-4 py-1">
            <Wordmark subtitle="Motor de Proyecto Autónomo" />
            <div className="flex items-center gap-3">
              {(tipo || abierto) && (
                <button type="button" onClick={reiniciar} className="btn btn-ghost">
                  {esInvitado ? (
                    'Volver al inicio'
                  ) : (
                    <>
                      <span className="sm:hidden">Nuevo</span>
                      <span className="hidden sm:inline">Nuevo proyecto</span>
                    </>
                  )}
                </button>
              )}
              {perfil.rol === 'ingeniero' && (
                <Link to="/dashboard" className="btn btn-ghost">
                  <span className="sm:hidden">Panel</span>
                  <span className="hidden sm:inline">Panel del ingeniero</span>
                </Link>
              )}
              {/* El invitado no tiene cuenta: si saliera, perdería su sesión
                  hasta volver a abrir el enlace. */}
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
                  onAceptar={() => setPidiendoContacto(true)}
                  onGuardarEdicion={guardarCambiosAbierto}
                  proyectoId={abierto.id}
                  conSeguimiento={abierto.aceptado}
                />
              ) : (
                <PrototypePreview
                  code={abierto.reactCode ?? ''}
                  servicio={abierto.servicio}
                  respuestas={abierto.respuestas}
                  usage={abierto.usage}
                  guardado="guardado"
                  aceptacion={aceptacionAbierto}
                  onAceptar={() => setPidiendoContacto(true)}
                />
              )}
            </>
          ) : tipo === 'web' ? (
            <FlujoWeb
              onGuardado={refrescarLista}
              empresaInicial={esInvitado ? invitacion?.negocio : undefined}
              onEmpezar={esInvitado ? registrarInicioInvitacion : undefined}
            />
          ) : servicio && iniciado ? (
            <AIBProductOwner servicioInicial={descripcion} onComplete={handleComplete} />
          ) : servicio ? (
            <DescribirIdea
              nombre={servicio.nombre}
              icono={servicio.icono}
              ejemplos={servicio.ejemplos}
              onEmpezar={empezarIA}
              onVolver={reiniciar}
            />
          ) : esInvitado ? (
            <BienvenidaInvitado
              negocio={invitacion?.negocio ?? ''}
              onEmpezar={() => setTipo('web')}
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

              <div className="mt-10 grid gap-4 text-left sm:grid-cols-3">
                {SERVICIOS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setTipo(s.id)}
                    className="card group flex flex-col gap-3 p-6 transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-[var(--shadow-glow)]"
                  >
                    <span className="text-3xl" aria-hidden="true">
                      {s.icono}
                    </span>
                    <span className="text-lg font-semibold text-ink">{s.nombre}</span>
                    <span className="text-sm leading-relaxed text-ink-muted">{s.descripcion}</span>
                    {s.flujo === 'modulo' && (
                      <span className="mt-auto inline-flex w-fit items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">
                        Mira tu web en ~1 minuto
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {cargandoProyecto ? (
                <p className="mt-14 text-sm text-ink-subtle">Abriendo proyecto…</p>
              ) : (
                <ProyectosGuardados onAbrir={abrirProyecto} recargar={versionLista} />
              )}
            </section>
          )}
        </Shell>
      </main>

      {abierto && pidiendoContacto && (
        <ContactoEncargo
          tipoServicio={abierto.tipoServicio}
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

/** Portada del cliente que entró con una invitación: directo a su web. */
function BienvenidaInvitado({
  negocio,
  onEmpezar,
  cargandoProyecto,
  onAbrir,
  versionLista,
}: {
  negocio: string;
  onEmpezar: () => void;
  cargandoProyecto: boolean;
  onAbrir: (id: string) => void;
  versionLista: number;
}) {
  return (
    <section className="animate-fade-up mx-auto max-w-2xl py-14 text-center sm:py-20">
      <p className="mb-3 text-sm font-medium tracking-widest text-accent uppercase">Tu invitación</p>
      <h1 className="text-4xl font-bold text-balance sm:text-5xl">Hola, {negocio} 👋</h1>
      <p className="mx-auto mt-4 max-w-lg text-base text-ink-muted">
        Te invitaron a ver cómo se vería tu página web. Responde 6 preguntas rápidas y en un minuto
        verás una primera versión con tu nombre y tus colores. No necesitas crear cuenta ni pagar nada.
      </p>
      <button type="button" onClick={onEmpezar} className="btn btn-primary mt-8 px-8 py-3 text-base">
        Empezar
      </button>
      <p className="mt-4 text-xs text-ink-subtle">Puedes volver cuando quieras con el mismo enlace.</p>

      {cargandoProyecto ? (
        <p className="mt-14 text-sm text-ink-subtle">Abriendo proyecto…</p>
      ) : (
        <ProyectosGuardados onAbrir={onAbrir} recargar={versionLista} />
      )}
    </section>
  );
}

/** El ingeniero desactivó la invitación (o ya no existe). */
function InvitacionInactiva() {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-ink">Tu invitación ya no está activa</h1>
        <p className="mt-3 text-sm text-ink-muted">
          Pide a quien te envió el enlace que te mande uno nuevo.
        </p>
      </div>
    </div>
  );
}

/** Paso de descripción libre para los servicios que aún usan el discovery con IA. */
function DescribirIdea({
  nombre,
  icono,
  ejemplos,
  onEmpezar,
  onVolver,
}: {
  nombre: string;
  icono: string;
  ejemplos: string[];
  onEmpezar: (texto: string) => void;
  onVolver: () => void;
}) {
  const [texto, setTexto] = useState('');

  return (
    <section className="animate-fade-up mx-auto max-w-2xl py-14 text-center sm:py-20">
      <button type="button" onClick={onVolver} className="mb-6 text-sm text-ink-subtle hover:text-ink">
        ← Elegir otro servicio
      </button>
      <p className="mb-3 text-sm font-medium tracking-widest text-accent uppercase">
        {icono} {nombre}
      </p>
      <h1 className="text-3xl font-bold text-balance sm:text-4xl">Cuéntanos qué te gustaría resolver</h1>
      <p className="mx-auto mt-4 max-w-lg text-base text-ink-muted">
        Una frase basta. Luego te hacemos unas pocas preguntas para entenderlo bien.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onEmpezar(texto);
        }}
        className="mt-9 flex flex-col gap-3 sm:flex-row"
      >
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={ejemplos[0] ? `Ej: ${ejemplos[0]}` : 'Describe tu idea'}
          className="field flex-1 text-base"
          autoFocus
          aria-label="Describe lo que necesitas"
        />
        <button type="submit" disabled={!texto.trim()} className="btn btn-primary px-7">
          Empezar
        </button>
      </form>

      {ejemplos.length > 0 && (
        <div className="mt-10">
          <p className="mb-3 text-xs tracking-wide text-ink-subtle uppercase">O parte de un ejemplo</p>
          <div className="flex flex-wrap justify-center gap-2">
            {ejemplos.map((ejemplo) => (
              <button
                key={ejemplo}
                type="button"
                onClick={() => onEmpezar(ejemplo)}
                className="rounded-full border border-line bg-surface-raised/60 px-4 py-2 text-sm text-ink-muted transition-colors hover:border-accent/50 hover:text-ink"
              >
                {ejemplo}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
