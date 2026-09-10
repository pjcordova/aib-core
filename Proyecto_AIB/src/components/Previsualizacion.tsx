import React from "react";
import type { PaqueteProyecto } from "../Types/form";

export const Previsualizacion: React.FC<{ paquete: PaqueteProyecto | null }> = ({ paquete }) => {
  if (!paquete) {
    return (
      <div className="preview">
        <p>Aún no hay paquete. Completa el formulario para generar una previsualización.</p>
      </div>
    );
  }

  const { resumen, funciones, experiencia, tecnologiaPreferida, sostenibilidad, artefactos } = paquete;

  return (
    <div className="preview">
      <h3>Previsualización del Proyecto</h3>
      <div className="cards">
        <div className="card">
          <strong>Solución:</strong> {resumen.solucion}
        </div>
        <div className="card">
          <strong>Objetivo:</strong> {resumen.objetivo}
        </div>
        <div className="card">
          <strong>Presupuesto:</strong> {resumen.presupuesto}
        </div>
        <div className="card">
          <strong>Tiempo:</strong> {resumen.tiempo}
        </div>
      </div>

      <div className="section">
        <strong>Funciones clave:</strong>
        <ul>
          {funciones.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>

      <div className="section">
        <strong>Experiencia/Estilo:</strong>
        <ul>
          {experiencia.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>

      <div className="section">
        <strong>Tecnología preferida:</strong> {tecnologiaPreferida}
      </div>

      <div className="section">
        <strong>Sostenibilidad:</strong>{" "}
        {sostenibilidad.habilitada ? "Incluida" : "No incluida"}
        {sostenibilidad.habilitada && sostenibilidad.metricas.length > 0 && (
          <ul>
            {sostenibilidad.metricas.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="section">
        <strong>Artefactos visuales:</strong>
        <p>{artefactos.descripcion || "Generados según las selecciones."}</p>
        {artefactos.mockupUrl && <div>Mockup: {artefactos.mockupUrl}</div>}
        {artefactos.diagramaUrl && <div>Diagrama: {artefactos.diagramaUrl}</div>}
      </div>

      <style>{`
        .preview {
          border: 1px solid #e0e0e0;
          border-radius: 12px;
          padding: 16px;
          background: #fafafa;
        }
        .cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
          margin-top: 10px;
        }
        .card {
          background: #fff;
          border: 1px solid #eee;
          border-radius: 10px;
          padding: 10px;
        }
        .section {
          margin-top: 14px;
        }
        ul {
          margin: 6px 0 0 18px;
        }
      `}</style>
    </div>
  );
};
