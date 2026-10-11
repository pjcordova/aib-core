// ---------------------------------------------------------------------------
// El cliente guarda su proyecto con Google o con su correo
// ---------------------------------------------------------------------------
// El cliente prueba sin cuenta: una sesión anónima que vive en su navegador.
// Al enviar su encargo se le ofrece guardarlo, y desde otro dispositivo lo
// recupera entrando con la misma cuenta (supabase_cuenta_cliente.sql).
//
// - Guardar: la sesión anónima pasa a ser una cuenta normal con el MISMO
//   usuario (linkIdentity con Google; updateUser con el correo), así que no
//   hay nada que mover.
// - Si ese Google o ese correo ya tenían cuenta, no se puede convertir: se
//   entra a esa cuenta y se trae lo hecho sin cuenta con un código de
//   traspaso de un solo uso (preparar_traspaso / completar_traspaso).
// - Recuperar: entrar con Google, o con un código que llega al correo (solo
//   a cuentas que ya existen).
//
// Google sale del sitio y vuelve: lo que estaba en marcha se apunta en
// localStorage y lo termina retomarAcceso() al volver.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import type { AuthError } from '@supabase/supabase-js';
import { supabase } from './supabase';

const CLAVE = 'aib-acceso-cliente';
/** Lo apuntado caduca a la hora, como el código de traspaso. */
const VIGENCIA_MS = 60 * 60 * 1000;

export type AccionAcceso = 'guardar' | 'recuperar';

interface Pendiente {
  accion: AccionAcceso;
  via: 'google' | 'correo';
  /** Código para traerse lo hecho sin cuenta, si había algo. */
  traspaso: string | null;
  en: number;
}

function leerPendiente(): Pendiente | null {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as Pendiente | null;
    return p && Date.now() - p.en < VIGENCIA_MS ? p : null;
  } catch {
    return null;
  }
}

function apuntar(p: Omit<Pendiente, 'en'>) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ ...p, en: Date.now() }));
  } catch {
    // Sin almacenamiento: se pierde el traspaso, no el acceso.
  }
}

function olvidar() {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Nada que hacer.
  }
}

/** A dónde vuelve el cliente desde Google o desde el enlace del correo. */
const destino = () => `${window.location.origin}/mi-web`;

async function esAnonima(): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.is_anonymous === true;
}

/** Si hay algo hecho sin cuenta, el código para traérselo. Si falla, sigue sin él. */
async function prepararTraspaso(): Promise<string | null> {
  if (!(await esAnonima())) return null;
  const { data, error } = await supabase.rpc('preparar_traspaso');
  if (error) console.warn('[AIB+] No se pudo preparar el traspaso:', error.message);
  return typeof data === 'string' ? data : null;
}

/** Un mensaje claro para cada fallo que el cliente puede encontrarse. */
export function mensajeDeAcceso(error: Pick<AuthError, 'code' | 'message'> | null | undefined): string {
  const codigo = error?.code ?? '';
  const texto = error?.message ?? '';
  if (codigo === 'manual_linking_disabled' || codigo === 'provider_disabled' || /provider is not enabled/i.test(texto)) {
    return 'El ingreso con Google todavía no está activo. Usa tu correo por ahora.';
  }
  if (codigo === 'over_email_send_rate_limit' || codigo === 'over_request_rate_limit') {
    return 'Enviamos varios correos en poco tiempo. Espera unos minutos y vuelve a intentarlo.';
  }
  if (codigo === 'email_address_not_authorized') {
    return 'Todavía no podemos enviar correos a esa dirección. Prueba con Google.';
  }
  // Supabase también revisa que el dominio reciba correos («gmial.com» no).
  if (codigo === 'email_address_invalid' || codigo === 'validation_failed') {
    return 'Revisa tu correo: parece que está mal escrito o no recibe mensajes.';
  }
  if (codigo === 'otp_expired') return 'El código no es correcto o ya venció. Revisa el último correo o pide uno nuevo.';
  if (codigo === 'otp_disabled' || codigo === 'signup_disabled' || codigo === 'user_not_found') {
    return 'No encontramos un proyecto guardado con ese correo. Revisa que sea el mismo con el que lo guardaste.';
  }
  return 'No pudimos completar el acceso. Revisa tu conexión y vuelve a intentarlo.';
}

export const correoValido = (correo: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo.trim());

/** Si ya tiene algún proyecto: antes de eso no hay nada que guardar. */
export async function tieneProyectos(): Promise<boolean> {
  const { count, error } = await supabase.from('proyectos').select('id', { count: 'exact', head: true });
  return !error && (count ?? 0) > 0;
}

// Se ofrece una vez por visita al enviar el encargo; después queda el botón.
const CLAVE_OFRECIDO = 'aib-guardar-ofrecido';

