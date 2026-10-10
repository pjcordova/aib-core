// --- DISEÑOS CON IA PARA EL CATÁLOGO DEL INGENIERO ---
// Armar un HTML desde cero era la traba para que los ingenieros publicaran
// diseños de sus servicios (CRM, ERP, apps…). Aquí el ingeniero describe lo
// que quiere y la IA le devuelve la página completa, ya con los huecos de
// AIB+ ({{negocio}}, {{{marca}}}…) y las variables de color, lista para
// revisarla, ponerle precio y publicarla. También aplica cambios sobre un
// diseño que ya tiene («pon el menú arriba»).
//
// Aquí solo se genera: el frontend lo vuelve a limpiar (prepararDiseno) y la
// base de datos lo valida al guardarlo.

const { Router } = require('express');
const { config } = require('../config');
const { generateText, stripMarkdownFences } = require('../claude');
const { crearLimitador } = require('../rateLimit');
const { requireAuth } = require('../auth');
const { cobrarCuota } = require('../cuota');
const { mantenerConexion } = require('../mantenerConexion');
const { soloIngeniero } = require('../soloIngeniero');

const router = Router();

// Cada diseño cuesta ~17 ¢ y tarda uno o dos minutos.
const limitar = crearLimitador({ maxPorMinuto: 3, nombre: 'crear-diseno' });
const soloIngenieros = soloIngeniero('Solo los ingenieros crean diseños.');

/** Lo más largo que se acepta de un diseño para pedirle un cambio. */
const MAX_ANTERIOR = 80_000;
/** Lo más largo que se devuelve (lo mismo que admite el panel, con margen). */
const MAX_DOCUMENTO = 350_000;

const SERVICIOS = {
  web: 'Página web',
  crm: 'CRM',
  erp: 'ERP',
  automatizacion: 'Automatización',
  'app-movil': 'App móvil',
};

/** Qué tiene que enseñar el diseño de cada servicio. */
const FORMATO = {
  web: `Una página web de inicio, de una sola página: barra de navegación con el logo y enlaces a cada sección por su id, portada con titular, {{descripcion}} y un botón de contacto, y las secciones que pida la idea (servicios o productos, nosotros, galería, testimonios, preguntas frecuentes, contacto…). Cierra con un pie.`,
  crm: `La pantalla principal de un CRM, como si ya estuviera funcionando: menú lateral con los módulos (en el celular pasa arriba como una fila desplazable), encabezado con saludo y botón de acción, tarjetas de cifras, el embudo de ventas por etapas (columnas con tarjetas de oportunidades) y una tabla de clientes con su estado y su próximo seguimiento.`,
  erp: `La pantalla principal de un ERP o sistema de gestión, como si ya estuviera funcionando: menú lateral con los módulos (ventas, compras, inventario, caja, reportes…; en el celular pasa arriba como una fila desplazable), cifras del día, un gráfico de ventas de la semana, el inventario con el stock bajo resaltado y los últimos comprobantes.`,
  automatizacion: `El panel de una automatización, como si ya estuviera funcionando: los flujos activos dibujados como pasos (disparador → acciones) con iconos, su estado (activo o en pausa) y cuántas veces corrió, un historial reciente con hora y resultado, y una cifra del tiempo que le ahorra al negocio.`,
  'app-movil': `Pantallas de una app móvil: 2 o 3 pantallas una al lado de la otra (en el celular, una debajo de otra), cada una dentro de un marco de teléfono de unos 340×700 px con bordes redondeados, barra superior y barra de navegación inferior con iconos. Por ejemplo: inicio, catálogo o detalle, y carrito o perfil.`,
  otro: `La pantalla principal de este servicio, como si ya estuviera funcionando. Elige el formato que mejor lo enseñe: un panel con menú, una página o pantallas de app.`,
};

