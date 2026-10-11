import { useEffect, useState } from 'react';
import {
  confirmarCodigo,
  continuarConGoogle,
  correoValido,
  useAccesos,
  pedirCodigo,
  reenviarCodigo,
  revisarSiSeGuardo,
  type AccionAcceso,
  type TipoCodigo,
} from '../lib/cuentaCliente';

/** Segundos antes de poder pedir otro código. */
const ESPERA_REENVIO = 60;

/**
 * Guardar el proyecto (el cliente sin cuenta) o recuperarlo (desde otro
 * dispositivo), con Google o con un código al correo. Sin contraseñas.
 */
export function AccesoCliente({
  accion,
  trasEnviar = false,
  onCerrar,
  onListo,
}: {
  accion: AccionAcceso;
  /** Recién envió su encargo: se le ofrece en ese momento. */
  trasEnviar?: boolean;
  onCerrar: () => void;
  /**
   * Ya quedó guardado, o ya entró a su cuenta. Con el correo, con cuál; y si
   * ese correo ya tenía cuenta (entró a ella y se trajo este proyecto).
   */
  onListo: (con: { correo: string; yaTeniaCuenta: boolean }) => void;
}) {
  const guardar = accion === 'guardar';
  const [paso, setPaso] = useState<'elegir' | 'codigo'>('elegir');
  const [correo, setCorreo] = useState('');
  const [codigo, setCodigo] = useState('');
  const [tipo, setTipo] = useState<TipoCodigo>('ingreso');
  const [yaTeniaCuenta, setYaTeniaCuenta] = useState(false);
  const [cargando, setCargando] = useState<'google' | 'correo' | 'codigo' | 'reenvio' | null>(null);
  const [error, setError] = useState('');
  const [reenviarEn, setReenviarEn] = useState(0);
  // Solo las formas que ya están listas (Google activado, correo con Resend).
  const accesos = useAccesos();

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !cargando && onCerrar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [cargando, onCerrar]);

  useEffect(() => {
    if (reenviarEn <= 0) return;
    const t = setTimeout(() => setReenviarEn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [reenviarEn]);

  // Si tocó el enlace del correo en otra pestaña o en el celular, al volver
  // aquí se comprueba: así no tiene que escribir el código.
  useEffect(() => {
    if (paso !== 'codigo' || tipo !== 'cambio') return;
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return;
      void revisarSiSeGuardo().then(
        (listo) =>
          listo &&
          onListo({
            correo: correo.trim().toLowerCase(),
            yaTeniaCuenta: false,
          }),
      );
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [paso, tipo, correo, onListo]);

  const conGoogle = async () => {
    setError('');
    setCargando('google');
    const r = await continuarConGoogle(accion);
    // Sin error, el navegador ya se va a Google.
    if (r.error) {
      setError(r.error);
      setCargando(null);
    }
  };

  const enviarCorreo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correoValido(correo)) return setError('Escribe tu correo completo, por ejemplo: nombre@gmail.com');
    setError('');
    setCargando('correo');
    const r = await pedirCodigo(correo, accion);
    setCargando(null);
    if ('error' in r) return setError(r.error);
    setTipo(r.tipo);
    setYaTeniaCuenta(r.yaTeniaCuenta);
    setCodigo('');
    setReenviarEn(ESPERA_REENVIO);
    setPaso('codigo');
  };

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (codigo.replace(/\D/g, '').length < 6) return setError('Escribe el código completo que te llegó.');
    setError('');
    setCargando('codigo');
    const r = await confirmarCodigo(correo, codigo, tipo);
    setCargando(null);
    if (r.error) return setError(r.error);
    onListo({ correo: correo.trim().toLowerCase(), yaTeniaCuenta });
  };

  const reenviar = async () => {
    setError('');
    setCargando('reenvio');
    const r = await reenviarCodigo(correo, tipo);
    setCargando(null);
    if (r.error) return setError(r.error);
    setReenviarEn(ESPERA_REENVIO);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-acceso"
    >
      <div className="card animate-fade-up max-h-[92vh] w-full max-w-md overflow-y-auto p-6 sm:p-8">
        {paso === 'codigo' ? (
          <form onSubmit={(e) => void confirmar(e)}>
            <h2 id="titulo-acceso" className="text-xl font-semibold">
              Revisa tu correo
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Te enviamos un código a <strong className="text-ink">{correo.trim().toLowerCase()}</strong>. Escríbelo
              aquí o toca el enlace del correo.
              {yaTeniaCuenta &&
                ' Ese correo ya tenía un proyecto guardado: entrarás a tu cuenta y te traeremos también este.'}
            </p>
            <label className="mt-5 block text-sm">
              <span className="mb-1.5 block text-ink-muted">Código</span>
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 10))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="field text-center text-2xl tracking-[0.4em] tabular-nums"
                autoFocus
              />
            </label>
            {error && (
              <p role="alert" className="mt-3 text-sm text-negative">
                {error}
              </p>
            )}
            <button type="submit" disabled={!!cargando} className="btn btn-primary mt-5 w-full">
              {cargando === 'codigo' ? 'Revisando…' : guardar ? 'Guardar mi proyecto' : 'Entrar'}
            </button>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
              <button
                type="button"
                onClick={() => {
                  setPaso('elegir');
                  setError('');
                }}
                className="hover:text-ink"
              >
                ← Cambiar correo
              </button>
              {reenviarEn > 0 ? (
                <span>Puedes pedir otro en {reenviarEn} s</span>
              ) : (
                <button
                  type="button"
                  onClick={() => void reenviar()}
                  disabled={!!cargando}
                  className="font-medium text-accent hover:underline"
                >
                  {cargando === 'reenvio' ? 'Enviando…' : '¿No te llegó? Enviar otro'}
                </button>
              )}
            </div>
            <p className="mt-3 text-xs text-ink-subtle">Si no lo ves, revisa la carpeta de spam o promociones.</p>
          </form>
        ) : (
          <>
            {trasEnviar && (
              <p className="text-xs font-medium tracking-widest text-positive uppercase">
                ✓ Tu encargo ya está enviado
              </p>
            )}
            <h2 id="titulo-acceso" className="mt-1.5 text-xl font-semibold text-balance">
              {guardar ? 'Guarda tu proyecto' : 'Recupera tu proyecto'}
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              {guardar
                ? 'Así lo sigues desde cualquier celular o computadora y ves cómo avanza tu encargo. No necesitas contraseña.'
                : `Entra con ${accesos?.correo ? 'el Google o el correo' : 'la cuenta de Google'} con ${accesos?.correo ? 'el' : 'la'} que lo guardaste. No necesitas contraseña.`}
            </p>

            {accesos?.google && (
              <>
                <button
                  type="button"
                  onClick={() => void conGoogle()}
                  disabled={!!cargando}
                  className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl border border-line-strong bg-white px-4 py-3 text-sm font-medium text-[#1f1f1f] shadow-sm transition-colors hover:bg-[#f7f8f8] disabled:opacity-60"
                >
                  <LogoGoogle />
                  {cargando === 'google' ? 'Abriendo Google…' : 'Continuar con Google'}
                </button>

                {accesos.correo && (
                  <div className="my-5 flex items-center gap-3 text-xs text-ink-subtle">
                    <span className="h-px flex-1 bg-line" />o con tu correo
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}
              </>
            )}

            {accesos?.correo && (
              <form onSubmit={(e) => void enviarCorreo(e)} className={'space-y-3 ' + (accesos.google ? '' : 'mt-6')}>
                <input
                  type="email"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value.slice(0, 120))}
                  placeholder="tu@correo.com"
                  autoComplete="email"
                  inputMode="email"
                  className="field"
                  aria-label="Tu correo"
                />
                <button type="submit" disabled={!!cargando} className="btn btn-ghost w-full">
                  {cargando === 'correo' ? 'Enviando…' : 'Enviarme un código'}
                </button>
              </form>
            )}
            {accesos && !accesos.google && !accesos.correo && (
              <p className="mt-6 text-sm text-ink-muted">Todavía no está disponible. Vuelve a intentarlo más tarde.</p>
            )}

            {error && (
              <p role="alert" className="mt-3 text-sm text-negative">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={onCerrar}
              disabled={!!cargando}
              className="mt-5 block w-full text-center text-sm text-ink-muted hover:text-ink"
            >
              {guardar ? 'Ahora no' : 'Cancelar'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** La «G» de Google, con sus colores, como pide su guía para estos botones. */
function LogoGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
