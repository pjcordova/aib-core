// ---------------------------------------------------------------------------
// La documentación de un encargo, en PDF
// ---------------------------------------------------------------------------
// Se abre en una pestaña como página lista para imprimir y el navegador ofrece
// «Guardar como PDF» (en computadora y en celular). Sin librerías: todo el
// texto, que viene de la IA y del cliente, se escapa antes de escribirlo.
// ---------------------------------------------------------------------------

import type { Documentacion } from './api';

const esc = (texto: unknown) =>
  String(texto ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );

const lista = (items: string[] | undefined, ordenada = false) =>
  items?.length
    ? `<${ordenada ? 'ol' : 'ul'}>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</${ordenada ? 'ol' : 'ul'}>`
    : '';

const seccion = (titulo: string, cuerpo: string) => (cuerpo ? `<section><h2>${esc(titulo)}</h2>${cuerpo}</section>` : '');

/** El HTML completo de la documentación. */
export function documentoImprimible(
  datos: { negocio: string; servicio: string; cliente?: string | null },
  doc: Documentacion
): string {
  const esWeb = doc.tipo === 'web';
  const fecha = new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });

  const etapas = doc.etapas?.length
    ? `<table><thead><tr><th>Etapa</th><th class="num">%</th><th class="num">Días</th><th>Entregable</th></tr></thead><tbody>${doc.etapas
        .map(
          (e, i) =>
            `<tr><td><strong>${i + 1}. ${esc(e.titulo)}</strong></td><td class="num">${esc(e.porcentaje)} %</td><td class="num">${esc(e.dias)}</td><td>${esc(e.entregable)}</td></tr>`
        )
        .join('')}</tbody></table>`
    : '';

  const cuerpo = [
    seccion('Resumen', `<p>${esc(doc.resumen)}</p>${doc.objetivo ? `<p><strong>Objetivo:</strong> ${esc(doc.objetivo)}</p>` : ''}`),
    seccion('Preguntas para la primera llamada', lista(doc.preguntas_llamada, true)),
    seccion(
      'Lo que hay que pedirle al cliente',
      doc.pedir_al_cliente?.length
        ? `<ul>${doc.pedir_al_cliente.map((m) => `<li><strong>${esc(m.material)}:</strong> ${esc(m.detalle)}</li>`).join('')}</ul>`
        : ''
    ),
    seccion(
      `Plan por etapas${doc.estimacion?.semanas ? ` · unas ${doc.estimacion.semanas} semanas` : ''}`,
      etapas
    ),
    seccion(
      'Funcionalidades',
      doc.funcionalidades?.length
        ? `<ul>${doc.funcionalidades
            .map((f) => `<li><span class="prioridad ${esc(f.prioridad)}">${esc(f.prioridad)}</span> <strong>${esc(f.nombre)}:</strong> ${esc(f.descripcion)}</li>`)
            .join('')}</ul>`
        : ''
    ),
    seccion(
      'Mapa del sitio',
      doc.mapa_sitio?.length
        ? doc.mapa_sitio.map((p) => `<h3>${esc(p.pagina)}</h3>${lista(p.secciones)}`).join('')
        : ''
    ),
    seccion(
      'Usuarios',
      doc.usuarios?.length ? `<ul>${doc.usuarios.map((u) => `<li><strong>${esc(u.rol)}:</strong> ${esc(u.necesidad)}</li>`).join('')}</ul>` : ''
    ),
    seccion(
      'Modelo de datos',
      doc.modelo_datos?.length
        ? doc.modelo_datos
            .map((m) => `<h3>${esc(m.entidad)}</h3><p class="mono">${esc(m.campos?.join(', '))}</p>${m.relaciones ? `<p class="suave">${esc(m.relaciones)}</p>` : ''}`)
            .join('')
        : ''
    ),
    seccion(
      'Flujos críticos',
      doc.flujos_criticos?.length ? doc.flujos_criticos.map((f) => `<h3>${esc(f.nombre)}</h3>${lista(f.pasos, true)}`).join('') : ''
    ),
    seccion('Integraciones', lista(doc.integraciones)),
    seccion('SEO básico', lista(doc.seo)),
    seccion(
      'Stack sugerido',
      doc.stack_sugerido
        ? `<ul><li><strong>Frontend:</strong> ${esc(doc.stack_sugerido.frontend)}</li><li><strong>Backend:</strong> ${esc(doc.stack_sugerido.backend)}</li><li><strong>Datos:</strong> ${esc(doc.stack_sugerido.datos)}</li></ul><p class="suave">${esc(doc.stack_sugerido.justificacion)}</p>`
        : ''
    ),
    seccion(esWeb ? 'Para publicar' : 'Para ponerlo en marcha', lista(doc.publicacion)),
    seccion('Criterios de aceptación', lista(doc.criterios_aceptacion)),
    seccion(
      'Riesgos',
      doc.riesgos?.length ? `<ul>${doc.riesgos.map((r) => `<li><strong>${esc(r.riesgo)}</strong> → ${esc(r.mitigacion)}</li>`).join('')}</ul>` : ''
    ),
    seccion('Supuestos', lista(doc.estimacion?.supuestos)),
  ].join('\n');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Documentación · ${esc(datos.negocio)} · AIB+</title>
