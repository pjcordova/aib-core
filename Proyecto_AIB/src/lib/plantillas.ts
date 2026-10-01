// ---------------------------------------------------------------------------
// Plantillas de ingeniero: modelo y renderizado
// ---------------------------------------------------------------------------
// Una plantilla es el diseño de una web que el ingeniero ya sabe construir,
// con huecos {{...}} donde va el contenido de cada cliente. Rellenarla no
// necesita que la IA escriba HTML: la estructura, los colores, el logo y los
// datos fijos se ponen aquí, y la IA solo aporta los textos.
//
// Las plantillas se escriben con sintaxis Mustache: es estándar, no ejecuta
// código y escapa por defecto todo lo que se inserta, así que un texto nunca
// puede colar HTML en la página.
// ---------------------------------------------------------------------------

import Mustache from 'mustache';
import { ajustar, escapar, ID_PALETA, textoLegible } from './marca';
import type { FichaWeb, Paleta } from './servicios';

/** Tipos de negocio con los que se empareja una plantilla. */
export type CategoriaNegocio =
  | 'tienda-ropa'
  | 'servicios-profesionales'
  | 'restaurante'
  | 'salud-bienestar'
  | 'institucion'
  | 'otro';

export const CATEGORIAS_NEGOCIO: { valor: CategoriaNegocio; etiqueta: string }[] = [
  { valor: 'tienda-ropa', etiqueta: 'Tienda de ropa o moda' },
  { valor: 'servicios-profesionales', etiqueta: 'Servicios profesionales o consultoría' },
  { valor: 'restaurante', etiqueta: 'Restaurante o comida' },
  { valor: 'salud-bienestar', etiqueta: 'Salud, belleza o bienestar' },
  { valor: 'institucion', etiqueta: 'Institución, ONG o entidad' },
  { valor: 'otro', etiqueta: 'Otro' },
];

/**
 * Qué papel cumple cada variable de color de la plantilla. Al renderizar, la
 * paleta del cliente se traduce a estos papeles y sustituye la del ingeniero.
 */
export type RolColor =
  | 'primario'
  | 'primario-oscuro'
  | 'primario-texto'
  | 'secundario'
  | 'secundario-oscuro'
  | 'secundario-suave';

export interface ContextoVista {
  empresa: string;
  /** HTML ya seguro de la marca: el logo o el nombre escapado. */
  marca: string;
  anio: number;
  /**
   * Secciones que pidió el cliente (claves de la pregunta de secciones). null
   * cuando no hay cliente, como en el catálogo del ingeniero: se ve todo.
   */
  secciones: string[] | null;
}

