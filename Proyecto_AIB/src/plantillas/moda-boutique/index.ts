// ---------------------------------------------------------------------------
// Plantilla "Boutique de moda"
// ---------------------------------------------------------------------------
// Derivada de la portada de bithia-web. Conserva su estructura, sus clases y
// sus proporciones; no conserva nada de la marca Bithia: ni nombre, ni textos,
// ni fotos. Todo eso lo pone cada cliente.
// ---------------------------------------------------------------------------

import html from './plantilla.html?raw';
import css from './estilos.css?raw';
import { colorSeguro, soles, soloNumero, type PlantillaBase } from '../../lib/plantillas';

export interface ProductoModa {
  nombre: string;
  precio: number;
  /** Tallas en texto corto: "S · M · L". */
  tallas: string;
  /** Hex del color principal de la prenda. */
  color: string;
  etiqueta: '' | 'Nuevo' | 'Más pedido';
}

/**
 * Lo que la IA escribe para esta plantilla. Esta forma se valida también en el
 * servidor (server/src/plantillas/moda-boutique.js): si cambia aquí, cambia allí.
 */
export interface TextosModaBoutique {
  anuncio: string;
  hero: { etiqueta: string; titulo: string; subtitulo: string; cta: string };
  categorias: string[];
  destacados_titulo: string;
  destacados: ProductoModa[];
  novedades_titulo: string;
  novedades: ProductoModa[];
  marquesinas: string[];
  edicion: { etiqueta: string; nombre: string; precio: number };
  top: {
    nombre: string;
    precio: number;
    color: string;
    color_nombre: string;
    tallas: string[];
    descripcion: string;
    material: string;
  };
  look: { titulo: string; etiqueta: string; prenda: { nombre: string; precio: number } };
  tienda: { nombre: string; ciudad: string };
  garantias: { titulo: string; detalle: string }[];
  pie_descripcion: string;
}

const TALLAS = ['XS', 'S', 'M', 'L', 'XL'];

/** Iconos fijos de la franja de garantías, en el mismo orden que sus textos. */
const ICONOS_GARANTIA = [
  // Tienda (map-pin)
  '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>',
  // Envío (truck)
  '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>',
  // Renovación (calendar-clock)
  '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/></svg>',
  // Asesoría (message-circle-heart)
  '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M15.8 9.2a2.5 2.5 0 0 0-3.5 0l-.3.4-.35-.3a2.42 2.42 0 1 0-3.2 3.6l3.6 3.5 3.6-3.5c1.2-1.2 1.1-2.7.2-3.7"/></svg>',
];

const CLASE_ETIQUETA: Record<ProductoModa['etiqueta'], string> = {
  '': '',
  Nuevo: 'bg-terracota text-white',
  'Más pedido': 'bg-white text-carbon',
};

function producto(p: ProductoModa) {
  return {
    nombre: p.nombre,
    precio_texto: soles(p.precio),
    tallas: p.tallas,
    color: colorSeguro(p.color),
    etiqueta: p.etiqueta || null,
    etiqueta_clase: CLASE_ETIQUETA[p.etiqueta] ?? '',
  };
}

/**
 * Textos de muestra, neutros a propósito: prendas unisex para que la
 * plantilla se entienda igual si la tienda es de hombre, de mujer o mixta.
 * Solo se ven antes de que la IA escriba los del cliente.
 */
