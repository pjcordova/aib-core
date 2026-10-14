// ---------------------------------------------------------------------------
// Métricas del marketplace, para los informes de Santander X
// ---------------------------------------------------------------------------
// Solo el administrador (metricas_admin, en supabase_metricas.sql). Semanas
// de lunes a domingo, hora de Lima; solo totales, sin datos personales. Los
// proyectos de los ingenieros probando como clientes no cuentan.
// ---------------------------------------------------------------------------

import { supabase } from './supabase';
import { PAGINAS_RUBRO } from './paginasRubro';
import { PAGINAS_SERVICIO } from './paginasServicio';

export interface SemanaMetricas {
  /** El lunes de la semana (AAAA-MM-DD). */
  semana: string;
  visitas: number;
  pruebas: number;
  proyectos: number;
  encargos: number;
  propuestas: number;
  aceptadas: number;
  vendido: number;
  ingenieros: number;
  disenos: number;
  resenas: number;
  ingresos: number;
}

export interface SituacionActual {
  ingenieros_aprobados: number;
  ingenieros_verificados: number;
  ingenieros_pendientes: number;
  ingenieros_con_disenos: number;
  disenos_publicados: number;
  clientes_con_cuenta: number;
  encargos: number;
  propuestas_aceptadas: number;
  vendido: number;
  resenas: number;
  promedio: number | null;
  planes_pro: number;
  planes_negocio: number;
  ingreso_mensual: number;
}

export interface Metricas {
  generado: string;
  semanas: SemanaMetricas[];
  actual: SituacionActual;
}

export type ClaveSerie = Exclude<keyof SemanaMetricas, 'semana'>;

/** Qué es cada número, en el orden del embudo. */
export const SERIES: { clave: ClaveSerie; nombre: string; soles?: boolean; ayuda: string }[] = [
  { clave: 'visitas', nombre: 'Visitas', ayuda: 'Visitas a la portada y a las páginas de servicios, rubros y el buscador' },
  { clave: 'pruebas', nombre: 'Pruebas', ayuda: 'Personas que empezaron a ver cómo quedaría lo suyo' },
  { clave: 'proyectos', nombre: 'Vistas previas', ayuda: 'Vistas previas guardadas por los clientes' },
  { clave: 'encargos', nombre: 'Encargos', ayuda: 'Proyectos enviados a un ingeniero' },
  { clave: 'propuestas', nombre: 'Propuestas', ayuda: 'Propuestas enviadas por los ingenieros' },
  { clave: 'aceptadas', nombre: 'Aceptadas', ayuda: 'Propuestas aceptadas por el cliente' },
  { clave: 'vendido', nombre: 'Vendido', soles: true, ayuda: 'Monto de las propuestas aceptadas (lo cobra el ingeniero)' },
  { clave: 'ingenieros', nombre: 'Ingenieros nuevos', ayuda: 'Postulaciones de ingenieros' },
  { clave: 'disenos', nombre: 'Diseños nuevos', ayuda: 'Diseños subidos o creados por los ingenieros' },
  { clave: 'resenas', nombre: 'Reseñas', ayuda: 'Reseñas de clientes' },
  { clave: 'ingresos', nombre: 'Ingresos AIB+', soles: true, ayuda: 'Pagos de planes registrados (lo que cobra AIB+)' },
];

/**
 * Los pasos del embudo, del primero al último. Las vistas previas no entran:
 * un cliente puede guardar varias en una misma prueba y el porcentaje
 * pasaría del 100%.
 */
export const EMBUDO: ClaveSerie[] = ['visitas', 'pruebas', 'encargos', 'propuestas', 'aceptadas'];

export async function leerMetricas(semanas = 8): Promise<Metricas | null> {
  const { data, error } = await supabase.rpc('metricas_admin', { p_semanas: semanas });
  if (error) {
    console.error('[AIB+] No se pudieron leer las métricas:', error.message);
    return null;
  }
  const m = data as Metricas | null;
  if (!m?.semanas) return null;
  // Los montos llegan como texto cuando son sumas grandes: siempre números.
  m.semanas = m.semanas.map((s) => {
    const fila = { ...s };
    for (const { clave } of SERIES) fila[clave] = Number(s[clave]) || 0;
    return fila;
  });
  return m;
}

// ------------------------------------------------------------ de dónde llegan
// llegadas_admin (supabase_llegadas.sql): por canal y por página de entrada.
// Google y las demás webs se distinguen desde el 12 de octubre de 2026; antes,
// todo figura como «directo» y en la portada.

export interface CanalLlegada {
  canal: string;
  visitas: number;
  /** Pruebas sin cuenta que empezaron por ese canal. */
  pruebas: number;
  maqueta: number;
  encargos: number;
}

