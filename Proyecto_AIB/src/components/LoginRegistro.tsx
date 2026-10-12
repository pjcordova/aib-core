import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Logo } from './ui/Primitives';
import { AccesoCliente } from './AccesoCliente';
import { hayAcceso, useAccesos } from '../lib/cuentaCliente';
import { MENSAJE_CAPTCHA, conCaptcha, esErrorDeCaptcha } from '../lib/captcha';

// ---------------------------------------------------------------------------
// LoginRegistro — autenticación con Supabase
// ---------------------------------------------------------------------------
// Misma lógica de siempre (signIn / signUp). Lo que cambia es que los estilos
// ya no viven en un bloque <style> de 150 líneas dentro del componente: ahora
// usa los tokens del sistema de diseño, así que el login y el resto de la app
// comparten paleta, tipografía y foco por construcción.
// ---------------------------------------------------------------------------

type AuthMode = 'login' | 'registro';

interface LoginRegistroProps {
  onAuthSuccess: () => void;
  /** Con qué pestaña se abre: «Pruébalo gratis» en la portada abre el registro. */
  modoInicial?: AuthMode;
  /** Vuelve a la portada. */
  onVolver?: () => void;
  /** A dónde lleva el enlace del correo de confirmación (por defecto, a la portada). */
  redirigirA?: string;
  /** Texto bajo la marca. */
  subtitulo?: string;
  /**
   * Desde «Ingresar» de la portada: el cliente que guardó su proyecto no tiene
   * contraseña (entró con Google o con un código). Se le ofrece primero su
   * entrada, y al entrar se llama a esto.
   */
  onClienteDentro?: () => void;
}

/** Los errores de Supabase, en palabras del usuario. */
function mensajeDeError(mensaje: string, conClientes: boolean): string {
  if (esErrorDeCaptcha({ message: mensaje })) return MENSAJE_CAPTCHA;
  if (/invalid login credentials/i.test(mensaje)) {
    return conClientes
      ? 'Correo o contraseña incorrectos. Si guardaste tu proyecto con Google o con un código, usa «Entrar a mi proyecto».'
      : 'Correo o contraseña incorrectos.';
  }
  if (/email not confirmed/i.test(mensaje)) return 'Aún no confirmas tu correo. Revisa tu bandeja de entrada.';
  if (/user already registered/i.test(mensaje)) return 'Ese correo ya tiene una cuenta. Inicia sesión.';
  if (/password should be at least/i.test(mensaje)) return 'La contraseña debe tener al menos 6 caracteres.';
  return mensaje;
}

const LoginRegistro: React.FC<LoginRegistroProps> = ({
  onAuthSuccess,
  modoInicial = 'login',
  onVolver,
  redirigirA,
  subtitulo,
  onClienteDentro,
}) => {
  const [mode, setMode] = useState<AuthMode>(modoInicial);
  const accesos = useAccesos();
  const conClientes = !!onClienteDentro && hayAcceso(accesos);
  const [recuperando, setRecuperando] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const cambiarModo = (siguiente: AuthMode) => {
    setMode(siguiente);
    setError(null);
    setSuccessMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: await conCaptcha(),
        });
        if (signInError) {
          setError(mensajeDeError(signInError.message, conClientes));
          return;
        }
        onAuthSuccess();
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          // El enlace del correo de confirmación vuelve a donde se registró. Sin
          // esto, Supabase usa su dirección por defecto (Site URL).
          options: {
            emailRedirectTo: redirigirA ?? `${window.location.origin}${window.location.pathname}`,
            ...(await conCaptcha()),
          },
        });
        if (signUpError) {
          setError(mensajeDeError(signUpError.message, conClientes));
          return;
        }
        setSuccessMsg(
          'Cuenta creada exitosamente. Revisa tu correo para confirmar tu cuenta.'
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-[400px]">
        <div className="card animate-fade-up p-8">
          <div className="mb-7 flex flex-col items-center text-center">
            <Logo size={40} />
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              AIB<span className="text-accent-alt">+</span>
            </h1>
            <p className="mt-1 text-xs tracking-wide text-ink-subtle">
              {subtitulo ?? (mode === 'registro' ? 'Crea tu cuenta y mira cómo quedaría tu proyecto' : 'Tecnología para tu negocio')}
            </p>
          </div>

          {conClientes && mode === 'login' && (
            <>
              <div className="rounded-xl border border-accent-alt/50 bg-accent-alt/10 p-4 text-center">
                <p className="font-semibold text-ink">¿Hiciste un proyecto en AIB+?</p>
                <p className="mt-1 text-xs text-ink-muted">
                  Entra con el Google o el correo con el que lo guardaste. No necesitas contraseña.
                </p>
                <button type="button" onClick={() => setRecuperando(true)} className="btn btn-primary mt-3 w-full">
                  Entrar a mi proyecto
                </button>
              </div>
              <div className="my-6 flex items-center gap-3 text-xs text-ink-subtle">
                <span className="h-px flex-1 bg-line" />
                ¿Eres ingeniero? Ingresa con tu contraseña
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <div className="mb-6 flex rounded-xl border border-line bg-surface-deep/50 p-1">
            {(['login', 'registro'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => cambiarModo(m)}
                aria-pressed={mode === m}
                className={
                  'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ' +
                  (mode === m
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-ink-muted hover:text-ink')
                }
              >
                {m === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="auth-email" className="block text-sm font-medium text-ink-muted">
                Correo electrónico
              </label>
              <input
                id="auth-email"
                type="email"
                placeholder="tu@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="field"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="auth-password" className="block text-sm font-medium text-ink-muted">
                Contraseña
              </label>
              <input
                id="auth-password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="field"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-negative/30 bg-negative/10 px-3.5 py-2.5 text-sm text-negative"
              >
                {error}
              </p>
            )}

            {successMsg && (
              <p
                role="status"
                className="rounded-lg border border-positive/30 bg-positive/10 px-3.5 py-2.5 text-sm text-positive"
              >
                {successMsg}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary w-full !py-3">
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-deep/30 border-t-surface-deep" />
                  Procesando…
                </>
              ) : mode === 'login' ? (
                'Ingresar'
              ) : (
                'Registrarse'
              )}
            </button>
          </form>
        </div>

        {onVolver && (
          <button
            type="button"
            onClick={onVolver}
            className="mx-auto mt-5 block text-sm text-ink-muted transition-colors hover:text-ink"
          >
            ← Volver
          </button>
        )}
        <p className="mt-6 text-center text-xs text-ink-subtle">
          Cordova Solutions © {new Date().getFullYear()}
        </p>
      </div>
      {recuperando && onClienteDentro && (
        <AccesoCliente
          accion="recuperar"
          onCerrar={() => setRecuperando(false)}
          onListo={() => {
            setRecuperando(false);
            onClienteDentro();
          }}
        />
      )}
    </div>
  );
};

export default LoginRegistro;
