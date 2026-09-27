// ---------------------------------------------------------------------------
// Entrada serverless de Vercel
// ---------------------------------------------------------------------------
// Vercel invoca este handler para todo lo que entre por /api/*. Reutiliza la
// misma app Express que el servidor local; aquí no se llama a listen(): Vercel
// se encarga del transporte.
// ---------------------------------------------------------------------------

const { app } = require('../server/src/app');

module.exports = app;
