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
  },

  // En desarrollo permitimos los puertos habituales de Vite. En producción se
  // define ALLOWED_ORIGINS con los dominios reales, separados por comas.
  allowedOrigins: (process.env.ALLOWED_ORIGINS?.trim()
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
      ]
  ).map((o) => o.trim()),

  isProduction: process.env.NODE_ENV === 'production',
};

module.exports = { config };
