// ---------------------------------------------------------------------------
// Plantilla "Restaurante" — lado servidor
// ---------------------------------------------------------------------------
// El HTML vive en el frontend (Proyecto_AIB/src/plantillas/restaurante). Aquí
// está lo que el servidor necesita para pedirle los textos a la IA: la forma
// exacta de la respuesta, el prompt y la normalización.
//
// No se piden precios, horarios ni direcciones: la plantilla los deja como
// huecos visibles que completa el cliente.
//
// La forma debe coincidir con TextosRestaurante del frontend.
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

const plato = (maxPalabras) =>
  objeto({
    nombre: texto('Nombre del plato o bebida, 1 a 5 palabras'),
    descripcion: texto(`Qué lleva o cómo se sirve, máximo ${maxPalabras} palabras, sin precio`),
  });

const paso = objeto({
  titulo: texto('2 a 4 palabras'),
  detalle: texto('Máximo 12 palabras'),
});

/**
 * JSON Schema para structured outputs. Solo tipos y `required`: las
 * longitudes y cantidades se piden en las descripciones y se imponen después
 * en `normalizar`, que no depende de lo que el modelo haya respetado.
 */
const propiedadesBase = {
  hero: objeto({
    etiqueta: texto('Tipo de cocina o de local, 2 a 5 palabras, como "Cevichería en Chorrillos"'),
    titulo: texto('Titular, máximo 7 palabras'),
    subtitulo: texto('Frase de apoyo, máximo 22 palabras'),
    cta_principal: texto('Botón que lleva a la carta, 2 a 4 palabras'),
    cta_secundario: texto('Botón para pedir por WhatsApp, 2 a 4 palabras'),
  }),
  sellos: {
    type: 'array',
    items: objeto({
      titulo: texto('Rasgo de la casa, 2 a 4 palabras'),
      detalle: texto('Máximo 9 palabras'),
    }),
    description: 'Exactamente 3 rasgos que distinguen al local, sin cifras, años ni premios',
  },
  destacados_intro: objeto({
    titulo: texto('Máximo 7 palabras'),
    bajada: texto('Máximo 14 palabras'),
  }),
  destacados: { type: 'array', items: plato(18), description: 'Exactamente 3 platos estrella de la casa' },
  carta_intro: objeto({
    titulo: texto('Máximo 7 palabras'),
    bajada: texto('Máximo 16 palabras'),
  }),
  carta: {
    type: 'array',
    items: objeto({
      nombre: texto('Categoría de la carta, 1 a 3 palabras, como "Entradas" o "Bebidas"'),
      platos: { type: 'array', items: plato(10), description: 'Exactamente 3' },
    }),
    description: 'Exactamente 4 categorías de la carta',
  },
  pedido: objeto({
    titulo: texto('Invitación a pedir por WhatsApp, máximo 7 palabras'),
    bajada: texto('Máximo 22 palabras'),
    cta: texto('Botón, 2 a 4 palabras'),
    pasos: { type: 'array', items: paso, description: 'Exactamente 3 pasos para pedir' },
  }),
  visita: objeto({
    titulo: texto('Invitación a visitar el local, máximo 7 palabras'),
    bajada: texto('Máximo 18 palabras'),
  }),
  ciudad: texto('Ciudad y país si el negocio lo dijo; si no, "Lima, Perú"'),
  pie_descripcion: texto('Descripción del local para el pie de página, máximo 16 palabras'),
};