export interface PlantillaBase<T = unknown> {
  /** Identificador estable: es el que se guarda en el catálogo del ingeniero. */
  id: string;
  nombre: string;
  descripcion: string;
  categoria: CategoriaNegocio;
  /** Mismo vocabulario que la pregunta de estilo del cliente. */
  estilo: string;
  etiquetas: string[];
  /**
   * Secciones de las que el cliente puede pedir (servicios.ts) que esta
   * plantilla sabe mostrar. Las que no estén aquí se avisan al elegir y le
   * llegan al ingeniero como pendientes.
   */
  secciones: string[];
  html: string;
  css: string;
  /** Hojas externas (tipografías). */
  fuentes: string[];
  colores: Record<string, RolColor>;
  paletaOriginal: { primario: string; secundario: string };
  /** Textos de muestra: sirven para enseñar la plantilla sin llamar a la IA. */
  ejemplo: T;
  /** Convierte los textos en los datos exactos que espera el HTML. */
  vista: (textos: T, contexto: ContextoVista) => Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */

/**
 * Marca para insertar con {{{marca}}}. Se construye aquí, no en la plantilla,
 * porque es el único hueco que admite HTML: por eso el nombre se escapa y el
 * logo solo puede ser la imagen ya procesada en el navegador.
 */
function marcaDe(ficha: Pick<FichaWeb, 'empresa' | 'logo'>): string {
  const nombre = escapar(ficha.empresa);
  if (ficha.logo && ficha.logo.startsWith('data:image/')) {
    return `<img src="${ficha.logo}" alt="${nombre}" style="max-height:36px;width:auto;display:inline-block;vertical-align:middle">`;
  }
  return nombre;
}

/**
 * Traduce la paleta del cliente a las variables de la plantilla, más las
 * guardas de contraste: si el color principal es claro, el texto blanco que
 * el ingeniero puso sobre él dejaría de leerse.
 */
export function estilosDePaleta(plantilla: PlantillaBase, paleta: Pick<Paleta, 'primario' | 'secundario'>): string {
  const principalClaro = textoLegible(paleta.primario) !== '#ffffff';

  const valores: Record<RolColor, string> = {
    primario: paleta.primario,
    'primario-oscuro': ajustar(paleta.primario, -0.15),
    // Para usar el principal como texto sobre fondo claro (precios,
    // etiquetas): si es un color claro, como un amarillo, se oscurece.
    'primario-texto': principalClaro ? ajustar(paleta.primario, -0.45) : paleta.primario,
    secundario: paleta.secundario,
    // Para usar el secundario como texto sobre blanco: un ámbar o un amarillo
    // tal cual no se leerían.
    'secundario-oscuro': ajustar(paleta.secundario, -0.35),
    'secundario-suave': ajustar(paleta.secundario, 0.6),
  };

  const variables = Object.entries(plantilla.colores)
    .map(([variable, rol]) => `${variable}:${valores[rol]}`)
    .join(';');

  const guarda = principalClaro
    ? Object.entries(plantilla.colores)
        .filter(([, rol]) => rol === 'primario')
        .map(([variable]) => {
          const clase = `.bg-${variable.replace('--color-', '')}`;
          return `${clase},${clase} .text-white{color:#1f2937!important}`;
        })
        .join('')
    : '';

  return `:root{${variables}}${guarda}`;
}

/** Página completa, lista para el iframe aislado. */
export function renderizarPlantilla<T>(
  plantilla: PlantillaBase<T>,
  textos: T,
  ficha: Pick<FichaWeb, 'empresa' | 'logo'> & {
    paleta?: Pick<Paleta, 'primario' | 'secundario'> | null;
    secciones?: string[] | null;
  }
): string {
  const contexto: ContextoVista = {
    empresa: ficha.empresa,
    marca: marcaDe(ficha),
    anio: new Date().getFullYear(),
    secciones: ficha.secciones ?? null,
  };

  // Los comentarios de la plantilla son notas del ingeniero (de dónde sale,
  // cómo funciona): no tienen por qué llegar a la web del cliente.
  const html = plantilla.html.replace(/<!--[\s\S]*?-->/g, '');
  const cuerpo = Mustache.render(html, plantilla.vista(textos, contexto));

  // Sin paleta del cliente no se toca nada: se ve exactamente con los colores
  // del ingeniero. Recalcular los tonos derivados a partir de su color base
  // daría un oscuro parecido pero no el que él eligió.
  const estilosCliente = ficha.paleta ? estilosDePaleta(plantilla as PlantillaBase, ficha.paleta) : '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(ficha.empresa)}</title>
${plantilla.fuentes.map((f) => `<link rel="stylesheet" href="${f}">`).join('\n')}
<style>${plantilla.css}</style>
${estilosCliente ? `<style id="${ID_PALETA}">${estilosCliente}</style>` : ''}
</head>
<body>
${cuerpo}
</body>
</html>`;
}

/** Secciones que pidió el cliente y la plantilla no sabe mostrar. */
export function seccionesQueFaltan(plantilla: Pick<PlantillaBase, 'secciones'>, pedidas: string[]): string[] {
  return pedidas.filter((s) => !plantilla.secciones.includes(s));
}

/* -------------------------------------------------------------------------- */
/* Formato                                                                    */
/* -------------------------------------------------------------------------- */

/** "S/ 89.90", como se ve en cualquier tienda peruana. */
export function soles(precio: number): string {
  const valor = Number.isFinite(precio) ? precio : 0;
  return `S/ ${valor.toFixed(2)}`;
}

export function soloNumero(precio: number): string {
  return (Number.isFinite(precio) ? precio : 0).toFixed(2);
}

/** Un color que va dentro de un atributo style: solo se acepta hex puro. */
export function colorSeguro(valor: string, respaldo = '#d4a59a'): string {
  return /^#[0-9a-f]{6}$/i.test(valor) ? valor : respaldo;
}
