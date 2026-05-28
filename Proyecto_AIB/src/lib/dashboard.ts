import type { PaqueteProyecto } from '../Types/form';
import { supabase } from './supabase';
import * as XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// Dashboard Service — Supabase Persistence Layer
// ---------------------------------------------------------------------------
// Replaces the former localStorage-based persistence with Supabase queries.
// All operations are scoped to the authenticated user via RLS policies
// defined in supabase_rls_setup.sql.
// ---------------------------------------------------------------------------

/**
 * Inserts a new project package into the `proyectos` table in Supabase.
 * The `user_id` column is auto-populated by RLS default via `auth.uid()`.
 */
export async function pushToDashboard(paquete: PaqueteProyecto): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('[AIB+] No authenticated user. Cannot save project.');
  }

  const { error } = await supabase
    .from('proyectos')
    .insert({
      user_id: user.id,
      payload: paquete,
    });

  if (error) {
    console.error('[AIB+] Error saving project:', error.message);
    throw error;
  }
}

/**
 * Retrieves all project packages for the currently authenticated user.
 * RLS ensures only the user's own rows are returned.
 */
export async function getPaquetes(): Promise<PaqueteProyecto[]> {
  const { data, error } = await supabase
    .from('proyectos')
    .select('payload')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[AIB+] Error fetching projects:', error.message);
    return [];
  }

  return (data || []).map((row: { payload: PaqueteProyecto }) => row.payload);
}

/**
 * Exports project data to an Excel file (client-side generation).
 * This function operates on already-fetched data, no persistence changes needed.
 */
export function exportExcel(paquetes: PaqueteProyecto[]): void {
  const rows = paquetes.map((p) => ({
    Solución: p.resumen.solucion,
    Objetivo: p.resumen.objetivo,
    Presupuesto: p.resumen.presupuesto,
    Tiempo: p.resumen.tiempo,
    Tecnología: p.tecnologiaPreferida,
    Funciones: p.funciones.join('; '),
    Estilo: p.experiencia.join('; '),
    Sostenibilidad: p.sostenibilidad.habilitada ? 'Sí' : 'No',
    Métricas: p.sostenibilidad.metricas.join('; '),
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Proyectos');

  XLSX.writeFile(workbook, 'proyectos_dashboard.xlsx');
}
