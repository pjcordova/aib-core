// ---------------------------------------------------------------------------
// Primeros pasos del ingeniero
// ---------------------------------------------------------------------------
// Lo que le falta a un ingeniero aprobado para empezar a recibir clientes. Lo
// calcula la base de datos (supabase_primeros_pasos.sql); aquí van los textos
// y adónde lleva cada paso en el panel.
// ---------------------------------------------------------------------------

import { supabase } from './supabase';

export type ClavePaso = 'perfil' | 'diseno' | 'precio' | 'avisos' | 'invitacion';

/** La pestaña del panel donde se hace cada paso. */
export type DestinoPaso = 'ingenieros' | 'catalogo' | 'invitaciones';

export interface Paso {
  clave: ClavePaso;
  hecho: boolean;
}

export const PASOS: Record<
  ClavePaso,
  { titulo: string; detalle: string; boton: string; destino: DestinoPaso; corto: string }
> = {
  perfil: {
    titulo: 'Pon tu foto y preséntate',
    detalle: 'Los clientes eligen a quien conocen: una foto y unas líneas sobre ti generan confianza.',
    boton: 'Completar mi perfil',
    destino: 'ingenieros',
    corto: 'tu foto y tu presentación',
  },
  diseno: {
    titulo: 'Sube tu primer diseño',
    detalle: 'Tus diseños salen en la portada con tu nombre: es lo que hace que un cliente te elija.',
    boton: 'Subir un diseño',
    destino: 'catalogo',
    corto: 'subir un diseño',
  },
  precio: {
    titulo: 'Ponle precio a tus diseños',
    detalle: 'Con su «desde S/» el cliente compara y llega a ti sabiendo cuánto invertir.',
    boton: 'Poner precios',
    destino: 'catalogo',
    corto: 'ponerle precio a tus diseños',
  },
  avisos: {
    titulo: 'Activa tus avisos por WhatsApp',
    detalle: 'Te avisamos al instante cuando te llega un encargo y cada mañana te recordamos lo pendiente.',
    boton: 'Activar avisos',
    destino: 'ingenieros',
    corto: 'activar tus avisos por WhatsApp',
  },
  invitacion: {
    titulo: 'Invita a tu primer cliente',
    detalle: 'Mándale tu enlace: ve cómo quedaría su proyecto en un minuto, sin crear cuenta.',
    boton: 'Crear una invitación',
    destino: 'invitaciones',
    corto: 'invitar a tu primer cliente',
  },
};

function leer(pasos: unknown): Paso[] {
  if (!Array.isArray(pasos)) return [];
  return pasos.filter(
    (p): p is Paso => !!p && typeof p === 'object' && (p as Paso).clave in PASOS && typeof (p as Paso).hecho === 'boolean'
  );
}

/** Los del ingeniero. null si no tiene perfil o es miembro del equipo de otro. */
export async function misPrimerosPasos(): Promise<Paso[] | null> {
  const { data, error } = await supabase.rpc('mis_primeros_pasos');
  if (error || !data) {
    if (error) console.warn('[AIB+] No se pudieron leer tus primeros pasos:', error.message);
    return null;
  }
  return leer((data as { pasos?: unknown }).pasos);
}

/** Los de cada ingeniero, para el administrador. */
export async function primerosPasosIngenieros(): Promise<Map<string, Paso[]>> {
  const { data, error } = await supabase.rpc('primeros_pasos_ingenieros');
  if (error) console.warn('[AIB+] No se pudieron leer los primeros pasos:', error.message);
  return new Map(((data as { id: string; pasos: unknown }[] | null) ?? []).map((f) => [f.id, leer(f.pasos)] as const));
}

/** «subir un diseño, ponerle precio a tus diseños y activar tus avisos por WhatsApp». */
export function textoFaltantes(pasos: Paso[]): string {
  const faltan = pasos.filter((p) => !p.hecho).map((p) => PASOS[p.clave].corto);
  return faltan.length <= 1 ? (faltan[0] ?? '') : `${faltan.slice(0, -1).join(', ')} y ${faltan[faltan.length - 1]}`;
}