const NIVELES = {
  basica: 'Básica: lo esencial, limpio y claro (una web de 4 o 5 secciones; un sistema con 3 o 4 bloques).',
  elaborada: 'Elaborada: más secciones y más detalle visual (una web de 6 a 8 secciones; un sistema con 5 a 7 bloques, estados y filtros a la vista).',
  premium: 'Premium: la más cuidada, con detalle visual de alto nivel (una web de 7 a 9 secciones; un sistema completo con 6 a 8 bloques).',
};

const COLORES_POR_DEFECTO =
  ':root{--aib-primario:#1a2d4d;--aib-primario-oscuro:#16263f;--aib-primario-texto:#1a2d4d;--aib-secundario:#c4a26a;--aib-secundario-oscuro:#7f6945;--aib-secundario-suave:#ede3d2}';
const COLORES_VALIDOS = /^:root\{(?:--aib-[a-z-]{3,30}:#[0-9a-f]{6};?){1,8}\}$/i;

const HUECOS = ['negocio', 'descripcion', 'anio'];

/** Texto suelto del ingeniero: sin etiquetas ni llaves, y acotado (todo acaba en el prompt). */
const texto = (v, max) =>
  typeof v === 'string' ? v.replace(/[<>{}]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max) : '';

function leerServicio(clave) {
  if (typeof clave !== 'string') return null;
  if (SERVICIOS[clave]) return { clave, nombre: SERVICIOS[clave], formato: FORMATO[clave] };
  const otro = clave.startsWith('otro:') ? texto(clave.slice(5), 40) : '';
  return otro.length >= 2 ? { clave: 'otro', nombre: otro, formato: FORMATO.otro } : null;
}

function sistema(colores, esWeb) {
  return `Eres diseñador UI senior de AIB+, una plataforma peruana donde ingenieros de software ofrecen sus servicios a dueños de pequeños negocios. Creas diseños en HTML que el ingeniero publica en su catálogo: el cliente los ve con el nombre, el logo y los colores de SU negocio antes de contratarlo. Tienen que verse terminados, creíbles y profesionales, como un producto real.

QUÉ DEVOLVER
Un documento HTML completo, de <!doctype html> a </html>, sin markdown ni explicaciones alrededor. En el <head>:
- <meta name="aib-nombre" content="…">: un nombre corto para el diseño (máximo 50 caracteres; por ejemplo "CRM para distribuidoras").
- <meta name="aib-descripcion" content="…">: qué muestra, en una línea (máximo 140 caracteres).
- Bootstrap 5.3.3: <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
- Bootstrap Icons: <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
- Si quieres, una fuente de Google Fonts (una o dos familias) en un solo <link>.
- Un único <style> con tus estilos.

HUECOS DE AIB+ (se rellenan con los datos de cada cliente; no uses ninguna otra llave {{ }})
- {{negocio}}: el nombre del negocio. Úsalo en titulares, saludos y el pie.
- {{{marca}}} (con tres llaves): su logo o su nombre. Ponlo una sola vez, donde iría el logo (barra de navegación o menú lateral), dentro de un elemento normal, no en un <h1>.
- {{descripcion}}: a qué se dedica el negocio, con sus palabras (una o dos frases). Úsalo una vez, como subtítulo de la portada o del encabezado.
- {{anio}}: el año, en el pie: © {{anio}} {{negocio}}.

COLORES
Copia al inicio del <style> exactamente este bloque:
${colores}
y usa solo esas variables para los colores de marca (fondos destacados, botones, acentos, iconos, bordes):
- --aib-primario: el color principal. --aib-primario-oscuro: su versión oscura (menús, pies, estados hover). --aib-primario-texto: el principal cuando va como texto sobre fondo claro.
- --aib-secundario: el acento (botones de acción, detalles). --aib-secundario-oscuro: el acento como texto sobre blanco. --aib-secundario-suave: un fondo muy claro para franjas y etiquetas.
El resto, en blancos, grises y negros neutros. No escribas a mano ningún otro color de marca, ni uses las clases de color de Bootstrap (btn-primary, bg-primary, text-primary…): define tus propias clases con las variables. Cada cliente cambia esas variables por sus colores y todo tiene que seguir viéndose bien. Sobre --aib-primario y --aib-primario-oscuro, el texto va en blanco.

FOTOS
Ninguna imagen externa ni etiqueta <img>. Donde iría una foto, deja un hueco donde el cliente sube la suya:
<div data-aib-foto style="position:relative;height:320px;border-radius:16px;background:linear-gradient(135deg,var(--aib-secundario-suave),#e5e7eb)"></div>
Ajusta el alto y los bordes, pero siempre con position:relative, un alto y un fondo. Encima puede ir un icono grande de Bootstrap Icons. Las fotos de la portada, de los productos o servicios y de la galería son siempre estos huecos: así el cliente pone las suyas.

SIN JAVASCRIPT
Los scripts se eliminan. Nada que dependa de JS: ni collapse, ni menú hamburguesa, ni dropdowns, ni modales, ni pestañas, ni carruseles, ni gráficos con canvas. Las preguntas frecuentes van con <details><summary>. Los gráficos se dibujan con HTML y CSS (barras con alturas en %, anillos con conic-gradient). La navegación tiene que verse bien en el celular sin JavaScript: enlaces que se acomodan o una fila que se desplaza.

RESPONSIVO
Se ve bien de 360 px a 1440 px de ancho, sin desbordes horizontales.

CONTENIDO
- En español de Perú. Nunca "Lorem ipsum": textos breves y creíbles, del rubro del diseño.
- El diseño es del negocio del cliente: no menciones AIB+, ni al ingeniero, ni números de versión.
${
  esWeb
    ? `- No inventes datos que el cliente leería como suyos: ni dirección, ni teléfono, ni correo, ni redes, ni horarios, ni cifras de su negocio. Deja huecos visibles entre corchetes: [Tu dirección], [Tu WhatsApp], [Tu correo], [@tu_instagram].
- Los testimonios son de ejemplo: fírmalos con el tipo de cliente ("Cliente frecuente"), nunca con nombres de personas.`
    : `- Llena las pantallas con datos de ejemplo realistas, para que se vea funcionando: montos en soles (S/ 1,250.00), fechas recientes, nombres de clientes, productos y estados creíbles para un negocio peruano.
- Los botones y enlaces de la interfaz son de adorno: que se vean, aunque no lleven a ningún sitio.`
}

Sé conciso: unas 250 a 350 líneas en total. Un diseño completo vale más que uno largo que se corte a medias.`;
}

function pedidoNuevo({ servicio, idea, rubro, estilo, nivel }) {
  return `Crea un diseño nuevo.

SERVICIO: ${servicio.nombre}
QUÉ ENSEÑA: ${servicio.formato}
PENSADO PARA: ${rubro || 'cualquier rubro'}
ESTILO: ${estilo || 'moderno'}
NIVEL: ${NIVELES[nivel]}

LO QUE PIDE EL INGENIERO:
${idea}`;
}

function pedidoCambio({ servicio, anterior, cambio }) {
  return `Este es un diseño de ${servicio.nombre} que ya existe:

<diseno>
${anterior}
</diseno>

EL CAMBIO QUE PIDE EL INGENIERO:
${cambio}

Devuelve el documento completo con ese cambio aplicado. Todo lo demás se queda como está: la estructura, los textos, los huecos de AIB+, las variables de color y las metas aib-nombre y aib-descripcion (cámbialas solo si el cambio altera de qué trata el diseño). Si al diseño le falta algo de las reglas (los huecos, las metas, las variables de color), añádelo.`;
}

const ENTIDADES = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '', '&gt;': '' };

function leerMeta(documento, nombre, max) {
  const etiqueta = documento.match(new RegExp(`<meta[^>]+name=["']aib-${nombre}["'][^>]*>`, 'i'))?.[0] ?? '';
  const valor = etiqueta.match(/content=(["'])([\s\S]*?)\1/i)?.[2] ?? '';
  return texto(valor.replace(/&(amp|quot|#39|lt|gt);/g, (e) => ENTIDADES[e]), max);
}

/**
 * Se queda con el documento, sin scripts, con el año como hueco y sin llaves
 * que no sean de AIB+ (el modelo a veces inventa {{telefono}}: se deja como
 * [telefono], un hueco visible). Devuelve null si no parece una página.
 */
function extraerDocumento(crudo) {
  let doc = stripMarkdownFences(crudo);
  const inicio = doc.search(/<!doctype html|<html[\s>]/i);
  if (inicio > 0) doc = doc.slice(inicio);
  const fin = doc.toLowerCase().lastIndexOf('</html>');
  if (fin >= 0) doc = doc.slice(0, fin + '</html>'.length);
  if (!/<body[\s>]/i.test(doc)) return null;

  doc = doc
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*>/gi, '')
    .replace(/(©|&copy;)\s*(?:19|20)\d{2}\b/gi, '$1 {{anio}}')
    .replace(/\{\{\{?\s*([^{}]*?)\s*\}?\}\}/g, (_todo, nombre) => {
      if (nombre === 'marca') return '{{{marca}}}';
      if (HUECOS.includes(nombre)) return `{{${nombre}}}`;
      return `[${nombre.replace(/[#^/!&]/g, '')}]`;
    });

  return doc.length <= MAX_DOCUMENTO ? doc : null;
}

router.post('/disenos/crear', limitar, requireAuth, soloIngenieros, async (req, res, next) => {
  // Se valida antes de cobrar: una petición mal formada no gasta el tope.
  const cuerpo = req.body ?? {};
  const servicio = leerServicio(cuerpo.servicio);
  const idea = texto(cuerpo.idea, 800);
  const cambio = texto(cuerpo.cambio, 500);
  const anterior = typeof cuerpo.anterior === 'string' ? cuerpo.anterior.trim() : '';

  if (!servicio) return res.status(400).json({ success: false, error: 'Elige el servicio del diseño.' });
  if (anterior) {
    if (cambio.length < 3) return res.status(400).json({ success: false, error: 'Escribe qué quieres cambiar.' });
    if (anterior.length > MAX_ANTERIOR) {
      return res.status(400).json({
        success: false,
        error: 'Este diseño es demasiado grande para cambiarlo con IA. Edítalo en tu computadora y vuelve a subirlo.',
      });
    }
  } else if (idea.length < 10) {
    return res.status(400).json({ success: false, error: 'Cuéntanos un poco más del diseño que quieres (al menos una frase).' });
  }

  res.locals.pedido = {
    servicio,
    idea,
    cambio,
    anterior,
    rubro: texto(cuerpo.rubro, 60),
    estilo: texto(cuerpo.estilo, 60),
    nivel: NIVELES[cuerpo.nivel] ? cuerpo.nivel : 'basica',
    colores: typeof cuerpo.colores === 'string' && COLORES_VALIDOS.test(cuerpo.colores) ? cuerpo.colores : COLORES_POR_DEFECTO,
  };
  return next();
}, cobrarCuota('diseno'), mantenerConexion, async (_req, res, next) => {
  try {
    const p = res.locals.pedido;
    const { text, usage } = await generateText({
      label: p.anterior ? 'cambiar-diseno' : 'crear-diseno',
      system: sistema(p.colores, p.servicio.clave === 'web'),
      prompt: p.anterior ? pedidoCambio(p) : pedidoNuevo(p),
      maxTokens: config.maxTokens.diseno,
      temperature: p.anterior ? 0.3 : 0.7,
    });

    const html = extraerDocumento(text);
    if (!html) {
      console.error('[AIB+] El diseño no llegó como una página:', text.slice(0, 300));
      return res.status(502).json({ success: false, error: 'El diseño no llegó completo. Vuelve a intentarlo.' });
    }

    return res.json({
      success: true,
      html,
      nombre: leerMeta(html, 'nombre', 60),
      descripcion: leerMeta(html, 'descripcion', 200),
      usage,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