/** Bloques que solo aparecen si el cliente pidió esa sección. */
const BLOQUES_OPCIONALES = {
  nosotros: objeto({
    titulo: texto('Título, máximo 7 palabras'),
    texto: texto('La historia del local con lo que contó el negocio; máximo 45 palabras, sin inventar años, premios ni cifras'),
    cita: texto('Frase breve que los define, máximo 10 palabras'),
  }),
  galeria: objeto({
    titulo: texto('Título de la galería de fotos, máximo 7 palabras'),
    bajada: texto('Máximo 14 palabras'),
  }),
  testimonios: {
    type: 'array',
    items: objeto({
      texto: texto('Opinión de ejemplo, máximo 25 palabras'),
      autor: texto('Tipo de comensal, como "Cliente de la zona"; nunca un nombre de persona'),
    }),
    description: 'Exactamente 3',
  },
  preguntas: {
    type: 'array',
    items: objeto({
      pregunta: texto('Duda típica de quien va a pedir o visitar, máximo 12 palabras'),
      respuesta: texto('Respuesta de máximo 30 palabras; si no se conoce el dato, invitar a consultarlo por WhatsApp'),
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
  nosotros: '- nosotros: la historia del local con lo que contó el negocio. Sin inventar años, premios ni cifras.',
  galeria: '- galeria: solo el título y la bajada; las fotos las pone el negocio.',
  testimonios: '- testimonios: opiniones de ejemplo, firmadas con el tipo de comensal, nunca con nombres.',
  preguntas:
    '- preguntas: dudas típicas (pedidos, reservas, delivery, opciones). Si no se sabe la respuesta, invita a consultarlo por WhatsApp en vez de prometer.',
};

function prompt({ empresa, rubro, estilo, secciones = [], objetivo = null }) {
  const bloques = Object.keys(BLOQUES_OPCIONALES)
    .filter((seccion) => secciones.includes(seccion))
    .map((seccion) => INSTRUCCIONES_BLOQUE[seccion]);

  return `
Eres redactor de webs de restaurantes. Escribe los textos de la página de
inicio de este negocio, que usa una plantilla ya diseñada: portada, platos de
la casa, carta por categorías, pedidos por WhatsApp y un bloque para visitar
el local.

NEGOCIO: ${empresa}
A QUÉ SE DEDICA: ${rubro}
ESTILO QUE BUSCA: ${estilo}
${lineasObjetivo(objetivo)}
${bloques.length ? `\nSECCIONES EXTRA QUE PIDIÓ EL NEGOCIO\n${bloques.join('\n')}\n` : ''}
REGLAS
- Todo en español de Perú, cercano y apetitoso, pero breve. Respeta los límites
  de palabras.
- La carta tiene que ser la de ESTE tipo de cocina. Si el negocio nombró platos,
  úsalos primero; el resto, platos típicos de su cocina, sin salirte de ella.
  Las categorías se adaptan al local (una cafetería no tiene "Fondos").
- Nunca escribas precios, horarios, direcciones ni teléfonos: la página ya
  tiene huecos para eso que completa el propio negocio.
- No inventes años de trayectoria, premios, rankings ni frases como "el mejor
  de Lima".
- No prometas delivery, zonas de reparto ni tiempos de entrega o de respuesta
  ("en minutos", "al toque") si el negocio no los mencionó: para pedir basta
  con elegir, escribir por WhatsApp y coordinar.
`.trim();
}

/* -------------------------------------------------------------------------- */

const platoNormalizado = (maxDescripcion) => (p) => {
  const nombre = limitar(p?.nombre, 50, '');
  return nombre ? { nombre, descripcion: limitar(p?.descripcion, maxDescripcion, '') } : null;
};

function categoriaNormalizada(c) {
  const nombre = limitar(c?.nombre, 30, '');
  const platos = exactamente(c?.platos, 3, platoNormalizado(90));
  return nombre && platos ? { nombre, platos } : null;
}

const pasoNormalizado = (p) => {
  const titulo = limitar(p?.titulo, 40, '');
  return titulo ? { titulo, detalle: limitar(p?.detalle, 100, '') } : null;
};

/** Los bloques opcionales, solo si se pidieron y llegaron con contenido. */
function bloquesOpcionales(t, secciones) {
  const extra = {};

  if (secciones.includes('nosotros')) {
    const cuerpo = limitar(t.nosotros?.texto, 340, '');
    if (cuerpo) {
      extra.nosotros = {
        titulo: limitar(t.nosotros?.titulo, 60, 'Nuestra historia'),
        texto: cuerpo,
        cita: limitar(t.nosotros?.cita, 90, ''),
      };
    }
  }

  if (secciones.includes('galeria')) {
    extra.galeria = {
      titulo: limitar(t.galeria?.titulo, 60, 'Nuestra mesa'),
      bajada: limitar(t.galeria?.bajada, 120, ''),
    };
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
 * algo imprescindible (la carta o los platos de la casa).
 */
function normalizar(t, secciones = []) {
  if (!t || typeof t !== 'object') return null;

  const carta = exactamente(t.carta, 4, categoriaNormalizada);
  const destacados = exactamente(t.destacados, 3, platoNormalizado(150));
  if (!carta || !destacados) return null;

  const sellos =
    exactamente(t.sellos, 3, (s) => {
      const titulo = limitar(s?.titulo, 40, '');
      return titulo ? { titulo, detalle: limitar(s?.detalle, 80, '') } : null;
    }) ?? [];
  const pasos = exactamente(t.pedido?.pasos, 3, pasoNormalizado) ?? [
    { titulo: 'Elige tus platos', detalle: 'Revisa la carta.' },
    { titulo: 'Escríbenos', detalle: 'Mándanos tu pedido por WhatsApp.' },
    { titulo: 'Coordinamos', detalle: 'Te confirmamos el pedido.' },
  ];

  return {
    hero: {
      etiqueta: limitar(t.hero?.etiqueta, 50, 'Restaurante'),
      titulo: limitar(t.hero?.titulo, 60, 'Te esperamos en la mesa'),
      subtitulo: limitar(t.hero?.subtitulo, 180, ''),
      cta_principal: limitar(t.hero?.cta_principal, 30, 'Ver la carta'),
      cta_secundario: limitar(t.hero?.cta_secundario, 30, 'Pedir por WhatsApp'),
    },
    sellos,
    destacados_intro: {
      titulo: limitar(t.destacados_intro?.titulo, 60, 'La casa recomienda'),
      bajada: limitar(t.destacados_intro?.bajada, 120, ''),
    },
    destacados,
    carta_intro: {
      titulo: limitar(t.carta_intro?.titulo, 60, 'Nuestra carta'),
      bajada: limitar(t.carta_intro?.bajada, 130, ''),
    },
    carta,
    pedido: {
      titulo: limitar(t.pedido?.titulo, 60, 'Pide por WhatsApp'),
      bajada: limitar(t.pedido?.bajada, 180, ''),
      cta: limitar(t.pedido?.cta, 30, 'Hacer mi pedido'),
      pasos,
    },
    visita: {
      titulo: limitar(t.visita?.titulo, 60, 'Visítanos'),
      bajada: limitar(t.visita?.bajada, 150, ''),
    },
    ciudad: limitar(t.ciudad, 40, 'Lima, Perú'),
    pie_descripcion: limitar(t.pie_descripcion, 140, ''),
    ...bloquesOpcionales(t, secciones),
  };
}

module.exports = { id: 'restaurante', esquema, prompt, normalizar };
