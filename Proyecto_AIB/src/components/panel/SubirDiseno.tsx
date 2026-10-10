import { useEffect, useMemo, useState } from 'react';
import { actualizarPlantilla, anadirPropia, type PlantillaDelCatalogo } from '../../lib/catalogo';
import { CATEGORIAS_NEGOCIO, renderizarPlantilla, type CategoriaNegocio } from '../../lib/plantillas';
import {
  basePropia,
  EJEMPLO_PLANTILLA,
  EJEMPLO_SISTEMA,
  NIVELES,
  prepararDiseno,
  TEXTOS_EJEMPLO,
  type DisenoPropio,
  type NivelPlantilla,
} from '../../lib/plantillaPropia';
import type { ServicioDelIngeniero } from '../../lib/formularios';
import { PREGUNTAS_WEB, iconoDeClave, nombreDeClave } from '../../lib/servicios';
import { MiniVista } from './MiniVista';

const ESTILOS = PREGUNTAS_WEB.find((p) => p.id === 'estilo')?.opciones ?? [];

/** Lo que pesa como máximo el archivo antes de limpiarlo. */
const MAX_ARCHIVO = 2_000_000;

/**
 * Descarga la página de ejemplo, con todos los huecos de AIB+: una web, o un
 * panel para los demás servicios (CRM, ERP…).
 */
function descargarEjemplo(sistema: boolean) {
  const url = URL.createObjectURL(new Blob([sistema ? EJEMPLO_SISTEMA : EJEMPLO_PLANTILLA], { type: 'text/html' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = sistema ? 'sistema-ejemplo-aib.html' : 'plantilla-ejemplo-aib.html';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * El ingeniero sube su propio diseño (o cambia uno que ya subió): el HTML, su
 * servicio, nombre, rubro, estilo, nivel y precio. Sale publicado.
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

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCerrar]);

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
    setArchivo(f.name);
    if (!nombre.trim()) setNombre(f.name.replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').slice(0, 60));
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
    if (!diseno) return setError('Sube el archivo HTML de tu diseño.');
    if (nombre.trim().length < 2) return setError('Ponle un nombre a tu diseño.');
    if (!precioValido) return setError('Revisa el precio: en soles, sin decimales.');
    setGuardando(true);
    setError('');
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
      ? await actualizarPlantilla(fila.id, { ...datos, descripcion: datos.descripcion || null, ...diseno })
      : await anadirPropia(datos, diseno);
    setGuardando(false);
    if (fallo) return setError(fallo);
    onListo();
  };

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
              {fila ? 'Editar mi diseño' : 'Subir mi diseño'}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Sube tu página en HTML (con Bootstrap o tus propios estilos). Tus clientes la verán con su nombre y sus colores.
            </p>
          </div>
          <button type="button" onClick={onCerrar} className="btn btn-ghost !py-1.5 text-sm">
            Cerrar
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          {/* ----------------------------------------------------- datos */}
          <div className="space-y-4">
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
                  Sube cómo se vería tu sistema (pantallas, panel, app): el cliente lo ve con su nombre y sus colores antes de
                  elegirte.
                </span>
              )}
            </label>

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
              <button type="button" onClick={() => descargarEjemplo(!esWeb)} className="mt-2 font-medium text-accent hover:underline">
                {esWeb ? 'Descargar una página de ejemplo' : 'Descargar un panel de ejemplo'}
              </button>
              <p className="mt-1.5">Los scripts se quitan: es un diseño, no una aplicación.</p>
            </div>

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
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 block text-ink-muted">{esWeb ? 'Para qué tipo de negocio' : 'Pensado para (rubro)'}</span>
                <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaNegocio)} className="field">
                  {CATEGORIAS_NEGOCIO.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.etiqueta}
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
          <div>
            <p className="mb-2 text-sm text-ink-muted">Así lo verá un cliente (con sus colores):</p>
            <div className="overflow-hidden rounded-xl border border-line">
              {vista ? (
                <MiniVista documento={vista} titulo="Vista previa de tu diseño" alto={420} inmediata interactiva />
              ) : (
                <div className="grid h-[420px] place-items-center bg-surface-overlay/40 p-6 text-center text-sm text-ink-subtle">
                  Sube tu archivo HTML para verlo aquí.
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-5 text-sm text-negative">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCerrar} className="btn btn-ghost">
            Cancelar
          </button>
          <button type="submit" disabled={guardando || !diseno} className="btn btn-primary">
            {guardando ? 'Guardando…' : fila ? 'Guardar cambios' : 'Publicar diseño'}
          </button>
        </div>
      </form>
    </div>
  );
}
