import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, crearDiseno, type DisenoDeIa } from '../../lib/api';
import { actualizarPlantilla, anadirPropia, type PlantillaDelCatalogo } from '../../lib/catalogo';
import { CATEGORIAS_NEGOCIO, renderizarPlantilla, type CategoriaNegocio } from '../../lib/plantillas';
import {
  basePropia,
  documentoCompleto,
  EJEMPLO_PLANTILLA,
  EJEMPLO_SISTEMA,
  fijarColores,
  NIVELES,
  prepararDiseno,
  TEXTOS_EJEMPLO,
  variablesDeColor,
  type DisenoPropio,
  type NivelPlantilla,
} from '../../lib/plantillaPropia';
import type { ServicioDelIngeniero } from '../../lib/formularios';
import { PREGUNTAS_WEB, iconoDeClave, nombreDeClave } from '../../lib/servicios';
import { MiniVista } from './MiniVista';

const ESTILOS = PREGUNTAS_WEB.find((p) => p.id === 'estilo')?.opciones ?? [];

/** Lo que pesa como máximo el archivo antes de limpiarlo. */
const MAX_ARCHIVO = 2_000_000;

/** Ideas para empezar: se tocan y quedan escritas, listas para ajustar. */
const IDEAS: Record<string, string[]> = {
  web: [
    'Web para una pastelería: portada con foto grande, tortas por categoría con precio, pedidos por WhatsApp y testimonios.',
    'Web para un estudio contable: servicios, por qué elegirnos, preguntas frecuentes y formulario de contacto.',
    'Tienda online de ropa: novedades, categorías, productos con precio y talla, y cómo son los envíos.',
  ],
  crm: [
    'CRM para una distribuidora: clientes con su deuda, pedidos de la semana, seguimiento por vendedor y ranking de ventas.',
    'CRM para una inmobiliaria: interesados por propiedad, visitas agendadas y embudo hasta el cierre.',
  ],
  erp: [
    'ERP para una ferretería: ventas del día, productos con stock bajo, compras a proveedores y caja.',
    'Sistema para un restaurante: mesas ocupadas, pedidos en cocina, carta con precios y cierre de caja.',
  ],
  automatizacion: [
    'Los pedidos que llegan por WhatsApp se registran solos en una hoja y avisan al almacén.',
    'Recordatorios automáticos de citas y de cobros por WhatsApp y correo, con su historial.',
  ],
  'app-movil': [
    'App de delivery para una pollería: menú con fotos, carrito y seguimiento del pedido.',
    'App de reservas para un spa: servicios, horarios disponibles y mis citas.',
  ],
};

/** Descarga un HTML para abrirlo o editarlo en la computadora. */
function descargar(contenido: string, archivo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/html' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = archivo;
  a.click();
  URL.revokeObjectURL(url);
}

