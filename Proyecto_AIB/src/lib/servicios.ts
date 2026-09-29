// ---------------------------------------------------------------------------
// Catálogo de servicios y preguntas por módulo
// ---------------------------------------------------------------------------
// Todo lo que el cliente ve al contar su proyecto sale de aquí: qué servicios
// se ofrecen, qué preguntas tiene cada uno y con qué opciones. Añadir un
// servicio o cambiar una pregunta es editar este archivo, no los componentes.
//
// Hoy solo el módulo web tiene su propio cuestionario. ERP y Automatización
// siguen con el discovery guiado por IA hasta que tengan el suyo.
// ---------------------------------------------------------------------------

export type TipoServicio = 'web' | 'erp' | 'automatizacion';

/** `modulo`: preguntas fijas de este archivo. `ia`: discovery generado por IA. */
export type FlujoServicio = 'modulo' | 'ia';

export interface Servicio {
  id: TipoServicio;
  nombre: string;
  descripcion: string;
  icono: string;
  flujo: FlujoServicio;
  /** Ejemplos que se proponen al describir la idea (solo flujo `ia`). */
  ejemplos: string[];
}

export const SERVICIOS: Servicio[] = [
  {
    id: 'web',
    nombre: 'Página web',
    descripcion: 'Tu web corporativa, landing o tienda: te enseñamos cómo se vería.',
    icono: '🌐',
    flujo: 'modulo',
    ejemplos: [],
  },
  {
    id: 'erp',
    nombre: 'ERP',
    descripcion: 'Un sistema para ordenar ventas, inventario, facturación o personal.',
    icono: '📊',
    flujo: 'ia',
    ejemplos: [
      'Un ERP para restaurantes con facturación e inventario',
      'Control de almacén y compras para una distribuidora',
      'Gestión de planillas y asistencia del personal',
    ],
  },
  {
    id: 'automatizacion',
    nombre: 'Automatización',
    descripcion: 'Que las tareas repetitivas se hagan solas: reportes, correos, datos.',
    icono: '⚡',
    flujo: 'ia',
    ejemplos: [
      'Enviar reportes de ventas automáticos cada lunes',
      'Pasar los pedidos del correo a una hoja de cálculo',
      'Avisar por WhatsApp cuando un stock baje del mínimo',
    ],
  },
];

export function obtenerServicio(id: TipoServicio): Servicio {
  const servicio = SERVICIOS.find((s) => s.id === id);
  if (!servicio) throw new Error(`Servicio desconocido: ${id}`);
  return servicio;
}

/* -------------------------------------------------------------------------- */
/* Preguntas                                                                  */
/* -------------------------------------------------------------------------- */

export type TipoPregunta = 'negocio' | 'logo' | 'paleta' | 'opcion' | 'multiple';

export interface Opcion {
  valor: string;
  etiqueta: string;
  detalle?: string;
}

export interface Pregunta {
  id: string;
  tipo: TipoPregunta;
  /** Se formula como en una conversación, no como un campo de formulario. */
  titulo: string;
  ayuda?: string;
  opciones?: Opcion[];
  /** Para `multiple`: cuántas se pueden marcar como máximo. */
  maximo?: number;
  opcional?: boolean;
}

/**
 * Presupuesto en soles. Son rangos a propósito: un número exacto intimida y un
 * rango basta para que el ingeniero sepa si el encargo le encaja.
 */
export const PRESUPUESTOS: Opcion[] = [
  { valor: 'hasta-1500', etiqueta: 'Hasta S/ 1,500' },
  { valor: '1500-4000', etiqueta: 'S/ 1,500 – S/ 4,000' },
  { valor: '4000-10000', etiqueta: 'S/ 4,000 – S/ 10,000' },
  { valor: 'mas-10000', etiqueta: 'Más de S/ 10,000' },
  { valor: 'no-se', etiqueta: 'Aún no lo sé', detalle: 'Lo conversamos con el ingeniero' },
];

/**
 * Hasta cuánto llega cada rango de presupuesto. Sirve para avisar al cliente
 * si un diseño parte de un precio mayor. null: no lo sabe.
 */
export function techoPresupuesto(valor: string): number | null {
  const techos: Record<string, number> = {
    'hasta-1500': 1500,
    '1500-4000': 4000,
    '4000-10000': 10000,
    'mas-10000': Number.POSITIVE_INFINITY,
  };
  return techos[valor] ?? null;
}

/** "S/ 1,200": soles sin decimales, como en los rangos de presupuesto. */
export function solesEnteros(monto: number): string {
  return `S/ ${Math.round(monto).toLocaleString('en-US')}`;
}

export interface Paleta {
  id: string;
  nombre: string;
  primario: string;
  secundario: string;
}

/** Paletas listas para elegir; más "los colores de mi logo" si sube uno. */
export const PALETAS: Paleta[] = [
  { id: 'confianza', nombre: 'Confianza', primario: '#1d4ed8', secundario: '#f59e0b' },
  { id: 'natural', nombre: 'Natural', primario: '#15803d', secundario: '#facc15' },
  { id: 'elegante', nombre: 'Elegante', primario: '#1f2937', secundario: '#c9a227' },
  { id: 'calido', nombre: 'Cálido', primario: '#c2410c', secundario: '#fcd34d' },
  { id: 'fresco', nombre: 'Fresco', primario: '#0d9488', secundario: '#f472b6' },
  { id: 'vibrante', nombre: 'Vibrante', primario: '#7c3aed', secundario: '#22d3ee' },
];

