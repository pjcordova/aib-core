import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { CUPO_EQUIPO, equipoPorToken, unirseEquipo, type EquipoPublico, type ResultadoUnirse } from '../../lib/planes';
import LoginRegistro from '../LoginRegistro';
import { Wordmark } from '../ui/Primitives';

// ---------------------------------------------------------------------------
// Unirse a un equipo (/equipo/:token)
// ---------------------------------------------------------------------------
// El dueño de un plan Negocio comparte este enlace. Quien lo abre crea su
// cuenta (o entra), pone su nombre y pasa a ver los encargos del equipo.
// ---------------------------------------------------------------------------

const MENSAJES: Partial<Record<ResultadoUnirse, string>> = {
  no_existe: 'Este enlace ya no sirve. Pídele a quien te invitó uno nuevo.',
  inactivo: 'El plan Negocio de este equipo no está activo. Pídele a quien te invitó que lo renueve.',
  lleno: `Este equipo ya tiene ${CUPO_EQUIPO} personas.`,
  ya_en_equipo: 'Ya eres parte de otro equipo. Sal de él en «Mi plan» para unirte a este.',
  tiene_equipo: 'Tienes tu propio equipo: no puedes unirte a otro.',
  anonimo: 'Necesitas una cuenta con tu correo para unirte.',
  error: 'No pudimos unirte. Vuelve a intentarlo.',
};

export function UnirseEquipo() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { session, initializing, signOut } = useAuth();
  const conCuenta = !!session && !session.user.is_anonymous;
  const [equipo, setEquipo] = useState<EquipoPublico | null | undefined>(undefined);
  const [acceso, setAcceso] = useState<'login' | 'registro' | null>(null);
  const [nombre, setNombre] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoUnirse | null>(null);

  useEffect(() => {
    let vigente = true;
    void equipoPorToken(token).then((e) => {
      if (vigente) setEquipo(e);
    });
    return () => {
      vigente = false;
    };
  }, [token]);

  if (initializing || equipo === undefined) return null;

  if (!conCuenta && acceso) {
    return (
      <LoginRegistro
        key={acceso}
        onAuthSuccess={() => setAcceso(null)}
        modoInicial={acceso}
        onVolver={() => setAcceso(null)}
        redirigirA={`${window.location.origin}/equipo/${token}`}
        subtitulo="Crea tu cuenta para unirte al equipo"
      />
    );
  }

  const unirse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nombre.trim().length < 2) return;
    setEnviando(true);
    const r = await unirseEquipo(token, nombre.trim());
    setEnviando(false);
    if (r === 'ok') navigate('/dashboard', { replace: true });
    else setResultado(r);
  };

  const problema = !equipo ? MENSAJES.no_existe : !equipo.activo ? MENSAJES.inactivo : equipo.lleno ? MENSAJES.lleno : null;

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link to="/" aria-label="Ir a la portada de AIB+">
          <Wordmark />
        </Link>
        {conCuenta && (
          <button type="button" onClick={signOut} className="btn btn-ghost">
            Salir
          </button>
        )}
      </header>

      <main className="mx-auto max-w-md px-4 pt-10 pb-20">
        <div className="card p-6 text-center sm:p-8">
          <p className="mb-3 text-xs font-medium tracking-[0.2em] text-ink-subtle uppercase">Equipo en AIB+</p>
          <h1 className="text-3xl text-balance">
            {equipo ? <>Únete al equipo de {equipo.agencia}</> : 'Enlace no válido'}
          </h1>

          {problema ? (
            <p className="mt-4 text-sm text-ink-muted">{problema}</p>
          ) : !conCuenta ? (
            <>
              <p className="mt-3 text-sm text-ink-muted">
                Verás los encargos del equipo, tendrás a ABI, tu asistente, y sabrás cuáles te tocan.
              </p>
              <button
                type="button"
                onClick={() => setAcceso('registro')}
                className="btn btn-primary mx-auto mt-6 px-8 py-3 text-base"
              >
                Crear mi cuenta
              </button>
              <button
                type="button"
                onClick={() => setAcceso('login')}
                className="mt-3 block w-full text-sm text-ink-muted hover:text-ink"
              >
                Ya tengo cuenta
              </button>
            </>
          ) : (
            <form onSubmit={(e) => void unirse(e)} className="mt-6 text-left">
              <label className="text-sm">
                <span className="mb-1 block text-ink-muted">Tu nombre, como te verá el equipo</span>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value.slice(0, 60))}
                  autoComplete="name"
                  required
                  minLength={2}
                  className="field"
                />
              </label>
              <button
                type="submit"
                disabled={enviando || nombre.trim().length < 2}
                className="btn btn-primary mt-4 w-full py-3"
              >
                {enviando ? 'Uniéndote…' : 'Unirme al equipo'}
              </button>
              {resultado && resultado !== 'ok' && (
                <p role="alert" className="mt-3 text-sm text-negative">
                  {MENSAJES[resultado] ?? MENSAJES.error}
                </p>
              )}
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
