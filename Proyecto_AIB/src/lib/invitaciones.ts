// ---------------------------------------------------------------------------
// Invitaciones
// ---------------------------------------------------------------------------
// El ingeniero crea un enlace para cada negocio (/i/<código>) y se lo manda
// por WhatsApp. El cliente lo abre y hace todo sin crear cuenta: se le abre
// una sesión anónima de Supabase atada a la invitación, y con el mismo enlace
// puede volver cuando quiera (supabase_invitaciones.sql).
// ---------------------------------------------------------------------------

import { supabase } from './supabase';
import { canalDeLaVisita } from './medicionPortada';

/* -------------------------------------------------------------------------- */
/* Ingeniero                                                                  */
/* -------------------------------------------------------------------------- */

/** Una fila de la vista invitaciones_resumen. */
export interface Invitacion {
  id: string;
  token: string;
  negocio: string;
  es_prueba: boolean;
  activa: boolean;
  created_at: string;
  abierta_en: string | null;
  empezada_en: string | null;
  ultima_visita: string | null;
  centimos_ia: number;
  /** Primer proyecto guardado: se guarda justo al enseñarle su maqueta. */
  maqueta_en: string | null;
  aceptada_en: string | null;
  /** 'portada': alguien que pulsó «Pruébalo gratis», sin invitación del ingeniero. */
  origen: 'ingeniero' | 'portada';
}

export type EtapaInvitacion = 'enviada' | 'abierta' | 'empezo' | 'maqueta' | 'acepto';

/** Las etapas del embudo, en orden. */
export const ETAPAS_INVITACION: { valor: EtapaInvitacion; etiqueta: string }[] = [
  { valor: 'enviada', etiqueta: 'Enviada' },
  { valor: 'abierta', etiqueta: 'Abrió el enlace' },
  { valor: 'empezo', etiqueta: 'Empezó el cuestionario' },
  { valor: 'maqueta', etiqueta: 'Vio su maqueta' },
  { valor: 'acepto', etiqueta: 'Aceptó' },
];

/** Hasta dónde llegó el cliente. */
export function etapaDe(inv: Invitacion): EtapaInvitacion {
  if (inv.aceptada_en) return 'acepto';
  if (inv.maqueta_en) return 'maqueta';
  if (inv.empezada_en) return 'empezo';
  if (inv.abierta_en) return 'abierta';
  return 'enviada';
}

/** Fecha en la que llegó a una etapa, si llegó. */
export function fechaDeEtapa(inv: Invitacion, etapa: EtapaInvitacion): string | null {
  return {
    enviada: inv.created_at,
    abierta: inv.abierta_en,
    empezo: inv.empezada_en,
    maqueta: inv.maqueta_en,
    acepto: inv.aceptada_en,
  }[etapa];
}

export function urlInvitacion(token: string): string {
  return `${window.location.origin}/i/${token}`;
}

/** Mensaje listo para mandar por WhatsApp. */
export function mensajeInvitacion(inv: Pick<Invitacion, 'negocio' | 'token'>): string {
  return (
    `Hola 👋 Te comparto un enlace para que veas en un minuto cómo se vería la página web de ${inv.negocio}. ` +
    `Solo respondes unas preguntas rápidas, sin crear cuenta: ${urlInvitacion(inv.token)}`
  );
}

export async function listarInvitaciones(): Promise<{ invitaciones: Invitacion[]; sinConfigurar: boolean }> {
  const { data, error } = await supabase
    .from('invitaciones_resumen')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    const sinConfigurar = error.code === '42P01' || error.code === 'PGRST205';
    if (!sinConfigurar) console.error('[AIB+] No se pudieron leer las invitaciones:', error.message);
    return { invitaciones: [], sinConfigurar };
  }
  return { invitaciones: (data ?? []) as Invitacion[], sinConfigurar: false };
}

export async function crearInvitacion(
  negocio: string,
  esPrueba: boolean
): Promise<{ token: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('crear_invitacion', {
    p_negocio: negocio.trim().slice(0, 80),
    p_es_prueba: esPrueba,
  });
  const token = (data as { token?: unknown } | null)?.token;
  if (error || typeof token !== 'string') {
    console.error('[AIB+] No se pudo crear la invitación:', error?.message);
    return { token: null, error: 'No se pudo crear la invitación. Vuelve a intentarlo.' };
  }
  return { token, error: null };
}

export async function cambiarInvitacion(
  id: string,
  cambios: { activa?: boolean; esPrueba?: boolean }
): Promise<boolean> {
  const { data, error } = await supabase.rpc('cambiar_invitacion', {
    p_id: id,
    p_activa: cambios.activa ?? null,
    p_es_prueba: cambios.esPrueba ?? null,
  });
  if (error) console.error('[AIB+] No se pudo cambiar la invitación:', error.message);
  return !error && data === true;
}

/**
 * Elimina la invitación y los proyectos de su cliente. Los encargos aceptados
 * de una invitación real se conservan (supabase_invitaciones.sql). Devuelve
 * cuántos proyectos se borraron y cuántos se conservaron, o null si falló.
 */
export async function eliminarInvitacion(id: string): Promise<{ borrados: number; conservados: number } | null> {
  const { data, error } = await supabase.rpc('eliminar_invitacion', { p_id: id });
  const r = data as { estado?: string; borrados?: number; conservados?: number } | null;
  if (error || r?.estado !== 'ok') {
    console.error('[AIB+] No se pudo eliminar la invitación:', error?.message ?? r?.estado);
    return null;
  }
  return { borrados: r.borrados ?? 0, conservados: r.conservados ?? 0 };
}

