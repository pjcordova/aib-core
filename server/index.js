// ---------------------------------------------------------------------------
// AIB+ — Servidor local
// ---------------------------------------------------------------------------
// Pone a escuchar la app de src/app.js. En Vercel este archivo no se usa: allí
// la app se monta como función serverless desde api/index.js.
// ---------------------------------------------------------------------------

const { app } = require('./src/app');
const { config } = require('./src/config');

const server = app.listen(config.port, () => {
  console.log(`[AIB+] Servidor orquestador en http://localhost:${config.port}`);
  console.log(`[AIB+] Modelo: ${config.model}`);
  console.log(`[AIB+] Orígenes permitidos: ${config.allowedOrigins.join(', ')}`);
});

// Cierre ordenado: deja terminar las peticiones en vuelo (una generación de
// prototipo puede tardar más de dos minutos) en vez de cortarlas en seco.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n[AIB+] ${signal} recibido, cerrando...`);
    server.close(() => process.exit(0));
  });
}
