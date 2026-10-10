// --- PREGUNTAS SUGERIDAS PARA EL FORMULARIO DE UN SERVICIO ---
// El ingeniero arma las preguntas que su cliente responde al pedir un servicio
// (supabase_formularios_servicio.sql). Para no empezar de cero, AIB+ le
// propone unas cuantas según el servicio; él las ajusta antes de guardarlas.
// Aquí solo se sugieren: guardar lo hace la base de datos, que las valida.

const { Router } = require('express');
const { config } = require('../config');
const { generateText } = require('../claude');
const { crearLimitador } = require('../rateLimit');
const { requireAuth } = require('../auth');
const { cobrarCuota } = require('../cuota');
const { consultarComo } = require('../supabaseUsuario');

const router = Router();

const limitar = crearLimitador({ maxPorMinuto: 6, nombre: 'sugerir-preguntas' });

const TIPOS = ['texto', 'opcion', 'multiple'];

const ESQUEMA = {
  type: 'object',
  properties: {
    preguntas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          tipo: { type: 'string', enum: TIPOS },
          opciones: { type: 'array', items: { type: 'string' } },
        },
        required: ['titulo', 'tipo', 'opciones'],
        additionalProperties: false,
      },
    },
  },
  required: ['preguntas'],
  additionalProperties: false,
};

async function soloIngeniero(req, res, next) {
  try {
    const es = await consultarComo(req.tokenUsuario, 'rpc/es_ingeniero', { cuerpo: {} });
    if (es === true) return next();
    return res.status(403).json({ success: false, error: 'Solo los ingenieros arman formularios.' });
  } catch (error) {
    console.error('[AIB+] No se pudo comprobar el rol para sugerir preguntas:', error.message);
    return res.status(503).json({ success: false, error: 'No pudimos comprobar tu cuenta. Inténtalo de nuevo.' });
  }
}

const texto = (v, max) => (typeof v === 'string' ? v.replace(/[<>{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Lo que devuelve la IA, recortado a lo que admite la base de datos. */
function limpiar(preguntas, maximo) {
  return (Array.isArray(preguntas) ? preguntas : [])
    .map((p) => {
      const titulo = texto(p?.titulo, 140);
      const tipo = TIPOS.includes(p?.tipo) ? p.tipo : 'texto';
      const opciones = [...new Set((Array.isArray(p?.opciones) ? p.opciones : []).map((o) => texto(o, 60)).filter(Boolean))].slice(0, 8);
      if (titulo.length < 3) return null;
      if (tipo === 'texto' || opciones.length < 2) return { titulo, tipo: 'texto' };
      return { titulo, tipo, opciones };
    })
    .filter(Boolean)
    .slice(0, maximo);
}

router.post('/formularios/sugerir', limitar, requireAuth, soloIngeniero, cobrarCuota('preguntas'), async (req, res, next) => {
  try {
    const servicio = texto(req.body?.servicio, 60);
    if (servicio.length < 2) {
      return res.status(400).json({ success: false, error: 'Falta el servicio.' });
    }
    const maximo = req.body?.maximo === 8 ? 8 : 5;
    // Las que ya hace AIB+ (o que ya escribió el ingeniero): no se repiten.
    const yaHechas = (Array.isArray(req.body?.yaHechas) ? req.body.yaHechas : [])
      .map((t) => texto(t, 140))
      .filter(Boolean)
      .slice(0, 20);

    const { text } = await generateText({
      label: 'sugerir-preguntas',
      prompt: `Eres AIB+, una plataforma peruana que conecta a dueños de pequeños negocios con ingenieros de software.

Un ingeniero ofrece este servicio: «${servicio}». Propón ${maximo} preguntas para el formulario que llena su cliente antes de recibir una propuesta. Deben ser las que más le ayudan al ingeniero a entender el alcance y a cotizar.

Reglas:
- Español sencillo, de tú, sin tecnicismos: el cliente es dueño de un negocio, no informático.
- Preguntas cortas (máximo 120 caracteres). La mayoría de un clic: "opcion" (elige una) o "multiple" (marca varias), con 3 a 6 opciones breves. Como mucho una "texto" (respuesta escrita), con opciones vacías.
- No preguntes el nombre del negocio, a qué se dedica, el logo, los colores, el presupuesto ni el plazo: eso ya se pregunta aparte.${
        yaHechas.length ? `\n- Tampoco repitas estas, que ya están en el formulario:\n${yaHechas.map((t) => `  · ${t}`).join('\n')}` : ''
      }`,
      maxTokens: config.maxTokens.sugerencias,
      temperature: 0.5,
      schema: ESQUEMA,
    });

    let crudo;
    try {
      crudo = JSON.parse(text);
    } catch {
      console.error('[AIB+] JSON inválido pese al esquema (sugerir-preguntas):', text.slice(0, 300));
      return res.status(502).json({ success: false, error: 'No pudimos sugerir preguntas. Vuelve a intentarlo.' });
    }

    return res.json({ success: true, preguntas: limpiar(crudo?.preguntas, maximo) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
