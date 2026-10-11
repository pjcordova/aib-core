// ---------------------------------------------------------------------------
// Avisos por correo al cliente cuando avanza su encargo
// ---------------------------------------------------------------------------
// Cada etapa nueva de un encargo deja un aviso pendiente en la base de datos
// (supabase_avisos_cliente.sql). Aquí se recogen con la clave del servidor y
// se envían por Resend. Solo llegan a clientes con cuenta (guardaron su
// proyecto con Google o con su correo); la base de datos ya filtra eso, junta
// las novedades de un mismo encargo y marca cada aviso para no repetirlo.
//
// Se llama tras cada cambio (el navegador avisa con /api/avisos/clientes) y,
// por si alguno se quedó, en el resumen diario de las 8:00.
// ---------------------------------------------------------------------------

const { config } = require('./config');
const { resendConfigurado, enviarCorreo, escapar, unaLinea } = require('./correo');
const { consultarComo } = require('./supabaseUsuario');

const consultarConClave = (funcion, cuerpo = {}) =>
  consultarComo(config.supabaseAnonKey, `rpc/${funcion}`, { cuerpo: { p_clave: config.cronSecret, ...cuerpo } });

const soles = (n) => `S/ ${Number(n).toLocaleString('es-PE')}`;

/**
 * El correo de una etapa. `a`: lo que devuelve avisos_cliente_pendientes
 * (estado, nota, negocio, ingeniero, tipo_servicio y, si hay, propuesta).
 */
function componerAvisoCliente(a, appUrl = config.appUrl) {
  const ingeniero = a.ingeniero || 'Tu ingeniero';
  const esWeb = (a.tipo_servicio || 'web') === 'web';
  const queEs = esWeb ? 'tu web' : 'tu proyecto';
  const proyecto = `${appUrl}/mi-web`;

  const porEtapa = {
    recibido: {
      asunto: `${ingeniero} ya tiene tu encargo`,
      titulo: 'Tu encargo llegó a tu ingeniero',
      texto: `${ingeniero} ya tiene ${queEs} con todo lo que nos contaste y te escribirá por WhatsApp.`,
    },
    en_revision: {
      asunto: `${ingeniero} está revisando ${queEs}`,
      titulo: 'Tu proyecto está en revisión',
      texto: `${ingeniero} está estudiando lo que necesitas para prepararte una propuesta.`,
    },
    propuesta_enviada: {
      asunto: 'Tu propuesta está lista',
      titulo: 'Tienes una propuesta',
      texto: a.propuesta
        ? `${ingeniero} te envió su propuesta: ${soles(a.propuesta.precio)}, en ${a.propuesta.plazo_dias} días. Revísala y acéptala o pide cambios.`
        : `${ingeniero} te envió una propuesta con precio y plazo.`,
      boton: a.propuesta?.token ? { texto: 'Ver la propuesta', url: `${appUrl}/propuesta/${a.propuesta.token}` } : null,
    },
    en_desarrollo: {
      asunto: `${esWeb ? 'Tu web' : 'Tu proyecto'} ya está en desarrollo`,
      titulo: '¡Manos a la obra!',
      texto: `${ingeniero} empezó a construir ${queEs}. Te avisaremos cuando esté ${esWeb ? 'publicada' : 'listo'}.`,
    },
    publicada: {
      asunto: esWeb ? '¡Tu web está publicada!' : '¡Tu proyecto está listo!',
      titulo: esWeb ? '¡Tu web ya está en línea!' : '¡Tu proyecto está listo!',
      texto: `${ingeniero} terminó ${queEs}. Gracias por confiar en AIB+.`,
    },
    // Propuesta por etapas: la nota es el nombre de la etapa entregada.
    entrega: {
      asunto: 'Tienes una entrega para revisar',
      titulo: 'Tienes una entrega para revisar',
      texto: `${ingeniero} terminó la etapa «${String(a.nota || '').trim().slice(0, 60) || 'siguiente'}» de ${queEs}. Revísala y apruébala, o pide ajustes.`,
      boton: a.propuesta?.token ? { texto: 'Revisar la entrega', url: `${appUrl}/propuesta/${a.propuesta.token}` } : null,
      sinNota: true,
    },
  };

  const e = porEtapa[a.estado] ?? {
    asunto: `Novedades de ${queEs}`,
    titulo: 'Tu proyecto avanzó',
    texto: `${ingeniero} actualizó tu encargo.`,
  };
  const boton = e.boton ?? { texto: 'Ver mi proyecto', url: proyecto };
  const nota = e.sinNota ? '' : String(a.nota || '').trim().slice(0, 280);
  const negocio = String(a.negocio || '').trim().slice(0, 80);

  const html = `<div lang="es" style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1f2937">
  <p style="font-size:12px;letter-spacing:2px;color:#a8874f;text-transform:uppercase;margin:0 0 8px">AIB+${negocio ? ` · ${escapar(negocio)}` : ''}</p>
  <h2 style="color:#1a2d4d;margin:0 0 12px">${escapar(e.titulo)}</h2>
  <p style="font-size:15px;line-height:1.5">${escapar(e.texto)}</p>
  ${nota ? `<p style="margin:16px 0;padding:12px 16px;background:#f5efe4;border-left:3px solid #c4a26a;font-size:14px">${escapar(ingeniero)} te dejó una nota: «${escapar(nota)}»</p>` : ''}
  <p style="margin:24px 0"><a href="${escapar(boton.url)}" style="background:#1a2d4d;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold;display:inline-block">${escapar(boton.texto)}</a></p>
  <p style="font-size:12px;color:#6b7280">Te escribimos porque tienes un encargo en AIB+. Si tienes dudas, responde a este correo.</p>
</div>`;

  const texto = [
    e.titulo,
    '',
    e.texto,
    nota ? `\n${ingeniero} te dejó una nota: «${nota}»` : '',
    '',
    `${boton.texto}: ${boton.url}`,
    '',
    'Te escribimos porque tienes un encargo en AIB+. Si tienes dudas, responde a este correo.',
  ].join('\n');

  return { asunto: unaLinea(negocio ? `${e.asunto} · ${negocio}` : e.asunto), html, texto };
}

/**
 * Envía los avisos pendientes. Nunca lanza: si algo falla queda en los logs
 * (y el aviso, marcado como fallido). Devuelve cuántos se enviaron.
 */
async function enviarAvisosCliente() {
  if (!resendConfigurado() || !config.cronSecret) return 0;

  let pendientes;
  try {
    pendientes = await consultarConClave('avisos_cliente_pendientes');
  } catch (error) {
    console.error('[AIB+] No se pudieron leer los avisos al cliente:', error.message);
    return 0;
  }
  if (!Array.isArray(pendientes)) return 0;

  let enviados = 0;
  for (const aviso of pendientes) {
    try {
      await enviarCorreo({ para: aviso.correo, ...componerAvisoCliente(aviso) });
      enviados += 1;
    } catch (error) {
      console.error(`[AIB+] No se pudo enviar el aviso ${aviso.id} al cliente:`, error.message);
      await consultarConClave('aviso_cliente_fallido', { p_id: aviso.id }).catch(() => {});
    }
  }
  if (enviados) console.log(`[AIB+] Avisos al cliente enviados: ${enviados}`);
  return enviados;
}

module.exports = { componerAvisoCliente, enviarAvisosCliente };
