// --- AVISO AL INGENIERO: ENCARGO NUEVO ---
// Por correo (Resend) y por WhatsApp (CallMeBot), según lo que esté configurado.
// El cliente llama aquí justo después de aceptar. El servidor no se fía de lo
// que manda el navegador: le pregunta a la base de datos, con el token del
// propio cliente, si el proyecto es suyo, está aceptado y aún no se había
// avisado (registrar_aviso_encargo, en supabase_encargos.sql). Solo entonces
// envía el correo, así que cada encargo avisa una sola vez.

const { Router } = require('express');
const { config } = require('../config');
const { crearLimitador } = require('../rateLimit');
const { requireAuth } = require('../auth');
const { correoConfigurado, enviarCorreo, escapar } = require('../correo');
const { whatsappConfigurado, enviarWhatsapp } = require('../whatsapp');
const { consultarComo } = require('../supabaseUsuario');

const router = Router();

const limitar = crearLimitador({ maxPorMinuto: 5, nombre: 'avisar-encargo' });
const limitarPrueba = crearLimitador({ maxPorMinuto: 3, nombre: 'probar-whatsapp' });

/**
 * Datos que solo el servidor puede pedir: los protege la misma clave secreta
 * que el resumen diario (CRON_SECRET), no la sesión de quien llama.
 */
function consultarConClave(funcion, cuerpo) {
  return consultarComo(config.supabaseAnonKey, `rpc/${funcion}`, { cuerpo: { p_clave: config.cronSecret, ...cuerpo } });
}

/**
 * Con varios ingenieros, el encargo también avisa a quien lo eligieron (si no
 * es el administrador, que ya recibe el aviso del servidor) por su propio
 * WhatsApp de CallMeBot. Devuelve false si no tiene los avisos activados.
 */
async function avisarAlIngeniero(proyectoId, enlacePanel) {
  const datos = await consultarConClave('aviso_ingeniero_de_encargo', { p_proyecto: proyectoId });
  if (datos?.estado !== 'ok') return false;
  const texto = componerWhatsapp({ empresa: datos.negocio }, enlacePanel).replace(
    '*Nuevo encargo en AIB+*',
    `*${datos.nombre ? `${datos.nombre}, t` : 'T'}e eligieron en AIB+*`
  );
  await enviarWhatsapp(texto, { telefono: datos.whatsapp, apikey: datos.apikey });
  return true;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function registrarAviso(proyectoId, token) {
  const respuesta = await fetch(`${config.supabaseUrl}/rest/v1/rpc/registrar_aviso_encargo`, {
    method: 'POST',
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_proyecto: proyectoId }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!respuesta.ok) {
    throw new Error(`registrar_aviso_encargo: HTTP ${respuesta.status} ${(await respuesta.text()).slice(0, 200)}`);
  }
  return respuesta.json();
}

/** El origen de la app que hizo la petición, si es uno nuestro; si no, el público. */
function origenDeLaApp(req) {
  const origen = req.get('origin');
  if (origen && config.allowedOrigins.includes(origen)) return origen;
  try {
    if (origen && new URL(origen).host === req.get('host')) return origen;
  } catch {
    // Origen malformado: se usa el público.
  }
  return config.appUrl;
}

/** "51987654321" → "+51 987 654 321". */
function formatearWhatsapp(numero) {
  const peruano = String(numero).match(/^51(9\d{2})(\d{3})(\d{3})$/);
  return peruano ? `+51 ${peruano[1]} ${peruano[2]} ${peruano[3]}` : `+${numero}`;
}

function componerCorreo(e, enlacePanel) {
  const titulo = e.empresa || e.servicio || 'Nuevo encargo';
  const whatsappValido = typeof e.whatsapp === 'string' && /^\d{8,15}$/.test(e.whatsapp);
  const alcance = Array.isArray(e.alcance) ? e.alcance : [];

  const filas = [
    ['Proyecto', e.servicio],
    ['Para qué quiere la web', e.objetivo],
    ['Cliente', e.cliente],
    ['WhatsApp', whatsappValido ? formatearWhatsapp(e.whatsapp) : null],
    ['Correo', e.correo],
    ['Presupuesto', e.presupuesto],
    ['Plantilla elegida', e.plantilla],
    ...alcance.map((a) => [a?.pregunta, a?.respuesta]),
  ].filter(([, valor]) => valor);

  const html = `<!doctype html>
<html lang="es"><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#ffffff;border-radius:12px;padding:24px;border:1px solid #e5e7eb">
    <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#2563eb;font-weight:bold">Nuevo encargo en AIB+</p>
    <h1 style="margin:8px 0 20px;font-size:22px">${escapar(titulo)}</h1>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${filas
        .map(
          ([etiqueta, valor]) =>
            `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;width:40%">${escapar(etiqueta)}</td><td style="padding:6px 0;font-weight:bold">${escapar(valor)}</td></tr>`
        )
        .join('')}
    </table>
    <p style="margin:24px 0 0">
      ${whatsappValido ? `<a href="https://wa.me/${e.whatsapp}" style="display:inline-block;background:#25d366;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:bold;margin-right:8px">Escribir por WhatsApp</a>` : ''}
      <a href="${escapar(enlacePanel)}" style="display:inline-block;background:#1f2937;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:bold">Ver en mi panel</a>
    </p>
  </div>
  <p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:16px">Te llega porque eres el ingeniero de AIB+. La documentación técnica estará lista en tu panel en un minuto.</p>
