// ---------------------------------------------------------------------------
// Planes de suscripción y equipos
// ---------------------------------------------------------------------------
// Los ingenieros pagan por usar AIB+: Free (sin ABI), Pro (con ABI) y Negocio
// (con ABI y un equipo de hasta 5 personas). El pago es manual por ahora: el
// ingeniero pide el plan, yapea y el administrador lo activa por 30 días
// (supabase_planes.sql).
// ---------------------------------------------------------------------------

import { supabase } from './supabase';

export type Plan = 'free' | 'pro' | 'negocio';
export type PlanEfectivo = Plan | 'admin';

export const CUPO_EQUIPO = 5;

/** Lo que trae cada plan, para las tarjetas. */
export const PLANES: { id: Plan; nombre: string; resumen: string; incluye: string[] }[] = [
  {
    id: 'free',
    nombre: 'Free',
    resumen: 'Para empezar a recibir clientes.',
    incluye: [
      'Tu perfil para que los clientes te elijan',
      'Encargos e invitaciones sin límite',
      'Avisos y resumen de la mañana por WhatsApp',
    ],
  },
  {
    id: 'pro',
    nombre: 'Pro',
    resumen: 'Para el ingeniero que quiere ir más rápido.',
    incluye: [
      'Todo lo del plan Free',
      'ABI, tu asistente con IA: te dice a quién responder, te redacta los mensajes y te ayuda a cotizar',
    ],
  },
  {
    id: 'negocio',
    nombre: 'Negocio',
    resumen: 'Para agencias y equipos.',
    incluye: [
      'Todo lo del plan Pro',
      `Tu equipo de hasta ${CUPO_EQUIPO} personas, con ABI para todos`,
      'Repartes los encargos: cada uno sabe cuáles lleva',
    ],
  },
];

export const nombrePlan = (p: PlanEfectivo) =>
  p === 'admin' ? 'Administrador' : (PLANES.find((x) => x.id === p)?.nombre ?? 'Free');

export interface MiPlan {
  plan: PlanEfectivo;
  nombre: string | null;
  propio: { plan: Exclude<Plan, 'free'>; vence_en: string; vigente: boolean } | null;
  /** Free, pero con Negocio por estar en un equipo activo. */
  por_equipo: boolean;
  pedido: { plan: Exclude<Plan, 'free'>; creado_en: string } | null;
  precios: { pro: number; negocio: number };
  yape: { numero: string; titular: string | null } | null;
}

export async function miPlan(): Promise<MiPlan | null> {
  const { data, error } = await supabase.rpc('mi_plan');
  if (error) {
    console.warn('[AIB+] No se pudo leer tu plan:', error.message);
    return null;
  }
  return (data as MiPlan | null) ?? null;
}

export async function preciosPlanes(): Promise<{ pro: number; negocio: number } | null> {
  const { data, error } = await supabase.rpc('precios_planes');
  if (error || !data) return null;
  return data as { pro: number; negocio: number };
}

export async function pedirPlan(plan: Exclude<Plan, 'free'>): Promise<boolean> {
  const { data, error } = await supabase.rpc('pedir_plan', { p_plan: plan });
  if (error) console.error('[AIB+] No se pudo pedir el plan:', error.message);
  return data === true;
}

export async function cancelarPedidoPlan(): Promise<boolean> {
  const { error } = await supabase.rpc('cancelar_pedido_plan');
  if (error) console.error('[AIB+] No se pudo cancelar el pedido:', error.message);
  return !error;
}

// ------------------------------------------------------------ administrador

export interface IngenieroPlan {
  user_id: string;
  nombre: string;
  correo: string | null;
  plan: PlanEfectivo;
  propio: Exclude<Plan, 'free'> | null;
  vence_en: string | null;
  equipo_de: string | null;
  miembros: number;
  pedido: { plan: Exclude<Plan, 'free'>; creado_en: string } | null;
}

export interface PlanesAdmin {
  config: { precio_pro: number; precio_negocio: number; yape_numero: string | null; yape_titular: string | null };
  ingresos: { cobrado_mes: number; mensual: number; pro: number; negocio: number };
  ingenieros: IngenieroPlan[];
}

export async function planesParaAdmin(): Promise<PlanesAdmin | null> {
  const { data, error } = await supabase.rpc('planes_para_admin');
  if (error) {
    console.warn('[AIB+] No se pudieron leer los planes:', error.message);
    return null;
  }
  return data as PlanesAdmin;
}

