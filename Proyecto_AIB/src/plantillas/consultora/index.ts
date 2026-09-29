// ---------------------------------------------------------------------------
// Plantilla "Consultora profesional"
// ---------------------------------------------------------------------------
// Derivada de la web de BuenVivir (consultora). Conserva su lenguaje visual:
// portada con tarjeta translúcida, píldoras, citas en cursiva y servicios que
// alternan imagen y texto. No conserva nada de su marca ni de su contenido.
// ---------------------------------------------------------------------------

import html from './plantilla.html?raw';
import css from './estilos.css?raw';
import type { PlantillaBase } from '../../lib/plantillas';

export interface ServicioConsultora {
  titulo: string;
  descripcion: string;
  /** Para quién es, en una frase. */
  para_quien: string;
  incluye: string[];
}

/**
 * Lo que la IA escribe para esta plantilla. Esta forma se valida también en el
 * servidor (server/src/plantillas/consultora.js): si cambia aquí, cambia allí.
 */
export interface TextosConsultora {
  hero: {
    etiqueta: string;
    titulo: string;
    titulo_acento: string;
    subtitulo: string;
    cta_principal: string;
    cta_secundario: string;
  };
  propuesta: {
    etiqueta: string;
    titulo: string;
    bajada: string;
    cita: string;
    parrafos: string[];
    pregunta: string;
    cta: string;
  };
  servicios_intro: { etiqueta: string; titulo: string; bajada: string };
  servicios: ServicioConsultora[];
  cierre: { titulo: string; bajada: string; cta: string };
  ciudad: string;
  pie_descripcion: string;
  // Solo llegan si el cliente pidió esa sección.
  nosotros?: { titulo: string; texto: string; cita: string };
  testimonios?: { texto: string; autor: string }[];
  preguntas?: { pregunta: string; respuesta: string }[];
}

/** Textos de muestra: una consultoría genérica, para enseñar la plantilla sin IA. */
const EJEMPLO: TextosConsultora = {
  hero: {
    etiqueta: 'Consultoría para equipos y empresas',
    titulo: 'Ordenamos tu negocio para que',
    titulo_acento: 'crezca con claridad',
    subtitulo: 'Te acompañamos a definir procesos, equipos y metas con un plan que se puede cumplir.',
    cta_principal: 'Agenda una conversación',
    cta_secundario: 'Ver servicios',
  },
  propuesta: {
    etiqueta: 'Cómo trabajamos',
    titulo: 'Primero escuchamos, después proponemos',
    bajada: 'Cada organización es distinta: por eso empezamos entendiendo la tuya.',
    cita: 'Un buen plan es el que tu equipo puede sostener en el día a día.',
    parrafos: [
      'Hacemos un diagnóstico de cómo trabajan hoy tus equipos y dónde se pierde tiempo o energía.',
      'Con eso diseñamos un plan por etapas, con acompañamiento cercano y resultados que se pueden medir.',
    ],
    pregunta: '¿No sabes por dónde empezar?',
    cta: 'Conversemos',
  },
  servicios_intro: {
    etiqueta: 'Servicios',
    titulo: 'Tres formas de acompañarte',
    bajada: 'Elige la que mejor se ajuste al momento de tu organización.',
  },
  servicios: [
    {
      titulo: 'Diagnóstico organizacional',
      descripcion: 'Un mapa claro de cómo funciona hoy tu organización y qué cambiar primero.',
      para_quien: 'Para equipos que sienten que trabajan mucho y avanzan poco.',
      incluye: ['Entrevistas con el equipo', 'Informe de hallazgos', 'Prioridades para los próximos meses'],
    },
    {
      titulo: 'Acompañamiento de equipos',
      descripcion: 'Sesiones periódicas para mejorar la comunicación y la forma de decidir.',
      para_quien: 'Para líderes que quieren un equipo más autónomo y comprometido.',
      incluye: ['Sesiones quincenales', 'Herramientas prácticas', 'Seguimiento de acuerdos'],
    },
    {
      titulo: 'Talleres a medida',
      descripcion: 'Espacios de trabajo intensivos sobre un tema concreto de tu organización.',
      para_quien: 'Para empresas que necesitan resolver un desafío puntual.',
      incluye: ['Diseño del taller', 'Facilitación', 'Resumen con próximos pasos'],
    },
  ],
  cierre: {
    titulo: '¿Conversamos sobre tu organización?',
    bajada: 'Cuéntanos qué te preocupa hoy y te proponemos cómo empezar.',
    cta: 'Agenda una conversación',
  },
  ciudad: 'Lima, Perú',
  pie_descripcion: 'Consultoría cercana para organizaciones que quieren crecer con orden.',
  nosotros: {
    titulo: 'Un equipo que acompaña de cerca',
    texto: 'Somos consultores que trabajamos codo a codo con cada organización. Nos importa que los cambios se sostengan cuando ya no estemos.',
    cita: 'Acompañar es caminar al lado, no delante.',
  },
  testimonios: [
    { texto: 'Nos ayudaron a ordenar el equipo y hoy decidimos mucho más rápido.', autor: 'Gerente de una empresa de servicios' },
    { texto: 'El diagnóstico nos mostró lo que no veíamos. Muy claro y práctico.', autor: 'Directora de una ONG' },
    { texto: 'Los talleres fueron dinámicos y el equipo salió con acuerdos concretos.', autor: 'Líder de un equipo comercial' },
  ],
  preguntas: [
    { pregunta: '¿Cómo empezamos?', respuesta: 'Con una conversación sin costo para entender qué necesita tu organización.' },
    { pregunta: '¿Trabajan con empresas pequeñas?', respuesta: 'Sí. Adaptamos el acompañamiento al tamaño y al momento de cada equipo.' },
    { pregunta: '¿Las sesiones son presenciales?', respuesta: 'Consúltanos: coordinamos la modalidad que mejor funcione para tu equipo.' },
    { pregunta: '¿Cuánto dura un acompañamiento?', respuesta: 'Depende del objetivo. Lo definimos juntos en la primera conversación.' },
  ],
};

