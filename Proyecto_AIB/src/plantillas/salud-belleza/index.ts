// ---------------------------------------------------------------------------
// Plantilla "Salud y belleza"
// ---------------------------------------------------------------------------
// Diseñada desde cero para AIB+ para spas, salones, barberías, estética y
// consultorios. Servicios con precio y duración, reservas por WhatsApp y el
// equipo.
//
// Precios, duraciones, nombres del equipo, horario y dirección son huecos
// visibles: la IA no los conoce y cualquier dato suyo sería inventado. El
// cliente los completa en «Editar».
// ---------------------------------------------------------------------------

import html from './plantilla.html?raw';
import css from './estilos.css?raw';
import type { PlantillaBase } from '../../lib/plantillas';

/**
 * Iconos que la IA puede elegir para cada servicio y cada beneficio. Son fijos
 * y se insertan como HTML: la IA solo manda el nombre, nunca el SVG. La lista
 * de nombres se repite en el servidor (server/src/plantillas/salud-belleza.js).
 */
const trazo = (cuerpo: string) =>
  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${cuerpo}</svg>`;

export const ICONOS = {
  tijeras: trazo(
    '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>'
  ),
  rostro: trazo(
    '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>'
  ),
  manos: trazo(
    '<path d="M18 11V6a2 2 0 0 0-4 0"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>'
  ),
  hojas: trazo(
    '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>'
  ),
  gota: trazo('<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>'),
  corazon: trazo(
    '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>'
  ),
  brillo: trazo(
    '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/>'
  ),
  salud: trazo(
    '<path d="M11 2v2"/><path d="M5 2v2"/><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/>'
  ),
  energia: trazo(
    '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>'
  ),
  calendario: trazo(
    '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>'
  ),
  escudo: trazo(
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'
  ),
};

export type Icono = keyof typeof ICONOS;

/** Solo nombres de la lista: lo que no esté en ella, nunca llega al HTML. */
const iconoDe = (nombre: string) => (Object.hasOwn(ICONOS, nombre) ? ICONOS[nombre as Icono] : ICONOS.brillo);

export interface ServicioSalud {
  icono: Icono;
  nombre: string;
  descripcion: string;
}

/**
 * Lo que la IA escribe para esta plantilla. Esta forma se valida también en el
 * servidor (server/src/plantillas/salud-belleza.js): si cambia aquí, cambia allí.
 */
export interface TextosSaludBelleza {
  hero: {
    etiqueta: string;
    titulo: string;
    titulo_acento: string;
    subtitulo: string;
    cta_principal: string;
    cta_secundario: string;
  };
  beneficios: { icono: Icono; titulo: string; detalle: string }[];
  servicios_intro: { titulo: string; bajada: string };
  servicios: ServicioSalud[];
  reserva: { titulo: string; bajada: string; cta: string; pasos: { titulo: string; detalle: string }[] };
  ciudad: string;
  pie_descripcion: string;
  // Solo llegan si el cliente pidió esa sección.
  nosotros?: { titulo: string; texto: string; equipo: { rol: string; detalle: string }[] };
  galeria?: { titulo: string; bajada: string };
  testimonios?: { texto: string; autor: string }[];
  preguntas?: { pregunta: string; respuesta: string }[];
}

/** Textos de muestra: un spa y centro de estética, para enseñar la plantilla sin IA. */
const EJEMPLO: TextosSaludBelleza = {
  hero: {
    etiqueta: 'Spa y centro de estética',
    titulo: 'Un momento para ti,',
    titulo_acento: 'sin apuros',
    subtitulo: 'Tratamientos faciales, corporales y de relajación en un espacio tranquilo, con atención personalizada.',
    cta_principal: 'Reservar mi cita',
    cta_secundario: 'Ver servicios',
  },
  beneficios: [
    { icono: 'corazon', titulo: 'Atención personalizada', detalle: 'Cada tratamiento se adapta a lo que necesitas.' },
    { icono: 'hojas', titulo: 'Espacio tranquilo', detalle: 'Un lugar pensado para desconectarte.' },
    { icono: 'calendario', titulo: 'Reserva fácil', detalle: 'Agenda tu cita con un mensaje.' },
  ],
  servicios_intro: {
    titulo: 'Elige tu próximo momento',
    bajada: 'Cuéntanos qué buscas y te recomendamos el tratamiento ideal.',
  },
  servicios: [
    { icono: 'rostro', nombre: 'Limpieza facial', descripcion: 'Limpieza profunda, exfoliación e hidratación según tu tipo de piel.' },
    { icono: 'manos', nombre: 'Masaje relajante', descripcion: 'Masaje de cuerpo completo para liberar tensiones y descansar.' },
    { icono: 'gota', nombre: 'Hidratación profunda', descripcion: 'Tratamiento facial que devuelve luminosidad y suavidad a la piel.' },
    { icono: 'hojas', nombre: 'Aromaterapia', descripcion: 'Aceites esenciales y técnicas suaves para relajar cuerpo y mente.' },
    { icono: 'brillo', nombre: 'Manicure y pedicure', descripcion: 'Cuidado completo de manos y pies, con esmaltado a tu elección.' },
    { icono: 'energia', nombre: 'Masaje descontracturante', descripcion: 'Presión focalizada en espalda y cuello para aliviar contracturas.' },
  ],
  reserva: {
    titulo: 'Reserva tu cita en tres pasos',
    bajada: 'Escríbenos por WhatsApp y coordinamos contigo el día y la hora.',
    cta: 'Reservar por WhatsApp',
    pasos: [
      { titulo: 'Elige tu servicio', detalle: 'Revisa los tratamientos y elige el que quieres.' },
      { titulo: 'Escríbenos', detalle: 'Mándanos un mensaje con el día que prefieres.' },
      { titulo: 'Confirmamos tu cita', detalle: 'Te respondemos con la hora disponible.' },
    ],
  },
  ciudad: 'Lima, Perú',
  pie_descripcion: 'Tratamientos de belleza y relajación con atención personalizada.',
  nosotros: {
    titulo: 'Manos expertas que te cuidan',
    texto: 'Somos un equipo que disfruta cuidar de cada persona que nos visita, con calma y atención a los detalles.',
    equipo: [
      { rol: 'Cosmetóloga', detalle: 'Se encarga de los tratamientos faciales.' },
      { rol: 'Masoterapeuta', detalle: 'Masajes de relajación y descontracturantes.' },
      { rol: 'Manicurista', detalle: 'Cuidado de manos y pies.' },
    ],
  },
  galeria: {
    titulo: 'Conoce nuestro espacio',
    bajada: 'Un lugar pensado para que te relajes desde que llegas.',
  },
  testimonios: [
    { texto: 'Salí renovada. La atención fue muy cálida y el lugar es súper tranquilo.', autor: 'Clienta frecuente' },
    { texto: 'El masaje descontracturante me ayudó muchísimo con la tensión de la espalda.', autor: 'Cliente nuevo' },
    { texto: 'Reservé por WhatsApp en un par de mensajes. Muy fácil y puntuales.', autor: 'Clienta de la zona' },
  ],
  preguntas: [
    { pregunta: '¿Cómo reservo una cita?', respuesta: 'Escríbenos por WhatsApp con el servicio y el día que prefieres.' },
    { pregunta: '¿Puedo ir sin cita?', respuesta: 'Te recomendamos reservar. Escríbenos y te decimos si hay espacio ese día.' },
    { pregunta: '¿Qué tratamiento me conviene?', respuesta: 'Cuéntanos qué buscas y te orientamos antes de reservar.' },
    { pregunta: '¿Cómo puedo pagar?', respuesta: 'Consúltanos por WhatsApp y te contamos los medios de pago.' },
  ],
};

/** Qué secciones que puede pedir el cliente sabe mostrar esta plantilla. */
const SECCIONES = ['nosotros', 'servicios', 'galeria', 'testimonios', 'precios', 'preguntas', 'contacto'];

/** Huecos visibles: dejan claro qué falta completar, no parecen datos reales. */
const PRECIO = '[Precio]';
const DURACION = '[Duración]';

export const saludBelleza: PlantillaBase<TextosSaludBelleza> = {
  id: 'salud-belleza',
  nombre: 'Salud y belleza',
  descripcion:
    'Para spas, salones, barberías, estética y consultorios: servicios con precio y duración, reservas por WhatsApp y el equipo. Limpio y sereno.',
  categoria: 'salud-bienestar',
  estilo: 'moderno',
  etiquetas: ['spa', 'estetica', 'belleza', 'barberia', 'salon', 'peluqueria', 'masajes', 'consultorio', 'bienestar', 'citas'],
  // Servicios lleva precio y duración (cubre precios); nosotros es el bloque
  // del equipo y contacto, el de reservas. Galería, testimonios y preguntas
  // tienen bloque propio.
  secciones: SECCIONES,
  html,
  css,
  fuentes: [
    'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700&display=swap',
  ],
  colores: {
    '--color-marca': 'primario',
    '--color-marca-oscuro': 'primario-oscuro',
    '--color-marca-texto': 'primario-texto',
    '--color-acento': 'secundario',
    '--color-acento-oscuro': 'secundario-oscuro',
    '--color-acento-suave': 'secundario-suave',
  },
  paletaOriginal: { primario: '#3f6f63', secundario: '#e6a893' },
  ejemplo: EJEMPLO,
  vista: (t, contexto) => {
    // Sin cliente (catálogo del ingeniero) se enseña todo.
    const pidio = (seccion: string) => !contexto.secciones || contexto.secciones.includes(seccion);
    const nosotros = pidio('nosotros') ? (t.nosotros ?? null) : null;
    const galeria = pidio('galeria') ? (t.galeria ?? null) : null;
    const testimonios = pidio('testimonios') ? (t.testimonios ?? []) : [];
    const preguntas = pidio('preguntas') ? (t.preguntas ?? []) : [];

    return {
      ...contexto,
      whatsapp: '[Tu WhatsApp]',
      horario: '[Tu horario de atención]',
      direccion: '[Tu dirección]',
      hero: t.hero,
      beneficios: t.beneficios.map((b) => ({ ...b, icono: iconoDe(b.icono) })),
      servicios_intro: t.servicios_intro,
      servicios: t.servicios.map((s) => ({ ...s, icono: iconoDe(s.icono), precio: PRECIO, duracion: DURACION })),
      reserva: { ...t.reserva, pasos: t.reserva.pasos.map((paso, i) => ({ ...paso, numero: i + 1 })) },
      ciudad: t.ciudad,
      pie_descripcion: t.pie_descripcion,
      hay_equipo: !!nosotros,
      nosotros,
      equipo: (nosotros?.equipo ?? []).map((m) => ({ ...m, nombre: '[Nombre]' })),
      hay_galeria: !!galeria,
      galeria,
      hay_testimonios: testimonios.length > 0,
      testimonios,
      hay_preguntas: preguntas.length > 0,
      preguntas,
    };
  },
};
