// --- ABI: EL RESUMEN DE CADA MAÑANA ---
// Lo llama el cron de Vercel a las 8:00 de Lima (vercel.json), con la cabecera
// Authorization: Bearer CRON_SECRET. Pide el resumen a la base de datos
// (resumen_del_dia, protegida con la misma clave) y se lo manda al
// administrador por WhatsApp. Después, a cada ingeniero con los avisos
// activados, el suyo (resumenes_ingenieros): solo lo que lleva él. A quien no
// tiene nada pendiente o lo desactivó en los ajustes de ABI no le llega nada.
//
// Después, los recordatorios del día (recordatorios_del_dia, en
// supabase_recordatorios.sql): pedir una reseña, una propuesta que vence
// mañana, el plan que vence. Por CallMeBot pasa lo mínimo (el negocio y el
// motivo, nunca el nombre ni el número del cliente): el mensaje para el
// cliente lo manda el ingeniero con un toque desde «Hoy», en su panel.
//
// Con ?prueba=1 devuelve los textos sin enviarlos (nunca números ni claves).

const crypto = require('crypto');
const { Router } = require('express');
const { config } = require('../config');
const { whatsappConfigurado, enviarWhatsapp } = require('../whatsapp');
const { consultarComo } = require('../supabaseUsuario');

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

/** El resumen de cada ingeniero que no es el administrador, por su WhatsApp. */
async function resumenesDeIngenieros(prueba) {
  const r = await consultarComo(config.supabaseAnonKey, 'rpc/resumenes_ingenieros', {
    cuerpo: { p_clave: config.cronSecret },
  });
  if (r?.estado !== 'ok') {
    console.error('[AIB+] Resúmenes de ingenieros: la base de datos rechazó la clave.');
    return { error: 'La clave no coincide con la de la base de datos.' };
  }

  const salida = { enviados: 0, sin_novedades: 0, fallidos: 0, ...(prueba ? { textos: [] } : {}) };
  for (const ing of r.ingenieros ?? []) {
    const texto = componerResumen(ing);
    if (!texto) {
      salida.sin_novedades += 1;
    } else if (prueba) {
      salida.textos.push({ nombre: ing.nombre, texto });
    } else {
      try {
        await enviarWhatsapp(texto, { telefono: ing.whatsapp, apikey: ing.apikey });
        salida.enviados += 1;
      } catch (error) {
        salida.fallidos += 1;
        console.error(`[AIB+] No se pudo mandar el resumen a ${ing.nombre}:`, error.message);
      }
    }
  }
  return salida;
}

/** El del administrador: lo de toda la plataforma, por el WhatsApp del servidor. */
async function resumenDelAdministrador(prueba) {
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
    return { error: 'La clave del resumen no coincide con la de la base de datos.' };
  }
  if (!resumen.activo) return { enviado: false, motivo: 'El ingeniero lo desactivó en los ajustes de ABI.' };

  const texto = componerResumen(resumen);
  if (!texto) return { enviado: false, motivo: 'No hay nada pendiente.' };
  if (prueba) return { enviado: false, texto };

  if (!whatsappConfigurado()) return { error: 'Falta configurar el WhatsApp de avisos (CallMeBot).' };
  await enviarWhatsapp(texto);
  console.log('[AIB+] Resumen diario enviado por WhatsApp.');
  return { enviado: true };
}

const NOMBRE_PLAN = { pro: 'Pro', negocio: 'Negocio' };

