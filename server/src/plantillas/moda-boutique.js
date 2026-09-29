// ---------------------------------------------------------------------------
// Plantilla "Boutique de moda" — lado servidor
// ---------------------------------------------------------------------------
// El HTML vive en el frontend (Proyecto_AIB/src/plantillas/moda-boutique). Aquí
// está lo que el servidor necesita para pedirle los textos a la IA: la forma
// exacta de la respuesta, el prompt y la normalización.
//
// La forma debe coincidir con TextosModaBoutique del frontend.
// ---------------------------------------------------------------------------

const texto = (description) => ({ type: 'string', description });
const numero = (description) => ({ type: 'number', description });

function objeto(properties) {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

const producto = objeto({
  nombre: texto('Nombre corto de la prenda, 2 a 4 palabras'),
  precio: numero('Precio en soles, realista para este negocio en Perú'),
  tallas: texto('Tallas separadas por " · ", por ejemplo "S · M · L"'),
  color: texto('Color principal de la prenda en hexadecimal, #rrggbb'),
  etiqueta: { type: 'string', enum: ['', 'Nuevo', 'Más pedido'] },
});

/**
 * Bloques que solo aparecen si el cliente pidió esa sección. Así la IA no
 * escribe textos que nadie va a ver y la maqueta respeta lo que eligió.
 * El resto de secciones (productos, precios, galería, contacto) salen de los
 * bloques fijos de la plantilla y se encienden o apagan en el frontend.
 */
const BLOQUES_OPCIONALES = {
  nosotros: objeto({
    titulo: texto('Título de la sección, máximo 4 palabras'),
    texto: texto('Quiénes son, con lo que contó la tienda; máximo 55 palabras, sin inventar años, cifras ni premios'),
  }),
  testimonios: {
    type: 'array',
    items: objeto({
      texto: texto('Opinión de ejemplo, máximo 25 palabras'),
      autor: texto('Tipo de cliente, como "Clienta frecuente"; nunca un nombre de persona'),
    }),
    description: 'Exactamente 3',
  },
  preguntas: {
    type: 'array',
    items: objeto({
      pregunta: texto('Duda típica al comprar en esta tienda, máximo 12 palabras'),
      respuesta: texto('Respuesta de máximo 30 palabras; si no se conoce la política, invitar a consultar por WhatsApp en vez de prometer'),
    }),
    description: 'Exactamente 4',
  },
};

/**
 * JSON Schema para structured outputs. Solo tipos, enums y `required`: las
 * longitudes y cantidades se piden en las descripciones y se imponen después
 * en `normalizar`, que no depende de lo que el modelo haya respetado.
 */
const propiedadesBase = {
  anuncio: texto('Frase de la barra superior, máximo 6 palabras'),
  hero: objeto({
    etiqueta: texto('Etiqueta corta sobre el título, 1 a 3 palabras'),
    titulo: texto('Titular de portada, máximo 6 palabras'),
    subtitulo: texto('Una frase de apoyo, máximo 18 palabras'),
    cta: texto('Texto del botón, 1 a 3 palabras'),
  }),
  categorias: { type: 'array', items: texto('Categoría de producto, 1 o 2 palabras'), description: 'Exactamente 4' },
  destacados_titulo: texto('Título de la sección de más vendidos, máximo 4 palabras'),
  destacados: { type: 'array', items: producto, description: 'Exactamente 6 productos' },
  novedades_titulo: texto('Título de la sección de novedades, máximo 3 palabras'),
  novedades: { type: 'array', items: producto, description: 'Exactamente 4 productos distintos de los destacados' },
  marquesinas: { type: 'array', items: texto('Frase corta, máximo 6 palabras'), description: 'Exactamente 3' },
  edicion: objeto({
    etiqueta: texto('Por ejemplo "Edición limitada"'),
    nombre: texto('Prenda protagonista, 2 a 4 palabras'),
    precio: numero('Precio en soles'),
  }),
  top: objeto({
    nombre: texto('Prenda estrella de la semana, 2 a 5 palabras'),
    precio: numero('Precio en soles'),
    color: texto('Hex #rrggbb'),
    color_nombre: texto('Nombre del color, 1 o 2 palabras'),
    tallas: { type: 'array', items: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL'] } },
    descripcion: texto('Descripción de la prenda, máximo 30 palabras'),
    material: texto('Material, máximo 6 palabras'),
  }),
  look: objeto({
    titulo: texto('Título de la sección de conjuntos, máximo 3 palabras'),
    etiqueta: texto('Palabra que va en vertical junto a la foto, 1 palabra'),
    prenda: objeto({ nombre: texto('Prenda del conjunto, 2 a 4 palabras'), precio: numero('Precio en soles') }),
  }),
  tienda: objeto({
    nombre: texto(
      'Zona o local solo si el cliente lo mencionó, como "Tienda de Los Olivos"; si no, "Nuestra tienda". Nunca una dirección inventada. Máximo 6 palabras'
    ),
    ciudad: texto('Ciudad y país, por ejemplo "Lima, Perú"'),
  }),
  garantias: {
    type: 'array',
    items: objeto({ titulo: texto('Máximo 3 palabras'), detalle: texto('Máximo 12 palabras') }),
    description:
      'Exactamente 4, en este orden: tienda o recojo; entrega (si el negocio no habló de envíos, algo que no prometa, como "Coordinamos tu entrega"); novedades; asesoría',
  },
  pie_descripcion: texto('Descripción del negocio para el pie de página, máximo 22 palabras'),
};

/** Esquema con los bloques fijos más los opcionales que pidió el cliente. */
function esquema(secciones = []) {
  const extra = Object.entries(BLOQUES_OPCIONALES).filter(([seccion]) => secciones.includes(seccion));
  return objeto({ ...propiedadesBase, ...Object.fromEntries(extra) });
}

const INSTRUCCIONES_BLOQUE = {
  nosotros: '- nosotros: quiénes son, con lo que contó la tienda. Sin inventar años, cifras ni premios.',
  testimonios: '- testimonios: opiniones de ejemplo, firmadas con el tipo de cliente, nunca con nombres.',
  preguntas:
    '- preguntas: dudas típicas al comprar aquí (tallas, cambios, pedidos). Si no se sabe la política, que la respuesta invite a consultar por WhatsApp en vez de prometer.',
};

function prompt({ empresa, rubro, estilo, secciones = [] }) {
  const bloques = Object.keys(BLOQUES_OPCIONALES)
    .filter((seccion) => secciones.includes(seccion))
    .map((seccion) => INSTRUCCIONES_BLOQUE[seccion]);

  return `
Eres redactor de tiendas de moda. Escribe los textos de la página de inicio de
esta tienda, que usa una plantilla de boutique ya diseñada.

TIENDA: ${empresa}
A QUÉ SE DEDICA: ${rubro}
ESTILO QUE BUSCA: ${estilo}
${bloques.length ? `\nSECCIONES EXTRA QUE PIDIÓ LA TIENDA\n${bloques.join('\n')}\n` : ''}
REGLAS
- Todo en español de Perú, cercano y breve. Respeta los límites de palabras.
- Las prendas tienen que ser las que vende ESTA tienda: si es ropa de hombre,
  prendas de hombre; si es deportiva, deportiva; si es infantil, infantil.
- Precios en soles, creíbles para este tipo de tienda y su estilo.
- Colores de prenda coherentes con cada prenda, en hexadecimal.
- No inventes promociones, envíos gratis, descuentos ni cuotas que la tienda no
  haya mencionado: cada frase es una promesa que un cliente real va a leer.
- Tampoco inventes direcciones, teléfonos ni otros datos de contacto.
- Si no se sabe la ciudad, usa "Lima, Perú".
`.trim();
}

/* -------------------------------------------------------------------------- */

const limitar = (valor, max, respaldo) => {
  const t = typeof valor === 'string' ? valor.trim() : '';
  return (t || respaldo).slice(0, max);
};

const precio = (valor, respaldo) =>
  Number.isFinite(valor) && valor > 0 && valor < 100000 ? Math.round(valor * 10) / 10 : respaldo;

const hex = (valor, respaldo = '#d4a59a') => (/^#[0-9a-f]{6}$/i.test(valor ?? '') ? valor : respaldo);

/** Deja una lista con exactamente `n` elementos: recorta o repite los que hay. */
function exactamente(lista, n, normalizarUno) {
  const base = Array.isArray(lista) ? lista.map(normalizarUno).filter(Boolean) : [];
  if (base.length === 0) return null;
  return Array.from({ length: n }, (_, i) => base[i % base.length]);
}

function productoNormalizado(p) {
  if (!p || typeof p !== 'object') return null;
  const nombre = limitar(p.nombre, 40, '');
  if (!nombre) return null;
  return {
    nombre,
    precio: precio(p.precio, 99.9),
    tallas: limitar(p.tallas, 24, 'S · M · L'),
    color: hex(p.color),
    etiqueta: ['', 'Nuevo', 'Más pedido'].includes(p.etiqueta) ? p.etiqueta : '',
  };
}

/** Los bloques opcionales, solo si se pidieron y llegaron con contenido. */
function bloquesOpcionales(t, secciones) {
  const extra = {};

  if (secciones.includes('nosotros')) {
    const cuerpo = limitar(t.nosotros?.texto, 400, '');
    if (cuerpo) extra.nosotros = { titulo: limitar(t.nosotros?.titulo, 40, 'Quiénes somos'), texto: cuerpo };
  }

  if (secciones.includes('testimonios')) {
    const testimonios = exactamente(t.testimonios, 3, (x) => {
      const opinion = limitar(x?.texto, 200, '');
      return opinion ? { texto: opinion, autor: limitar(x?.autor, 40, 'Cliente') } : null;
    });
    if (testimonios) extra.testimonios = testimonios;
  }

  if (secciones.includes('preguntas')) {
    const preguntas = exactamente(t.preguntas, 4, (x) => {
      const pregunta = limitar(x?.pregunta, 100, '');
      const respuesta = limitar(x?.respuesta, 240, '');
      return pregunta && respuesta ? { pregunta, respuesta } : null;
    });
    if (preguntas) extra.preguntas = preguntas;
  }

  return extra;
}

/**
 * Impone los límites que el esquema no puede expresar y valida lo que acaba
 * dentro de atributos (colores). Devuelve null si falta algo imprescindible.
 */
function normalizar(t, secciones = []) {
  if (!t || typeof t !== 'object') return null;

  const destacados = exactamente(t.destacados, 6, productoNormalizado);
  const novedades = exactamente(t.novedades, 4, productoNormalizado);
  const categorias = exactamente(t.categorias, 4, (c) => limitar(c, 18, '') || null);
  if (!destacados || !novedades || !categorias) return null;

  const tallasTop = Array.isArray(t.top?.tallas)
    ? [...new Set(t.top.tallas.filter((x) => ['XS', 'S', 'M', 'L', 'XL'].includes(x)))]
    : [];

  return {
    anuncio: limitar(t.anuncio, 60, 'Nuevos modelos cada semana'),
    hero: {
      etiqueta: limitar(t.hero?.etiqueta, 28, 'Nueva colección'),
      titulo: limitar(t.hero?.titulo, 60, 'Nueva colección'),
      subtitulo: limitar(t.hero?.subtitulo, 160, ''),
      cta: limitar(t.hero?.cta, 24, 'Ver colección'),
    },
    categorias,
    destacados_titulo: limitar(t.destacados_titulo, 36, 'Los más pedidos'),
    destacados,
    novedades_titulo: limitar(t.novedades_titulo, 30, 'Nuevos ingresos'),
    novedades,
    marquesinas: exactamente(t.marquesinas, 3, (m) => limitar(m, 50, '') || null) ?? ['Nuevos modelos cada semana'],
    edicion: {
      etiqueta: limitar(t.edicion?.etiqueta, 28, 'Edición limitada'),
      nombre: limitar(t.edicion?.nombre, 40, destacados[0].nombre),
      precio: precio(t.edicion?.precio, destacados[0].precio),
    },
    top: {
      nombre: limitar(t.top?.nombre, 48, destacados[0].nombre),
      precio: precio(t.top?.precio, destacados[0].precio),
      color: hex(t.top?.color),
      color_nombre: limitar(t.top?.color_nombre, 24, 'Color principal'),
      tallas: tallasTop.length ? tallasTop : ['S', 'M', 'L'],
      descripcion: limitar(t.top?.descripcion, 220, ''),
      material: limitar(t.top?.material, 48, ''),
    },
    look: {
      titulo: limitar(t.look?.titulo, 30, 'Arma tu look'),
      etiqueta: limitar(t.look?.etiqueta, 12, 'Estilo'),
      prenda: {
        nombre: limitar(t.look?.prenda?.nombre, 40, destacados[1].nombre),
        precio: precio(t.look?.prenda?.precio, destacados[1].precio),
      },
    },
    tienda: {
      nombre: limitar(t.tienda?.nombre, 60, 'Nuestra tienda'),
      ciudad: limitar(t.tienda?.ciudad, 40, 'Lima, Perú'),
    },
    garantias:
      exactamente(t.garantias, 4, (g) =>
        g && typeof g === 'object'
          ? { titulo: limitar(g.titulo, 32, 'Atención'), detalle: limitar(g.detalle, 100, '') }
          : null
      ) ?? [],
    pie_descripcion: limitar(t.pie_descripcion, 180, ''),
    ...bloquesOpcionales(t, secciones),
  };
}

module.exports = { id: 'moda-boutique', esquema, prompt, normalizar };
