import React, { useState, useEffect } from "react";
import LoginRegistro from "./components/LoginRegistro";
import { AIBProductOwner } from "./components/AIBProductOwner";
import { supabase } from "./lib/supabase";
import type { QAHistory } from "./Types/productOwner";

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [service, setService] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!session) {
    return <LoginRegistro onAuthSuccess={() => {}} />;
  }

  const handleComplete = (history: QAHistory[]) => {
    console.log("Interrogation complete!", history);
    // Future phase: Move to Prototyping
  };

  return (
    <main>
      <header className="app-header">
        <h1>AIB+ SaaS Engine</h1>
        <button onClick={() => supabase.auth.signOut()} className="logout-btn">Cerrar Sesión</button>
      </header>

      {!started ? (
        <div className="service-prompt">
          <h2>¿Qué software necesitas construir hoy?</h2>
          <input 
            type="text" 
            value={service} 
            onChange={e => setService(e.target.value)}
            placeholder="Ej: Un ERP para restaurantes con facturación..."
          />
          <button onClick={() => { if (service) setStarted(true); }}>
            Iniciar IA Product Owner
          </button>
        </div>
      ) : (
        <AIBProductOwner 
          servicioInicial={service}
          onComplete={handleComplete}
        />
      )}

      <style>{`
        main {
          max-width: 980px;
          margin: 0 auto;
          padding: 24px;
          font-family: Inter, system-ui, sans-serif;
        }
        .app-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 40px;
        }
        .logout-btn {
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: transparent;
          cursor: pointer;
        }
        .service-prompt {
          text-align: center;
          padding: 40px;
          background: #f8fafc;
          border-radius: 16px;
          border: 1px dashed #cbd5e1;
        }
        .service-prompt input {
          width: 80%;
          max-width: 400px;
          padding: 12px;
          margin: 20px 0;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
        }
        .service-prompt button {
          display: block;
          margin: 0 auto;
          padding: 12px 24px;
          background: #0ea5e9;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
        }
      `}</style>
    </main>
  );
}
