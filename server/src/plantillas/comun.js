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

module.exports = {
  texto,
  numero,
  objeto,
  limitar,
  exactamente,
  testimoniosNormalizados,
  preguntasNormalizadas,
};
