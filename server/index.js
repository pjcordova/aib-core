// ---------------------------------------------------------------------------
// AIB+ — Servidor orquestador
// ---------------------------------------------------------------------------
// Solo ensambla: configuración, middlewares, rutas y manejo de errores. La
// lógica vive en src/.
// ---------------------------------------------------------------------------

const express = require('express');
const cors = require('cors');

const { config } = require('./src/config');
const { TruncatedError } = require('./src/claude');
const discoveryRoutes = require('./src/routes/discovery');
const prototypeRoutes = require('./src/routes/prototype');

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      // Sin cabecera Origin (curl, health checks) se deja pasar.
      if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origen no permitido: ${origin}`));
    },
  })
);

app.use(express.json({ limit: '1mb' }));

// Traza mínima de cada petición: método, ruta, estado y duración.
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    console.log(`[AIB+] ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - startedAt}ms)`);
  });
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', model: config.model, uptime: Math.round(process.uptime()) });
});

app.use('/api', discoveryRoutes);
app.use('/api', prototypeRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

// Manejador central. Traduce errores de dominio a respuestas con sentido para
// el usuario y deja los inesperados como 500 sin filtrar internals en producción.
app.use((error, _req, res, _next) => {
  if (error instanceof TruncatedError) {
    console.error('[AIB+] Generación truncada:', error.message);
    return res.status(502).json({
      success: false,
      error: 'La IA se quedó sin espacio antes de terminar. Reduce el alcance o sube el límite de tokens.',
    });
  }

  if (error?.status === 401) {
    console.error('[AIB+] API key rechazada por Anthropic.');
    return res.status(500).json({ success: false, error: 'Credenciales de IA inválidas.' });
  }

  if (error?.status === 429) {
    return res.status(429).json({
      success: false,
      error: 'Límite de peticiones alcanzado. Espera unos segundos y reintenta.',
    });
  }

  console.error('[AIB+] Error no controlado:', error);
  return res.status(500).json({
    success: false,
    error: config.isProduction ? 'Error interno del servidor.' : error.message,
  });
});

const server = app.listen(config.port, () => {
  console.log(`[AIB+] Servidor orquestador en http://localhost:${config.port}`);
  console.log(`[AIB+] Modelo: ${config.model}`);
  console.log(`[AIB+] Orígenes permitidos: ${config.allowedOrigins.join(', ')}`);
});

// Cierre ordenado: deja terminar las peticiones en vuelo (una generación de
// prototipo puede tardar un minuto) en vez de cortarlas en seco.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n[AIB+] ${signal} recibido, cerrando...`);
    server.close(() => process.exit(0));
  });
}
