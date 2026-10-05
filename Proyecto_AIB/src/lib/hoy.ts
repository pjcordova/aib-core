// ---------------------------------------------------------------------------
// «Hoy» — lo que ABI le pone delante al ingeniero
// ---------------------------------------------------------------------------
// Sin IA: reglas fijas sobre datos que el panel ya tiene, en consultas
// pequeñas. Solo clientes reales: las pruebas del ingeniero no son trabajo
// pendiente (columna `es_prueba` de la vista `encargos`).
// ---------------------------------------------------------------------------

import { supabase } from './supabase';
import type { TipoServicio } from './servicios';
import { etapaDe, mensajeInvitacion, urlInvitacion, type Invitacion } from './invitaciones';
import type { Reaccion } from './comentarios';

/** Cuántos de cada cosa enseña la portada; el resto, en su pestaña. */
const MOSTRAR = 5;
const DIAS_SEMANA = 7;

export interface EncargoPendiente {
  id: string;
  empresa: string | null;
  servicio: string;
  cliente: string | null;
  whatsapp: string | null;
  tipoServicio?: TipoServicio;
  /** Desde cuándo espera: cuando aceptó o, en los antiguos, cuando se creó. */
  desde: string;
}

export interface ComentarioReciente {
  id: number;
  creadoEn: string;
  reaccion: Reaccion | null;
  texto: string | null;
  empresa: string | null;
}

export interface ResumenHoy {
  /** Aceptados por clientes reales y todavía en "Recibido", del que más espera al que menos. */
  esperando: EncargoPendiente[];
  totalEsperando: number;
  sinDocumentacion: EncargoPendiente[];
  totalSinDocumentacion: number;
  /** Invitaciones reales y activas que aún no terminaron en encargo. */
  invitaciones: Invitacion[];
  totalInvitaciones: number;
  comentarios: ComentarioReciente[];
  semana: { enviadas: number; abrieron: number; aceptaron: number; comentarios: number };
  /** Alguna consulta falló: lo que se ve puede estar incompleto. */
  incompleto: boolean;
}

interface FilaEncargo {
  id: string;
  empresa: string | null;
  servicio: string | null;
  cliente: string | null;
  whatsapp: string | null;
  tipo_servicio: TipoServicio | null;
  aceptado_en: string | null;
  created_at: string;
}

const COLUMNAS_ENCARGO = 'id, empresa, servicio, cliente, whatsapp, tipo_servicio, aceptado_en, created_at';

function pendienteDe(f: FilaEncargo): EncargoPendiente {
  return {
    id: f.id,
    empresa: f.empresa,
    servicio: f.servicio ?? 'Proyecto',
    cliente: f.cliente,
    whatsapp: f.whatsapp,
    tipoServicio: f.tipo_servicio ?? undefined,
    desde: f.aceptado_en ?? f.created_at,
  };
}

