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
    console.error(
      `\n[AIB+] Falta la variable de entorno ${name}.\n` +
        `       Copia server/.env.example a server/.env y rellénala.\n`
    );
    process.exit(1);
  }
  return value.trim();
}

const config = {
  port: Number(process.env.PORT) || 3001,

  anthropicApiKey: required('ANTHROPIC_API_KEY'),

  // Un único sitio donde cambiar de modelo.
  model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-6',

  // Techos de salida. No son coste: solo se pagan los tokens que se generan.
  maxTokens: {
    discovery: 4000,
    prototype: 32000,
  },

  // En desarrollo permitimos los puertos habituales de Vite. En producción se
  // define ALLOWED_ORIGINS con los dominios reales, separados por comas.
  allowedOrigins: (process.env.ALLOWED_ORIGINS?.trim()
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173']
  ).map((o) => o.trim()),

  isProduction: process.env.NODE_ENV === 'production',
};

module.exports = { config };
