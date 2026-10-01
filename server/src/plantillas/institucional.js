// ---------------------------------------------------------------------------
// Plantilla "Institucional" — lado servidor
// ---------------------------------------------------------------------------
// El HTML vive en el frontend (Proyecto_AIB/src/plantillas/institucional).
// Aquí está lo que el servidor necesita para pedirle los textos a la IA: la
// forma exacta de la respuesta, el prompt y la normalización.
//
// Es para organizaciones que quieren informar, no vender: el prompt lo deja
// claro aunque el cliente no haya elegido objetivo. No se piden horarios,
// direcciones, teléfonos, correos ni fechas: la plantilla los deja como
// huecos visibles.
//
// La forma debe coincidir con TextosInstitucional del frontend.
// ---------------------------------------------------------------------------

const {
  texto,
  objeto,
  limitar,
  exactamente,
  preguntasNormalizadas,
  lineasObjetivo,
} = require('./comun');

/** Los mismos nombres que ICONOS_INSTITUCIONAL en el frontend. */
const ICONOS = [
  'documento',
  'personas',
  'edificio',
  'informacion',
  'calendario',
  'escudo',
  'mundo',
  'libro',
  'educacion',
  'grafico',
  'corazon',
  'hojas',
  'mensaje',
];

const icono = {
  type: 'string',
  enum: ICONOS,
  description:
    'Icono que mejor lo representa: documento (trámites, documentos), personas (atención, comunidad), edificio (institución, sede), informacion (orientación), calendario (citas, eventos), escudo (seguridad, transparencia), mundo (alcance nacional o internacional), libro (biblioteca, investigación), educacion (formación, colegio), grafico (estadísticas, datos), corazon (ayuda social, salud), hojas (medio ambiente), mensaje (consultas, contacto)',
};

const TIPOS_NOTICIA = ['Comunicado', 'Noticia', 'Evento'];

/**
 * JSON Schema para structured outputs. Solo tipos y `required`: las
 * longitudes y cantidades se piden en las descripciones y se imponen después
 * en `normalizar`, que no depende de lo que el modelo haya respetado.
 */
const propiedadesBase = {
  aviso: texto('Mensaje destacado para la franja de arriba, máximo 14 palabras, sin fechas ni cifras'),
  hero: objeto({
    etiqueta: texto('Tipo de organización y ámbito, 2 a 6 palabras, como "Asociación civil en Arequipa"'),
    titulo: texto('Titular, máximo 9 palabras'),
    subtitulo: texto('Qué hace y para quién, máximo 24 palabras'),
    cta_principal: texto('Botón que lleva a sus servicios, 2 a 4 palabras, como "Conoce lo que hacemos"'),
    cta_secundario: texto('Botón de contacto, 1 a 3 palabras'),
  }),
  pilares: {
    type: 'array',
    items: objeto({
      icono,
      titulo: texto('2 a 4 palabras'),
      detalle: texto('Máximo 14 palabras'),
    }),
    description: 'Exactamente 3 valores o rasgos que la definen, sin cifras, años ni premios',
  },
  servicios_intro: objeto({
    titulo: texto('Máximo 7 palabras'),
    bajada: texto('Máximo 16 palabras'),
  }),
  servicios: {
    type: 'array',
    items: objeto({
      icono,
      nombre: texto('Nombre del servicio, programa o área, 1 a 5 palabras'),
      descripcion: texto('Qué ofrece, máximo 18 palabras, sin precios'),
      dirigido_a: texto('A quién va dirigido, máximo 8 palabras, como "Vecinos del distrito"'),
    }),
    description: 'Exactamente 6 servicios, programas o áreas de esta organización',
  },
  contacto_intro: objeto({
    titulo: texto('Invitación a contactar o acercarse, máximo 7 palabras'),
    bajada: texto('Máximo 18 palabras'),
  }),
  ciudad: texto('Ciudad y país si la organización lo dijo; si no, "Lima, Perú"'),
  pie_descripcion: texto('Descripción de la organización para el pie de página, máximo 16 palabras'),
};