export interface PaginaLlegada {
  /** 'portada', 'explorar', 'servicios/<slug>', 'rubros/<slug>', 'otra' o 'sin-dato'. */
  pagina: string;
  visitas: number;
  google: number;
  pruebas: number;
  encargos: number;
}

/** Ingenieros que postularon en el periodo, por el canal con el que llegaron. */
export interface IngenierosPorCanal {
  canal: string;
  postularon: number;
  aprobados: number;
}

export interface Llegadas {
  canales: CanalLlegada[];
  paginas: PaginaLlegada[];
  ingenieros?: IngenierosPorCanal[];
}

export async function leerLlegadas(semanas = 8): Promise<Llegadas | null> {
  const { data, error } = await supabase.rpc('llegadas_admin', { p_semanas: semanas });
  if (error || !data) {
    console.error('[AIB+] No se pudo leer de dónde llegan las visitas:', error?.message);
    return null;
  }
  return data as Llegadas;
}

const NOMBRES_CANAL: Record<string, string> = {
  google: 'Google',
  buscador: 'Otros buscadores',
  directo: 'Directo',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  whatsapp: 'WhatsApp',
  x: 'X (Twitter)',
  correo: 'Correo',
  'otra-web': 'Otras webs',
  otro: 'Otros',
};

/** «Google», «Otros buscadores»… o el ?c= del enlace con mayúscula («Maps»). */
export const nombreCanal = (canal: string) => NOMBRES_CANAL[canal] ?? canal.charAt(0).toUpperCase() + canal.slice(1);

/** «Portada», «Rubro: Restaurantes», «Servicio: CRM»… */
export function nombrePagina(pagina: string): string {
  if (pagina === 'portada') return 'Portada';
  if (pagina === 'explorar') return 'Buscador de ingenieros';
  if (pagina === 'ingenieros') return 'Únete como ingeniero';
  if (pagina === 'otra') return 'Otras';
  if (pagina === 'sin-dato') return 'Sin dato (pruebas de antes del 12 oct)';
  const [tipo, slug] = pagina.split('/');
  if (tipo === 'rubros') return `Rubro: ${PAGINAS_RUBRO.find((p) => p.slug === slug)?.nombre ?? slug}`;
  if (tipo === 'servicios') return `Servicio: ${PAGINAS_SERVICIO.find((p) => p.slug === slug)?.nombre ?? slug}`;
  return pagina;
}

export const numero = (n: number) => n.toLocaleString('es-PE');
export const soles = (n: number) => `S/ ${n.toLocaleString('es-PE')}`;
export const valor = (clave: ClaveSerie, n: number) => (SERIES.find((s) => s.clave === clave)?.soles ? soles(n) : numero(n));

/** «5 oct» (corto) o «5 al 11 de octubre» (rango de la semana). */
export function etiquetaSemana(lunes: string, larga = false): string {
  const inicio = new Date(`${lunes}T12:00:00`);
  if (!larga) return inicio.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 6);
  const mismoMes = inicio.getMonth() === fin.getMonth();
  return mismoMes
    ? `${inicio.getDate()} al ${fin.toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })}`
    : `${inicio.toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })} al ${fin.toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })}`;
}

/** Suma de una serie en todo el periodo. */
export const total = (m: Metricas, clave: ClaveSerie) => m.semanas.reduce((suma, s) => suma + s[clave], 0);

/** «1 reseña», «3 reseñas». */
const contar = (n: number, uno: string, varios: string) => `${numero(n)} ${n === 1 ? uno : varios}`;

