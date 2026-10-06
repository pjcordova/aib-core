import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePerfil } from '../../hooks/usePerfil';
import { miPerfilIngeniero, type EstadoIngeniero, type MiPerfil } from '../../lib/ingenieros';
import LoginRegistro from '../LoginRegistro';
import { Wordmark } from '../ui/Primitives';
import { FormularioPerfil } from './FormularioPerfil';
import { PLANES, preciosPlanes } from '../../lib/planes';
import { solesEnteros } from '../../lib/servicios';

// ---------------------------------------------------------------------------
// Únete a AIB+ como ingeniero (/ingenieros)
// ---------------------------------------------------------------------------
// Registro abierto con aprobación: cualquiera con cuenta arma su perfil y
// postula; el administrador lo revisa en su panel. Al aprobarlo pasa a ser
// ingeniero y sale a los clientes al elegir quién les construye la web.
// ---------------------------------------------------------------------------

const VENTAJAS = [
  {
    titulo: 'Clientes que ya saben lo que quieren',
    texto: 'Te llegan con su web ya imaginada: rubro, secciones, colores, diseño elegido y presupuesto.',
  },
  {
    titulo: 'Tu perfil trabaja por ti',
    texto: 'Los dueños de negocio te eligen por tu perfil, tus rubros y las reseñas de tus clientes.',
  },
  {
    titulo: 'Empiezas gratis',
    texto: 'El plan Free no cuesta nada. Con Pro sumas a ABI, tu asistente con IA, y con Negocio, a tu equipo.',
  },
];