/** Bloques que solo aparecen si el cliente pidió esa sección. */
const BLOQUES_OPCIONALES = {
  nosotros: objeto({
    titulo: texto('Título del bloque "Quiénes somos", máximo 8 palabras'),
    mision: texto('Su misión, con lo que contó; máximo 30 palabras, sin cifras ni años'),
    vision: texto('Su visión, máximo 25 palabras'),
  }),
  blog: objeto({
    bajada: texto('Presentación de la sección de noticias, máximo 14 palabras'),
    entradas: {
      type: 'array',
      items: objeto({
        tipo: { type: 'string', enum: TIPOS_NOTICIA, description: 'Tipo de entrada' },
        titulo: texto('Titular de ejemplo, máximo 10 palabras, sin fechas'),
        resumen: texto('Resumen de ejemplo, máximo 22 palabras, sin fechas, cifras ni nombres de personas'),
      }),
      description: 'Exactamente 3 entradas de ejemplo, coherentes con lo que hace la organización',
    },
  }),
  documentos: objeto({
    bajada: texto('Presentación de la sección de documentos, máximo 14 palabras'),
    lista: {
      type: 'array',
      items: objeto({
        nombre: texto('Nombre de un documento típico de esta organización, máximo 6 palabras'),
        descripcion: texto('Para qué sirve, máximo 12 palabras'),
      }),
      description: 'Exactamente 4 documentos que suele publicar este tipo de organización',
    },
  }),
  galeria: objeto({
    titulo: texto('Título de la galería de fotos, máximo 7 palabras'),
    bajada: texto('Máximo 14 palabras'),
  }),
  preguntas: {
    type: 'array',
    items: objeto({
      pregunta: texto('Duda típica de quien busca información o un servicio, máximo 12 palabras'),
      respuesta: texto('Respuesta de máximo 30 palabras; si no se conoce el dato, invitar a consultar'),
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
  nosotros: '- nosotros: misión y visión con lo que contó la organización. Sin años, cifras ni logros inventados.',
  blog: '- blog: tres entradas de EJEMPLO (comunicado, noticia o evento) coherentes con lo que hace; el cliente las cambiará. Sin fechas, cifras ni nombres de personas.',
  documentos: '- documentos: cuatro documentos típicos que publica este tipo de organización (reglamentos, guías, formularios, informes).',
  galeria: '- galeria: solo el título y la bajada; las fotos las pone la organización.',
  preguntas:
    '- preguntas: dudas típicas de quien busca información o un servicio. Si no se sabe la respuesta, invita a consultar en vez de prometer.',
};

function prompt({ empresa, rubro, estilo, secciones = [], objetivo = null }) {
  const bloques = Object.keys(BLOQUES_OPCIONALES)
    .filter((seccion) => secciones.includes(seccion))
    .map((seccion) => INSTRUCCIONES_BLOQUE[seccion]);

  return `
Eres redactor de webs institucionales. Escribe los textos de la página de
inicio de esta organización, que usa una plantilla ya diseñada: aviso
destacado, portada, tres pilares, seis servicios o programas y atención al
público.

ORGANIZACIÓN: ${empresa}
A QUÉ SE DEDICA: ${rubro}
ESTILO QUE BUSCA: ${estilo}
${lineasObjetivo(objetivo || 'informar')}
${bloques.length ? `\nSECCIONES EXTRA QUE PIDIÓ\n${bloques.join('\n')}\n` : ''}
REGLAS
- Todo en español de Perú, claro, cercano y sobrio. Respeta los límites de
  palabras.
- Es una web para INFORMAR, no para vender: nada de precios, promociones,
  "compra", "pedido" ni carritos.
- Los servicios tienen que ser los de ESTA organización. Si nombró menos de
  seis, completa con los típicos de su tipo, sin salirte de lo que hace.
- No inventes cifras, años, premios, autoridades, nombres de personas ni datos
  de contacto, horarios, direcciones o fechas: la página ya tiene huecos para
  eso que completa la propia organización.
`.trim();
}

/* -------------------------------------------------------------------------- */

const iconoValido = (valor) => (ICONOS.includes(valor) ? valor : 'informacion');

function pilarNormalizado(p) {
  const titulo = limitar(p?.titulo, 40, '');
  return titulo ? { icono: iconoValido(p?.icono), titulo, detalle: limitar(p?.detalle, 110, '') } : null;
}

function servicioNormalizado(s) {
  const nombre = limitar(s?.nombre, 50, '');
  return nombre
    ? {
        icono: iconoValido(s?.icono),
        nombre,
        descripcion: limitar(s?.descripcion, 150, ''),
        dirigido_a: limitar(s?.dirigido_a, 70, 'Público en general'),
      }
    : null;
}

/** Los bloques opcionales, solo si se pidieron y llegaron con contenido. */
function bloquesOpcionales(t, secciones) {
  const extra = {};

  if (secciones.includes('nosotros')) {
    const mision = limitar(t.nosotros?.mision, 240, '');
    if (mision) {
      extra.nosotros = {
        titulo: limitar(t.nosotros?.titulo, 70, 'Quiénes somos'),
        mision,
        vision: limitar(t.nosotros?.vision, 200, ''),
      };
    }
  }

  if (secciones.includes('blog')) {
    const entradas = exactamente(t.blog?.entradas, 3, (n) => {
      const titulo = limitar(n?.titulo, 90, '');
      return titulo
        ? {
            tipo: TIPOS_NOTICIA.includes(n?.tipo) ? n.tipo : 'Noticia',
            titulo,
            resumen: limitar(n?.resumen, 180, ''),
          }
        : null;
    });
    if (entradas) extra.noticias = { bajada: limitar(t.blog?.bajada, 120, ''), entradas };
  }

  if (secciones.includes('documentos')) {
    const lista = exactamente(t.documentos?.lista, 4, (d) => {
      const nombre = limitar(d?.nombre, 60, '');
      return nombre ? { nombre, descripcion: limitar(d?.descripcion, 100, '') } : null;
    });
    if (lista) extra.documentos = { bajada: limitar(t.documentos?.bajada, 120, ''), lista };
  }

  if (secciones.includes('galeria')) {
    extra.galeria = {
      titulo: limitar(t.galeria?.titulo, 60, 'Nuestras actividades'),
      bajada: limitar(t.galeria?.bajada, 120, ''),
    };
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

  const servicios = exactamente(t.servicios, 6, servicioNormalizado);
  if (!servicios) return null;

  return {
    aviso: limitar(t.aviso, 120, 'Consulta aquí nuestros servicios y comunicados.'),
    hero: {
      etiqueta: limitar(t.hero?.etiqueta, 60, 'Institución'),
      titulo: limitar(t.hero?.titulo, 80, 'Al servicio de la comunidad'),
      subtitulo: limitar(t.hero?.subtitulo, 190, ''),
      cta_principal: limitar(t.hero?.cta_principal, 32, 'Conoce lo que hacemos'),
      cta_secundario: limitar(t.hero?.cta_secundario, 24, 'Contáctanos'),
    },
    pilares: exactamente(t.pilares, 3, pilarNormalizado) ?? [],
    servicios_intro: {
      titulo: limitar(t.servicios_intro?.titulo, 60, 'Nuestros servicios'),
      bajada: limitar(t.servicios_intro?.bajada, 130, ''),
    },
    servicios,
    contacto_intro: {
      titulo: limitar(t.contacto_intro?.titulo, 60, 'Estamos para atenderte'),
      bajada: limitar(t.contacto_intro?.bajada, 150, ''),
    },
    ciudad: limitar(t.ciudad, 40, 'Lima, Perú'),
    pie_descripcion: limitar(t.pie_descripcion, 140, ''),
    ...bloquesOpcionales(t, secciones),
  };
}

module.exports = { id: 'institucional', esquema, prompt, normalizar };
