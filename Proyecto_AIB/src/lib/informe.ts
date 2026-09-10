import jsPDF from "jspdf";
import type { RefObject } from "react";
import type { PaqueteProyecto } from "../Types/form";

/**
 * Lo unico que este modulo necesita de un grafico es poder exportarlo a imagen.
 * Tiparlo por esa capacidad evita arrastrar los genericos de Chart.js hasta aqui.
 */
type ExportableChart = { toBase64Image: () => string };
type ChartRef = RefObject<ExportableChart | null>;

/**
 * Genera un informe técnico en PDF con datos del proyecto y gráficos Chart.js incrustados.
 * @param paquete Proyecto seleccionado
 * @param kpis KPIs calculados
 * @param barChartRef referencia al gráfico de barras
 * @param radarChartRef referencia al gráfico radar
 */
export function generarInformeConGraficos(
  paquete: PaqueteProyecto,
  kpis: { viabilidad: number; facilidad: number; impacto: number },
  barChartRef: ChartRef,
  radarChartRef: ChartRef
) {
  const doc = new jsPDF();

  // Título
  doc.setFontSize(18);
  doc.text("Informe Técnico del Proyecto", 20, 20);

  // Datos generales
  doc.setFontSize(12);
  doc.text(`Solución: ${paquete.resumen.solucion}`, 20, 40);
  doc.text(`Objetivo: ${paquete.resumen.objetivo}`, 20, 50);
  doc.text(`Presupuesto: ${paquete.resumen.presupuesto}`, 20, 60);
  doc.text(`Tiempo estimado: ${paquete.resumen.tiempo}`, 20, 70);
  doc.text(`Tecnología preferida: ${paquete.tecnologiaPreferida}`, 20, 80);

  // Funciones y estilo
  doc.text("Funciones clave:", 20, 95);
  doc.text(paquete.funciones.join(", "), 30, 105);

  doc.text("Estilo/Experiencia:", 20, 120);
  doc.text(paquete.experiencia.join(", "), 30, 130);

  // KPIs
  doc.text("Indicadores clave (KPIs):", 20, 150);
  doc.text(`Viabilidad: ${kpis.viabilidad}%`, 30, 160);
  doc.text(`Facilidad de ejecución: ${kpis.facilidad}%`, 30, 170);
  doc.text(`Impacto sostenible: ${kpis.impacto}%`, 30, 180);

  // Sostenibilidad
  if (paquete.sostenibilidad.habilitada) {
    doc.text("Métricas de sostenibilidad:", 20, 200);
    doc.text(paquete.sostenibilidad.metricas.join(", "), 30, 210);
  }

  // Gráfico de barras
  if (barChartRef?.current) {
    const barImg = barChartRef.current.toBase64Image();
    doc.text("Comparación de KPIs (Barras):", 20, 230);
    doc.addImage(barImg, "PNG", 20, 240, 160, 80);
  }

  // Gráfico radar
  if (radarChartRef?.current) {
    const radarImg = radarChartRef.current.toBase64Image();
    doc.text("Perfil del Proyecto (Radar):", 20, 330);
    doc.addImage(radarImg, "PNG", 20, 340, 160, 80);
  }

  // Guardar PDF
  doc.save("informe_tecnico_con_graficos.pdf");
}
