// ---------------------------------------------------------------------------
// Captcha (Cloudflare Turnstile)
// ---------------------------------------------------------------------------
// Con la protección activa en Supabase (Auth → Bot and Abuse Protection), abrir
// una prueba sin cuenta, entrar con contraseña o con un código, registrarse y
// reenviar códigos piden un captcha. Así un programa no puede abrir pruebas ni
// pedir códigos sin parar. Entrar con Google no lo necesita.
//
// Turnstile casi nunca muestra nada: comprueba en segundo plano que es una
// persona y, solo si algo le parece raro, pide marcar una casilla (aparece en
// una ventanita). Cada token sirve una vez: se pide uno por llamada.
//
// Sin clave de sitio, o si Turnstile no carga, se sigue sin token: mientras la
// protección no esté activa en Supabase, todo funciona igual que antes.
// ---------------------------------------------------------------------------

/** La clave de sitio de Turnstile. Es pública: viaja en la página. */
const CLAVE_SITIO: string = import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAFUQADBRTY_P1X55';

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Si nunca pide la casilla, no se espera más que esto. */
const ESPERA_MS = 25_000;

interface Turnstile {
  render(contenedor: HTMLElement, opciones: Record<string, unknown>): string | null | undefined;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let cargando: Promise<Turnstile | null> | null = null;

function cargarTurnstile(): Promise<Turnstile | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  cargando ??= new Promise((resolver) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.onload = () => resolver(window.turnstile ?? null);
    script.onerror = () => {
      // Se podrá volver a intentar en la próxima acción.
      cargando = null;
      script.remove();
      resolver(null);
    };
    document.head.appendChild(script);
  });
  return cargando;
}

/** Un token de un solo uso, o undefined si no hay captcha (o no se pudo obtener). */
export async function obtenerCaptcha(): Promise<string | undefined> {
  if (!CLAVE_SITIO) return undefined;
  const turnstile = await cargarTurnstile();
  if (!turnstile) return undefined;

  return new Promise((resolver) => {
    // La ventanita existe desde el principio (Turnstile necesita su lugar en la
    // página), pero solo se ve si pide la casilla.
    const capa = document.createElement('div');
    capa.className = 'fixed inset-0 z-[100] grid place-items-center bg-accent-strong/40 p-4';
    capa.style.visibility = 'hidden';
    capa.setAttribute('role', 'dialog');
    capa.setAttribute('aria-modal', 'true');
    capa.setAttribute('aria-label', 'Confirma que eres una persona');

    const tarjeta = document.createElement('div');
    tarjeta.className = 'card w-full max-w-sm p-5 text-center';
    const titulo = document.createElement('p');
    titulo.className = 'font-semibold text-ink';
    titulo.textContent = 'Un momento';
    const texto = document.createElement('p');
    texto.className = 'mt-1 text-sm text-ink-muted';
    texto.textContent = 'Confirma que eres una persona para seguir.';
    const caja = document.createElement('div');
    caja.className = 'mt-4 flex min-h-[65px] justify-center';
    const cancelar = document.createElement('button');
    cancelar.type = 'button';
    cancelar.className = 'btn btn-ghost mt-3 text-sm';
    cancelar.textContent = 'Cancelar';
    tarjeta.append(titulo, texto, caja, cancelar);
    capa.append(tarjeta);
    document.body.append(capa);

    let terminado = false;
    let id: string | null | undefined;
    const terminar = (token?: string) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj);
      try {
        if (id) turnstile.remove(id);
      } catch {
        // Ya no estaba: no importa.
      }
      capa.remove();
      resolver(token);
    };
    const reloj = setTimeout(() => terminar(undefined), ESPERA_MS);
    cancelar.onclick = () => terminar(undefined);

    try {
      id = turnstile.render(caja, {
        sitekey: CLAVE_SITIO,
        appearance: 'interaction-only',
        language: 'es',
        theme: 'light',
        callback: (token: string) => terminar(token),
        'error-callback': () => {
          terminar(undefined);
          return true;
        },
        'expired-callback': () => terminar(undefined),
        'timeout-callback': () => terminar(undefined),
        // Pide la casilla: se muestra la ventanita y se espera a la persona.
        'before-interactive-callback': () => {
          clearTimeout(reloj);
          capa.style.visibility = 'visible';
        },
      });
    } catch (error) {
      console.warn('[AIB+] No se pudo mostrar el captcha:', error);
      terminar(undefined);
    }
  });
}

/** Para las opciones de Supabase Auth: { captchaToken } si hay token. */
export async function conCaptcha(): Promise<{ captchaToken?: string }> {
  const captchaToken = await obtenerCaptcha();
  return captchaToken ? { captchaToken } : {};
}

/** Supabase rechazó la acción por el captcha (falta, venció o no pasó). */
export const esErrorDeCaptcha = (error: { code?: string; message?: string } | null | undefined) =>
  error?.code === 'captcha_failed' || /captcha/i.test(error?.message ?? '');

export const MENSAJE_CAPTCHA = 'No pudimos comprobar que eres una persona. Vuelve a intentarlo.';
