import type { PaqueteProyecto } from "../Types/form";
import * as XLSX from "xlsx";

export async function pushToDashboard(paquete: PaqueteProyecto): Promise<void> {
  const existentes = JSON.parse(localStorage.getItem("paquetesDashboard") || "[]");
  existentes.push({ ...paquete, id: Date.now() });
  localStorage.setItem("paquetesDashboard", JSON.stringify(existentes));
  await new Promise((r) => setTimeout(r, 400));
}

export function getPaquetes(): PaqueteProyecto[] {
  return JSON.parse(localStorage.getItem("paquetesDashboard") || "[]");
}

export function exportExcel(paquetes: PaqueteProyecto[]): void {
  const rows = paquetes.map((p) => ({
    Solución: p.resumen.solucion,
    Objetivo: p.resumen.objetivo,
    Presupuesto: p.resumen.presupuesto,
    Tiempo: p.resumen.tiempo,
    Tecnología: p.tecnologiaPreferida,
    Funciones: p.funciones.join("; "),
    Estilo: p.experiencia.join("; "),
    Sostenibilidad: p.sostenibilidad.habilitada ? "Sí" : "No",
    Métricas: p.sostenibilidad.metricas.join("; ")
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Proyectos");

  XLSX.writeFile(workbook, "proyectos_dashboard.xlsx");
}