export async function activarPlan(
  usuario: string,
  plan: Exclude<Plan, 'free'>,
  meses: number,
  cortesia: boolean
): Promise<boolean> {
  const { data, error } = await supabase.rpc('activar_plan', {
    p_usuario: usuario,
    p_plan: plan,
    p_meses: meses,
    p_cortesia: cortesia,
  });
  if (error) console.error('[AIB+] No se pudo activar el plan:', error.message);
  return data === true;
}

export async function quitarPlan(usuario: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('quitar_plan', { p_usuario: usuario });
  if (error) console.error('[AIB+] No se pudo quitar el plan:', error.message);
  return data === true;
}

export async function descartarPedidoPlan(usuario: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('descartar_pedido_plan', { p_usuario: usuario });
  if (error) console.error('[AIB+] No se pudo descartar el pedido:', error.message);
  return data === true;
}

export async function configurarPlanes(datos: {
  precioPro: number;
  precioNegocio: number;
  yapeNumero: string;
  yapeTitular: string;
}): Promise<boolean> {
  const { data, error } = await supabase.rpc('configurar_planes', {
    p_precio_pro: datos.precioPro,
    p_precio_negocio: datos.precioNegocio,
    p_yape_numero: datos.yapeNumero,
    p_yape_titular: datos.yapeTitular,
  });
  if (error) console.error('[AIB+] No se pudieron guardar los planes:', error.message);
  return data === true;
}

// ------------------------------------------------------------------- equipos

export interface MiembroEquipo {
  id: string;
  nombre: string;
  desde: string;
}

export interface MiEquipo {
  rol: 'dueno' | 'miembro';
  dueno_id: string;
  agencia: string | null;
  activo: boolean;
  /** Solo para el dueño. */
  token: string | null;
  miembros: MiembroEquipo[];
}

export async function miEquipo(): Promise<MiEquipo | null> {
  const { data, error } = await supabase.rpc('mi_equipo');
  if (error) {
    console.warn('[AIB+] No se pudo leer tu equipo:', error.message);
    return null;
  }
  return (data as MiEquipo | null) ?? null;
}

export async function crearEquipo(): Promise<boolean> {
  const { error } = await supabase.rpc('crear_equipo');
  if (error) console.error('[AIB+] No se pudo crear el equipo:', error.message);
  return !error;
}

export async function renovarEnlaceEquipo(): Promise<boolean> {
  const { error } = await supabase.rpc('renovar_enlace_equipo');
  if (error) console.error('[AIB+] No se pudo renovar el enlace:', error.message);
  return !error;
}

export async function quitarMiembro(miembro: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('quitar_miembro', { p_miembro: miembro });
  if (error) console.error('[AIB+] No se pudo quitar al miembro:', error.message);
  return data === true;
}

export async function salirDelEquipo(): Promise<boolean> {
  const { data, error } = await supabase.rpc('salir_del_equipo');
  if (error) console.error('[AIB+] No se pudo salir del equipo:', error.message);
  return data === true;
}

export const enlaceEquipo = (token: string) => `${window.location.origin}/equipo/${token}`;

export interface EquipoPublico {
  agencia: string;
  activo: boolean;
  lleno: boolean;
}

export async function equipoPorToken(token: string): Promise<EquipoPublico | null> {
  const { data, error } = await supabase.rpc('equipo_por_token', { p_token: token });
  if (error || !data) return null;
  return data as EquipoPublico;
}

export type ResultadoUnirse = 'ok' | 'no_existe' | 'inactivo' | 'lleno' | 'anonimo' | 'ya_en_equipo' | 'tiene_equipo' | 'error';

export async function unirseEquipo(token: string, nombre: string): Promise<ResultadoUnirse> {
  const { data, error } = await supabase.rpc('unirse_equipo', { p_token: token, p_nombre: nombre });
  if (error) {
    console.error('[AIB+] No se pudo unir al equipo:', error.message);
    return 'error';
  }
  const estado = (data as { estado?: ResultadoUnirse } | null)?.estado;
  return estado ?? 'error';
}

/** El dueño reparte un encargo: a un miembro, a sí mismo o a nadie (null). */
export async function asignarResponsable(proyecto: string, responsable: string | null): Promise<boolean> {
  const { data, error } = await supabase.rpc('asignar_responsable', {
    p_proyecto: proyecto,
    p_responsable: responsable,
  });
  if (error) console.error('[AIB+] No se pudo asignar el encargo:', error.message);
  return data === true;
}

/** «5 nov.» */
export const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
