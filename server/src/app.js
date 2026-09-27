// ---------------------------------------------------------------------------
// AIB+ — Aplicación Express
// ---------------------------------------------------------------------------
// Monta middlewares, rutas y manejo de errores, y exporta la app sin ponerla a
// escuchar. Así el mismo código sirve para el servidor local (index.js) y para
// la función serverless de Vercel (api/index.js).
// ---------------------------------------------------------------------------

const express = require('express');
const cors = require('cors');

const { config } = require('./config');
const { TruncatedError } = require('./claude');
const discoveryRoutes = require('./routes/discovery');
const prototypeRoutes = require('./routes/prototype');
const documentationRoutes = require('./routes/documentation');

const app = express();

// Detrás del proxy de Vercel, req.ip sería la IP del proxy para todo el mundo y
// el limitador trataría a todos los usuarios como uno solo. Con esto Express lee
// la IP real de X-Forwarded-For.
app.set('trust proxy', 1);

// CORS. El navegador manda `Origin` también en las peticiones POST al mismo
// dominio, así que una lista blanca que solo contenga localhost rechaza el
// propio sitio en producción. Aceptamos siempre el mismo origen —donde la web y
// la API se sirven juntas, como en Vercel— además de lo que se configure.
app.use(
  cors((req, callback) => {
    const origin = req.headers.origin;

    // Sin cabecera Origin (curl, health checks) se deja pasar.
    if (!origin) return callback(null, { origin: true });

    let mismoOrigen = false;
    try {
      mismoOrigen = new URL(origin).host === req.headers.host;
    } catch {
      mismoOrigen = false;
    }

    const permitido = mismoOrigen || config.allowedOrigins.includes(origin);

    if (!permitido) {
      console.warn(`[AIB+] Origen rechazado: ${origin}`);
    }

    // Se responde sin cabeceras CORS en vez de lanzar: un origen no permitido
    // es una petición rechazada, no un fallo del servidor.
    return callback(null, { origin: permitido });
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
app.use('/api', documentationRoutes);

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

  // Errores de cliente que traen su propio código (por ejemplo, un JSON mal
  // formado que body-parser rechaza con 400). Devolverlos como 500 confundía
  // el diagnóstico: parecía un fallo del servidor y era una petición inválida.
  const codigoCliente = error?.status ?? error?.statusCode;
  if (Number.isInteger(codigoCliente) && codigoCliente >= 400 && codigoCliente < 500) {
    return res.status(codigoCliente).json({
      success: false,
      error: 'La petición no es válida.',
    });
  }

  console.error('[AIB+] Error no controlado:', error);
  return res.status(500).json({
    success: false,
    error: config.isProduction ? 'Error interno del servidor.' : error.message,
  });
});

module.exports = { app };
