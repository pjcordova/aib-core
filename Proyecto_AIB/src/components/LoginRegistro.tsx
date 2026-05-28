import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// LoginRegistro — Supabase Authentication Component
// ---------------------------------------------------------------------------
// Provides sign-in and sign-up flows using Supabase Auth.
// On successful authentication, calls `onAuthSuccess` to allow the parent
// component to update its state (e.g., redirect to the main app).
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (mode === 'login') {
        // ----- SIGN IN -----
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
        // ----- SIGN UP -----
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

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
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-icon">◆</span>
          <h1>AIB+</h1>
          <p className="auth-subtitle">Motor de Preventa Autónomo</p>
        </div>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(null); setSuccessMsg(null); }}
            type="button"
          >
            Iniciar Sesión
          </button>
          <button
            className={`auth-tab ${mode === 'registro' ? 'active' : ''}`}
            onClick={() => { setMode('registro'); setError(null); setSuccessMsg(null); }}
            type="button"
          >
            Crear Cuenta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="auth-email">Correo electrónico</label>
            <input
              id="auth-email"
              type="email"
              placeholder="tu@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-password">Contraseña</label>
            <input
              id="auth-password"
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="auth-success" role="status">
              {successMsg}
            </div>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading
              ? 'Procesando...'
              : mode === 'login'
                ? 'Ingresar'
                : 'Registrarse'}
          </button>
        </form>

        <p className="auth-footer">
          Cordova Solutions © {new Date().getFullYear()}
        </p>
      </div>

      <style>{`
        .auth-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          padding: 20px;
        }

        .auth-card {
          width: 100%;
          max-width: 420px;
          background: rgba(30, 41, 59, 0.8);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 20px;
          padding: 40px 36px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.4);
        }

        .auth-logo {
          text-align: center;
          margin-bottom: 32px;
        }

        .auth-logo-icon {
          font-size: 32px;
          color: #38bdf8;
          display: block;
          margin-bottom: 8px;
        }

        .auth-logo h1 {
          font-size: 28px;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0;
          letter-spacing: 2px;
        }

        .auth-subtitle {
          color: #94a3b8;
          font-size: 13px;
          margin: 6px 0 0;
        }

        .auth-tabs {
          display: flex;
          gap: 4px;
          background: rgba(15, 23, 42, 0.6);
          border-radius: 12px;
          padding: 4px;
          margin-bottom: 28px;
        }

        .auth-tab {
          flex: 1;
          padding: 10px;
          border: none;
          border-radius: 10px;
          background: transparent;
          color: #94a3b8;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .auth-tab.active {
          background: #38bdf8;
          color: #0f172a;
          font-weight: 600;
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .auth-field label {
          display: block;
          color: #cbd5e1;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 6px;
        }

        .auth-field input {
          width: 100%;
          padding: 12px 14px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 10px;
          background: rgba(15, 23, 42, 0.5);
          color: #f1f5f9;
          font-size: 15px;
          transition: border-color 0.2s ease;
          box-sizing: border-box;
        }

        .auth-field input::placeholder {
          color: #475569;
        }

        .auth-field input:focus {
          outline: none;
          border-color: #38bdf8;
          box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.15);
        }

        .auth-error {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #fca5a5;
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 13px;
        }

        .auth-success {
          background: rgba(34, 197, 94, 0.15);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: #86efac;
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 13px;
        }

        .auth-submit {
          width: 100%;
          padding: 14px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, #38bdf8, #818cf8);
          color: #fff;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.25s ease;
          letter-spacing: 0.5px;
        }

        .auth-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(56, 189, 248, 0.3);
        }

        .auth-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .auth-footer {
          text-align: center;
          color: #475569;
          font-size: 12px;
          margin-top: 28px;
        }
      `}</style>
    </div>
  );
};

export default LoginRegistro;