const cuando = (dias) => (dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`);

function fechaLima(iso) {
  return new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', timeZone: 'America/Lima' });
}

/** El WhatsApp de recordatorios de un ingeniero, o null si no hay nada. */
function componerRecordatorios(d) {
  const lineas = [
    ...(d.resenas ?? []).map((r) => `• ${r.negocio} ya lleva 2 días listo: pídele su reseña a tu cliente.`),
    ...(d.propuestas ?? []).map((p) => `• La propuesta de ${p.negocio} vence mañana y tu cliente aún no responde.`),
    ...(d.plan
      ? [
          `• Tu plan ${NOMBRE_PLAN[d.plan.plan] ?? d.plan.plan} vence ${cuando(d.plan.dias)} (${fechaLima(d.plan.vence_en)}). Renuévalo en «Mi plan» para no perder ABI.`,
        ]
      : []),
    ...(d.planes_de_otros?.length
      ? [
          `• Planes por vencer: ${d.planes_de_otros
            .map((p) => `${p.nombre.split(' ')[0]} (${NOMBRE_PLAN[p.plan] ?? p.plan}) ${cuando(p.dias)}`)
            .join('; ')}.`,
        ]
      : []),
  ];
  if (lineas.length === 0) return null;
  const conCliente = (d.resenas?.length ?? 0) + (d.propuestas?.length ?? 0) > 0;
  return [
    `🔔 ${d.nombre ? `${d.nombre}, t` : 'T'}us recordatorios de hoy`,
    lineas.join('\n'),
    conCliente
      ? `Envíale el mensaje a tu cliente con un toque desde «Hoy»: ${config.appUrl}/dashboard`
      : `Tu panel: ${config.appUrl}/dashboard`,
  ].join('\n\n');
}

/** Los recordatorios del día, a cada ingeniero por su WhatsApp y al administrador por el del servidor. */
async function recordatorios(prueba) {
  const r = await consultarComo(config.supabaseAnonKey, 'rpc/recordatorios_del_dia', {
    cuerpo: { p_clave: config.cronSecret },
  });
  if (r?.estado !== 'ok') {
    console.error('[AIB+] Recordatorios: la base de datos rechazó la clave.');
    return { error: 'La clave no coincide con la de la base de datos.' };
  }

  const salida = { enviados: 0, sin_whatsapp: 0, fallidos: 0, ...(prueba ? { textos: [] } : {}) };
  for (const d of r.destinatarios ?? []) {
    const texto = componerRecordatorios(d);
    if (!texto) continue;
    if (prueba) {
      salida.textos.push({ nombre: d.nombre ?? (d.es_admin ? 'Administrador' : 'Ingeniero'), texto });
      continue;
    }
    // El administrador, por el WhatsApp del servidor; los demás, si activaron el suyo.
    const destino = d.es_admin ? null : d.whatsapp && d.apikey ? { telefono: d.whatsapp, apikey: d.apikey } : undefined;
    if (destino === undefined || (destino === null && !whatsappConfigurado())) {
      salida.sin_whatsapp += 1;
      continue;
    }
    try {
      await enviarWhatsapp(texto, destino ?? undefined);
      salida.enviados += 1;
    } catch (error) {
      salida.fallidos += 1;
      console.error(`[AIB+] No se pudieron mandar los recordatorios a ${d.nombre ?? 'un ingeniero'}:`, error.message);
    }
  }
  return salida;
}

router.get('/abi/resumen-diario', async (req, res, next) => {
  if (!config.cronSecret) {
    return res.status(503).json({ success: false, error: 'Falta CRON_SECRET en el servidor.' });
  }
  if (!claveCorrecta(req.headers.authorization)) {
    return res.status(401).json({ success: false, error: 'No autorizado.' });
  }

  try {
    const prueba = req.query.prueba === '1';
    const admin = await resumenDelAdministrador(prueba);
    const ingenieros = await resumenesDeIngenieros(prueba);
    // Un fallo aquí no tumba los resúmenes, que ya salieron.
    const avisos = await recordatorios(prueba).catch((error) => {
      console.error('[AIB+] No se pudieron preparar los recordatorios:', error.message);
      return { error: error.message };
    });
    if (admin.error && ingenieros.error) return res.status(500).json({ success: false, error: admin.error });
    // Lo del administrador, como antes, más lo de los demás ingenieros y los recordatorios.
    return res.json({ success: !admin.error, ...admin, ingenieros, recordatorios: avisos });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
