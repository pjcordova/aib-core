import React, { useMemo, useState } from "react";
import gusano from "../data/gusano.json";
import type { PasoBase, Respuestas, PaqueteProyecto } from "../Types/form";
import { Previsualizacion } from "./Previsualizacion";
import { pushToDashboard } from "../lib/dashboard";

const mapa: Record<string, PasoBase> = gusano.formularioGusano as any;

export const FormularioGusano: React.FC = () => {
  const [pasoActual, setPasoActual] = useState<string>("inicio");
  const [respuestas, setRespuestas] = useState<Respuestas>({});
  const [paquete, setPaquete] = useState<PaqueteProyecto | null>(null);

  const paso = mapa[pasoActual];

  const handleOpcion = (opcion: string) => {
    setRespuestas((prev) => ({ ...prev, [pasoActual]: opcion }));
    avanzar(opcion);
  };

  const handleMulti = (opcion: string) => {
    const prevSel = (respuestas[pasoActual] as string[]) || [];
    const existe = prevSel.includes(opcion);
    const nuevo = existe ? prevSel.filter((o) => o !== opcion) : [...prevSel, opcion];
    setRespuestas((prev) => ({ ...prev, [pasoActual]: nuevo }));
  };

  const continuarMulti = () => {
    const sel = (respuestas[pasoActual] as string[]) || [];
    const min = paso.minSeleccion || 1;
    if (sel.length < min) return alert(`Selecciona al menos ${min}`);
    avanzar(null);
  };

  const handleRango = (valor: string) => {
    setRespuestas((prev) => ({ ...prev, [pasoActual]: valor }));
    avanzar(valor);
  };

  const handleTexto = (valor: string) => {
    setRespuestas((prev) => ({ ...prev, [pasoActual]: valor }));
  };

  const avanzar = (res?: string | null) => {
    if (!paso.siguiente) return;
    if (typeof paso.siguiente === "string") {
      setPasoActual(paso.siguiente);
    } else if (res) {
      const siguienteId = (paso.siguiente as Record<string, string>)[res];
      setPasoActual(siguienteId);
    }
  };

  const generarPaquete = useMemo((): PaqueteProyecto => {
    const solucion = (respuestas["inicio"] as string) || "";
    const objetivo = (respuestas["objetivo"] as string) || "";
    const presupuesto = (respuestas["presupuesto"] as string) || "";
    const tiempo = (respuestas["tiempo"] as string) || "";

    const funcionesKey =
      (mapa.objetivo.siguiente as Record<string, string>)[objetivo] || "";
    const funciones = (respuestas[funcionesKey] as string[]) || [];

    const experiencia = (respuestas["experiencia"] as string[]) || [];
    const tecnologiaPreferida = (respuestas["tecnologia"] as string) || "";

    const sostenibilidadEnabled =
      ((respuestas["sostenibilidad"] as string) || "") === "Sí";
    const metricas =
      (respuestas["metricasSostenibles"] as string[]) || [];

    const feedback = (respuestas["feedback"] as string) || undefined;

    return {
      resumen: { solucion, objetivo, presupuesto, tiempo },
      funciones,
      experiencia,
      tecnologiaPreferida,
      sostenibilidad: {
        habilitada: sostenibilidadEnabled,
        metricas
      },
      feedback,
      artefactos: {}
    };
  }, [respuestas]);

  const onGenerarPrevisualizacion = () => {
    const mock = {
      mockupUrl: "/previews/mockup-" + Date.now() + ".png",
      diagramaUrl: "/previews/diagram-" + Date.now() + ".png",
      descripcion:
        "Previsualización generada según las selecciones del formulario."
    };
    const nuevoPaquete = { ...generarPaquete, artefactos: mock };
    setPaquete(nuevoPaquete);
    setPasoActual("validacion");
  };

  const aceptar = async () => {
    if (!paquete) return;
    await pushToDashboard(paquete);
    setPasoActual("enviarADashboard");
  };

  const reabrirTramo = () => {
    // Estrategia simple: reabrir experiencia → tecnología → presupuesto
    setPasoActual("experiencia");
  };

  return (
    <div className="gusano-container">
      <div className="paso">
        {paso.pregunta && <h2>{paso.pregunta}</h2>}

        {paso.tipo === "opciones" && (
          <div className="grid">
            {paso.opciones?.map((op) => (
              <button
                key={op}
                className={`btn ${respuestas[pasoActual] === op ? "selected" : ""}`}
                onClick={() => handleOpcion(op)}
              >
                {op}
              </button>
            ))}
          </div>
        )}

        {paso.tipo === "multiseleccion" && (
          <>
            <div className="grid">
              {paso.opciones?.map((op) => {
                const sel = ((respuestas[pasoActual] as string[]) || []).includes(op);
                return (
                  <button
                    key={op}
                    className={`btn ${sel ? "selected" : ""}`}
                    onClick={() => handleMulti(op)}
                  >
                    {op}
                  </button>
                );
              })}
            </div>
            <div className="actions">
              <button className="btn primary" onClick={continuarMulti}>
                Continuar
              </button>
            </div>
          </>
        )}

        {paso.tipo === "rango" && (
          <div className="grid">
            {paso.valores?.map((v) => (
              <button
                key={v}
                className={`btn ${respuestas[pasoActual] === v ? "selected" : ""}`}
                onClick={() => handleRango(v)}
              >
                {v}
              </button>
            ))}
          </div>
        )}

        {paso.tipo === "texto" && (
          <>
            <textarea
              placeholder={paso.placeholder}
              value={(respuestas[pasoActual] as string) || ""}
              onChange={(e) => handleTexto(e.target.value)}
            />
            <div className="actions">
              <button className="btn primary" onClick={() => avanzar(null)}>
                Enviar feedback
              </button>
            </div>
          </>
        )}

        {paso.tipo === "accion" && paso.accion === "GenerarPrevisualizacion" && (
          <>
            <Previsualizacion paquete={generarPaquete} />
            <div className="actions">
              <button className="btn primary" onClick={onGenerarPrevisualizacion}>
                Generar previsualización
              </button>
            </div>
          </>
        )}

        {pasoActual === "validacion" && (
          <div className="validate">
            <Previsualizacion paquete={paquete || generarPaquete} />
            <div className="actions">
              <button className="btn success" onClick={aceptar}>
                Aceptar
              </button>
              <button className="btn danger" onClick={() => setPasoActual("feedback")}>
                Rechazar
              </button>
            </div>
          </div>
        )}

        {pasoActual === "reiniciarParcial" && (
          <div className="actions">
            <button className="btn" onClick={reabrirTramo}>
              Reabrir tramo relevante
            </button>
          </div>
        )}

        {pasoActual === "enviarADashboard" && (
          <div className="done">
            <h3>Tu paquete fue enviado al Dashboard del Ingeniero/Empresa.</h3>
          </div>
        )}
      </div>

      <style jsx>{`
        .gusano-container {
          max-width: 860px;
          margin: 0 auto;
          padding: 24px;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
          margin-top: 16px;
        }
        .btn {
          border: 1px solid #cfd8dc;
          border-radius: 10px;
          padding: 10px 14px;
          background: #fff;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .btn:hover {
          border-color: #26a69a;
        }
        .selected {
          border-color: #26a69a;
          background: #e0f2f1;
        }
        .primary {
          background: #26a69a;
          color: #fff;
          border-color: #26a69a;
        }
        .success {
          background: #2e7d32;
          color: #fff;
          border-color: #2e7d32;
        }
        .danger {
          background: #c62828;
          color: #fff;
          border-color: #c62828;
        }
        textarea {
          width: 100%;
          min-height: 120px;
          padding: 10px;
          border: 1px solid #cfd8dc;
          border-radius: 10px;
          margin-top: 12px;
        }
        .actions {
          margin-top: 16px;
          display: flex;
          gap: 10px;
        }
        .validate, .done {
          margin-top: 18px;
        }
      `}</style>
    </div>
  );
};