export async function cargarHoy(): Promise<ResumenHoy> {
  const hace = new Date(Date.now() - DIAS_SEMANA * 24 * 60 * 60 * 1000).toISOString();

  const [esperando, sinDoc, invitaciones, semana, comentarios] = await Promise.all([
    supabase
      .from('encargos')
      .select(COLUMNAS_ENCARGO, { count: 'exact' })
      .eq('estado', 'recibido')
      .eq('es_prueba', false)
      .order('created_at', { ascending: true })
      .limit(MOSTRAR),
    supabase
      .from('encargos')
      .select(COLUMNAS_ENCARGO, { count: 'exact' })
      .eq('tiene_documentacion', false)
      .eq('es_prueba', false)
      .order('created_at', { ascending: true })
      .limit(3),
    supabase
      .from('invitaciones_resumen')
      .select('*', { count: 'exact' })
      .eq('activa', true)
      .eq('es_prueba', false)
      // Las pruebas desde la portada no tienen a quién escribirle.
      .eq('origen', 'ingeniero')
      .is('aceptada_en', null)
      .order('created_at', { ascending: false })
      .limit(MOSTRAR),
    supabase
      .from('invitaciones_resumen')
      .select('created_at, abierta_en, aceptada_en')
      .eq('es_prueba', false)
      .eq('origen', 'ingeniero')
      .or(`created_at.gte."${hace}",abierta_en.gte."${hace}",aceptada_en.gte."${hace}"`),
    supabase
      .from('comentarios')
      .select('id, created_at, reaccion, texto, proyecto:proyectos(empresa:payload->ficha->>empresa)', {
        count: 'exact',
      })
      .gte('created_at', hace)
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  const fallos = [esperando, sinDoc, invitaciones, semana, comentarios].filter((r) => r.error);
  for (const r of fallos) console.error('[AIB+] ABI no pudo leer una parte del resumen:', r.error?.message);

  const fechasSemana = (semana.data ?? []) as { created_at: string; abierta_en: string | null; aceptada_en: string | null }[];
  const enSemana = (fecha: string | null) => fecha !== null && fecha >= hace;

  return {
    esperando: ((esperando.data ?? []) as unknown as FilaEncargo[]).map(pendienteDe),
    totalEsperando: esperando.count ?? 0,
    sinDocumentacion: ((sinDoc.data ?? []) as unknown as FilaEncargo[]).map(pendienteDe),
    totalSinDocumentacion: sinDoc.count ?? 0,
    invitaciones: (invitaciones.data ?? []) as Invitacion[],
    totalInvitaciones: invitaciones.count ?? 0,
    comentarios: (
      (comentarios.data ?? []) as unknown as {
        id: number;
        created_at: string;
        reaccion: Reaccion | null;
        texto: string | null;
        proyecto: { empresa: string | null } | null;
      }[]
    ).map((c) => ({
      id: c.id,
      creadoEn: c.created_at,
      reaccion: c.reaccion,
      texto: c.texto,
      empresa: c.proyecto?.empresa ?? null,
    })),
    semana: {
      enviadas: fechasSemana.filter((i) => enSemana(i.created_at)).length,
      abrieron: fechasSemana.filter((i) => enSemana(i.abierta_en)).length,
      aceptaron: fechasSemana.filter((i) => enSemana(i.aceptada_en)).length,
      comentarios: comentarios.count ?? 0,
    },
    incompleto: fallos.length > 0,
  };
}

/** "3 h", "1 día", "4 días": cuánto lleva algo esperando. */
export function tiempoDesde(iso: string, ahora = Date.now()): string {
  const horas = Math.max(0, (ahora - Date.parse(iso)) / 3_600_000);
  if (horas < 1) return 'menos de una hora';
  if (horas < 24) return `${Math.floor(horas)} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? '1 día' : `${dias} días`;
}

/** Días completos desde una fecha, para decidir el color del aviso. */
export function diasDesde(iso: string, ahora = Date.now()): number {
  return Math.floor(Math.max(0, ahora - Date.parse(iso)) / 86_400_000);
}

/** Lo último que hizo el invitado, para saber cuánto lleva parado. */
export function ultimaActividad(inv: Invitacion): string {
  return [inv.created_at, inv.abierta_en, inv.empezada_en, inv.ultima_visita, inv.maqueta_en]
    .filter((f): f is string => Boolean(f))
    .sort()
    .at(-1) as string;
}

/** En qué se quedó, dicho como lo diría el ingeniero. */
export function dondeSeQuedo(inv: Invitacion): string {
  return {
    enviada: 'Todavía no abre el enlace',
    abierta: 'Abrió el enlace, pero no empezó',
    empezo: 'Empezó, pero no llegó a ver su web',
    maqueta: 'Vio su web, pero no aceptó',
    acepto: 'Aceptó',
  }[etapaDe(inv)];
}

/** Mensaje de WhatsApp para retomar la invitación donde se quedó. */
export function mensajeSeguimiento(inv: Invitacion): string {
  const url = urlInvitacion(inv.token);
  switch (etapaDe(inv)) {
    case 'abierta':
    case 'empezo':
      return (
        `Hola 👋 Vi que abriste el enlace para ver la web de ${inv.negocio}. ` +
        `Te toma un minuto terminarlo y ver cómo quedaría: ${url}`
      );
    case 'maqueta':
      return (
        `Hola 👋 ¿Qué te pareció la web de ${inv.negocio}? ` +
        `Si quieres cambiar algo o tienes dudas, te ayudo. Tu enlace: ${url}`
      );
    default:
      return mensajeInvitacion(inv);
  }
}
