import React, { useEffect, useState, useRef } from "react";
import { getPaquetes, exportExcel } from "../lib/dashboard";
import type { PaqueteProyecto } from "../Types/form";
import styles from "../styles/DashboardIngeniero.module.css";
import { Bar, Radar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  RadialLinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from "chart.js";
import { generarInformeConGraficos } from "../lib/informe";

// Registrar módulos de Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  RadialLinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

interface KPIProyecto {
  viabilidad: number;
  facilidad: number;
  impacto: number;
}

// Función para calcular KPIs
const calcularKPIs = (paquete: PaqueteProyecto): KPIProyecto => {
  const funciones = paquete.funciones.length;
  const sostenibilidad = paquete.sostenibilidad.habilitada ? paquete.sostenibilidad.metricas.length : 0;

  return {
    viabilidad: Math.min(100, 60 + funciones * 5),
    facilidad: Math.max(20, 100 - funciones * 7),
    impacto: sostenibilidad * 20
  };
};
/** Criterios por los que se puede ordenar la tabla de paquetes. */
type Criterio = "viabilidad" | "impacto" | "facilidad";

export const DashboardIngeniero: React.FC = () => {
  const [paquetes, setPaquetes] = useState<PaqueteProyecto[]>([]);
  const [criterio, setCriterio] = useState<Criterio>("viabilidad");

  // Referencias a los gráficos
  const barRef = useRef<ChartJS<'bar'> | null>(null);
  const radarRef = useRef<ChartJS<'radar'> | null>(null);

  useEffect(() => {
    const loadPaquetes = async () => {
      const data = await getPaquetes();
      setPaquetes(data);
    };
    loadPaquetes();
  }, []);

  const ordenar = (lista: PaqueteProyecto[]): PaqueteProyecto[] => {
    return [...lista].sort((a, b) => {
      const kpiA = calcularKPIs(a);
      const kpiB = calcularKPIs(b);
      return kpiB[criterio] - kpiA[criterio];
    });
  };

  const descargarExcel = () => {
    exportExcel(paquetes);
  };

  const generarInformeProyecto = (paquete: PaqueteProyecto) => {
    const kpi = calcularKPIs(paquete);
    generarInformeConGraficos(paquete, kpi, barRef, radarRef);
  };

  // Datos para gráficos
  const labels = paquetes.map((p) => p.resumen.solucion + " (" + p.resumen.objetivo + ")");
  const dataViabilidad = paquetes.map((p) => calcularKPIs(p).viabilidad);
  const dataFacilidad = paquetes.map((p) => calcularKPIs(p).facilidad);
  const dataImpacto = paquetes.map((p) => calcularKPIs(p).impacto);

  const barData = {
    labels,
    datasets: [
      { label: "Viabilidad", data: dataViabilidad, backgroundColor: "#26a69a" },
      { label: "Facilidad", data: dataFacilidad, backgroundColor: "#42a5f5" },
      { label: "Impacto sostenible", data: dataImpacto, backgroundColor: "#66bb6a" }
    ]
  };

  const radarData = {
    labels: ["Viabilidad", "Facilidad", "Impacto sostenible"],
    datasets: paquetes.map((p, idx) => ({
      label: p.resumen.solucion,
      data: [calcularKPIs(p).viabilidad, calcularKPIs(p).facilidad, calcularKPIs(p).impacto],
      backgroundColor: `rgba(${50 + idx * 40}, ${100 + idx * 30}, ${150 + idx * 20}, 0.3)`,
      borderColor: `rgba(${50 + idx * 40}, ${100 + idx * 30}, ${150 + idx * 20}, 1)`
    }))
  };

  return (
    <div className={styles.dashboard}>
      <h2>Dashboard del Ingeniero/Empresa</h2>

      <div className={styles.actions}>
        <label>Ordenar por: </label>
        <select value={criterio} onChange={(e) => setCriterio(e.target.value as Criterio)}>
          <option value="viabilidad">Viabilidad</option>
          <option value="impacto">Impacto sostenible</option>
          <option value="facilidad">Facilidad</option>
        </select>
        <button onClick={descargarExcel}>Exportar Excel</button>
      </div>

      {paquetes.length === 0 && <p>No hay proyectos aún.</p>}

      <div className={styles.grid}>
        {ordenar(paquetes).map((p, idx) => {
          const kpi = calcularKPIs(p);
          return (
            <div key={idx} className={styles.card}>
              <h3>{p.resumen.solucion} — {p.resumen.objetivo}</h3>
              <p><strong>Presupuesto:</strong> {p.resumen.presupuesto}</p>
              <p><strong>Tiempo:</strong> {p.resumen.tiempo}</p>
              <p><strong>Tecnología:</strong> {p.tecnologiaPreferida}</p>
              <p><strong>Funciones:</strong> {p.funciones.join(", ")}</p>
              <p><strong>Estilo:</strong> {p.experiencia.join(", ")}</p>
              <div className={styles.kpis}>
                <span>Viabilidad: {kpi.viabilidad}%</span>
                <span>Facilidad: {kpi.facilidad}%</span>
                <span>Impacto sostenible: {kpi.impacto}%</span>
              </div>
              <div className={styles.actions}>
                <button onClick={() => generarInformeProyecto(p)}>Generar Informe Técnico con Gráficos</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.charts}>
        <h3>Comparación de KPIs (Barras)</h3>
        <Bar ref={barRef} data={barData} />

        <h3>Perfil de cada proyecto (Radar)</h3>
        <Radar ref={radarRef} data={radarData} />
      </div>
    </div>
  );
};
