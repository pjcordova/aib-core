// ---------------------------------------------------------------------------
// Plantilla "Restaurante"
// ---------------------------------------------------------------------------
// Diseñada desde cero para AIB+. Portada a sangre con foto, platos de la casa,
// carta por categorías, pedidos por WhatsApp y un bloque para visitar el local.
//
// Precios, horario y dirección son huecos visibles: la IA no los conoce y
// cualquier cifra suya sería inventada. El cliente los completa en «Editar».
// ---------------------------------------------------------------------------

import html from './plantilla.html?raw';
import css from './estilos.css?raw';
import type { PlantillaBase } from '../../lib/plantillas';

export interface Plato {
  nombre: string;
  descripcion: string;
}

/**
 * Lo que la IA escribe para esta plantilla. Esta forma se valida también en el
 * servidor (server/src/plantillas/restaurante.js): si cambia aquí, cambia allí.
 */
export interface TextosRestaurante {
  hero: { etiqueta: string; titulo: string; subtitulo: string; cta_principal: string; cta_secundario: string };
  /** Tres rasgos de la casa, sin cifras ni premios. */
  sellos: { titulo: string; detalle: string }[];
  destacados_intro: { titulo: string; bajada: string };
  destacados: Plato[];
  carta_intro: { titulo: string; bajada: string };
  carta: { nombre: string; platos: Plato[] }[];
  pedido: { titulo: string; bajada: string; cta: string; pasos: { titulo: string; detalle: string }[] };
  visita: { titulo: string; bajada: string };
  ciudad: string;
  pie_descripcion: string;
  // Solo llegan si el cliente pidió esa sección.
  nosotros?: { titulo: string; texto: string; cita: string };
  galeria?: { titulo: string; bajada: string };
  testimonios?: { texto: string; autor: string }[];
  preguntas?: { pregunta: string; respuesta: string }[];
}

/** Textos de muestra: una cocina peruana casera, para enseñar la plantilla sin IA. */
const EJEMPLO: TextosRestaurante = {
  hero: {
    etiqueta: 'Cocina peruana casera',
    titulo: 'Sabores de casa, servidos con cariño',
    subtitulo: 'Recetas de siempre preparadas cada día, para disfrutar en el local o pedir por WhatsApp.',
    cta_principal: 'Ver la carta',
    cta_secundario: 'Pedir por WhatsApp',
  },
  sellos: [
    { titulo: 'Recetas de la casa', detalle: 'Las de siempre, hechas como en familia.' },
    { titulo: 'Cocina del día', detalle: 'Preparamos todo el mismo día.' },
    { titulo: 'Para compartir', detalle: 'Porciones pensadas para la mesa.' },
  ],
  destacados_intro: {
    titulo: 'Los platos que más piden',
    bajada: 'Si es tu primera vez, empieza por aquí.',
  },
  destacados: [
    { nombre: 'Lomo saltado', descripcion: 'Trozos de lomo al wok con cebolla, tomate y papas fritas, con arroz blanco.' },
    { nombre: 'Ceviche clásico', descripcion: 'Pescado del día en leche de tigre, con camote, choclo y cancha.' },
    { nombre: 'Ají de gallina', descripcion: 'Gallina deshilachada en crema de ají amarillo, con papa y arroz.' },
  ],
  carta_intro: {
    titulo: 'Todo lo que preparamos',
    bajada: 'Elige con calma: te ayudamos a armar tu pedido por WhatsApp.',
  },
  carta: [
    {
      nombre: 'Entradas',
      platos: [
        { nombre: 'Causa limeña', descripcion: 'Papa amarilla con ají, rellena de pollo y palta.' },
        { nombre: 'Papa a la huancaína', descripcion: 'Con crema de ají amarillo, huevo y aceituna.' },
        { nombre: 'Tequeños', descripcion: 'Rellenos de queso, con salsa de palta.' },
      ],
    },
    {
      nombre: 'Fondos',
      platos: [
        { nombre: 'Lomo saltado', descripcion: 'Al wok, con papas fritas y arroz.' },
        { nombre: 'Arroz con mariscos', descripcion: 'Arroz meloso con mariscos y salsa criolla.' },
        { nombre: 'Seco de res', descripcion: 'Guiso al culantro con frejoles y arroz.' },
      ],
    },
    {
      nombre: 'Postres',
      platos: [
        { nombre: 'Suspiro limeño', descripcion: 'Manjar blanco con merengue al oporto.' },
        { nombre: 'Mazamorra morada', descripcion: 'Con fruta y un toque de canela.' },
        { nombre: 'Picarones', descripcion: 'Con miel de chancaca.' },
      ],
    },
    {
      nombre: 'Bebidas',
      platos: [
        { nombre: 'Chicha morada', descripcion: 'Hecha en casa, en vaso o en jarra.' },
        { nombre: 'Limonada', descripcion: 'Clásica o frozen.' },
        { nombre: 'Maracuyá', descripcion: 'Refresco natural de la fruta.' },
      ],
    },
  ],
  pedido: {
    titulo: 'Tu pedido, a un mensaje',
    bajada: 'Escríbenos por WhatsApp con lo que se te antoja y coordinamos contigo el resto.',
    cta: 'Hacer mi pedido',
    pasos: [
      { titulo: 'Elige tus platos', detalle: 'Revisa la carta y anota lo que quieres.' },
      { titulo: 'Escríbenos', detalle: 'Mándanos tu pedido por WhatsApp.' },
      { titulo: 'Coordinamos', detalle: 'Te confirmamos el pedido y cómo recibirlo.' },
    ],
  },
  visita: {
    titulo: 'Te esperamos en la mesa',
    bajada: 'Ven con la familia o los amigos: aquí se come como en casa.',
  },
  ciudad: 'Lima, Perú',
  pie_descripcion: 'Cocina peruana casera, preparada cada día para compartir.',
  nosotros: {
    titulo: 'Una cocina con historia familiar',
    texto:
      'Empezamos cocinando para la familia y los vecinos. Hoy abrimos nuestra mesa a todos, con las mismas recetas y el mismo cuidado.',
    cita: 'Cocinamos como si fueras de la familia.',
  },
  galeria: {
    titulo: 'Así se vive nuestra mesa',
    bajada: 'Un vistazo a nuestros platos y a nuestro local.',
  },
  testimonios: [
    { texto: 'El lomo saltado es de los mejores que he probado. Volvemos cada semana.', autor: 'Comensal frecuente' },
    { texto: 'Pedimos por WhatsApp para la oficina y todo salió tal cual lo pedimos.', autor: 'Cliente de la zona' },
    { texto: 'Atención muy amable y porciones generosas. Ideal para ir en familia.', autor: 'Familia que nos visita' },
  ],
  preguntas: [
    { pregunta: '¿Cómo hago un pedido?', respuesta: 'Escríbenos por WhatsApp con los platos que quieres y te confirmamos.' },
    { pregunta: '¿Hacen delivery?', respuesta: 'Consúltanos por WhatsApp y te contamos cómo hacerte llegar tu pedido.' },
    { pregunta: '¿Puedo reservar una mesa?', respuesta: 'Sí, escríbenos con el día, la hora y cuántos serán.' },
    { pregunta: '¿Tienen opciones sin carne?', respuesta: 'Pregúntanos por WhatsApp y te recomendamos las opciones del día.' },
  ],
};

