// ---------------------------------------------------------------------------
// Plantilla "Consultora profesional" — lado servidor
// ---------------------------------------------------------------------------
// El HTML vive en el frontend (Proyecto_AIB/src/plantillas/consultora). Aquí
// está lo que el servidor necesita para pedirle los textos a la IA: la forma
// exacta de la respuesta, el prompt y la normalización.
//
// La forma debe coincidir con TextosConsultora del frontend.
// ---------------------------------------------------------------------------

const {
  texto,
  objeto,
  limitar,
  exactamente,
  testimoniosNormalizados,
  preguntasNormalizadas,
  lineasObjetivo,
} = require('./comun');

const servicio = objeto({
  titulo: texto('Nombre del servicio, 2 a 5 palabras'),
  descripcion: texto('Qué es y qué logra, máximo 28 palabras'),
  para_quien: texto('Para quién es, empieza por "Para", máximo 16 palabras'),
  incluye: { type: 'array', items: texto('Qué incluye, máximo 6 palabras'), description: 'Exactamente 3' },
});

/**
 * JSON Schema para structured outputs. Solo tipos y `required`: las
 * longitudes y cantidades se piden en las descripciones y se imponen después
 * en `normalizar`, que no depende de lo que el modelo haya respetado.
 */
const propiedadesBase = {
  hero: objeto({
    etiqueta: texto('Qué hacen, 3 a 6 palabras'),
    titulo: texto('Primera parte del titular, máximo 6 palabras'),
    titulo_acento: texto('Final del titular, que se destaca en cursiva, máximo 5 palabras'),
    subtitulo: texto('Frase de apoyo, máximo 22 palabras'),
    cta_principal: texto('Botón principal, 2 a 4 palabras, invita a contactar'),
    cta_secundario: texto('Botón secundario, 2 a 3 palabras, lleva a los servicios'),
  }),
  propuesta: objeto({
    etiqueta: texto('1 a 3 palabras, como "Cómo trabajamos"'),
    titulo: texto('Máximo 7 palabras'),
    bajada: texto('Máximo 20 palabras'),
    cita: texto('Frase que resume su forma de trabajar, máximo 18 palabras'),
    parrafos: { type: 'array', items: texto('Máximo 35 palabras'), description: 'Exactamente 2' },
    pregunta: texto('Pregunta al visitante, máximo 8 palabras'),
    cta: texto('Botón, 1 a 2 palabras'),
  }),
  servicios_intro: objeto({
    etiqueta: texto('1 a 2 palabras'),
    titulo: texto('Máximo 7 palabras'),
    bajada: texto('Máximo 18 palabras'),
  }),
  servicios: { type: 'array', items: servicio, description: 'Exactamente 3 servicios que ofrece este negocio' },
  cierre: objeto({
    titulo: texto('Pregunta o invitación final, máximo 8 palabras'),
    bajada: texto('Máximo 22 palabras'),
    cta: texto('Botón, 2 a 4 palabras'),
  }),
  ciudad: texto('Ciudad y país si el negocio lo dijo; si no, "Lima, Perú"'),
  pie_descripcion: texto('Descripción del negocio para el pie de página, máximo 18 palabras'),
};

/** Bloques que solo aparecen si el cliente pidió esa sección. */
const BLOQUES_OPCIONALES = {
  nosotros: objeto({
    titulo: texto('Título, máximo 7 palabras'),
    texto: texto('Quiénes son, con lo que contó el negocio; máximo 50 palabras, sin inventar años, cifras, títulos ni certificaciones'),
    cita: texto('Frase breve que los define, máximo 10 palabras'),
  }),
  testimonios: {
    type: 'array',
    items: objeto({
      texto: texto('Opinión de ejemplo, máximo 25 palabras'),
      autor: texto('Tipo de cliente, como "Gerenta de una pyme"; nunca un nombre de persona'),
    }),
    description: 'Exactamente 3',
  },
  preguntas: {
    type: 'array',
    items: objeto({
      pregunta: texto('Duda típica de quien contrata este servicio, máximo 12 palabras'),
      respuesta: texto('Respuesta de máximo 30 palabras; si no se conoce el dato, invitar a consultarlo en vez de prometer'),
    }),
    description: 'Exactamente 4',
  },
};

/** Esquema con los bloques fijos más los opcionales que pidió el cliente. */
function esquema(secciones = []) {
  const extra = Object.entries(BLOQUES_OPCIONALES).filter(([seccion]) => secciones.includes(seccion));
  return objeto({ ...propiedadesBase, ...Object.fromEntries(extra) });
}

const INSTRUCCIONES_BLOQUE = {
  nosotros: '- nosotros: quiénes son, con lo que contó el negocio. Sin inventar años, cifras, títulos ni certificaciones.',
  testimonios: '- testimonios: opiniones de ejemplo, firmadas con el tipo de cliente, nunca con nombres.',
  preguntas:
    '- preguntas: dudas típicas de quien contrata este servicio. Si no se sabe un dato (precios, duración, modalidad), la respuesta invita a consultarlo en vez de prometer.',
};

