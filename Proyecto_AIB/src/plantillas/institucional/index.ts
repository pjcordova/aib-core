// ---------------------------------------------------------------------------
// Plantilla "Institucional"
// ---------------------------------------------------------------------------
// Diseñada desde cero para AIB+ para instituciones, ONG, colegios, entidades
// públicas y profesionales que quieren informar y darse a conocer, no vender.
// Nació del primer feedback de un usuario real: todas las plantillas
// empujaban a vender o a pedir por WhatsApp.
//
// Horario, dirección, teléfono, correo y fechas son huecos visibles: la IA no
// los conoce y cualquier dato suyo sería inventado.
// ---------------------------------------------------------------------------

import html from './plantilla.html?raw';
import css from './estilos.css?raw';
import type { PlantillaBase } from '../../lib/plantillas';

/**
 * Iconos que la IA puede elegir para cada pilar y cada servicio. Son fijos y
 * se insertan como HTML: la IA solo manda el nombre. La lista se repite en el
 * servidor (server/src/plantillas/institucional.js).
 */
const trazo = (cuerpo: string) =>
  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${cuerpo}</svg>`;

export const ICONOS_INSTITUCIONAL = {
  documento: trazo(
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>'
  ),
  personas: trazo(
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
  ),
  edificio: trazo(
    '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>'
  ),
  informacion: trazo('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
  calendario: trazo('<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>'),
  escudo: trazo(
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'
  ),
  mundo: trazo('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>'),
  libro: trazo(
    '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>'
  ),
  educacion: trazo(
    '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>'
  ),
  grafico: trazo('<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>'),
  corazon: trazo(
    '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>'
  ),
  hojas: trazo(
    '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>'
  ),
  mensaje: trazo('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>'),
};

export type IconoInstitucional = keyof typeof ICONOS_INSTITUCIONAL;

/** Solo nombres de la lista: lo que no esté en ella, nunca llega al HTML. */
const iconoDe = (nombre: string) =>
  Object.hasOwn(ICONOS_INSTITUCIONAL, nombre)
    ? ICONOS_INSTITUCIONAL[nombre as IconoInstitucional]
    : ICONOS_INSTITUCIONAL.informacion;

/**
 * Lo que la IA escribe para esta plantilla. Esta forma se valida también en el
 * servidor (server/src/plantillas/institucional.js): si cambia aquí, cambia allí.
 */
export interface TextosInstitucional {
  /** Mensaje destacado de la franja de arriba. */
  aviso: string;
  hero: { etiqueta: string; titulo: string; subtitulo: string; cta_principal: string; cta_secundario: string };
  pilares: { icono: IconoInstitucional; titulo: string; detalle: string }[];
  servicios_intro: { titulo: string; bajada: string };
  servicios: { icono: IconoInstitucional; nombre: string; descripcion: string; dirigido_a: string }[];
  contacto_intro: { titulo: string; bajada: string };
  ciudad: string;
  pie_descripcion: string;
  // Solo llegan si el cliente pidió esa sección.
  nosotros?: { titulo: string; mision: string; vision: string };
  noticias?: { bajada: string; entradas: { tipo: 'Comunicado' | 'Noticia' | 'Evento'; titulo: string; resumen: string }[] };
  documentos?: { bajada: string; lista: { nombre: string; descripcion: string }[] };
  galeria?: { titulo: string; bajada: string };
  preguntas?: { pregunta: string; respuesta: string }[];
}

/** Textos de muestra: una asociación comunitaria, para enseñar la plantilla sin IA. */
const EJEMPLO: TextosInstitucional = {
  aviso: 'Consulta aquí nuestros servicios, comunicados y documentos.',
  hero: {
    etiqueta: 'Asociación sin fines de lucro',
    titulo: 'Trabajamos por el desarrollo de nuestra comunidad',
    subtitulo: 'Acompañamos a familias y jóvenes con programas de formación, orientación y apoyo social.',
    cta_principal: 'Conoce lo que hacemos',
    cta_secundario: 'Contáctanos',
  },
  pilares: [
    { icono: 'corazon', titulo: 'Compromiso social', detalle: 'Cada programa nace de una necesidad real de la comunidad.' },
    { icono: 'escudo', titulo: 'Transparencia', detalle: 'Informamos con claridad lo que hacemos y cómo lo hacemos.' },
    { icono: 'personas', titulo: 'Cercanía', detalle: 'Escuchamos y trabajamos junto a las personas.' },
  ],
  servicios_intro: {
    titulo: 'Programas y servicios',
    bajada: 'Conoce lo que ofrecemos y a quién va dirigido cada programa.',
  },
  servicios: [
    { icono: 'educacion', nombre: 'Talleres de formación', descripcion: 'Capacitaciones prácticas en oficios y habilidades digitales.', dirigido_a: 'Jóvenes y adultos de la comunidad' },
    { icono: 'personas', nombre: 'Orientación familiar', descripcion: 'Acompañamiento a familias en temas de convivencia y crianza.', dirigido_a: 'Madres, padres y cuidadores' },
    { icono: 'libro', nombre: 'Biblioteca comunitaria', descripcion: 'Espacio de lectura y apoyo escolar para niñas y niños.', dirigido_a: 'Estudiantes de primaria y secundaria' },
    { icono: 'hojas', nombre: 'Cuidado del entorno', descripcion: 'Campañas de limpieza, reciclaje y áreas verdes.', dirigido_a: 'Vecinos y voluntarios' },
    { icono: 'corazon', nombre: 'Apoyo social', descripcion: 'Orientación para acceder a programas y beneficios públicos.', dirigido_a: 'Familias en situación vulnerable' },
    { icono: 'mensaje', nombre: 'Voluntariado', descripcion: 'Súmate como voluntario y participa en nuestras actividades.', dirigido_a: 'Personas que quieren ayudar' },
  ],
  contacto_intro: {
    titulo: 'Estamos para atenderte',
    bajada: 'Escríbenos o visítanos en nuestro horario de atención.',
  },
  ciudad: 'Lima, Perú',
  pie_descripcion: 'Asociación que trabaja por el desarrollo y el bienestar de la comunidad.',
  nosotros: {
    titulo: 'Una organización al servicio de la comunidad',
    mision: 'Mejorar la calidad de vida de las familias de la comunidad a través de programas de formación, orientación y apoyo social.',
    vision: 'Ser una organización de referencia en el desarrollo comunitario, cercana y transparente.',
  },
  noticias: {
    bajada: 'Mantente al día con nuestras actividades y comunicados.',
    entradas: [
      { tipo: 'Comunicado', titulo: 'Inscripciones abiertas para los talleres', resumen: 'Conoce los requisitos y cómo inscribirte en los próximos talleres de formación.' },
      { tipo: 'Evento', titulo: 'Jornada de limpieza comunitaria', resumen: 'Te invitamos a participar con tu familia en la próxima jornada en el parque.' },
      { tipo: 'Noticia', titulo: 'Inauguramos la biblioteca comunitaria', resumen: 'Un nuevo espacio de lectura y apoyo escolar abierto para todos.' },
    ],
  },
  documentos: {
    bajada: 'Descarga los documentos que más nos piden.',
    lista: [
      { nombre: 'Estatuto de la asociación', descripcion: 'Quiénes somos y cómo nos organizamos.' },
      { nombre: 'Memoria anual', descripcion: 'Resumen de las actividades del año.' },
      { nombre: 'Requisitos de inscripción', descripcion: 'Lo que necesitas para participar en los programas.' },
      { nombre: 'Formulario de voluntariado', descripcion: 'Para sumarte como voluntario.' },
    ],
  },
  galeria: {
    titulo: 'Nuestras actividades',
    bajada: 'Algunos momentos de nuestro trabajo con la comunidad.',
  },
  preguntas: [
    { pregunta: '¿Cómo me inscribo en un programa?', respuesta: 'Escríbenos o acércate en nuestro horario de atención y te orientamos.' },
    { pregunta: '¿Los programas tienen costo?', respuesta: 'Consúltanos: cada programa tiene sus propias condiciones.' },
    { pregunta: '¿Puedo ser voluntario?', respuesta: 'Sí. Descarga el formulario de voluntariado o escríbenos.' },
    { pregunta: '¿Dónde están ubicados?', respuesta: 'Encuentra nuestra dirección y horario en la sección de atención al público.' },
  ],
};

/** Qué secciones que puede pedir el cliente sabe mostrar esta plantilla. */
const SECCIONES = ['nosotros', 'servicios', 'blog', 'documentos', 'galeria', 'preguntas', 'contacto'];

export const institucional: PlantillaBase<TextosInstitucional> = {
  id: 'institucional',
  nombre: 'Institucional',
  descripcion:
    'Para instituciones, ONG, colegios y entidades que quieren informar: servicios, comunicados, documentos para descargar y atención al público. Sobrio y confiable.',
  categoria: 'institucion',
  estilo: 'corporativo',
  etiquetas: ['institucion', 'ong', 'asociacion', 'municipalidad', 'colegio', 'entidad', 'comunidad', 'informacion'],
  // Servicios es el bloque central; blog son las noticias y contacto la
  // atención al público. Nosotros, documentos, galería y preguntas tienen
  // bloque propio.
  secciones: SECCIONES,
  html,
  css,
  fuentes: ['https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&display=swap'],
  colores: {
    '--color-marca': 'primario',
    '--color-marca-oscuro': 'primario-oscuro',
    '--color-marca-texto': 'primario-texto',
    '--color-acento': 'secundario',
    '--color-acento-oscuro': 'secundario-oscuro',
    '--color-acento-suave': 'secundario-suave',
  },
  paletaOriginal: { primario: '#1f4e8c', secundario: '#e9a21b' },
  ejemplo: EJEMPLO,
  vista: (t, contexto) => {
    // Sin cliente (catálogo del ingeniero) se enseña todo.
    const pidio = (seccion: string) => !contexto.secciones || contexto.secciones.includes(seccion);
    const nosotros = pidio('nosotros') ? (t.nosotros ?? null) : null;
    const noticias = pidio('blog') ? (t.noticias ?? null) : null;
    const documentos = pidio('documentos') ? (t.documentos ?? null) : null;
    const galeria = pidio('galeria') ? (t.galeria ?? null) : null;
    const preguntas = pidio('preguntas') ? (t.preguntas ?? []) : [];

    return {
      ...contexto,
      // Huecos visibles, no datos que parezcan reales.
      horario: '[Tu horario de atención]',
      direccion: '[Tu dirección]',
      telefono: '[Tu teléfono]',
      correo: '[Tu correo]',
      aviso: t.aviso,
      hero: t.hero,
      pilares: t.pilares.map((p) => ({ ...p, icono: iconoDe(p.icono) })),
      servicios_intro: t.servicios_intro,
      servicios: t.servicios.map((s) => ({ ...s, icono: iconoDe(s.icono) })),
      contacto_intro: t.contacto_intro,
      ciudad: t.ciudad,
      pie_descripcion: t.pie_descripcion,
      hay_nosotros: !!nosotros,
      nosotros,
      hay_noticias: !!noticias,
      noticias_bajada: noticias?.bajada ?? '',
      noticias: (noticias?.entradas ?? []).map((n) => ({ ...n, fecha: '[Fecha]' })),
      hay_documentos: !!documentos,
      documentos_bajada: documentos?.bajada ?? '',
      documentos: documentos?.lista ?? [],
      hay_galeria: !!galeria,
      galeria,
      hay_preguntas: preguntas.length > 0,
      preguntas,
    };
  },
};
