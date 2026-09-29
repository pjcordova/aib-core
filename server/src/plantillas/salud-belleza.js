// ---------------------------------------------------------------------------
// Plantilla "Salud y belleza" — lado servidor
// ---------------------------------------------------------------------------
// El HTML vive en el frontend (Proyecto_AIB/src/plantillas/salud-belleza).
// Aquí está lo que el servidor necesita para pedirle los textos a la IA: la
// forma exacta de la respuesta, el prompt y la normalización.
//
// No se piden precios, duraciones, nombres del equipo, horarios ni
// direcciones: la plantilla los deja como huecos visibles que completa el
// cliente.
//
// La forma debe coincidir con TextosSaludBelleza del frontend.
// ---------------------------------------------------------------------------

const {
  texto,
  objeto,
  limitar,
  exactamente,
  testimoniosNormalizados,
  preguntasNormalizadas,
} = require('./comun');

/** Los mismos nombres que ICONOS en el frontend. */
const ICONOS = ['tijeras', 'rostro', 'manos', 'hojas', 'gota', 'corazon', 'brillo', 'salud', 'energia', 'calendario', 'escudo'];

const icono = {
  type: 'string',
  enum: ICONOS,
  description:
    'Icono que mejor lo representa: tijeras (corte, barbería), rostro (facial), manos (masajes, manicure), hojas (natural, relajación), gota (hidratación, depilación), corazon (cuidado), brillo (belleza, uñas), salud (consulta médica o dental), energia (terapia física, entrenamiento), calendario (citas), escudo (seguridad, higiene)',
};

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
    etiqueta: texto('Tipo de negocio, 2 a 5 palabras, como "Barbería en Miraflores"'),
    titulo: texto('Primera parte del titular, máximo 6 palabras'),
    titulo_acento: texto('Final del titular, que se destaca en cursiva, máximo 4 palabras'),
    subtitulo: texto('Frase de apoyo, máximo 22 palabras'),
    cta_principal: texto('Botón para reservar cita, 2 a 4 palabras'),
    cta_secundario: texto('Botón que lleva a los servicios, 2 a 3 palabras'),
  }),
  beneficios: {
    type: 'array',
    items: objeto({
      icono,
      titulo: texto('2 a 4 palabras'),
      detalle: texto('Máximo 10 palabras'),
    }),
    description: 'Exactamente 3 razones para elegir este negocio, sin cifras, años ni títulos',
  },
  servicios_intro: objeto({
    titulo: texto('Máximo 7 palabras'),
    bajada: texto('Máximo 16 palabras'),
  }),
  servicios: {
    type: 'array',
    items: objeto({
      icono,
      nombre: texto('Nombre del servicio, 1 a 4 palabras'),
      descripcion: texto('Qué incluye o qué logra, máximo 18 palabras, sin precio ni duración'),
    }),
    description: 'Exactamente 6 servicios que ofrece este negocio',
  },
  reserva: objeto({
    titulo: texto('Invitación a reservar, máximo 7 palabras'),
    bajada: texto('Máximo 20 palabras'),
    cta: texto('Botón para reservar por WhatsApp, 2 a 4 palabras'),
    pasos: { type: 'array', items: paso, description: 'Exactamente 3 pasos para reservar' },
  }),
  ciudad: texto('Ciudad y país si el negocio lo dijo; si no, "Lima, Perú"'),
  pie_descripcion: texto('Descripción del negocio para el pie de página, máximo 16 palabras'),
};

