import React from "react";
import { FormularioGusano } from "./components/FormularioGusano";

export default function Home() {
  return (
    <main>
      <h1>Plataforma asistida por IA — Formulario “Gusano”</h1>
      <p>Desde lo general a lo específico, con sostenibilidad integrada y previsualización antes de validar.</p>
      <FormularioGusano />
      <style jsx>{`
        main {
          max-width: 980px;
          margin: 0 auto;
          padding: 24px;
          font-family: Inter, system-ui, sans-serif;
        }
        h1 {
          font-size: 26px;
        }
        p {
          color: #546e7a;
        }
      `}</style>
    </main>
  );
}
