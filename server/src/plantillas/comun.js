// ---------------------------------------------------------------------------
// Utilidades comunes a las plantillas del lado servidor
// ---------------------------------------------------------------------------
// Cada plantilla define su esquema (lo que se le pide a la IA con structured
// outputs), su prompt y su normalización. Esto es lo que comparten.
// ---------------------------------------------------------------------------

const texto = (description) => ({ type: 'string', description });
const numero = (description) => ({ type: 'number', description });

/** Objeto cerrado: sin propiedades extra y con todas obligatorias. */
function objeto(properties) {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

/** Texto recortado a `max` caracteres, o el respaldo si llegó vacío. */
const limitar = (valor, max, respaldo) => {
  const t = typeof valor === 'string' ? valor.trim() : '';
  return (t || respaldo).slice(0, max);
};

/** Deja una lista con exactamente `n` elementos: recorta o repite los que hay. */
function exactamente(lista, n, normalizarUno) {
  const base = Array.isArray(lista) ? lista.map(normalizarUno).filter(Boolean) : [];
  if (base.length === 0) return null;
  return Array.from({ length: n }, (_, i) => base[i % base.length]);
}

/** Opiniones de ejemplo, firmadas por tipo de cliente. Exactamente 3. */
function testimoniosNormalizados(lista) {
  return exactamente(lista, 3, (x) => {
    const opinion = limitar(x?.texto, 200, '');
    return opinion ? { texto: opinion, autor: limitar(x?.autor, 60, 'Cliente') } : null;
  });
}

/** Preguntas frecuentes con su respuesta. Exactamente 4. */
function preguntasNormalizadas(lista) {
  return exactamente(lista, 4, (x) => {
    const pregunta = limitar(x?.pregunta, 100, '');
    const respuesta = limitar(x?.respuesta, 240, '');
    return pregunta && respuesta ? { pregunta, respuesta } : null;
  });
}

/* -------------------------------------------------------------------------- */
/* Objetivo de la web                                                         */
/* -------------------------------------------------------------------------- */
// Lo elige el cliente al principio del cuestionario. Cambia el tono y los
// llamados a la acción: no es lo mismo una tienda que una institución que
// solo quiere informar. Mismas claves que OBJETIVOS_WEB en el frontend.

const OBJETIVOS = {
  vender: {
    etiqueta: 'Vender o recibir pedidos',
    guia: 'Su objetivo es vender: los llamados a la acción invitan a comprar o hacer un pedido.',
  },
  clientes: {
    etiqueta: 'Conseguir clientes o reservas',
    guia: 'Su objetivo es conseguir clientes: los llamados a la acción invitan a contactar, cotizar o reservar.',
  },
  informar: {
    etiqueta: 'Informar y darse a conocer',
    guia:
      'Su objetivo es informar y darse a conocer, NO vender: nada de precios, promociones, ' +
      'carritos ni "compra ya" o "haz tu pedido". Los llamados a la acción invitan a conocer más, ' +
      'ver lo que hacen o escribir. El tono es claro e institucional, cercano a quien busca información.',
  },
  promocionar: {
    etiqueta: 'Promocionar algo puntual (un evento, un lanzamiento o una campaña)',
    guia:
      'Su objetivo es promocionar algo puntual: todo gira en torno a eso, qué es, para quién, ' +
      'cuándo, dónde y cómo participar o inscribirse. No inventes fechas, lugares ni precios: ' +
      'usa huecos visibles como [Fecha], [Lugar] o [Cómo inscribirse].',
  },
};

/** La clave del objetivo si es una conocida; si no, null. */
function leerObjetivo(valor) {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(OBJETIVOS, valor) ? valor : null;
}

/** Bloque para el prompt. Vacío si el cliente no lo eligió (proyectos antiguos). */
function lineasObjetivo(objetivo) {
  const o = objetivo ? OBJETIVOS[objetivo] : null;
  return o ? `OBJETIVO DE LA WEB: ${o.etiqueta}\n${o.guia}` : '';
}

module.exports = {
  OBJETIVOS,
  leerObjetivo,
  lineasObjetivo,
  texto,
  numero,
  objeto,
  limitar,
  exactamente,
  testimoniosNormalizados,
  preguntasNormalizadas,
};