export function yaSeOfrecio(): boolean {
  try {
    return sessionStorage.getItem(CLAVE_OFRECIDO) === '1';
  } catch {
    return false;
  }
}

export function marcarOfrecido() {
  try {
    sessionStorage.setItem(CLAVE_OFRECIDO, '1');
  } catch {
    // Sin almacenamiento: se ofrecerá otra vez, nada más.
  }
}

/* -------------------------------------------------------------------------- */
/* Google                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * El correo de Supabase, sin un servidor de correo propio (Resend), solo
 * llega a los miembros del equipo y unos pocos por hora: a un cliente no le
 * llegaría el código. Se pone en true al configurar Resend en Supabase.
 */
const CORREO_LISTO = false;

export interface Accesos {
  google: boolean;
  correo: boolean;
}

let accesos: Promise<Accesos> | null = null;

/**
 * Con qué puede guardar o recuperar su proyecto. Google, si está activado en
 * Supabase (sin él, Supabase respondería con una página de error en vez de
 * llevarlo a Google). Sin ninguno, no se ofrece guardar.
 */
export function accesosDisponibles(): Promise<Accesos> {
  accesos ??= fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string },
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((ajustes: { external?: { google?: boolean } } | null) => ajustes?.external?.google === true)
    .catch(() => false)
    .then((google) => ({ google, correo: CORREO_LISTO }));
  return accesos;
}

/** Si hay al menos una forma de guardar: si no, no se ofrece. */
export function useAccesos(): Accesos | null {
  const [disponibles, setDisponibles] = useState<Accesos | null>(null);
  useEffect(() => {
    let vigente = true;
    void accesosDisponibles().then((a) => vigente && setDisponibles(a));
    return () => {
      vigente = false;
    };
  }, []);
  return disponibles;
}

export const hayAcceso = (a: Accesos | null) => !!a && (a.google || a.correo);

/**
 * Con sesión anónima, guarda (vincula Google a la sesión); sin ella, entra.
 * Si todo va bien, el navegador se va a Google: solo vuelve aquí si falla.
 */
export async function continuarConGoogle(accion: AccionAcceso): Promise<{ error: string | null }> {
  const anonima = await esAnonima();
  apuntar({ accion, via: 'google', traspaso: await prepararTraspaso() });
  const opciones = { provider: 'google' as const, options: { redirectTo: destino() } };
  const { error } =
    anonima && accion === 'guardar'
      ? await supabase.auth.linkIdentity(opciones)
      : await supabase.auth.signInWithOAuth(opciones);
  // Sin error, el navegador ya se está yendo a Google: lo apuntado se queda.
  if (!error) return { error: null };
  olvidar();
  console.error('[AIB+] No se pudo abrir Google:', error.message);
  return { error: mensajeDeAcceso(error) };
}

/* -------------------------------------------------------------------------- */
/* Correo                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 'cambio': el correo queda en la sesión anónima, que pasa a ser su cuenta.
 * 'ingreso': el correo ya tenía cuenta (o está recuperando) y entra a ella.
 */
export type TipoCodigo = 'cambio' | 'ingreso';

/**
 * Envía el código (y el enlace) al correo. Al guardar, si ese correo ya tenía
 * cuenta, pasa solo a entrar en ella trayéndose lo hecho sin cuenta.
 */
export async function pedirCodigo(
  correo: string,
  accion: AccionAcceso
): Promise<{ tipo: TipoCodigo; yaTeniaCuenta: boolean } | { error: string }> {
  const email = correo.trim().toLowerCase();

  if (accion === 'guardar' && (await esAnonima())) {
    apuntar({ accion, via: 'correo', traspaso: null });
    const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: destino() });
    if (!error) return { tipo: 'cambio', yaTeniaCuenta: false };
    if (error.code !== 'email_exists' && error.code !== 'user_already_exists') {
      olvidar();
      console.error('[AIB+] No se pudo enviar el código:', error.message);
      return { error: mensajeDeAcceso(error) };
    }
    // Ese correo ya tenía cuenta: se entra a ella.
  }

  apuntar({ accion, via: 'correo', traspaso: await prepararTraspaso() });
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: destino() },
  });
  if (error) {
    olvidar();
    console.error('[AIB+] No se pudo enviar el código de ingreso:', error.message);
    return { error: mensajeDeAcceso(error) };
  }
  return { tipo: 'ingreso', yaTeniaCuenta: accion === 'guardar' };
}

/** Vuelve a enviar el código, del mismo tipo. */
export async function reenviarCodigo(correo: string, tipo: TipoCodigo): Promise<{ error: string | null }> {
  const email = correo.trim().toLowerCase();
  const { error } =
    tipo === 'cambio'
      ? await supabase.auth.resend({ type: 'email_change', email, options: { emailRedirectTo: destino() } })
      : await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: destino() } });
  if (error) console.error('[AIB+] No se pudo reenviar el código:', error.message);
  return { error: error ? mensajeDeAcceso(error) : null };
}