/** «Desde Google: 12 visitas y 2 pruebas. Otros canales: …» (vacío si no hay datos). */
function textoLlegadas(llegadas?: Llegadas | null): string {
  if (!llegadas?.canales.length) return '';
  const google = llegadas.canales.find((c) => c.canal === 'google');
  const otros = llegadas.canales
    .filter((c) => c.canal !== 'google' && c.visitas > 0)
    .slice(0, 4)
    .map((c) => `${nombreCanal(c.canal)} ${numero(c.visitas)}`);
  return [
    `Desde Google: ${contar(google?.visitas ?? 0, 'visita', 'visitas')} y ${contar(google?.pruebas ?? 0, 'prueba', 'pruebas')}.`,
    otros.length ? `Otros canales (visitas): ${otros.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Un párrafo listo para pegar en el informe. */
export function resumenTexto(m: Metricas, llegadas?: Llegadas | null): string {
  const semanas = m.semanas;
  const ultima = semanas.at(-1);
  const a = m.actual;
  const t = (c: ClaveSerie) => total(m, c);
  const fecha = (d: Date, conAnio = false) =>
    d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', ...(conAnio ? { year: 'numeric' } : {}) });
  const lineas = [
    `AIB+ — resumen de las últimas ${semanas.length} semanas (del ${fecha(new Date(`${semanas[0].semana}T12:00:00`))} al ${fecha(new Date(), true)}).`,
    '',
    `Embudo: ${contar(t('visitas'), 'visita', 'visitas')} a la web, ${contar(t('pruebas'), 'prueba', 'pruebas')}, ${contar(t('proyectos'), 'vista previa', 'vistas previas')}, ${contar(t('encargos'), 'encargo enviado', 'encargos enviados')} a ingenieros, ${contar(t('propuestas'), 'propuesta', 'propuestas')} y ${contar(t('aceptadas'), 'aceptada', 'aceptadas')} (${soles(t('vendido'))} vendidos por los ingenieros).`,
    ultima
      ? `Esta semana (del ${etiquetaSemana(ultima.semana, true)}): ${contar(ultima.visitas, 'visita', 'visitas')}, ${contar(ultima.pruebas, 'prueba', 'pruebas')} y ${contar(ultima.encargos, 'encargo', 'encargos')}.`
      : '',
    textoLlegadas(llegadas),
    '',
    `Oferta: ${contar(a.ingenieros_aprobados, 'ingeniero aprobado', 'ingenieros aprobados')} (${contar(a.ingenieros_verificados, 'verificado', 'verificados')}, ${a.ingenieros_con_disenos} con diseños publicados) y ${contar(a.disenos_publicados, 'diseño publicado', 'diseños publicados')}.`,
    `Clientes: ${a.clientes_con_cuenta} con cuenta, ${contar(a.encargos, 'encargo', 'encargos')} en total, ${contar(a.resenas, 'reseña', 'reseñas')}${a.promedio ? ` (promedio ${a.promedio} ★)` : ''}.`,
    `Ingresos de AIB+: ${contar(a.planes_pro, 'plan Pro', 'planes Pro')} y ${contar(a.planes_negocio, 'plan Negocio', 'planes Negocio')} activos, ${soles(a.ingreso_mensual)} al mes; ${soles(t('ingresos'))} cobrados en el periodo.`,
  ];
  return lineas.filter((l, i, todas) => l !== '' || todas[i - 1] !== '').join('\n');
}

/** Excel con tres hojas: por semana, la situación actual y de dónde llegan. */
export async function descargarExcel(m: Metricas, llegadas?: Llegadas | null): Promise<void> {
  const XLSX = await import('xlsx');
  const filas = m.semanas.map((s) => ({
    'Semana del': etiquetaSemana(s.semana, true),
    ...Object.fromEntries(SERIES.map((serie) => [serie.soles ? `${serie.nombre} (S/)` : serie.nombre, s[serie.clave]])),
  }));
  const a = m.actual;
  const actual = [
    ['Ingenieros aprobados', a.ingenieros_aprobados],
    ['Ingenieros verificados', a.ingenieros_verificados],
    ['Ingenieros con diseños', a.ingenieros_con_disenos],
    ['Postulaciones por revisar', a.ingenieros_pendientes],
    ['Diseños publicados', a.disenos_publicados],
    ['Clientes con cuenta', a.clientes_con_cuenta],
    ['Encargos (total)', a.encargos],
    ['Propuestas aceptadas (total)', a.propuestas_aceptadas],
    ['Vendido por los ingenieros (S/)', a.vendido],
    ['Reseñas', a.resenas],
    ['Promedio de estrellas', a.promedio ?? '—'],
    ['Planes Pro activos', a.planes_pro],
    ['Planes Negocio activos', a.planes_negocio],
    ['Ingreso mensual de AIB+ (S/)', a.ingreso_mensual],
  ];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), 'Por semana');
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Indicador', 'Valor'], ...actual]), 'Situación actual');
  if (llegadas) {
    const hoja = [
      ['Canal', 'Visitas', 'Pruebas', 'Vieron su maqueta', 'Encargos'],
      ...llegadas.canales.map((c) => [nombreCanal(c.canal), c.visitas, c.pruebas, c.maqueta, c.encargos]),
      [],
      ['Página de entrada', 'Visitas', 'Desde Google', 'Pruebas', 'Encargos'],
      ...llegadas.paginas.map((p) => [nombrePagina(p.pagina), p.visitas, p.google, p.pruebas, p.encargos]),
      [],
      ['Ingenieros por canal', 'Postularon', 'Aprobados'],
      ...(llegadas.ingenieros ?? []).map((g) => [nombreCanal(g.canal), g.postularon, g.aprobados]),
    ];
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(hoja), 'De dónde llegan');
  }
  XLSX.writeFile(libro, `aibplus-metricas-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