function prompt({ empresa, rubro, estilo, secciones = [], objetivo = null }) {
  const bloques = Object.keys(BLOQUES_OPCIONALES)
    .filter((seccion) => secciones.includes(seccion))
    .map((seccion) => INSTRUCCIONES_BLOQUE[seccion]);

  return `
Eres redactor de webs de consultoras y servicios profesionales. Escribe los
textos de la página de inicio de este negocio, que usa una plantilla ya
diseñada: portada, propuesta de valor, tres servicios y cierre de contacto.

NEGOCIO: ${empresa}
A QUÉ SE DEDICA: ${rubro}
ESTILO QUE BUSCA: ${estilo}
${lineasObjetivo(objetivo)}
${bloques.length ? `\nSECCIONES EXTRA QUE PIDIÓ EL NEGOCIO\n${bloques.join('\n')}\n` : ''}
REGLAS
- Todo en español de Perú, cercano, claro y breve. Respeta los límites de palabras.
- Los servicios tienen que ser los que ofrece ESTE negocio. Si nombró menos de
  tres, propón los que encajan con lo que hace, sin salirte de su rubro.
- No inventes cifras: ni años de experiencia, ni clientes atendidos, ni
  porcentajes de éxito, ni títulos o certificaciones que no haya mencionado.
- No inventes precios, promociones, direcciones, teléfonos ni otros datos de
  contacto: cada frase es una promesa que un cliente real va a leer.
`.trim();
}

/* -------------------------------------------------------------------------- */

function servicioNormalizado(s) {
  if (!s || typeof s !== 'object') return null;
  const titulo = limitar(s.titulo, 60, '');
  if (!titulo) return null;
  const incluye = exactamente(s.incluye, 3, (x) => limitar(x, 60, '') || null);
  return {
    titulo,
    descripcion: limitar(s.descripcion, 220, ''),
    para_quien: limitar(s.para_quien, 140, ''),
    incluye: incluye ?? [],
  };
}

/** Los bloques opcionales, solo si se pidieron y llegaron con contenido. */
function bloquesOpcionales(t, secciones) {
  const extra = {};

  if (secciones.includes('nosotros')) {
    const cuerpo = limitar(t.nosotros?.texto, 380, '');
    if (cuerpo) {
      extra.nosotros = {
        titulo: limitar(t.nosotros?.titulo, 60, 'Quiénes somos'),
        texto: cuerpo,
        cita: limitar(t.nosotros?.cita, 90, ''),
      };
    }
  }

  if (secciones.includes('testimonios')) {
    const testimonios = testimoniosNormalizados(t.testimonios);
    if (testimonios) extra.testimonios = testimonios;
  }

  if (secciones.includes('preguntas')) {
    const preguntas = preguntasNormalizadas(t.preguntas);
    if (preguntas) extra.preguntas = preguntas;
  }

  return extra;
}

/**
 * Impone los límites que el esquema no puede expresar. Devuelve null si falta
 * algo imprescindible (los servicios).
 */
function normalizar(t, secciones = []) {
  if (!t || typeof t !== 'object') return null;

  const servicios = exactamente(t.servicios, 3, servicioNormalizado);
  if (!servicios) return null;
  const parrafos = exactamente(t.propuesta?.parrafos, 2, (p) => limitar(p, 260, '') || null) ?? [];

  return {
    hero: {
      etiqueta: limitar(t.hero?.etiqueta, 60, 'Consultoría'),
      titulo: limitar(t.hero?.titulo, 60, 'Acompañamos a tu organización'),
      titulo_acento: limitar(t.hero?.titulo_acento, 50, ''),
      subtitulo: limitar(t.hero?.subtitulo, 180, ''),
      cta_principal: limitar(t.hero?.cta_principal, 40, 'Conversemos'),
      cta_secundario: limitar(t.hero?.cta_secundario, 30, 'Ver servicios'),
    },
    propuesta: {
      etiqueta: limitar(t.propuesta?.etiqueta, 40, 'Cómo trabajamos'),
      titulo: limitar(t.propuesta?.titulo, 70, 'Cómo trabajamos'),
      bajada: limitar(t.propuesta?.bajada, 160, ''),
      cita: limitar(t.propuesta?.cita, 150, ''),
      parrafos,
      pregunta: limitar(t.propuesta?.pregunta, 70, '¿Conversamos?'),
      cta: limitar(t.propuesta?.cta, 25, 'Conversemos'),
    },
    servicios_intro: {
      etiqueta: limitar(t.servicios_intro?.etiqueta, 30, 'Servicios'),
      titulo: limitar(t.servicios_intro?.titulo, 70, 'Nuestros servicios'),
      bajada: limitar(t.servicios_intro?.bajada, 150, ''),
    },
    servicios,
    cierre: {
      titulo: limitar(t.cierre?.titulo, 70, '¿Conversamos?'),
      bajada: limitar(t.cierre?.bajada, 180, ''),
      cta: limitar(t.cierre?.cta, 40, 'Agenda una conversación'),
    },
    ciudad: limitar(t.ciudad, 40, 'Lima, Perú'),
    pie_descripcion: limitar(t.pie_descripcion, 160, ''),
    ...bloquesOpcionales(t, secciones),
  };
}

module.exports = { id: 'consultora', esquema, prompt, normalizar };