<style>
  @page { margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; font-size: 12.5px; line-height: 1.55; margin: 0 auto; max-width: 780px; padding: 24px; }
  header { border-bottom: 3px solid #c4a26a; padding-bottom: 12px; margin-bottom: 18px; }
  .marca { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #a8874f; margin: 0; }
  h1 { font-size: 22px; color: #1a2d4d; margin: 4px 0 2px; }
  .datos { color: #6b7280; margin: 0; }
  section { margin: 0 0 16px; break-inside: avoid-page; }
  h2 { font-size: 14px; color: #1a2d4d; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin: 0 0 8px; }
  h3 { font-size: 12.5px; margin: 10px 0 4px; }
  p { margin: 0 0 6px; }
  ul, ol { margin: 0; padding-left: 20px; }
  li { margin: 0 0 4px; break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 6px 6px; text-align: left; vertical-align: top; }
  th { font-size: 11px; color: #6b7280; font-weight: normal; }
  .num { text-align: right; white-space: nowrap; }
  .mono { font-family: Consolas, monospace; font-size: 11.5px; color: #4b5563; }
  .suave { color: #6b7280; }
  .prioridad { display: inline-block; font-size: 10px; text-transform: uppercase; border-radius: 4px; padding: 0 5px; background: #f3f4f6; color: #6b7280; }
  .prioridad.alta { background: #fde8e8; color: #b42318; }
  .prioridad.media { background: #fdf3e2; color: #b26a00; }
  footer { margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 11px; color: #9ca3af; }
  .aviso { background: #f5efe4; border-left: 3px solid #c4a26a; padding: 8px 12px; margin-bottom: 16px; font-size: 12px; }
  @media print { .aviso { display: none; } body { padding: 0; } }
</style>
</head>
<body>
<p class="aviso">Para guardarlo, elige «Guardar como PDF» en la ventana de impresión.</p>
<header>
  <p class="marca">AIB+ · Documentación del encargo</p>
  <h1>${esc(datos.negocio)}</h1>
  <p class="datos">${esc(datos.servicio)}${datos.cliente ? ` · Cliente: ${esc(datos.cliente)}` : ''} · ${esc(fecha)}</p>
</header>
${cuerpo}
<footer>Preparada con AIB+ · www.aibplus.app. Es una guía para cotizar y construir: el alcance final lo acuerdan el ingeniero y el cliente.</footer>
</body>
</html>`;
}

/**
 * Abre la documentación en una pestaña nueva y la manda a imprimir. false si
 * el navegador bloqueó la pestaña.
 */
export function imprimirDocumentacion(datos: { negocio: string; servicio: string; cliente?: string | null }, doc: Documentacion): boolean {
  const ventana = window.open('', '_blank');
  if (!ventana) return false;
  ventana.document.open();
  ventana.document.write(documentoImprimible(datos, doc));
  ventana.document.close();
  ventana.focus();
  // Un momento para que pinte antes de abrir el diálogo de impresión.
  setTimeout(() => ventana.print(), 400);
  return true;
}
