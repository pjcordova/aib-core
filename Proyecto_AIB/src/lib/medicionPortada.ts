// ---------------------------------------------------------------------------
// Medición de la portada y de las páginas públicas
// ---------------------------------------------------------------------------
// Qué canal trae a los dueños de negocio, por qué página entran y hasta dónde
// llegan (supabase_medicion_portada.sql y supabase_llegadas.sql). El canal va
// en el enlace que se comparte (aibplus.app/?c=instagram) o, si no lo tiene,
// sale de la web de la que viene la visita: Google, otro buscador, una red…
// No hay cookies ni datos personales: solo se cuenta la visita y se guardan
// el canal y la página de entrada en la prueba sin cuenta.
// ---------------------------------------------------------------------------

import { supabase } from './supabase';

const CLAVE_CANAL = 'aib-canal';
const CLAVE_VISITA = 'aib-visita-contada';
const CLAVE_ENTRADA = 'aib-entrada';

function limpiar(canal: string | null): string | null {
  const limpio = (canal ?? '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,30}$/.test(limpio) ? limpio : null;
}

/** De qué web viene la visita, por su dirección. null si no viene de otra web. */
function canalDelReferente(): string | null {
  let host: string;
  try {
    host = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : '';
  } catch {
    return null;
  }
  const es = (dominios: string) => new RegExp(`(^|\\.)(${dominios})$`).test(host);
  // Sin referente, la propia AIB+ o la vuelta de entrar con Google o Supabase.
  if (!host || host === window.location.hostname || es('aibplus\\.app|supabase\\.co') || host.startsWith('accounts.')) {
    return null;
  }
  // El buscador es google.com, google.com.pe…; Gmail y los demás de Google, no.
  if (/^(www\.)?google\.[a-z.]+$/.test(host) || host.includes('googlequicksearchbox')) return 'google';
  if (host === 'mail.google.com' || es('outlook\\.live\\.com|mail\\.yahoo\\.com')) return 'correo';
  if (es('bing\\.com|duckduckgo\\.com|yahoo\\.com|ecosia\\.org|search\\.brave\\.com|yandex\\.[a-z.]+')) return 'buscador';
  if (es('facebook\\.com|fb\\.com|fb\\.me')) return 'facebook';
  if (es('instagram\\.com')) return 'instagram';
  if (es('tiktok\\.com')) return 'tiktok';
  if (es('linkedin\\.com|lnkd\\.in')) return 'linkedin';
  if (es('youtube\\.com|youtu\\.be')) return 'youtube';
  if (es('whatsapp\\.com|wa\\.me')) return 'whatsapp';
  if (es('t\\.co|x\\.com|twitter\\.com')) return 'x';
  return 'otra-web';
}

/**
 * El canal de esta visita: el ?c= del enlace (o utm_source, por si viene de
 * un anuncio) o, sin eso, la web de la que viene. Se recuerda en la pestaña
 * para cuando pulse «Pruébalo gratis».
 */
export function canalDeLaVisita(): string | null {
  const params = new URLSearchParams(window.location.search);
  const delEnlace = limpiar(params.get('c') ?? params.get('utm_source'));
  try {
    if (delEnlace) sessionStorage.setItem(CLAVE_CANAL, delEnlace);
    const guardado = delEnlace ?? limpiar(sessionStorage.getItem(CLAVE_CANAL));
    if (guardado) return guardado;
    const referente = canalDelReferente();
    if (referente) sessionStorage.setItem(CLAVE_CANAL, referente);
    return referente;
  } catch {
    return delEnlace ?? canalDelReferente();
  }
}

/** Buscadores y herramientas automáticas: ejecutan la página pero no son visitas. */
function esRobot(): boolean {
  return navigator.webdriver || /bot|crawl|spider|slurp|lighthouse|headless/i.test(navigator.userAgent);
}

/**
 * Cuenta una visita, una sola vez por pestaña: en la primera página pública
 * que abre ('portada', 'servicios/<slug>', 'rubros/<slug>' o 'explorar'), que
 * queda como su página de entrada. En desarrollo no cuenta: la app local usa
 * la misma base de datos que producción.
 */
export function registrarVisita(pagina: string): void {
  if (import.meta.env.DEV || esRobot()) return;
  try {
    if (sessionStorage.getItem(CLAVE_VISITA)) return;
    sessionStorage.setItem(CLAVE_VISITA, '1');
    sessionStorage.setItem(CLAVE_ENTRADA, pagina);
  } catch {
    // Sin almacenamiento se cuenta igual: a lo sumo, una recarga suma de más.
  }
  void supabase.rpc('registrar_visita', { p_pagina: pagina, p_canal: canalDeLaVisita() }).then(({ error }) => {
    if (error) console.warn('[AIB+] No se pudo contar la visita:', error.message);
  });
}

/** La página por la que entró en esta pestaña, para guardarla con su prueba. */
export function paginaDeEntrada(): string | null {
  try {
    return sessionStorage.getItem(CLAVE_ENTRADA);
  } catch {
    return null;
  }
}

/** El cliente pulsó «Prefiero publicarla yo». Estadística: si falla, no pasa nada. */
export function registrarInteres(tipo: 'publicar-yo'): void {
  void supabase.rpc('registrar_interes', { p_tipo: tipo }).then(({ error }) => {
    if (error) console.warn('[AIB+] No se pudo registrar el interés:', error.message);
  });
}

export interface CanalPortada {
  canal: string;
  visitas: number;
  pulsaron: number;
  empezaron: number;
  maqueta: number;
  aceptaron: number;
}

export interface EmbudoPortada {
  desde: string | null;
  canales: CanalPortada[];
  publicar_yo: { quieren: number; vieron_maqueta: number };
}

/** Para el ingeniero. */
export async function leerEmbudoPortada(): Promise<EmbudoPortada | null> {
  const { data, error } = await supabase.rpc('embudo_portada');
  if (error || !data) {
    console.warn('[AIB+] No se pudo leer el embudo de la portada:', error?.message);
    return null;
  }
  return data as EmbudoPortada;
}