/** Qué secciones que puede pedir el cliente sabe mostrar esta plantilla. */
const SECCIONES = ['nosotros', 'servicios', 'galeria', 'testimonios', 'precios', 'preguntas', 'contacto'];

/** Huecos visibles: dejan claro qué falta completar, no parecen datos reales. */
const PRECIO = '[Precio]';

export const restaurante: PlantillaBase<TextosRestaurante> = {
  id: 'restaurante',
  nombre: 'Restaurante',
  descripcion:
    'Para restaurantes, cafeterías y negocios de comida: carta con precios, pedidos por WhatsApp, horario y ubicación. Cálido y apetitoso.',
  categoria: 'restaurante',
  estilo: 'cercano',
  etiquetas: ['restaurante', 'comida', 'carta', 'menu', 'cevicheria', 'polleria', 'cafeteria', 'delivery', 'whatsapp'],
  // La carta cubre servicios (los platos) y precios (con sus huecos);
  // contacto es el bloque "Visítanos". Nosotros, galería, testimonios y
  // preguntas tienen bloque propio.
  secciones: SECCIONES,
  html,
  css,
  fuentes: [
    'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap',
  ],
  colores: {
    '--color-marca': 'primario',
    '--color-marca-oscuro': 'primario-oscuro',
    '--color-marca-texto': 'primario-texto',
    '--color-acento': 'secundario',
    '--color-acento-oscuro': 'secundario-oscuro',
    '--color-acento-suave': 'secundario-suave',
  },
  paletaOriginal: { primario: '#b5452b', secundario: '#e3a72f' },
  ejemplo: EJEMPLO,
  vista: (t, contexto) => {
    // Sin cliente (catálogo del ingeniero) se enseña todo.
    const pidio = (seccion: string) => !contexto.secciones || contexto.secciones.includes(seccion);
    const nosotros = pidio('nosotros') ? (t.nosotros ?? null) : null;
    const galeria = pidio('galeria') ? (t.galeria ?? null) : null;
    const testimonios = pidio('testimonios') ? (t.testimonios ?? []) : [];
    const preguntas = pidio('preguntas') ? (t.preguntas ?? []) : [];
    const conPrecio = (p: Plato) => ({ ...p, precio: PRECIO });

    return {
      ...contexto,
      whatsapp: '[Tu WhatsApp]',
      horario: '[Tu horario de atención]',
      direccion: '[Tu dirección]',
      hero: t.hero,
      sellos: t.sellos,
      destacados_intro: t.destacados_intro,
      destacados: t.destacados.map(conPrecio),
      carta_intro: t.carta_intro,
      // El índice da a cada categoría un ancla (#carta-1…) para saltar a ella.
      carta: t.carta.map((categoria, i) => ({
        nombre: categoria.nombre,
        indice: i + 1,
        platos: categoria.platos.map(conPrecio),
      })),
      pedido: { ...t.pedido, pasos: t.pedido.pasos.map((paso, i) => ({ ...paso, numero: i + 1 })) },
      visita: t.visita,
      ciudad: t.ciudad,
      pie_descripcion: t.pie_descripcion,
      hay_nosotros: !!nosotros,
      nosotros,
      hay_galeria: !!galeria,
      galeria,
      hay_testimonios: testimonios.length > 0,
      testimonios,
      hay_preguntas: preguntas.length > 0,
      preguntas,
    };
  },
};