export function UneteIngeniero() {
  const { session, initializing, signOut } = useAuth();
  const conCuenta = !!session && !session.user.is_anonymous;
  const perfil = usePerfil(conCuenta ? session?.user.id : null);
  const [acceso, setAcceso] = useState<'login' | 'registro' | null>(null);
  const [miPerfil, setMiPerfil] = useState<MiPerfil | null | undefined>(undefined);
  const [recienEnviada, setRecienEnviada] = useState<EstadoIngeniero | null>(null);

  useEffect(() => {
    if (!conCuenta) return;
    let vigente = true;
    void miPerfilIngeniero().then((p) => {
      if (vigente) setMiPerfil(p);
    });
    return () => {
      vigente = false;
    };
  }, [conCuenta, session?.user.id]);

  if (initializing) return null;

  // Sin cuenta: primero se crea (o se entra) y luego se arma el perfil.
  if (!conCuenta && acceso) {
    return (
      <LoginRegistro
        key={acceso}
        onAuthSuccess={() => setAcceso(null)}
        modoInicial={acceso}
        onVolver={() => setAcceso(null)}
        redirigirA={`${window.location.origin}/ingenieros`}
        subtitulo="Crea tu cuenta para postular como ingeniero"
      />
    );
  }

  const cargando = conCuenta && (perfil.cargando || miPerfil === undefined);
  const esIngeniero = conCuenta && perfil.rol === 'ingeniero';
  const estado = recienEnviada ?? miPerfil?.estado ?? null;

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link to="/" aria-label="Ir a la portada de AIB+">
          <Wordmark />
        </Link>
        {conCuenta ? (
          <button type="button" onClick={signOut} className="btn btn-ghost">
            Salir
          </button>
        ) : (
          <button type="button" onClick={() => setAcceso('login')} className="btn btn-ghost">
            Ingresar
          </button>
        )}
      </header>

      <main className="mx-auto grid max-w-6xl gap-12 px-4 pt-8 pb-20 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
        <section>
          <p className="mb-4 text-xs font-medium tracking-[0.2em] text-ink-subtle uppercase">Para ingenieros</p>
          <h1 className="text-4xl leading-[1.1] text-balance sm:text-5xl">Únete a AIB+ y construye webs para negocios</h1>
          <p className="mt-5 max-w-lg text-ink-muted">
            AIB+ atrae a los dueños de negocio y les enseña en un minuto cómo quedaría su web. Cuando les gusta, eligen a un
            ingeniero para construirla. Ese ingeniero puedes ser tú.
          </p>
          <ul className="mt-8 space-y-5">
            {VENTAJAS.map((v) => (
              <li key={v.titulo} className="flex gap-3">
                <span
                  className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs text-white"
                  aria-hidden="true"
                >
                  ✓
                </span>
                <div>
                  <p className="font-medium text-ink">{v.titulo}</p>
                  <p className="text-sm text-ink-muted">{v.texto}</p>
                </div>
              </li>
            ))}
          </ul>
          <ol className="mt-10 space-y-2 text-sm text-ink-muted">
            <li>
              <strong className="text-ink">1.</strong> Crea tu cuenta y arma tu perfil.
            </li>
            <li>
              <strong className="text-ink">2.</strong> El equipo de AIB+ revisa tu solicitud.
            </li>
            <li>
              <strong className="text-ink">3.</strong> Apareces a los clientes y te eligen.
            </li>
          </ol>
        </section>

        <section className="card p-6 sm:p-8">
          {!conCuenta ? (
            <div className="flex h-full flex-col justify-center text-center">
              <h2 className="text-2xl">Postula en unos minutos</h2>
              <p className="mt-2 text-sm text-ink-muted">Necesitas una cuenta con tu correo para armar tu perfil.</p>
              <button
                type="button"
                onClick={() => setAcceso('registro')}
                className="btn btn-primary mx-auto mt-6 px-8 py-3 text-base"
              >
                Crear mi cuenta
              </button>
              <button type="button" onClick={() => setAcceso('login')} className="mt-3 text-sm text-ink-muted hover:text-ink">
                Ya tengo cuenta
              </button>
            </div>
          ) : cargando ? (
            <p className="text-sm text-ink-subtle">Cargando…</p>
          ) : esIngeniero ? (
            <div className="text-center">
              <h2 className="text-2xl">Ya eres ingeniero de AIB+</h2>
              <p className="mt-2 text-sm text-ink-muted">Tu perfil y tus encargos están en tu panel.</p>
              <Link to="/dashboard" className="btn btn-primary mt-6 inline-flex">
                Ir a mi panel
              </Link>
            </div>
          ) : (
            <>
              {estado === 'pendiente' && (
                <p role="status" className="mb-6 rounded-xl border border-accent-alt/50 bg-accent-alt/10 p-4 text-sm text-ink">
                  <strong>Tu solicitud está en revisión.</strong> Te avisaremos cuando la aprueben. Mientras tanto puedes
                  mejorar tu perfil.
                </p>
              )}
              {estado === 'rechazado' && (
                <p role="status" className="mb-6 rounded-xl border border-line p-4 text-sm text-ink">
                  Tu solicitud no fue aprobada esta vez. Puedes mejorar tu perfil y volver a enviarla.
                </p>
              )}
              <h2 className="text-2xl">{estado ? 'Tu perfil' : 'Arma tu perfil'}</h2>
              <p className="mt-1 mb-6 text-sm text-ink-muted">Es lo que verán los dueños de negocio al elegir.</p>
              <FormularioPerfil
                key={miPerfil ? 'con-perfil' : 'nuevo'}
                inicial={miPerfil}
                textoBoton={estado === 'pendiente' ? 'Guardar cambios' : 'Enviar solicitud'}
                onGuardado={(nuevo) => {
                  setRecienEnviada(nuevo);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </>
          )}
        </section>
      </main>

      <PlanesIngeniero />
    </div>
  );
}

/** Los tres planes, con los precios que puso el administrador. */
function PlanesIngeniero() {
  const [precios, setPrecios] = useState<{ pro: number; negocio: number } | null>(null);

  useEffect(() => {
    let vigente = true;
    void preciosPlanes().then((p) => {
      if (vigente) setPrecios(p);
    });
    return () => {
      vigente = false;
    };
  }, []);

  if (!precios) return null;

  return (
    <section id="planes" className="border-t border-line bg-surface-raised/60">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-3xl sm:text-4xl">Planes para ingenieros</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-ink-muted">
          Los clientes llegan gratis en todos los planes. Pagas solo si quieres a ABI o trabajar en equipo.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PLANES.map((p) => (
            <article
              key={p.id}
              className={
                'flex flex-col rounded-2xl border p-6 ' +
                (p.id === 'pro' ? 'border-accent/40 bg-accent/5' : 'border-line bg-surface-base')
              }
            >
              <h3 className="text-xl">{p.nombre}</h3>
              <p className="mt-2">
                {p.id === 'free' ? (
                  <span className="text-3xl font-semibold text-ink">Gratis</span>
                ) : (
                  <>
                    <span className="text-3xl font-semibold text-ink tabular-nums">
                      {solesEnteros(p.id === 'pro' ? precios.pro : precios.negocio)}
                    </span>
                    <span className="text-sm text-ink-muted"> al mes</span>
                  </>
                )}
              </p>
              <p className="mt-1 text-sm text-ink-muted">{p.resumen}</p>
              <ul className="mt-4 space-y-2 text-sm text-ink">
                {p.incluye.map((linea) => (
                  <li key={linea} className="flex gap-2">
                    <span className="text-accent" aria-hidden="true">
                      ✓
                    </span>
                    {linea}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-ink-subtle">
          Empiezas en Free. Cambias de plan cuando quieras desde tu panel, en «Mi plan».
        </p>
      </div>
    </section>
  );
}
