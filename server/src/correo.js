// ---------------------------------------------------------------------------
// Correo saliente (Resend)
// ---------------------------------------------------------------------------
// Avisa al ingeniero de un encargo nuevo y al cliente de cómo avanza el suyo
// (avisosCliente.js). Lo que se inserta en el correo viene de los usuarios,
// así que se escapa: un nombre de negocio no puede colar HTML en una bandeja.
// ---------------------------------------------------------------------------

const { config } = require('./config');

const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapar = (valor) => String(valor ?? '').replace(/[&<>"']/g, (c) => ENTIDADES[c]);

/** Una línea de asunto: sin saltos de línea y con un largo razonable. */
const unaLinea = (valor, max = 120) => String(valor ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

/** Si se puede avisar al administrador por correo. */
function correoConfigurado() {
  return Boolean(config.avisos.resendApiKey && config.avisos.para);
}

/** Si hay con qué enviar correos (la clave de Resend). */
function resendConfigurado() {
  return Boolean(config.avisos.resendApiKey);
}

/** @param {{ para?: string, asunto: string, html: string, texto: string }} correo Sin `para`, va al administrador. */
async function enviarCorreo({ para = config.avisos.para, asunto, html, texto }) {
  const respuesta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.avisos.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.avisos.remitente,
      to: [para],
      subject: unaLinea(asunto),
      html,
      text: texto,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!respuesta.ok) {
    throw new Error(`Resend respondió ${respuesta.status}: ${(await respuesta.text()).slice(0, 200)}`);
  }
}

module.exports = { correoConfigurado, resendConfigurado, enviarCorreo, escapar, unaLinea };
