// ---------------------------------------------------------------------------
// WhatsApp al ingeniero (CallMeBot)
// ---------------------------------------------------------------------------
// CallMeBot es un servicio gratuito para mandarse avisos a uno mismo: el
// ingeniero activa su número una vez y recibe una clave. No es la API oficial
// de WhatsApp y el mensaje pasa por un tercero, así que solo lleva lo mínimo
// (el negocio y el enlace al panel); los datos del cliente van por correo.
//
// La clave viaja en la URL porque así funciona su API: por eso esa URL nunca
// se escribe en los logs.
// ---------------------------------------------------------------------------

const { config } = require('./config');

function whatsappConfigurado() {
  const { whatsapp, callmebotApiKey } = config.avisos;
  return Boolean(whatsapp && /^\d{8,15}$/.test(whatsapp) && callmebotApiKey);
}

async function enviarWhatsapp(texto) {
  const parametros = new URLSearchParams({
    phone: `+${config.avisos.whatsapp}`,
    text: texto.slice(0, 1000),
    apikey: config.avisos.callmebotApiKey,
  });

  const respuesta = await fetch(`https://api.callmebot.com/whatsapp.php?${parametros}`, {
    signal: AbortSignal.timeout(15_000),
  });
  const cuerpo = (await respuesta.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // Responde 200 también en algunos errores (clave inválida, número sin
  // activar): se mira el texto.
  if (!respuesta.ok || /error|invalid|not (been )?activated/i.test(cuerpo)) {
    throw new Error(`CallMeBot respondió ${respuesta.status}: ${cuerpo.slice(0, 160)}`);
  }
}

module.exports = { whatsappConfigurado, enviarWhatsapp };
