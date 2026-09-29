// ---------------------------------------------------------------------------
// Enlaces para compartir la maqueta
// ---------------------------------------------------------------------------
// El cliente manda su maqueta a otra persona con un enlace /ver/<código>.
// Quien lo abre no necesita cuenta y solo ve la maqueta: la base de datos
// devuelve la página y nada más del proyecto (supabase_compartir.sql).
//
// La página que se enseña en público la escribió un cliente, así que aquí no
// se confía en ella: se pinta sin scripts, sin enlaces hacia fuera y sin
// formularios que envíen nada.
// ---------------------------------------------------------------------------

import { supabase } from './supabase';
import { construirDocumento } from './marca';
import { sanearDocumento } from './edicion';
import { PREFIJO_FOTOS } from './fotos';
import { colorSeguro } from './plantillas';
import { PALETAS, type FichaWeb } from './servicios';

/** Dirección pública de un enlace. */
export function urlDeEnlace(token: string): string {
  return `${window.location.origin}/ver/${token}`;
}

/** Código del enlace del proyecto, si ya se compartió. */
export async function enlaceDelProyecto(proyectoId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('enlaces_compartidos')
    .select('token')
    .eq('proyecto_id', proyectoId)
    .maybeSingle();
  if (error) {
    console.warn('[AIB+] No se pudo leer el enlace:', error.message);
    return null;
  }
  return data?.token ?? null;
}

/** Crea el enlace del proyecto, o devuelve el que ya tenía. */
export async function compartirProyecto(proyectoId: string): Promise<{ token: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('compartir_proyecto', { p_proyecto: proyectoId });
  if (error || typeof data !== 'string') {
    console.error('[AIB+] No se pudo crear el enlace:', error?.message);
    return { token: null, error: 'No pudimos crear el enlace. Vuelve a intentarlo en un momento.' };
  }
  return { token: data, error: null };
}

/** Borra el enlace: quien lo tenga deja de ver la maqueta. */
export async function dejarDeCompartir(proyectoId: string): Promise<boolean> {
  const { error } = await supabase.from('enlaces_compartidos').delete().eq('proyecto_id', proyectoId);
  if (error) console.error('[AIB+] No se pudo desactivar el enlace:', error.message);
  return !error;
}

/* -------------------------------------------------------------------------- */
/* Vista pública                                                              */
/* -------------------------------------------------------------------------- */

export interface MaquetaCompartida {
  empresa: string;
  /** Página lista para el iframe, ya limpia. */
  documento: string;
}

interface FilaCompartida {
  empresa?: unknown;
  logo?: unknown;
  paleta?: { primario?: unknown; secundario?: unknown } | null;
  documento?: unknown;
  html?: unknown;
}

const LOGO_VALIDO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/**
 * La maqueta de un enlace, lista para pintar. null si el enlace no existe o
 * se desactivó.
 */
export async function leerMaquetaCompartida(token: string): Promise<MaquetaCompartida | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;

  const { data, error } = await supabase.rpc('maqueta_compartida', { p_token: token });
  if (error) {
    console.error('[AIB+] No se pudo leer la maqueta compartida:', error.message);
    throw new Error('No pudimos cargar la maqueta.');
  }
  const fila = data as FilaCompartida | null;
  if (!fila) return null;

  const empresa = typeof fila.empresa === 'string' && fila.empresa.trim() ? fila.empresa.trim() : 'Tu negocio';

  let documento = typeof fila.documento === 'string' ? fila.documento : '';
  if (!documento && typeof fila.html === 'string') {
    // Las maquetas de IA sin editar guardan solo el cuerpo: se montan igual
    // que en la app, con el logo y los colores validados.
    const base = PALETAS[0];
    const ficha = {
      empresa,
      logo: typeof fila.logo === 'string' && LOGO_VALIDO.test(fila.logo) ? fila.logo : null,
      paleta: {
        ...base,
        primario: colorSeguro(String(fila.paleta?.primario ?? ''), base.primario),
        secundario: colorSeguro(String(fila.paleta?.secundario ?? ''), base.secundario),
      },
    } as FichaWeb;
    documento = construirDocumento(fila.html, ficha);
  }
  if (!documento) return null;

  return { empresa, documento: documentoPublico(documento) };
}

/**
 * Qué puede cargar la maqueta pública: sus estilos y fuentes de siempre
 * (Google Fonts y el CDN de Bootstrap) y las fotos de nuestro almacenamiento.
 * Nada más: ni scripts, ni imágenes de terceros que sirvan para rastrear a
 * quien la abre, ni formularios que envíen datos.
 */
function politicaDeContenido(): string {
  const fotos = (() => {
    try {
      return new URL(PREFIJO_FOTOS).origin;
    } catch {
      return '';
    }
  })();
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    'font-src https://fonts.gstatic.com https://cdn.jsdelivr.net data:',
    `img-src data: ${fotos}`.trim(),
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
}

/**
 * Deja la página lista para enseñarla a cualquiera. Además de la limpieza de
 * siempre (sanearDocumento), sin ningún script, sin enlaces que salgan de la
 * página y sin formularios con destino: en el iframe no se ejecuta nada, y
 * así tampoco puede servir para mandar a nadie a otra web.
 */
export function documentoPublico(documento: string): string {
  const doc = new DOMParser().parseFromString(sanearDocumento(documento), 'text/html');

  // Va la primera del <head>, para que rija antes de cargar nada.
  const politica = doc.createElement('meta');
  politica.setAttribute('http-equiv', 'Content-Security-Policy');
  politica.setAttribute('content', politicaDeContenido());
  doc.head.prepend(politica);

  doc.querySelectorAll('script, noscript').forEach((n) => n.remove());
  doc.querySelectorAll('a[href]').forEach((a) => {
    if (!a.getAttribute('href')?.startsWith('#')) a.removeAttribute('href');
  });
  doc.querySelectorAll('form').forEach((f) => {
    f.removeAttribute('action');
    f.removeAttribute('target');
  });
  doc.querySelectorAll('[formaction], [target]').forEach((el) => {
    el.removeAttribute('formaction');
    el.removeAttribute('target');
  });

  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}
