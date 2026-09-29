// ---------------------------------------------------------------------------
// Fotos del cliente
// ---------------------------------------------------------------------------
// Donde la maqueta tiene un hueco de imagen (un degradado o un icono), el
// cliente puede poner una foto suya. Se reduce en el navegador y se sube a
// Supabase Storage (supabase_fotos.sql), a una carpeta a su nombre.
// ---------------------------------------------------------------------------

import { supabase } from './supabase';

const BUCKET = 'fotos';
const FORMATOS = ['image/png', 'image/jpeg', 'image/webp'];
/** El original puede ser grande: se reduce antes de subirlo. */
const PESO_MAXIMO_ORIGINAL = 15 * 1024 * 1024;
const LADO_MAXIMO = 1600;

/** Dirección pública de las fotos: la única que se acepta dentro de una maqueta. */
export const PREFIJO_FOTOS = `${String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}/`;

/**
 * Reduce la foto a un tamaño de web y la re-codifica en WEBP. Además de pesar
 * mucho menos, pasar por un canvas descarta todo lo que no sea la imagen
 * (metadatos, ubicación del GPS de la cámara, contenido raro).
 */
async function prepararFoto(archivo: File): Promise<Blob> {
  if (!FORMATOS.includes(archivo.type)) {
    throw new Error('Sube la foto en JPG, PNG o WEBP.');
  }
  if (archivo.size > PESO_MAXIMO_ORIGINAL) {
    throw new Error('La foto pesa demasiado. Prueba con una de menos de 15 MB.');
  }

  const imagen = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
  const ancho = Math.max(1, Math.round(imagen.width * escala));
  const alto = Math.max(1, Math.round(imagen.height * escala));

  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no pudo procesar la foto.');
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  imagen.close();

  const blob = await new Promise<Blob | null>((listo) => canvas.toBlob(listo, 'image/webp', 0.82));
  if (!blob) throw new Error('Tu navegador no pudo procesar la foto.');
  return blob;
}

/** Sube una foto del cliente y devuelve su dirección pública. */
export async function subirFoto(archivo: File): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');

  const blob = await prepararFoto(archivo);
  const ruta = `${user.id}/${crypto.randomUUID()}.webp`;

  const { error } = await supabase.storage.from(BUCKET).upload(ruta, blob, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) {
    console.error('[AIB+] No se pudo subir la foto:', error.message);
    throw new Error('No pudimos subir la foto. Revisa tu conexión y vuelve a intentarlo.');
  }

  return supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
}