/** Para el nombre del archivo: «CRM para tiendas» → «crm-para-tiendas». */
function nombreDeArchivo(texto: string): string {
  const limpio = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${limpio || 'mi-diseno'}.html`;
}

/**
 * El ingeniero crea su diseño con IA o sube el suyo (o cambia uno que ya
 * tiene): el HTML, su servicio, nombre, rubro, estilo, nivel y precio. Sale
 * publicado.
 */
export function SubirDiseno({
  existente,
  servicios,
  servicioInicial,
  onListo,
  onCerrar,
}: {
  /** Para editar una propia ya subida. Sin ella, es un diseño nuevo. */
  existente?: PlantillaDelCatalogo;
  /** Los servicios que ofrece: cada diseño es de uno. */
  servicios: ServicioDelIngeniero[];
  servicioInicial?: string;
  onListo: () => void;
  onCerrar: () => void;
}) {
  const fila = existente?.fila;
  const [servicio, setServicio] = useState(fila?.servicio ?? servicioInicial ?? servicios[0]?.clave ?? 'web');
  const esWeb = servicio === 'web';
  // El de un diseño ya subido sale aunque ya no lo ofrezca.
  const opcionesServicio = servicios.some((s) => s.clave === servicio)
    ? servicios
    : [...servicios, { clave: servicio, nombre: nombreDeClave(servicio), icono: iconoDeClave(servicio) }];
  const [diseno, setDiseno] = useState<DisenoPropio | null>(
    fila?.html ? { html: fila.html, css: fila.css ?? '', fuentes: fila.fuentes ?? [] } : null
  );
  const [archivo, setArchivo] = useState('');
  const [nombre, setNombre] = useState(fila?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(fila?.descripcion ?? '');
  // Un CRM o un ERP no suele ser de un rubro: por defecto, cualquiera.
  const [categoria, setCategoria] = useState<CategoriaNegocio>(
    fila?.categoria ?? (servicioInicial && servicioInicial !== 'web' ? 'otro' : 'servicios-profesionales')
  );
  const [estilo, setEstilo] = useState(fila?.estilo ?? ESTILOS[0]?.valor ?? 'moderno');
  const [nivel, setNivel] = useState<NivelPlantilla>(fila?.nivel ?? 'basica');
  const [precio, setPrecio] = useState(fila?.precio_desde ? String(fila.precio_desde) : '');
  const [primario, setPrimario] = useState(fila?.color_primario ?? '#1a2d4d');
  const [secundario, setSecundario] = useState(fila?.color_secundario ?? '#c4a26a');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Con IA (lo normal al empezar uno) o con su propio archivo.
  const [modo, setModo] = useState<'ia' | 'archivo'>(fila ? 'archivo' : 'ia');
  const [idea, setIdea] = useState('');
  const [cambio, setCambio] = useState('');
  const [generando, setGenerando] = useState<'crear' | 'cambiar' | null>(null);
  const [segundos, setSegundos] = useState(0);
  // Si lo hizo la IA, sus colores por defecto se ajustan a los que elija.
  const [deIa, setDeIa] = useState(false);

  const cerrar = useCallback(() => {
    if (generando && !window.confirm('Tu diseño se está creando. ¿Cerrar igual? Se perderá.')) return;
    onCerrar();
  }, [generando, onCerrar]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && cerrar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [cerrar]);

  useEffect(() => {
    if (!generando) return;
    setSegundos(0);
    const reloj = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(reloj);
  }, [generando]);

  const leerArchivo = async (f: File | undefined) => {
    setError('');
    if (!f) return;
    if (f.size > MAX_ARCHIVO) {
      setError('El archivo pesa demasiado (máximo 2 MB). Usa imágenes por enlace en vez de incrustadas.');
      return;
    }
    const r = prepararDiseno(await f.text());
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setDiseno(r.diseno);
    setDeIa(false);
    setArchivo(f.name);
    if (!nombre.trim()) setNombre(f.name.replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').slice(0, 60));
  };

  /** Lo que devuelve la IA pasa por la misma limpieza que un archivo subido. */
  const usarDeIa = (r: DisenoDeIa) => {
    const limpio = prepararDiseno(r.html);
    if ('error' in limpio) {
      setError('El diseño llegó con un problema. Vuelve a intentarlo.');
      return;
    }
    setDiseno(limpio.diseno);
    setDeIa(true);
    setArchivo('');
    setNombre((n) => (n.trim() ? n : r.nombre.slice(0, 80)));
    setDescripcion((d) => (d.trim() ? d : r.descripcion.slice(0, 300)));
  };

  const pedirALaIa = async (tipo: 'crear' | 'cambiar') => {
    if (generando) return;
    if (tipo === 'crear' && idea.trim().length < 10) return setError('Cuéntanos un poco más del diseño que quieres.');
    if (tipo === 'cambiar' && cambio.trim().length < 3) return setError('Escribe qué quieres cambiar.');
    if (tipo === 'cambiar' && !diseno) return;
    setError('');
    setGenerando(tipo);
    try {
      const r = await crearDiseno({
        servicio,
        rubro: categoria === 'otro' ? '' : (CATEGORIAS_NEGOCIO.find((c) => c.valor === categoria)?.etiqueta ?? ''),
        estilo: ESTILOS.find((o) => o.valor === estilo)?.etiqueta ?? '',
        nivel,
        colores: variablesDeColor({ primario, secundario }),
        ...(tipo === 'crear' ? { idea } : { anterior: documentoCompleto(diseno!), cambio }),
      });
      usarDeIa(r);
      if (tipo === 'cambiar') setCambio('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos crear el diseño. Vuelve a intentarlo.');
    } finally {
      setGenerando(null);
    }
  };

  // Vista previa: el diseño con un negocio de ejemplo y los colores que puso.
  const vista = useMemo(() => {
    if (!diseno) return null;
    const base = basePropia({
      nombre: nombre || 'Diseño',
      descripcion,
      categoria,
      estilo,
      etiquetas: [],
      ...diseno,
      color_primario: primario,
      color_secundario: secundario,
    });
    return renderizarPlantilla(base, TEXTOS_EJEMPLO, {
      empresa: 'Tu cliente',
      logo: null,
      paleta: { primario, secundario },
    });
  }, [diseno, nombre, descripcion, categoria, estilo, primario, secundario]);

  const valorPrecio = precio.trim() ? Number(precio.replace(/[^\d]/g, '')) : null;
  const precioValido = valorPrecio === null || (valorPrecio > 0 && valorPrecio < 1_000_000);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (generando) return;
    if (!diseno) return setError(modo === 'ia' ? 'Crea tu diseño con IA o sube tu archivo HTML.' : 'Sube el archivo HTML de tu diseño.');
    if (nombre.trim().length < 2) return setError('Ponle un nombre a tu diseño.');
    if (!precioValido) return setError('Revisa el precio: en soles, sin decimales.');
    setGuardando(true);
    setError('');
    // El de la IA se guarda con los colores que eligió: así sale en el catálogo y en su página.
    const final = deIa ? { ...diseno, css: fijarColores(diseno.css, { primario, secundario }) } : diseno;
    const datos = {
      servicio,
      nombre: nombre.trim().slice(0, 80),
      descripcion: descripcion.trim().slice(0, 300),
      categoria,
      estilo,
      nivel,
      precio_desde: valorPrecio,
      color_primario: primario,
      color_secundario: secundario,
    };
    const { error: fallo } = fila
      ? await actualizarPlantilla(fila.id, { ...datos, descripcion: datos.descripcion || null, ...final })
      : await anadirPropia(datos, final);
    setGuardando(false);
    if (fallo) return setError(fallo);
    onListo();
  };

  const ideas = IDEAS[servicio] ?? [];

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-subir-diseno"
    >
      <form
        onSubmit={(e) => void guardar(e)}
        className="card animate-fade-up max-h-[92vh] w-full max-w-5xl overflow-y-auto p-6 sm:p-8"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="titulo-subir-diseno" className="text-2xl">
              {fila ? 'Editar mi diseño' : 'Nuevo diseño'}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Créalo con IA contando lo que quieres, o sube tu propio HTML. Tus clientes lo verán con su nombre y sus colores.
            </p>
          </div>
          <button type="button" onClick={cerrar} className="btn btn-ghost !py-1.5 text-sm">
            Cerrar
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          {/* ----------------------------------------------------- datos */}
          <div className="min-w-0 space-y-4">
            <label className="block text-sm">
              <span className="mb-1.5 block text-ink-muted">Servicio</span>
              <select value={servicio} onChange={(e) => setServicio(e.target.value)} className="field">
                {opcionesServicio.map((s) => (
                  <option key={s.clave} value={s.clave}>
                    {s.icono} {s.nombre}
                  </option>
                ))}
              </select>
              {!esWeb && (
                <span className="mt-1 block text-xs text-ink-subtle">
                  Muestra cómo se vería tu sistema (pantallas, panel, app): el cliente lo ve con su nombre y sus colores antes
                  de elegirte.
                </span>
              )}
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 block text-ink-muted">{esWeb ? 'Para qué tipo de negocio' : 'Pensado para (rubro)'}</span>
                <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaNegocio)} className="field">
                  {CATEGORIAS_NEGOCIO.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.valor === 'otro' && !esWeb ? 'Cualquier rubro' : c.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-ink-muted">Estilo</span>
                <select value={estilo} onChange={(e) => setEstilo(e.target.value)} className="field">
                  {ESTILOS.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* ------------------------------------------- IA o archivo */}
            <div role="tablist" aria-label="Cómo crear el diseño" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-overlay p-1 text-sm">
              {(
                [
                  ['ia', '✨ Crear con IA'],
                  ['archivo', 'Subir mi HTML'],
                ] as const
              ).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  type="button"
                  role="tab"
                  aria-selected={modo === valor}
                  onClick={() => setModo(valor)}
                  className={
                    'rounded-lg px-3 py-2 font-medium transition-colors ' +
                    (modo === valor ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-muted hover:text-ink')
                  }
                >
                  {etiqueta}
                </button>
              ))}
            </div>

            {modo === 'ia' ? (
              <div className="space-y-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
                {diseno && (
                  <div>
                    <label className="block text-sm">
                      <span className="mb-1.5 block font-medium text-ink">Pedir un cambio</span>
                      <span className="flex gap-2">
                        <input
                          value={cambio}
                          onChange={(e) => setCambio(e.target.value.slice(0, 500))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void pedirALaIa('cambiar');
                            }
                          }}
                          className="field min-w-0 flex-1"
                          placeholder={esWeb ? 'Ej: agrega una sección de horarios' : 'Ej: agrega un módulo de inventario al menú'}
                          disabled={!!generando}
                        />
                        <button
                          type="button"
                          onClick={() => void pedirALaIa('cambiar')}
                          disabled={!!generando || cambio.trim().length < 3}
                          className="btn btn-primary shrink-0 !px-3"
                        >
                          {generando === 'cambiar' ? 'Cambiando…' : 'Aplicar'}
                        </button>
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => descargar(documentoCompleto(deIa ? { ...diseno, css: fijarColores(diseno.css, { primario, secundario }) } : diseno), nombreDeArchivo(nombre))}
                      className="mt-2 text-xs font-medium text-accent hover:underline"
                    >
                      Descargar el HTML para editarlo a mano
                    </button>
                  </div>
                )}

                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium text-ink">
                    {diseno ? 'O crea uno nuevo desde cero' : 'Describe el diseño que quieres'}
                  </span>
                  <textarea
                    value={idea}
                    onChange={(e) => setIdea(e.target.value.slice(0, 800))}
                    className="field min-h-[96px]"
                    placeholder={
                      ideas[0] ? `Ej: ${ideas[0]}` : 'Ej: la pantalla principal de tu servicio, qué ve tu cliente y qué datos muestra.'
                    }
                    disabled={!!generando}
                  />
                </label>
                {!idea.trim() && ideas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs text-ink-subtle">Ideas:</span>
                    {ideas.map((texto) => (
                      <button
                        key={texto}
                        type="button"
                        onClick={() => setIdea(texto)}
                        className="rounded-full border border-line bg-surface-raised px-2.5 py-1 text-left text-xs text-ink-muted hover:border-accent/50 hover:text-ink"
                      >
                        {texto.split(':')[0]}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void pedirALaIa('crear')}
                    disabled={!!generando || idea.trim().length < 10}
                    className={diseno ? 'btn btn-ghost' : 'btn btn-primary'}
                  >
                    {generando === 'crear' ? 'Creando…' : diseno ? '✨ Crear uno nuevo' : '✨ Crear diseño'}
                  </button>
                  <span className="text-xs text-ink-subtle">
                    Usa el servicio, el rubro, el estilo y el nivel que elijas. Tarda 1 o 2 minutos.
                  </span>
                </div>
              </div>
            ) : (
              <>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-ink-muted">Archivo HTML {fila && '(opcional: solo si lo cambias)'}</span>
                  <input
                    type="file"
                    accept=".html,.htm,text/html"
                    onChange={(e) => void leerArchivo(e.target.files?.[0])}
                    className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
                  />
                  {archivo && <span className="mt-1 block text-xs text-positive">✓ {archivo} listo</span>}
                </label>

                <div className="rounded-xl border border-line bg-surface-overlay/50 p-3 text-xs text-ink-muted">
                  <p className="font-medium text-ink">Huecos que AIB+ rellena con los datos del cliente:</p>
                  <ul className="mt-1.5 space-y-0.5 font-mono">
                    <li>{'{{negocio}}'} — su nombre</li>
                    <li>{'{{{marca}}}'} — su logo (o su nombre)</li>
                    <li>{'{{descripcion}}'} — a qué se dedica</li>
                    <li>{'{{anio}}'} — el año</li>
                    <li>var(--aib-primario), var(--aib-secundario) — sus colores</li>
                    <li>data-aib-foto — un espacio donde pone su foto</li>
                  </ul>
                  <button
                    type="button"
                    onClick={() =>
                      descargar(esWeb ? EJEMPLO_PLANTILLA : EJEMPLO_SISTEMA, esWeb ? 'plantilla-ejemplo-aib.html' : 'sistema-ejemplo-aib.html')
                    }
                    className="mt-2 font-medium text-accent hover:underline"
                  >
                    {esWeb ? 'Descargar una página de ejemplo' : 'Descargar un panel de ejemplo'}
                  </button>
                  <p className="mt-1.5">Los scripts se quitan: es un diseño, no una aplicación.</p>
                </div>
              </>
            )}

            <label className="block text-sm">
              <span className="mb-1.5 block text-ink-muted">Nombre del diseño</span>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                maxLength={80}
                className="field"
                placeholder={esWeb ? 'Ej: Restaurante moderno' : 'Ej: CRM para tiendas'}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-ink-muted">Descripción corta (opcional)</span>
              <input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                maxLength={300}
                className="field"
                placeholder="Ej: Carta por categorías y pedidos por WhatsApp"
              />
            </label>

            <fieldset>
              <legend className="mb-1.5 text-sm text-ink-muted">Nivel</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {NIVELES.map((n) => (
                  <label
                    key={n.valor}
                    className={
                      'cursor-pointer rounded-xl border p-3 text-xs transition-colors ' +
                      (nivel === n.valor ? 'border-accent bg-accent/5' : 'border-line hover:border-accent/50')
                    }
                  >
                    <input
                      type="radio"
                      name="nivel"
                      value={n.valor}
                      checked={nivel === n.valor}
                      onChange={() => setNivel(n.valor)}
                      className="sr-only"
                    />
                    <span className="block text-sm font-semibold text-ink">{n.etiqueta}</span>
                    <span className="mt-0.5 block text-ink-muted">{n.detalle}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
              <label className="block text-sm">
                <span className="mb-1.5 block text-ink-muted">Precio para el cliente</span>
                <span className="relative block">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle">desde S/</span>
                  <input
                    value={precio}
                    onChange={(e) => setPrecio(e.target.value.replace(/[^\d]/g, '').slice(0, 7))}
                    inputMode="numeric"
                    placeholder="900"
                    aria-invalid={!precioValido}
                    className="field !pl-20 tabular-nums"
                  />
                </span>
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-ink-muted">Color 1</span>
                <input type="color" value={primario} onChange={(e) => setPrimario(e.target.value)} className="h-11 w-14 cursor-pointer rounded-lg border border-line" />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-ink-muted">Color 2</span>
                <input type="color" value={secundario} onChange={(e) => setSecundario(e.target.value)} className="h-11 w-14 cursor-pointer rounded-lg border border-line" />
              </label>
            </div>
          </div>

          {/* ---------------------------------------------------- vista previa */}
          <div className="min-w-0">
            <p className="mb-2 text-sm text-ink-muted">Así lo verá un cliente (con sus colores):</p>
            <div className="relative overflow-hidden rounded-xl border border-line">
              {vista ? (
                <MiniVista documento={vista} titulo="Vista previa de tu diseño" alto={420} inmediata interactiva />
              ) : (
                <div className="grid h-[420px] place-items-center bg-surface-overlay/40 p-6 text-center text-sm text-ink-subtle">
                  {modo === 'ia' ? 'Describe tu diseño y tócalo en «Crear diseño»: aparecerá aquí.' : 'Sube tu archivo HTML para verlo aquí.'}
                </div>
              )}
              {generando && (
                <div className="absolute inset-0 grid place-items-center bg-surface-raised/85 p-6 text-center backdrop-blur-sm" aria-live="polite">
                  <div>
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
                    <p className="mt-3 font-medium text-ink">
                      {generando === 'crear' ? 'Creando tu diseño…' : 'Aplicando tu cambio…'}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Suele tardar 1 o 2 minutos · {segundos} s
                    </p>
                  </div>
                </div>
              )}
            </div>
            {deIa && diseno && !generando && (
              <p className="mt-2 text-xs text-ink-subtle">
                Revísalo bien antes de publicarlo: puedes navegarlo aquí, pedirle cambios o descargarlo para ajustarlo a mano.
              </p>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-5 text-sm text-negative">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={cerrar} className="btn btn-ghost">
            Cancelar
          </button>
          <button type="submit" disabled={guardando || !diseno || !!generando} className="btn btn-primary">
            {guardando ? 'Guardando…' : fila ? 'Guardar cambios' : 'Publicar diseño'}
          </button>
        </div>
      </form>
    </div>
  );
}
