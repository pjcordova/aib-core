// --- ABI: EL RESUMEN DE CADA MAÑANA ---
// Lo llama el cron de Vercel a las 8:00 de Lima (vercel.json), con la cabecera
// Authorization: Bearer CRON_SECRET. Pide el resumen a la base de datos
// (resumen_del_dia, protegida con la misma clave) y se lo manda al ingeniero
// por WhatsApp. Si no hay nada pendiente o él lo desactivó en los ajustes de
// ABI, no manda nada. Con ?prueba=1 devuelve el texto sin enviarlo.

const crypto = require('crypto');
const { Router } = require('express');
const { config } = require('../config');
const { whatsappConfigurado, enviarWhatsapp } = require('../whatsapp');

const router = Router();

const REACCIONES = { encanta: '😍', bien: '🙂', no_convence: '😕' };

/** Compara sin filtrar por tiempo cuánto de la clave coincide. */
function claveCorrecta(cabecera) {
  if (!config.cronSecret || typeof cabecera !== 'string') return false;
  const esperada = Buffer.from(`Bearer ${config.cronSecret}`);
  const recibida = Buffer.from(cabecera);
  return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}

function tiempoDesde(iso) {
  const dias = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(dias) || dias < 1) return 'menos de un día';
  return dias === 1 ? '1 día' : `${dias} días`;
}

/** El WhatsApp de la mañana, o null si no hay nada que contar. */
function componerResumen(r) {
  const partes = [];

  if (r.total_esperando > 0) {
    partes.push(
      [
        r.total_esperando === 1 ? 'Un cliente espera tu respuesta:' : `${r.total_esperando} clientes esperan tu respuesta:`,
        ...r.esperando.map((e) => `• ${e.negocio}: ${tiempoDesde(e.desde)}`),
        ...(r.total_esperando > r.esperando.length ? [`  y ${r.total_esperando - r.esperando.length} más`] : []),
      ].join('\n')
    );
  }
  if (r.encargos_nuevos_24h > 0) {
    partes.push(
      r.encargos_nuevos_24h === 1 ? 'Ayer entró un encargo nuevo.' : `Ayer entraron ${r.encargos_nuevos_24h} encargos nuevos.`
    );
  }
  if (r.total_invitaciones_a_medias > 0) {
    partes.push(
      [
        `Invitaciones a medio camino: ${r.total_invitaciones_a_medias}`,
        ...r.invitaciones_a_medias.map((i) => `• ${i.negocio}: ${i.donde}`),
      ].join('\n')
    );
  }
  if (r.comentarios_24h.length > 0) {
    partes.push(
      [
        'Comentarios nuevos:',
        ...r.comentarios_24h.map(
          (c) =>
            `• ${c.negocio ?? 'Un cliente'} ${REACCIONES[c.reaccion] ?? ''}${c.texto ? `: «${c.texto}»` : ''}`.trimEnd()
        ),
      ].join('\n')
    );
  }

  if (partes.length === 0) return null;
  const saludo = `Buenos días${r.nombre ? `, ${r.nombre}` : ''}. Soy ABI ☀️`;
  return [saludo, ...partes, `Tu panel: ${config.appUrl}/dashboard`].join('\n\n');
}

router.get('/abi/resumen-diario', async (req, res, next) => {
  if (!config.cronSecret) {
    return res.status(503).json({ success: false, error: 'Falta CRON_SECRET en el servidor.' });
  }
  if (!claveCorrecta(req.headers.authorization)) {
    return res.status(401).json({ success: false, error: 'No autorizado.' });
  }

  try {
    const respuesta = await fetch(`${config.supabaseUrl}/rest/v1/rpc/resumen_del_dia`, {
      method: 'POST',
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_clave: config.cronSecret }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!respuesta.ok) throw new Error(`Supabase respondió ${respuesta.status}: ${(await respuesta.text()).slice(0, 200)}`);

    const resumen = await respuesta.json();
    if (resumen?.estado !== 'ok') {
      console.error('[AIB+] Resumen diario: la base de datos rechazó la clave. Revisa claves_sistema.');
      return res.status(500).json({ success: false, error: 'La clave del resumen no coincide con la de la base de datos.' });
    }
    if (!resumen.activo) {
      return res.json({ success: true, enviado: false, motivo: 'El ingeniero lo desactivó en los ajustes de ABI.' });
    }

    const texto = componerResumen(resumen);
    if (!texto) return res.json({ success: true, enviado: false, motivo: 'No hay nada pendiente.' });
    if (req.query.prueba === '1') return res.json({ success: true, enviado: false, texto });

    if (!whatsappConfigurado()) {
      return res.status(503).json({ success: false, error: 'Falta configurar el WhatsApp de avisos (CallMeBot).' });
    }
    await enviarWhatsapp(texto);
    console.log('[AIB+] Resumen diario enviado por WhatsApp.');
    return res.json({ success: true, enviado: true });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