/** Qué secciones que puede pedir el cliente sabe mostrar esta plantilla. */
const SECCIONES = ['nosotros', 'servicios', 'testimonios', 'preguntas', 'contacto'];

export const consultora: PlantillaBase<TextosConsultora> = {
  id: 'consultora',
  nombre: 'Consultora profesional',
  descripcion:
    'Para consultoras, asesores y servicios profesionales: propuesta de valor, servicios detallados y contacto. Sereno y cercano.',
  categoria: 'servicios-profesionales',
  estilo: 'corporativo',
  etiquetas: ['consultoria', 'asesoria', 'coaching', 'servicios', 'profesional', 'empresas', 'equipos', 'capacitacion'],
  // Servicios es el bloque central; contacto, el cierre. Nosotros,
  // testimonios y preguntas tienen bloque propio.
  secciones: SECCIONES,
  html,
  css,
  fuentes: [
    'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=Work+Sans:wght@400;500;600&display=swap',
  ],
  colores: {
    '--color-marca': 'primario',
    '--color-marca-oscuro': 'primario-oscuro',
    '--color-acento': 'secundario',
    '--color-acento-oscuro': 'secundario-oscuro',
    '--color-acento-suave': 'secundario-suave',
  },
  paletaOriginal: { primario: '#27a47e', secundario: '#cf9f3d' },
  ejemplo: EJEMPLO,
  vista: (t, contexto) => {
    // Sin cliente (catálogo del ingeniero) se enseña todo.
    const pidio = (seccion: string) => !contexto.secciones || contexto.secciones.includes(seccion);
    const nosotros = pidio('nosotros') ? (t.nosotros ?? null) : null;
    const testimonios = pidio('testimonios') ? (t.testimonios ?? []) : [];
    const preguntas = pidio('preguntas') ? (t.preguntas ?? []) : [];

    return {
      ...contexto,
      // Huecos visibles, no datos que parezcan reales.
      whatsapp: '[Tu WhatsApp]',
      correo: '[Tu correo]',
      hero: t.hero,
      propuesta: {
        ...t.propuesta,
        parrafo_1: t.propuesta.parrafos[0] ?? '',
        parrafo_2: t.propuesta.parrafos[1] ?? '',
      },
      servicios_intro: t.servicios_intro,
      // La imagen alterna de lado para que la lectura no sea monótona.
      servicios: t.servicios.map((s, i) => ({
        ...s,
        incluye: s.incluye.map((texto) => ({ texto })),
        orden_imagen: i % 2 === 1 ? 'md:order-2' : '',
      })),
      cierre: t.cierre,
      ciudad: t.ciudad,
      pie_descripcion: t.pie_descripcion,
      hay_nosotros: !!nosotros,
      nosotros,
      hay_testimonios: testimonios.length > 0,
      testimonios,
      hay_preguntas: preguntas.length > 0,
      preguntas,
    };
  },
};
