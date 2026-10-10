// ---------------------------------------------------------------------------
// Configuración — se valida al arrancar, no en cada petición.
// ---------------------------------------------------------------------------
// Antes una API key ausente no se notaba hasta que un usuario pedía preguntas
// y recibía un 500 opaco. Ahora el proceso no llega a escuchar.
// ---------------------------------------------------------------------------

require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    const mensaje =
      `Falta la variable de entorno ${name}. ` +
      'En local: copia server/.env.example a server/.env y rellénala. ' +
      'En Vercel: defínela en Settings > Environment Variables.';

    // En serverless matar el proceso deja un error genérico sin causa visible.
    // Lanzamos para que el motivo aparezca en los logs de la función.
    if (process.env.VERCEL) throw new Error(`[AIB+] ${mensaje}`);

    console.error(`
[AIB+] ${mensaje}
`);
    process.exit(1);
  }
  return value.trim();
}

/** Quita las barras finales para componer rutas sin duplicarlas. */
function sinBarraFinal(url) {
  let limpia = url;
  while (limpia.endsWith('/')) limpia = limpia.slice(0, -1);
  return limpia;
}

const config = {
  port: Number(process.env.PORT) || 3001,

  anthropicApiKey: required('ANTHROPIC_API_KEY'),

  // Necesarias para validar la sesión de quien llama a la API. La clave anónima
  // es pública por diseño; lo que autoriza es el token del usuario.
  // Sin barra final, para componer rutas sin duplicarla.
  supabaseUrl: sinBarraFinal(required('SUPABASE_URL')),
  supabaseAnonKey: required('SUPABASE_ANON_KEY'),

  // Un único sitio donde cambiar de modelo.
  model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-6',

  // Techos de salida. No son coste: solo se pagan los tokens que se generan.
  maxTokens: {
    discovery: 4000,
    // Una maqueta de una pantalla cabe de sobra en 12k. El techo mas bajo
    // acota el coste y el tiempo de espera si el modelo se alarga.
    prototype: 12000,
    documentation: 8000,
    web: 7000,
    // Solo textos en JSON: ronda los 1.000 tokens. El techo deja margen.
    plantilla: 4000,
    // Unas pocas preguntas en JSON para el formulario de un ingeniero.
    sugerencias: 2000,
  },

  // ABI, el asistente del ingeniero (src/abi.js). Lleva su propio modelo: es
  // una conversación con herramientas, no una generación de un solo paso.
  abi: {
    model: process.env.ABI_MODEL?.trim() || 'claude-opus-5-5',
    // Cuánto piensa antes de responder: low | medium | high.
    effort: process.env.ABI_EFFORT?.trim() || 'medium',
    maxTokens: 16000,
    // Consultas seguidas que puede hacer para una sola pregunta.
    maxVueltas: 6,
  },

  // En desarrollo permitimos los puertos habituales de Vite. En producción se
  // define ALLOWED_ORIGINS con los dominios reales, separados por comas.
  allowedOrigins: (process.env.ALLOWED_ORIGINS?.trim()
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        // En Windows, Vite escucha en la dirección IPv6 de localhost.
        'http://[::1]:3000',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
      ]
  ).map((o) => o.trim()),

  isProduction: process.env.NODE_ENV === 'production',

  // Aviso por correo al ingeniero cuando entra un encargo (Resend). Opcional:
  // sin estas dos variables no se envía nada y el resto funciona igual.
  // Sin dominio propio verificado en Resend, AVISOS_CORREO tiene que ser el
  // correo de la cuenta de Resend.
  avisos: {
    resendApiKey: process.env.RESEND_API_KEY?.trim() || null,
    para: process.env.AVISOS_CORREO?.trim() || null,
    remitente: process.env.AVISOS_REMITENTE?.trim() || 'AIB+ <onboarding@resend.dev>',

    // WhatsApp al ingeniero con CallMeBot (gratis, solo para avisarse a uno
    // mismo). Número con código de país y sin símbolos: 51987654321.
    whatsapp: (process.env.AVISOS_WHATSAPP ?? '').replace(/\D/g, '') || null,
    callmebotApiKey: process.env.CALLMEBOT_APIKEY?.trim() || null,
  },

  // Dirección pública de la app, para el enlace del correo cuando la petición
  // no trae un origen reconocible.
  appUrl: sinBarraFinal(process.env.APP_URL?.trim() || 'https://aib-core.vercel.app'),

  // Clave con la que el cron de Vercel llama al resumen de cada mañana de ABI
  // (Vercel la manda sola si existe CRON_SECRET). Su huella está en la tabla
  // claves_sistema. Sin ella, el resumen no se envía.
  cronSecret: process.env.CRON_SECRET?.trim() || null,
};

module.exports = { config };