</div>
</body></html>`;

  const texto = [
    `Nuevo encargo en AIB+: ${titulo}`,
    '',
    ...filas.map(([etiqueta, valor]) => `${etiqueta}: ${valor}`),
    '',
    whatsappValido ? `WhatsApp: https://wa.me/${e.whatsapp}` : '',
    `Ver en tu panel: ${enlacePanel}`,
  ]
    .filter((linea, i, todas) => linea !== '' || todas[i - 1] !== '')
    .join('\n');

  return { asunto: `Nuevo encargo: ${titulo}`, html, texto };
}

/**
 * El WhatsApp pasa por un tercero: solo el negocio y el enlace al panel. Sin
 * los datos del cliente, que van en el correo.
 */
function componerWhatsapp(e, enlacePanel) {
  const titulo = String(e.empresa || e.servicio || 'un cliente')
    .replace(/[*_~`]/g, '')
    .slice(0, 80);
  return `🔔 *Nuevo encargo en AIB+*\n${titulo}\n\nMíralo en tu panel: ${enlacePanel}`;
}

router.post('/avisar-encargo', limitar, requireAuth, async (req, res, next) => {
  try {
    const { proyectoId } = req.body ?? {};
    if (typeof proyectoId !== 'string' || !UUID.test(proyectoId)) {
      return res.status(400).json({ success: false, error: 'Falta el proyecto.' });
    }

    // Sin ningún canal configurado no se registra nada: si se configura más
    // tarde, los encargos nuevos avisarán con normalidad. Con la clave del
    // servidor, al menos se puede avisar al ingeniero elegido.
    if (!correoConfigurado() && !whatsappConfigurado() && !config.cronSecret) {
      return res.status(202).json({ success: true, avisado: false });
    }

    const encargo = await registrarAviso(proyectoId, req.tokenUsuario);
    if (!encargo) {
      // Ajeno, sin aceptar o ya avisado: no hay nada que hacer.
      return res.status(202).json({ success: true, avisado: false });
    }

    const panel = `${origenDeLaApp(req)}/dashboard`;
    const envios = [];
    if (correoConfigurado()) envios.push(['correo', enviarCorreo(componerCorreo(encargo, panel))]);
    if (whatsappConfigurado()) envios.push(['whatsapp', enviarWhatsapp(componerWhatsapp(encargo, panel))]);
    if (config.cronSecret) envios.push(['ingeniero', avisarAlIngeniero(proyectoId, panel)]);

    // Cada canal por su lado: si uno falla, el otro sale igual.
    const resultados = await Promise.allSettled(envios.map(([, envio]) => envio));
    const avisado = {};
    resultados.forEach((resultado, i) => {
      const canal = envios[i][0];
      avisado[canal] = resultado.status === 'fulfilled' && resultado.value !== false;
      if (resultado.status === 'rejected') {
        console.error(`[AIB+] No se pudo avisar por ${canal}:`, resultado.reason?.message);
      }
    });
    console.log(`[AIB+] Aviso de encargo ${proyectoId.slice(0, 8)}:`, JSON.stringify(avisado));
    return res.json({ success: true, avisado });
  } catch (error) {
    // El encargo ya está aceptado y guardado: un fallo aquí solo significa que
    // el ingeniero se entera al abrir su panel.
    console.error('[AIB+] No se pudo avisar del encargo:', error.message);
    return next(error);
  }
});

/**
 * El ingeniero comprueba desde su perfil que le llegan los avisos: se le manda
 * un WhatsApp de prueba a su número, con su clave de CallMeBot.
 */
router.post('/avisos/probar-whatsapp', limitarPrueba, requireAuth, async (req, res, next) => {
  try {
    if (!config.cronSecret) {
      return res.status(503).json({ success: false, error: 'Los avisos no están configurados en el servidor.' });
    }
    const datos = await consultarConClave('aviso_de_prueba', { p_usuario: req.usuario.id });
    if (datos?.estado !== 'ok') {
      return res
        .status(409)
        .json({ success: false, error: 'Guarda tu WhatsApp en tu perfil y tu clave de CallMeBot antes de probar.' });
    }
    try {
      await enviarWhatsapp(
        `✅ Hola${datos.nombre ? ` ${datos.nombre}` : ''}, así te llegarán los avisos de AIB+: cuando un cliente te elija y cada mañana, con tu resumen.`,
        { telefono: datos.whatsapp, apikey: datos.apikey }
      );
    } catch (error) {
      console.warn('[AIB+] Prueba de WhatsApp fallida:', error.message);
      return res.status(502).json({
        success: false,
        error: 'CallMeBot no aceptó el envío. Revisa que activaste CallMeBot con este mismo número y que la clave es la que te mandó.',
      });
    }
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
module.exports.componerCorreo = componerCorreo;
module.exports.componerWhatsapp = componerWhatsapp;