/* -------------------------------------------------------------------------- */
/* Cliente invitado                                                           */
/* -------------------------------------------------------------------------- */

export type ResultadoEntrada =
  | { estado: 'ok'; negocio: string }
  | { estado: 'no_existe' }
  /** Hay una cuenta normal abierta: el ingeniero probando su propio enlace. */
  | { estado: 'con_cuenta' }
  | { estado: 'error' };

async function reclamar(token: string): Promise<{ estado?: string; negocio?: string } | null> {
  const { data, error } = await supabase.rpc('reclamar_invitacion', { p_token: token });
  if (error) {
    console.error('[AIB+] No se pudo abrir la invitación:', error.message);
    return null;
  }
  return data as { estado?: string; negocio?: string };
}

/**
 * Deja al cliente dentro con una sesión anónima atada a la invitación. Si ya
 * tenía una de otra invitación (otro enlace en el mismo navegador), la cambia
 * por una nueva.
 */
export async function entrarConInvitacion(token: string): Promise<ResultadoEntrada> {
  if (!/^[0-9a-f]{32}$/.test(token)) return { estado: 'no_existe' };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session && !session.user.is_anonymous) return { estado: 'con_cuenta' };

  if (!session) {
    // Antes de abrir una sesión anónima se comprueba el enlace: uno mal copiado
    // o inventado no debe dejar una sesión vacía en Supabase. Si la comprobación
    // falla por red, se sigue como siempre y lo decide reclamar_invitacion.
    const { data: valida, error: errorValida } = await supabase.rpc('invitacion_valida', { p_token: token });
    if (!errorValida && valida === false) return { estado: 'no_existe' };

    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error('[AIB+] No se pudo abrir la sesión de invitado:', error.message);
      return { estado: 'error' };
    }
  }

  let resultado = await reclamar(token);
  if (resultado?.estado === 'otra') {
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInAnonymously();
    if (error) return { estado: 'error' };
    resultado = await reclamar(token);
  }

  if (resultado?.estado === 'ok') return { estado: 'ok', negocio: resultado.negocio ?? '' };
  if (resultado?.estado === 'no_existe') return { estado: 'no_existe' };
  return { estado: 'error' };
}

export interface MiInvitacion {
  /** null: llegó desde la portada y todavía no dijo cómo se llama su negocio. */
  negocio: string | null;
  activa: boolean;
  origen: 'ingeniero' | 'portada';
}

/** La invitación del cliente con sesión anónima. null si no tiene. */
export async function miInvitacion(): Promise<MiInvitacion | null> {
  const { data, error } = await supabase.rpc('mi_invitacion');
  if (error || !data) return null;
  const inv = data as { negocio?: unknown; activa?: unknown; origen?: unknown };
  const origen = inv.origen === 'portada' ? 'portada' : 'ingeniero';
  if (typeof inv.negocio !== 'string' && origen !== 'portada') return null;
  return {
    negocio: typeof inv.negocio === 'string' ? inv.negocio : null,
    activa: inv.activa === true,
    origen,
  };
}

/**
 * El cliente pasó la primera pregunta. Si llegó desde la portada, su prueba
 * toma el nombre del negocio. Estadística: si falla, no pasa nada.
 */
export function registrarInicioInvitacion(negocio?: string): void {
  void supabase.rpc('registrar_inicio_invitacion', { p_negocio: negocio?.trim() || null }).then(({ error }) => {
    if (error) console.warn('[AIB+] No se pudo registrar el inicio:', error.message);
  });
}

/* -------------------------------------------------------------------------- */
/* Probar sin cuenta desde la portada                                         */
/* -------------------------------------------------------------------------- */

export type ResultadoPrueba = 'ok' | 'lleno' | 'con_cuenta' | 'error';

/**
 * «Pruébalo gratis»: abre una sesión anónima con su propia invitación, igual
 * que si el ingeniero le hubiera mandado un enlace. Hay un máximo de pruebas
 * por día (supabase_invitaciones.sql, sección 8); se consulta antes de abrir
 * la sesión para no dejar sesiones vacías.
 */
export async function empezarSinCuenta(): Promise<ResultadoPrueba> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session && !session.user.is_anonymous) return 'con_cuenta';

  let abrioSesion = false;
  if (!session) {
    const { data: cupo, error: errorCupo } = await supabase.rpc('hay_cupo_prueba_libre');
    if (!errorCupo && cupo === false) return 'lleno';

    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error('[AIB+] No se pudo abrir la sesión de prueba:', error.message);
      return 'error';
    }
    abrioSesion = true;
  }

  // El canal por el que llegó a la portada (?c=), para saber cuál trae clientes.
  const { data, error } = await supabase.rpc('empezar_prueba_libre', { p_canal: canalDeLaVisita() });
  const estado = (data as { estado?: string } | null)?.estado;
  if (!error && estado === 'ok') return 'ok';

  // Sin prueba, la sesión recién abierta no sirve para nada: se cierra.
  if (abrioSesion) await supabase.auth.signOut();
  if (error) console.error('[AIB+] No se pudo empezar la prueba:', error.message);
  return estado === 'lleno' ? 'lleno' : 'error';
}
