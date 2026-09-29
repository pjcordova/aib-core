// ---------------------------------------------------------------------------
// Correo saliente (Resend)
// ---------------------------------------------------------------------------
// Solo se usa para avisar al ingeniero. Todo lo que se inserta en el correo
// viene del cliente, así que se escapa: un nombre de negocio no puede colar
// HTML en la bandeja del ingeniero.
// ---------------------------------------------------------------------------

const { config } = require('./config');

const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapar = (valor) => String(valor ?? '').replace(/[&<>"']/g, (c) => ENTIDADES[c]);

/** Una línea de asunto: sin saltos de línea y con un largo razonable. */
const unaLinea = (valor, max = 120) => String(valor ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

function correoConfigurado() {
  return Boolean(config.avisos.resendApiKey && config.avisos.para);
}

async function enviarCorreo({ asunto, html, texto }) {
  const respuesta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.avisos.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.avisos.remitente,
      to: [config.avisos.para],
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

module.exports = { correoConfigurado, enviarCorreo, escapar, unaLinea };