/** Confirma el código del correo y termina lo que estaba en marcha. */
export async function confirmarCodigo(
  correo: string,
  codigo: string,
  tipo: TipoCodigo
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.verifyOtp({
    email: correo.trim().toLowerCase(),
    token: codigo.replace(/\D/g, ''),
    type: tipo === 'cambio' ? 'email_change' : 'email',
  });
  if (error) {
    console.error('[AIB+] Código no aceptado:', error.message);
    return { error: mensajeDeAcceso(error) };
  }
  // Un token nuevo, que ya dice que no es anónima.
  await supabase.auth.refreshSession();
  await terminarTraspaso();
  return { error: null };
}

/**
 * Si tocó el enlace del correo en otra pestaña o en otro dispositivo, esta
 * sesión sigue creyéndose anónima hasta refrescarse. true si ya se guardó.
 */
export async function revisarSiSeGuardo(): Promise<boolean> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session || data.session.user.is_anonymous) return false;
  olvidar();
  return true;
}

/* -------------------------------------------------------------------------- */
/* Al volver de Google o del enlace del correo                                */
/* -------------------------------------------------------------------------- */

async function terminarTraspaso(): Promise<void> {
  const pendiente = leerPendiente();
  olvidar();
  if (!pendiente?.traspaso) return;
  const { data, error } = await supabase.rpc('completar_traspaso', { p_token: pendiente.traspaso });
  if (error || data !== 'ok') console.warn('[AIB+] No se completó el traspaso:', error?.message ?? data);
}

export type Retomado =
  | { estado: 'nada' }
  /** Ya entró a su cuenta (y se trajo lo hecho sin cuenta, si había). */
  | { estado: 'listo'; accion: AccionAcceso; via: 'google' | 'correo' }
  /** Se fue otra vez a Google, a entrar a la cuenta que ya tenía ese Google. */
  | { estado: 'redirigiendo' }
  | { estado: 'error'; mensaje: string };

/** Los parámetros de error con que vuelve Supabase (en la URL o tras el #). */
function errorDeLaUrl(): { codigo: string; descripcion: string } | null {
  const parametros = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const codigo = parametros.get('error_code') ?? hash.get('error_code');
  const descripcion = parametros.get('error_description') ?? hash.get('error_description') ?? '';
  if (!codigo && !parametros.get('error') && !hash.get('error')) return null;
  // Que no se quede en la barra de direcciones ni se vuelva a leer.
  window.history.replaceState(null, '', window.location.pathname);
  return { codigo: codigo ?? '', descripcion };
}

// Una sola vez por carga: en modo estricto React ejecuta los efectos dos veces,
// y dos traspasos o dos viajes a Google a la vez se pisarían.
let retomando: Promise<Retomado> | null = null;

/**
 * Se llama al cargar la app con la sesión ya resuelta. Termina lo que quedó
 * a medias antes de ir a Google o de tocar el enlace del correo.
 */
export function retomarAcceso(anonima: boolean): Promise<Retomado> {
  if (!retomando) {
    retomando = retomar(anonima);
    // Pasado el doble arranque, lo ya retomado no se vuelve a anunciar (al ir
    // de la portada a /mi-web la app se monta otra vez).
    void retomando.then(() => setTimeout(() => (retomando = Promise.resolve({ estado: 'nada' })), 3000));
  }
  return retomando;
}

async function retomar(anonima: boolean): Promise<Retomado> {
  const pendiente = leerPendiente();
  const error = errorDeLaUrl();

  if (error) {
    // Ese Google ya era de otra cuenta: se entra a ella y se trae lo hecho aquí.
    if (error.codigo === 'identity_already_exists' && pendiente?.via === 'google') {
      apuntar({ accion: pendiente.accion, via: 'google', traspaso: pendiente.traspaso });
      const { error: fallo } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: destino() },
      });
      if (!fallo) return { estado: 'redirigiendo' };
      olvidar();
      return { estado: 'error', mensaje: mensajeDeAcceso(fallo) };
    }
    olvidar();
    console.error('[AIB+] Volvió con error del acceso:', error.codigo, error.descripcion);
    return {
      estado: 'error',
      mensaje:
        error.codigo === 'otp_expired'
          ? 'El enlace del correo ya venció. Pide uno nuevo.'
          : mensajeDeAcceso({ code: error.codigo, message: error.descripcion }),
    };
  }

  if (!pendiente || anonima) return { estado: 'nada' };
  await terminarTraspaso();
  return { estado: 'listo', accion: pendiente.accion, via: pendiente.via };
}
