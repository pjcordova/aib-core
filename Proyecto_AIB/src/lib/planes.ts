// ---------------------------------------------------------------------------
// Planes de suscripción y equipos
// ---------------------------------------------------------------------------
// Los ingenieros pagan por usar AIB+: Free, Pro y Negocio (Pro con un equipo
// de hasta 5 personas). Pro y Negocio aparecen primero, con insignia «Pro»,
// tienen ABI, 30 diseños con IA al mes y estadísticas completas
// (supabase_destacados.sql y supabase_plan_pro.sql). Cada ingeniero nuevo
// empieza con 14 días de Pro gratis. El pago es manual por ahora: el ingeniero
// pide el plan, yapea y el administrador lo activa por 30 días
// (supabase_planes.sql).
// ---------------------------------------------------------------------------

import { supabase } from './supabase';

export type Plan = 'free' | 'pro' | 'negocio';
export type PlanEfectivo = Plan | 'admin';

export const CUPO_EQUIPO = 5;
/** Los días de Pro gratis al aprobar a un ingeniero nuevo (revisar_ingeniero). */
export const DIAS_PRUEBA = 14;
/** Diseños con IA al mes (crear o cambiar uno es un uso). Los mismos que limites_ia. */
export const DISENOS_IA_MES = { free: 3, pro: 30 };

/** Lo principal de cada plan, para las tarjetas. El detalle está en COMPARATIVA. */
export const PLANES: { id: Plan; nombre: string; resumen: string; incluye: string[] }[] = [
  {
    id: 'free',
    nombre: 'Free',
    resumen: 'Para empezar a recibir clientes.',
    incluye: ['Tu página y encargos sin límite', `${DISENOS_IA_MES.free} diseños con IA al mes`],
  },
  {
    id: 'pro',
    nombre: 'Pro',
    resumen: 'Para conseguir más clientes y atenderlos más rápido.',
    incluye: [
      'Apareces primero, con insignia «Pro»',
      'ABI, tu asistente con IA',
      `${DISENOS_IA_MES.pro} diseños con IA al mes y estadísticas completas`,
    ],
  },
  {
    id: 'negocio',
    nombre: 'Negocio',
    resumen: 'Para agencias y equipos.',
    incluye: ['Todo lo del plan Pro', `Tu equipo de hasta ${CUPO_EQUIPO} personas, con ABI para todos`],
  },
];

/** Beneficio por beneficio: true (lo tiene), false (no) o un texto. */
export const COMPARATIVA: { beneficio: string; free: boolean | string; pro: boolean | string; negocio: boolean | string }[] = [
  { beneficio: 'Tu página pública y tu perfil en el buscador', free: true, pro: true, negocio: true },
  { beneficio: 'Encargos, invitaciones y diseños publicados sin límite', free: true, pro: true, negocio: true },
  { beneficio: 'Avisos por WhatsApp y correo', free: true, pro: true, negocio: true },
  {
    beneficio: 'Diseños con IA (crear o cambiar uno)',
    free: `${DISENOS_IA_MES.free} al mes`,
    pro: `${DISENOS_IA_MES.pro} al mes`,
    negocio: `${DISENOS_IA_MES.pro} al mes c/u`,
  },
  { beneficio: 'Apareces primero en el buscador, la portada y los rubros', free: false, pro: true, negocio: true },
  { beneficio: 'Insignia «Pro» en tu tarjeta y tu página', free: false, pro: true, negocio: true },
  { beneficio: 'Estadísticas de tu página', free: 'Visitas', pro: 'Completas', negocio: 'Completas' },
  { beneficio: 'ABI, tu asistente con IA', free: false, pro: true, negocio: true },
  { beneficio: `Equipo de hasta ${CUPO_EQUIPO} personas`, free: false, pro: false, negocio: true },
];

export const nombrePlan = (p: PlanEfectivo) =>
  p === 'admin' ? 'Administrador' : (PLANES.find((x) => x.id === p)?.nombre ?? 'Free');

export interface MiPlan {
  plan: PlanEfectivo;
  nombre: string | null;
  /** `prueba`: los días de Pro gratis de un ingeniero nuevo. */
  propio: { plan: Exclude<Plan, 'free'>; vence_en: string; vigente: boolean; prueba?: boolean } | null;
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

/** Los diseños con IA de este mes. `limite` null: sin límite (el administrador). */
export interface DisenosIa {
  usados: number;
  limite: number | null;
  plan: PlanEfectivo;
}

export async function misDisenosIa(): Promise<DisenosIa | null> {
  const { data, error } = await supabase.rpc('mis_disenos_ia');
  if (error) {
    console.warn('[AIB+] No se pudo leer tu cupo de diseños con IA:', error.message);
    return null;
  }
  return (data as DisenosIa | null) ?? null;
}

/** Visitas a AIB+ y pruebas de clientes de los últimos 7 días, para animar a pasar a Pro. */
export async function alcanceSemana(): Promise<{ visitas: number; pruebas: number } | null> {
  const { data, error } = await supabase.rpc('alcance_semana');
  if (error || !data) return null;
  return data as { visitas: number; pruebas: number };
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
  /** Está en sus días de Pro gratis. */
  prueba?: boolean;
  equipo_de: string | null;
  miembros: number;
  pedido: { plan: Exclude<Plan, 'free'>; creado_en: string } | null;
}

export interface PlanesAdmin {
  config: { precio_pro: number; precio_negocio: number; yape_numero: string | null; yape_titular: string | null };
  /** Sin las pruebas gratis, que no son ingreso; `en_prueba`, cuántas hay. */
  ingresos: { cobrado_mes: number; mensual: number; pro: number; negocio: number; en_prueba?: number };
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