const EJEMPLO: TextosModaBoutique = {
  anuncio: 'Nuevos modelos cada semana',
  hero: {
    etiqueta: 'Nueva colección',
    titulo: 'Estilo que se nota',
    subtitulo: 'Prendas seleccionadas una a una, en pocas unidades por modelo.',
    cta: 'Ver colección',
  },
  categorias: ['Camisas', 'Pantalones', 'Casacas', 'Accesorios'],
  destacados_titulo: 'Los más pedidos',
  destacados: [
    { nombre: 'Camisa de lino', precio: 89.9, tallas: 'S · M · L', color: '#e8e2d6', etiqueta: 'Más pedido' },
    { nombre: 'Pantalón chino', precio: 119.9, tallas: 'S · M · L', color: '#8a7a5c', etiqueta: '' },
    { nombre: 'Casaca denim', precio: 159.9, tallas: 'M · L', color: '#3f5a7a', etiqueta: 'Nuevo' },
    { nombre: 'Polo básico', precio: 49.9, tallas: 'S · M · L · XL', color: '#1f1f1f', etiqueta: '' },
    { nombre: 'Blazer entallado', precio: 219.9, tallas: 'S · M', color: '#5a5a5a', etiqueta: 'Más pedido' },
    { nombre: 'Casaca de cuero', precio: 289.9, tallas: 'M · L', color: '#3b2a20', etiqueta: '' },
  ],
  novedades_titulo: 'Nuevos ingresos',
  novedades: [
    { nombre: 'Camisa oxford', precio: 99.9, tallas: 'S · M · L', color: '#a9c1d9', etiqueta: 'Nuevo' },
    { nombre: 'Jean recto', precio: 139.9, tallas: 'S · M · L', color: '#2f4a6b', etiqueta: 'Nuevo' },
    { nombre: 'Suéter de punto', precio: 129.9, tallas: 'M · L · XL', color: '#c9b79c', etiqueta: '' },
    { nombre: 'Correa de cuero', precio: 59.9, tallas: 'Única', color: '#4a3526', etiqueta: '' },
  ],
  marquesinas: ['Nuevos modelos cada semana', 'Pocas unidades por modelo', 'Te asesoramos por WhatsApp'],
  edicion: { etiqueta: 'Edición limitada', nombre: 'Abrigo de paño', precio: 349.9 },
  top: {
    nombre: 'Casaca denim clásica',
    precio: 159.9,
    color: '#3f5a7a',
    color_nombre: 'Azul índigo',
    tallas: ['S', 'M', 'L'],
    descripcion: 'Corte recto y lavado medio, pensada para usarse todo el año y combinar con todo.',
    material: 'Denim 100% algodón',
  },
  look: { titulo: 'Arma tu look', etiqueta: 'Estilo', prenda: { nombre: 'Camisa de lino', precio: 89.9 } },
  tienda: { nombre: 'Nuestra tienda', ciudad: 'Lima, Perú' },
  garantias: [
    { titulo: 'Recojo en tienda', detalle: 'Pruébate las prendas antes de llevarlas.' },
    { titulo: 'Envíos coordinados', detalle: 'Coordinamos tu entrega por WhatsApp.' },
    { titulo: 'Novedades constantes', detalle: 'Modelos nuevos cada semana.' },
    { titulo: 'Asesoría personal', detalle: 'Te ayudamos a elegir talla y combinación.' },
  ],
  pie_descripcion: 'Moda seleccionada con cuidado, en pocas unidades por modelo.',
};

export const modaBoutique: PlantillaBase<TextosModaBoutique> = {
  id: 'moda-boutique',
  nombre: 'Boutique de moda',
  descripcion:
    'Tienda de ropa con catálogo, destacados, "arma tu look" y pedidos por WhatsApp. Estilo boutique, sobrio y elegante.',
  categoria: 'tienda-ropa',
  estilo: 'premium',
  etiquetas: ['moda', 'ropa', 'boutique', 'catalogo', 'whatsapp', 'elegante', 'minimalista', 'tienda-fisica'],
  html,
  css,
  fuentes: ['https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'],
  colores: {
    '--color-terracota': 'primario',
    '--color-terracota-oscuro': 'primario-oscuro',
    '--color-rosa': 'secundario',
    '--color-rosa-suave': 'secundario-suave',
  },
  paletaOriginal: { primario: '#c9a48d', secundario: '#d4a59a' },
  ejemplo: EJEMPLO,
  vista: (t, contexto) => ({
    ...contexto,
    whatsapp: '999 999 999',
    anuncio: t.anuncio,
    hero: t.hero,
    categorias: t.categorias.map((nombre) => ({ nombre })),
    destacados_titulo: t.destacados_titulo,
    destacados: t.destacados.map(producto),
    novedades_titulo: t.novedades_titulo,
    novedades: t.novedades.map(producto),
    marquesina_1: t.marquesinas[0] ?? '',
    marquesina_2: t.marquesinas[1] ?? t.marquesinas[0] ?? '',
    marquesina_3: t.marquesinas[2] ?? t.marquesinas[0] ?? '',
    edicion: { ...t.edicion, precio_numero: soloNumero(t.edicion.precio) },
    top: {
      ...t.top,
      precio_texto: soles(t.top.precio),
      color: colorSeguro(t.top.color),
      // La primera talla disponible sale marcada, como si la clienta ya la
      // hubiera elegido; las que no existen quedan apagadas.
      tallas: TALLAS.map((talla) => {
        const existe = t.top.tallas.includes(talla);
        const elegida = talla === t.top.tallas[0];
        return {
          talla,
          clase: elegida
            ? 'border-carbon bg-carbon text-white'
            : existe
              ? 'border-linea bg-white text-carbon'
              : 'border-linea bg-white text-linea',
        };
      }),
    },
    look: {
      ...t.look,
      prenda: { nombre: t.look.prenda.nombre, precio_texto: soles(t.look.prenda.precio) },
    },
    tienda: t.tienda,
    garantias: t.garantias.slice(0, 4).map((g, i) => ({ ...g, icono: ICONOS_GARANTIA[i] })),
    pie_descripcion: t.pie_descripcion,
  }),
};