/** Bloques que solo aparecen si el cliente pidió esa sección. */
const BLOQUES_OPCIONALES = {
  nosotros: objeto({
    titulo: texto('Título del bloque del equipo, máximo 7 palabras'),
    texto: texto('Quiénes son, con lo que contó el negocio; máximo 35 palabras, sin inventar años, títulos ni certificaciones'),
    equipo: {
      type: 'array',
      items: objeto({
        rol: texto('Rol típico en este negocio, 1 a 3 palabras, como "Estilista"; nunca un nombre de persona'),
        detalle: texto('De qué se encarga, máximo 10 palabras'),
      }),
      description: 'Exactamente 3',
    },
  }),
  galeria: objeto({
    titulo: texto('Título de la galería de fotos, máximo 7 palabras'),
    bajada: texto('Máximo 14 palabras'),
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
      pregunta: texto('Duda típica antes de reservar, máximo 12 palabras'),
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
  nosotros:
    '- nosotros: el equipo. Un texto breve y tres roles típicos del negocio; los nombres los pone el negocio. Sin inventar años, títulos ni certificaciones.',
  galeria: '- galeria: solo el título y la bajada; las fotos las pone el negocio.',
  testimonios: '- testimonios: opiniones de ejemplo, firmadas con el tipo de cliente, nunca con nombres.',
  preguntas:
    '- preguntas: dudas típicas antes de reservar. Si no se sabe la respuesta (precios, medios de pago, duración), invita a consultarlo por WhatsApp en vez de prometer.',
};

function prompt({ empresa, rubro, estilo, secciones = [] }) {
  const bloques = Object.keys(BLOQUES_OPCIONALES)
    .filter((seccion) => secciones.includes(seccion))
    .map((seccion) => INSTRUCCIONES_BLOQUE[seccion]);

  return `
Eres redactor de webs de negocios de salud, belleza y bienestar. Escribe los
textos de la página de inicio de este negocio, que usa una plantilla ya
diseñada: portada, tres razones para elegirlo, seis servicios y reservas por
WhatsApp.

NEGOCIO: ${empresa}
A QUÉ SE DEDICA: ${rubro}
ESTILO QUE BUSCA: ${estilo}
${bloques.length ? `\nSECCIONES EXTRA QUE PIDIÓ EL NEGOCIO\n${bloques.join('\n')}\n` : ''}
REGLAS
- Todo en español de Perú, cálido, claro y breve. Respeta los límites de
  palabras.
- Los servicios tienen que ser los que ofrece ESTE negocio. Si nombró menos de
  seis, completa con los típicos de su rubro, sin salirte de él (una barbería
  no ofrece limpiezas faciales de spa si no lo dijo).
- Nunca escribas precios, duraciones, horarios, direcciones, teléfonos ni
  nombres de personas: la página ya tiene huecos para eso que completa el
  propio negocio.
- No prometas resultados de salud ni estéticos ("elimina", "cura",
  "garantizado", "resultados permanentes"), ni inventes años de experiencia,
  títulos, colegiaturas o certificaciones.
- No prometas tiempos de respuesta ni de atención ("en minutos", "al toque",
  "sin esperas"): el negocio no los ha fijado.
`.trim();
}

/* -------------------------------------------------------------------------- */

const iconoValido = (valor) => (ICONOS.includes(valor) ? valor : 'brillo');

function servicioNormalizado(s) {
  const nombre = limitar(s?.nombre, 45, '');
  return nombre ? { icono: iconoValido(s?.icono), nombre, descripcion: limitar(s?.descripcion, 150, '') } : null;
}

function beneficioNormalizado(b) {
  const titulo = limitar(b?.titulo, 40, '');
  return titulo ? { icono: iconoValido(b?.icono), titulo, detalle: limitar(b?.detalle, 90, '') } : null;
}

const pasoNormalizado = (p) => {
  const titulo = limitar(p?.titulo, 40, '');
  return titulo ? { titulo, detalle: limitar(p?.detalle, 100, '') } : null;
};

/** Los bloques opcionales, solo si se pidieron y llegaron con contenido. */
function bloquesOpcionales(t, secciones) {
  const extra = {};

  if (secciones.includes('nosotros')) {
    const equipo = exactamente(t.nosotros?.equipo, 3, (m) => {
      const rol = limitar(m?.rol, 40, '');
      return rol ? { rol, detalle: limitar(m?.detalle, 90, '') } : null;
    });
    if (equipo) {
      extra.nosotros = {
        titulo: limitar(t.nosotros?.titulo, 60, 'Nuestro equipo'),
        texto: limitar(t.nosotros?.texto, 260, ''),
        equipo,
      };
    }
  }

  if (secciones.includes('galeria')) {
    extra.galeria = {
      titulo: limitar(t.galeria?.titulo, 60, 'Conoce nuestro espacio'),
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
 * algo imprescindible (los servicios).
 */
function normalizar(t, secciones = []) {
  if (!t || typeof t !== 'object') return null;

  const servicios = exactamente(t.servicios, 6, servicioNormalizado);
  if (!servicios) return null;

  const beneficios = exactamente(t.beneficios, 3, beneficioNormalizado) ?? [];
  const pasos = exactamente(t.reserva?.pasos, 3, pasoNormalizado) ?? [
    { titulo: 'Elige tu servicio', detalle: 'Revisa los servicios.' },
    { titulo: 'Escríbenos', detalle: 'Mándanos un mensaje por WhatsApp.' },
    { titulo: 'Confirmamos tu cita', detalle: 'Te respondemos con la hora.' },
  ];

  return {
    hero: {
      etiqueta: limitar(t.hero?.etiqueta, 50, 'Salud y belleza'),
      titulo: limitar(t.hero?.titulo, 60, 'Un momento para ti'),
      titulo_acento: limitar(t.hero?.titulo_acento, 40, ''),
      subtitulo: limitar(t.hero?.subtitulo, 180, ''),
      cta_principal: limitar(t.hero?.cta_principal, 30, 'Reservar cita'),
      cta_secundario: limitar(t.hero?.cta_secundario, 30, 'Ver servicios'),
    },
    beneficios,
    servicios_intro: {
      titulo: limitar(t.servicios_intro?.titulo, 60, 'Nuestros servicios'),
      bajada: limitar(t.servicios_intro?.bajada, 130, ''),
    },
    servicios,
    reserva: {
      titulo: limitar(t.reserva?.titulo, 60, 'Reserva tu cita'),
      bajada: limitar(t.reserva?.bajada, 170, ''),
      cta: limitar(t.reserva?.cta, 30, 'Reservar por WhatsApp'),
      pasos,
    },
    ciudad: limitar(t.ciudad, 40, 'Lima, Perú'),
    pie_descripcion: limitar(t.pie_descripcion, 140, ''),
    ...bloquesOpcionales(t, secciones),
  };
}

module.exports = { id: 'salud-belleza', esquema, prompt, normalizar };