/**
 * Módulo web. Seis pasos como tope duro, una sola pregunta abierta (la del
 * negocio) y todo lo demás a golpe de clic.
 */
export const PREGUNTAS_WEB: Pregunta[] = [
  {
    id: 'negocio',
    tipo: 'negocio',
    titulo: 'Para empezar, cuéntanos un poco de tu negocio',
    ayuda: 'Con esto la web ya hablará como tu empresa, no como una plantilla.',
  },
  {
    id: 'logo',
    tipo: 'logo',
    titulo: '¿Tienes logo? Súbelo y lo ponemos en tu web',
    ayuda: 'Si no tienes, no pasa nada: usaremos el nombre de tu empresa.',
    opcional: true,
  },
  {
    id: 'paleta',
    tipo: 'paleta',
    titulo: '¿Con qué colores te imaginas tu web?',
    ayuda: 'Elige la que más se parezca a tu marca. Luego se puede ajustar.',
  },
  {
    id: 'secciones',
    tipo: 'multiple',
    titulo: '¿Qué secciones te gustaría que tenga?',
    ayuda: 'Marca hasta 5. La portada ya va incluida.',
    maximo: 5,
    opciones: [
      { valor: 'nosotros', etiqueta: 'Quiénes somos' },
      { valor: 'servicios', etiqueta: 'Servicios o productos' },
      { valor: 'galeria', etiqueta: 'Galería o portafolio' },
      { valor: 'testimonios', etiqueta: 'Testimonios de clientes' },
      { valor: 'precios', etiqueta: 'Precios o planes' },
      { valor: 'preguntas', etiqueta: 'Preguntas frecuentes' },
      { valor: 'contacto', etiqueta: 'Contacto' },
      { valor: 'blog', etiqueta: 'Blog o noticias' },
    ],
  },
  {
    id: 'estilo',
    tipo: 'opcion',
    titulo: '¿Qué estilo va más con tu marca?',
    opciones: [
      { valor: 'moderno', etiqueta: 'Moderno y minimalista', detalle: 'Limpio, con mucho aire' },
      { valor: 'corporativo', etiqueta: 'Corporativo y formal', detalle: 'Serio y confiable' },
      { valor: 'cercano', etiqueta: 'Cercano y colorido', detalle: 'Alegre y amigable' },
      { valor: 'premium', etiqueta: 'Elegante y premium', detalle: 'Sofisticado y exclusivo' },
    ],
  },
  {
    id: 'presupuesto',
    tipo: 'opcion',
    titulo: 'Última: ¿con qué presupuesto cuentas, más o menos?',
    ayuda: 'Es solo para que el ingeniero te proponga algo a tu medida.',
    opciones: PRESUPUESTOS,
  },
];

/* -------------------------------------------------------------------------- */
/* Al aceptar                                                                 */
/* -------------------------------------------------------------------------- */

export interface PreguntaEncargo {
  /** Empieza por "alcance-": así el panel del ingeniero las reconoce. */
  id: string;
  titulo: string;
  opciones: Opcion[];
  /** Solo tiene sentido para páginas web. */
  soloWeb?: boolean;
}

/**
 * Se preguntan al aceptar, no antes: no retrasan la maqueta y solo las
 * contesta quien de verdad quiere seguir. Son las que más cambian el precio.
 */
export const PREGUNTAS_ENCARGO: PreguntaEncargo[] = [
  {
    id: 'alcance-venta',
    titulo: '¿Qué quieres que haga tu web?',
    soloWeb: true,
    opciones: [
      { valor: 'vitrina', etiqueta: 'Mostrar mi negocio y recibir mensajes' },
      { valor: 'pedidos-whatsapp', etiqueta: 'Recibir pedidos por WhatsApp' },
      { valor: 'tienda-online', etiqueta: 'Vender en línea, con carrito y pagos' },
      { valor: 'no-se', etiqueta: 'Aún no lo sé' },
    ],
  },
  {
    id: 'alcance-dominio',
    titulo: '¿Ya tienes dominio? (por ejemplo, tunegocio.pe)',
    soloWeb: true,
    opciones: [
      { valor: 'si', etiqueta: 'Sí, ya tengo' },
      { valor: 'no', etiqueta: 'No, necesito uno' },
      { valor: 'no-se', etiqueta: 'No sé qué es' },
    ],
  },
  {
    id: 'alcance-plazo',
    titulo: '¿Para cuándo lo necesitas?',
    opciones: [
      { valor: 'urgente', etiqueta: 'Lo antes posible' },
      { valor: '1-mes', etiqueta: 'En un mes' },
      { valor: '2-3-meses', etiqueta: 'En dos o tres meses' },
      { valor: 'sin-apuro', etiqueta: 'Sin apuro' },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Respuestas                                                                 */
/* -------------------------------------------------------------------------- */

/** Lo que el cliente contesta en el módulo web. */
export interface FichaWeb {
  empresa: string;
  /** Tipo de negocio: es lo que decide qué plantillas del ingeniero encajan. */
  categoria: string;
  rubro: string;
  /** Imagen ya reducida en el navegador, como data URI. */
  logo: string | null;
  paleta: Paleta;
  secciones: string[];
  estilo: string;
  presupuesto: string;
}

export function etiquetaDe(opciones: Opcion[] | undefined, valor: string): string {
  return opciones?.find((o) => o.valor === valor)?.etiqueta ?? valor;
}
