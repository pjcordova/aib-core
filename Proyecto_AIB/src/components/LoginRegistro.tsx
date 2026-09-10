import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Logo } from './ui/Primitives';

// ---------------------------------------------------------------------------
// LoginRegistro — autenticación con Supabase
// ---------------------------------------------------------------------------
// Misma lógica de siempre (signIn / signUp). Lo que cambia es que los estilos
// ya no viven en un bloque <style> de 150 líneas dentro del componente: ahora
// usa los tokens del sistema de diseño, así que el login y el resto de la app
// comparten paleta, tipografía y foco por construcción.
// ---------------------------------------------------------------------------

interface LoginRegistroProps {
  onAuthSuccess: () => void;
}

type AuthMode = 'login' | 'registro';

const LoginRegistro: React.FC<LoginRegistroProps> = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState<AuthMode>('login');
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
        });
        if (signInError) {
          setError(signInError.message);
          return;
        }
        onAuthSuccess();
      } else {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) {
          setError(signUpError.message);
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
            <h1 className="mt-3 text-2xl font-bold tracking-tight">
              AIB<span className="text-accent">+</span>
            </h1>
            <p className="mt-1 text-xs tracking-wide text-ink-subtle">
              Motor de Proyecto Autónomo
            </p>
          </div>

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
                    ? 'bg-accent text-surface-deep shadow-sm'
                    : 'text-ink-muted hover:text-ink')
                }
              >
                {m === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
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

        <p className="mt-6 text-center text-xs text-ink-subtle">
          Cordova Solutions © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
};

export default LoginRegistro;
