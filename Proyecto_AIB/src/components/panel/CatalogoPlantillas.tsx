import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listarMisPlantillas,
  anadirPlantilla,
  basesDeBibliotecaEnUso,
  actualizarPlantilla,
  quitarPlantilla,
  type PlantillaDelCatalogo,
} from '../../lib/catalogo';
import { CATEGORIAS_NEGOCIO, renderizarPlantilla, type PlantillaBase } from '../../lib/plantillas';
import { PREGUNTAS_WEB, etiquetaDe, iconoDeClave, nombreDeClave, solesEnteros } from '../../lib/servicios';
import {
  misFormularios,
  misServicios,
  type PreguntaPropia,
  type ServicioDelIngeniero,
} from '../../lib/formularios';
import { PLANTILLAS_BASE } from '../../plantillas';
import { EditorFormulario } from './EditorFormulario';
import { MiniVista } from './MiniVista';
import { SubirDiseno } from './SubirDiseno';
import { NIVELES, type NivelPlantilla } from '../../lib/plantillaPropia';

const ESTILOS = PREGUNTAS_WEB.find((p) => p.id === 'estilo')?.opciones ?? [];

/** La plantilla tal como la diseñó el ingeniero: sus colores y textos de ejemplo. */
function documentoDe(base: PlantillaBase): string {
  return renderizarPlantilla(base, base.ejemplo, { empresa: 'Tu cliente', logo: null, paleta: null });
}

function etiquetaCategoria(valor: string): string {
  return CATEGORIAS_NEGOCIO.find((c) => c.valor === valor)?.etiqueta ?? valor;
}

/** "#Hombres, denim  #formal" → ["hombres", "denim", "formal"] */
function leerEtiquetas(texto: string): string[] {
  const limpias = texto
    .split(/[\s,]+/)
    .map((e) => e.replace(/^#/, '').trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(limpias)].slice(0, 20);
}

/**
 * Catálogo de plantillas del ingeniero.
 *
 * Es el lugar donde decide qué ofrece a sus clientes: sube sus propios
 * diseños, les pone nivel y precio, decide cuáles publica y ve cuáles le
 * consiguen propuestas aceptadas. El administrador tiene además la biblioteca
 * de AIB+.
 */
export function CatalogoPlantillas({ esAdmin }: { esAdmin: boolean }) {
  const [plantillas, setPlantillas] = useState<PlantillaDelCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sinConfigurar, setSinConfigurar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const [filtroServicio, setFiltroServicio] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroEstilo, setFiltroEstilo] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [ampliada, setAmpliada] = useState<PlantillaBase | null>(null);
  // 'nuevo': subiendo un diseño; una plantilla: editando esa.
  const [subiendo, setSubiendo] = useState<PlantillaDelCatalogo | 'nuevo' | null>(null);
  const [servicioNuevo, setServicioNuevo] = useState<string | undefined>(undefined);

  // Lo que ofrece y sus preguntas por servicio.
  const [servicios, setServicios] = useState<ServicioDelIngeniero[]>([]);
  const [formularios, setFormularios] = useState<Record<string, PreguntaPropia[]>>({});
  const [editandoFormulario, setEditandoFormulario] = useState<ServicioDelIngeniero | null>(null);
  // Las de la biblioteca que ya publica algún ingeniero.
  const [enUso, setEnUso] = useState<string[]>([]);

  useEffect(() => {
    let activo = true;
    listarMisPlantillas().then((r) => {
      if (!activo) return;
      setPlantillas(r.plantillas);
      setSinConfigurar(r.sinConfigurar);
      setCargando(false);
    });
    return () => {
      activo = false;
    };
  }, [version]);

  useEffect(() => {
    let activo = true;
    void Promise.all([misServicios(esAdmin), misFormularios(), esAdmin ? basesDeBibliotecaEnUso() : []]).then(
      ([s, f, u]) => {
        if (!activo) return;
        setServicios(s);
        setFormularios(f);
        setEnUso(u);
      }
    );
    return () => {
      activo = false;
    };
  }, [esAdmin]);

  const subirPara = (clave?: string) => {
    setServicioNuevo(clave);
    setSubiendo('nuevo');
  };

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  const accion = async (promesa: Promise<{ error: string | null }>) => {
    setError(null);
    const { error: e } = await promesa;
    if (e) setError(e);
    recargar();
  };

  const visibles = useMemo(() => {
    const termino = busqueda.replace(/^#/, '').trim().toLowerCase();
    return plantillas.filter(({ fila }) => {
      if (filtroServicio && fila.servicio !== filtroServicio) return false;
      if (filtroTipo && fila.categoria !== filtroTipo) return false;
      if (filtroEstilo && fila.estilo !== filtroEstilo) return false;
      if (termino && !fila.etiquetas.some((e) => e.includes(termino)) && !fila.nombre.toLowerCase().includes(termino)) {
        return false;
      }
      return true;
    });
  }, [plantillas, filtroServicio, filtroTipo, filtroEstilo, busqueda]);

  const disponibles = PLANTILLAS_BASE.filter(
    (b) => !plantillas.some((p) => p.fila.base === b.id) && !enUso.includes(b.id)
  );

  /* ------------------------------------------------------------ estados */

  if (cargando) return <p className="p-6 text-sm text-ink-subtle">Cargando catálogo…</p>;

  if (sinConfigurar) {
    return (
      <div className="card mx-auto my-8 max-w-2xl p-8">
        <h2 className="text-lg font-semibold">Falta preparar la base de datos</h2>
        <p className="mt-2 text-sm text-ink-muted">
          El catálogo necesita las tablas nuevas. Ejecuta una vez el archivo{' '}
          <code className="rounded bg-surface-deep px-1.5 py-0.5 text-xs">supabase_roles_plantillas.sql</code> en
          el editor SQL de Supabase y vuelve a entrar.
        </p>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-5 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">{esAdmin ? 'Catálogo de plantillas' : 'Mis plantillas'}</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Crea con IA o sube diseños para cada servicio que ofreces: tus clientes los ven con su nombre y sus colores antes de elegirte.
            Los publicados los ven los clientes de tu enlace y los de la plataforma; las premium, solo el cliente al que se
            las habilites en su invitación.
          </p>
        </div>
        <button type="button" onClick={() => subirPara()} className="btn btn-primary">
          ✨ Nuevo diseño
        </button>
      </header>

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-negative/30 bg-negative/10 px-4 py-2.5 text-sm text-negative">
          {error}
        </p>
      )}

      {/* ------------------------------------------------- por servicio */}
      {servicios.length > 0 && (
        <TusServicios
          servicios={servicios}
          plantillas={plantillas}
          formularios={formularios}
          onSubir={subirPara}
          onPreguntas={setEditandoFormulario}
        />
      )}

      {/* --------------------------------------------------------- filtros */}
      {plantillas.length > 0 && (
        <div className="mb-6 space-y-3">
          {servicios.length > 1 && (
            <Filtros
              titulo="Servicio"
              valor={filtroServicio}
              onCambio={setFiltroServicio}
              opciones={servicios.map((s) => ({ valor: s.clave, etiqueta: s.nombre }))}
            />
          )}
          <Filtros
            titulo="Tipo"
            valor={filtroTipo}
            onCambio={setFiltroTipo}
            opciones={CATEGORIAS_NEGOCIO.filter((c) => c.valor !== 'otro').map((c) => ({
              valor: c.valor,
              etiqueta: c.etiqueta,
            }))}
          />
          <Filtros
            titulo="Estilo"
            valor={filtroEstilo}
            onCambio={setFiltroEstilo}
            opciones={ESTILOS.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta }))}
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por #etiqueta o nombre"
            className="field max-w-xs !py-2 text-sm"
            aria-label="Buscar plantillas"
          />
        </div>
      )}

      {/* ------------------------------------------------- mis plantillas */}
      {plantillas.length === 0 ? (
        <div className="card mb-10 p-8 text-center">
          <p className="font-medium">Aún no tienes diseños</p>
          <p className="mt-1 text-sm text-ink-muted">
            {esAdmin
              ? 'Sube tu diseño o añade uno de la biblioteca de abajo.'
              : 'Crea tu primer diseño con IA en «Nuevo diseño»: lo describes y en un par de minutos lo tienes. Mientras no tengas ninguno, los clientes de tu enlace ven los diseños de AIB+.'}
          </p>
        </div>
      ) : visibles.length === 0 ? (
        <p className="mb-10 text-sm text-ink-subtle">Ninguna plantilla coincide con esos filtros.</p>
      ) : (
        <div className="mb-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((p) => (
            <TarjetaPlantilla
              key={p.fila.id}
              plantilla={p}
              onVer={() => setAmpliada(p.base)}
              onActivar={(activa) => void accion(actualizarPlantilla(p.fila.id, { activa }))}
              onEtiquetas={(etiquetas) => void accion(actualizarPlantilla(p.fila.id, { etiquetas }))}
              onPrecio={(precio_desde) => void accion(actualizarPlantilla(p.fila.id, { precio_desde }))}
              onNivel={(nivel) => void accion(actualizarPlantilla(p.fila.id, { nivel }))}
              onEditar={p.fila.tipo === 'propia' ? () => setSubiendo(p) : undefined}
              onQuitar={() => void accion(quitarPlantilla(p.fila.id))}
            />
          ))}
        </div>
      )}

      {/* ------------------------------------------------------ biblioteca */}
      {esAdmin && disponibles.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-ink-subtle uppercase">Biblioteca AIB+</h3>
          <p className="mb-4 text-sm text-ink-muted">Plantillas listas para añadir a tu catálogo.</p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {disponibles.map((base) => (
              <article key={base.id} className="card overflow-hidden">
                <MiniVista documento={documentoDe(base)} titulo={`Vista previa de ${base.nombre}`} />
                <div className="p-4">
                  <p className="font-semibold text-ink">{base.nombre}</p>
                  <p className="mt-1 text-xs text-ink-subtle">{etiquetaCategoria(base.categoria)}</p>
                  <p className="mt-2 text-sm text-ink-muted">{base.descripcion}</p>
                  <div className="mt-4 flex gap-2">
                    <button type="button" onClick={() => setAmpliada(base)} className="btn btn-ghost !py-2 text-sm">
                      Ver
                    </button>
                    <button
                      type="button"
                      onClick={() => void accion(anadirPlantilla(base))}
                      className="btn btn-primary !py-2 text-sm"
                    >
                      Añadir a mi catálogo
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {ampliada && <VistaAmpliada base={ampliada} onCerrar={() => setAmpliada(null)} />}
      {editandoFormulario && (
        <EditorFormulario
          servicio={editandoFormulario}
          iniciales={formularios[editandoFormulario.clave] ?? []}
          onCerrar={() => setEditandoFormulario(null)}
          onGuardado={(preguntas) => {
            setFormularios((prev) => ({ ...prev, [editandoFormulario.clave]: preguntas }));
            setEditandoFormulario(null);
          }}
        />
      )}
      {subiendo && (
        <SubirDiseno
          existente={subiendo === 'nuevo' ? undefined : subiendo}
          servicios={servicios}
          servicioInicial={subiendo === 'nuevo' ? servicioNuevo : undefined}
          onCerrar={() => setSubiendo(null)}
          onListo={() => {
            setSubiendo(null);
            recargar();
          }}
        />
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Filtros({
  titulo,
  valor,
  onCambio,
  opciones,
}: {
  titulo: string;
  valor: string;
  onCambio: (v: string) => void;
  opciones: { valor: string; etiqueta: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-14 text-xs text-ink-subtle">{titulo}</span>
      {[{ valor: '', etiqueta: 'Todos' }, ...opciones].map((o) => (
        <button
          key={o.valor || 'todos'}
          type="button"
          onClick={() => onCambio(o.valor)}
          aria-pressed={valor === o.valor}
          className={
            'rounded-full border px-3 py-1 text-xs transition-colors ' +
            (valor === o.valor
              ? 'border-accent bg-accent/15 text-ink'
              : 'border-line text-ink-muted hover:border-accent/50 hover:text-ink')
          }
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

/**
 * Cada servicio que ofrece, con cuántos diseños publicados tiene y sus
 * preguntas propias. Un servicio sin diseños no se ve en la plataforma: el
 * cliente recibe una vista previa hecha por IA.
 */
function TusServicios({
  servicios,
  plantillas,
  formularios,
  onSubir,
  onPreguntas,
}: {
  servicios: ServicioDelIngeniero[];
  plantillas: PlantillaDelCatalogo[];
  formularios: Record<string, PreguntaPropia[]>;
  onSubir: (clave: string) => void;
  onPreguntas: (s: ServicioDelIngeniero) => void;
}) {
  return (
    <div className="mb-8">
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-ink-subtle uppercase">Tus servicios</h3>
      <p className="mb-4 text-sm text-ink-muted">
        Para cada uno: tus diseños y tus preguntas para el cliente. ¿Ofreces algo más? Márcalo en «Mi perfil».
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {servicios.map((s) => {
          const publicados = plantillas.filter((p) => p.fila.servicio === s.clave && p.fila.activa).length;
          const preguntas = formularios[s.clave]?.length ?? 0;
          return (
            <div key={s.clave} className="rounded-xl border border-line bg-surface-raised p-4">
              <p className="font-semibold text-ink">
                <span aria-hidden="true">{s.icono}</span> {s.nombre}
              </p>
              <p className={'mt-1 text-xs ' + (publicados > 0 ? 'text-ink-muted' : 'text-caution')}>
                {publicados > 0
                  ? `${publicados} ${publicados === 1 ? 'diseño publicado' : 'diseños publicados'}`
                  : s.clave === 'web'
                    ? 'Sin diseños: tus clientes ven los de AIB+'
                    : 'Sin diseños: tus clientes verán una vista previa hecha por IA'}
              </p>
              <p className="text-xs text-ink-muted">
                {preguntas > 0 ? `${preguntas} ${preguntas === 1 ? 'pregunta tuya' : 'preguntas tuyas'}` : 'Solo las preguntas de AIB+'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => onSubir(s.clave)} className="btn btn-ghost !px-3 !py-1 text-xs">
                  + Diseño con IA
                </button>
                <button type="button" onClick={() => onPreguntas(s)} className="btn btn-ghost !px-3 !py-1 text-xs">
                  {preguntas > 0 ? 'Editar preguntas' : 'Añadir preguntas'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TarjetaPlantilla({
  plantilla,
  onVer,
  onActivar,
  onEtiquetas,
  onPrecio,
  onNivel,
  onEditar,
  onQuitar,
}: {
  plantilla: PlantillaDelCatalogo;
  onVer: () => void;
  onActivar: (activa: boolean) => void;
  onEtiquetas: (etiquetas: string[]) => void;
  onPrecio: (precio: number | null) => void;
  onNivel: (nivel: NivelPlantilla) => void;
  /** Solo las propias: cambiar el archivo o sus datos. */
  onEditar?: () => void;
  onQuitar: () => void;
}) {
  const { fila, base } = plantilla;
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(fila.etiquetas.map((e) => `#${e}`).join(' '));
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);

  const documento = useMemo(() => documentoDe(base), [base]);
  const tasa = fila.veces_mostrada > 0 ? Math.round((fila.veces_aceptada / fila.veces_mostrada) * 100) : null;

  return (
    <article className={'card overflow-hidden transition-opacity ' + (fila.activa ? '' : 'opacity-60')}>
      <button type="button" onClick={onVer} className="block w-full text-left" aria-label={`Ver ${fila.nombre} en grande`}>
        <MiniVista documento={documento} titulo={`Vista previa de ${fila.nombre}`} />
      </button>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{fila.nombre}</p>
            <p className="mt-0.5 text-xs text-ink-subtle">
              {fila.tipo === 'propia' ? 'Tu diseño' : 'Biblioteca AIB+'} ·{' '}
              {fila.servicio === 'web'
                ? etiquetaCategoria(fila.categoria)
                : `${iconoDeClave(fila.servicio)} ${nombreDeClave(fila.servicio)}`}{' '}
              · {etiquetaDe(ESTILOS, fila.estilo)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onActivar(!fila.activa)}
            aria-pressed={fila.activa}
            className={
              'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ' +
              (fila.activa
                ? 'bg-positive/15 text-positive hover:bg-positive/25'
                : 'bg-line text-ink-muted hover:text-ink')
            }
            title={fila.activa ? 'La ven tus clientes. Clic para ocultarla.' : 'Oculta. Clic para publicarla.'}
          >
            {fila.activa ? '● Publicada' : '○ Oculta'}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            Nivel
            <select
              value={fila.nivel}
              onChange={(e) => onNivel(e.target.value as NivelPlantilla)}
              className="field !w-auto !py-1 text-xs"
              aria-label="Nivel de la plantilla"
            >
              {NIVELES.map((n) => (
                <option key={n.valor} value={n.valor}>
                  {n.etiqueta}
                </option>
              ))}
            </select>
          </label>
          {onEditar && (
            <button type="button" onClick={onEditar} className="text-xs text-accent hover:underline">
              Editar diseño
            </button>
          )}
        </div>
        {fila.nivel === 'premium' && (
          <p className="mt-1.5 text-[11px] text-ink-subtle">
            No sale en la plataforma: habilítala en la invitación del cliente especial.
          </p>
        )}

        {/* Etiquetas */}
        {editando ? (
          <form
            className="mt-3"
            onSubmit={(e) => {
              e.preventDefault();
              onEtiquetas(leerEtiquetas(texto));
              setEditando(false);
            }}
          >
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="field !py-1.5 text-xs"
              placeholder="#hombres #denim #formal"
              aria-label="Etiquetas"
              autoFocus
            />
            <div className="mt-2 flex gap-2">
              <button type="submit" className="btn btn-primary !px-3 !py-1 text-xs">
                Guardar
              </button>
              <button type="button" onClick={() => setEditando(false)} className="btn btn-ghost !px-3 !py-1 text-xs">
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {fila.etiquetas.slice(0, 8).map((e) => (
              <span key={e} className="rounded-full bg-surface-overlay px-2 py-0.5 text-[11px] text-ink-muted">
                #{e}
              </span>
            ))}
            <button type="button" onClick={() => setEditando(true)} className="text-[11px] text-accent hover:underline">
              Editar
            </button>
          </div>
        )}

        <PrecioDesde precio={fila.precio_desde} onGuardar={onPrecio} />

        {/* Contadores */}
        <dl className="mt-4 grid grid-cols-4 gap-2 border-t border-line pt-3 text-center">
          {(
            [
              ['Mostrada', fila.veces_mostrada],
              ['Elegida', fila.veces_elegida],
              ['Aceptada', fila.veces_aceptada],
              ['Éxito', tasa === null ? '—' : `${tasa}%`],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dd className="text-base font-semibold text-ink tabular-nums">{v}</dd>
              <dt className="text-[10px] text-ink-subtle uppercase">{k}</dt>
            </div>
          ))}
        </dl>

        <div className="mt-3 text-right">
          {confirmarQuitar ? (
            <span className="text-xs">
              ¿Quitarla del catálogo?{' '}
              <button type="button" onClick={onQuitar} className="font-medium text-negative hover:underline">
                Sí, quitar
              </button>{' '}
              ·{' '}
              <button type="button" onClick={() => setConfirmarQuitar(false)} className="text-ink-muted hover:underline">
                No
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmarQuitar(true)} className="text-xs text-ink-subtle hover:text-negative">
              Quitar del catálogo
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Precio orientativo que ve el cliente al elegir el diseño ("desde S/ X").
 * Vacío: no se le muestra ninguno.
 */
function PrecioDesde({ precio, onGuardar }: { precio: number | null; onGuardar: (p: number | null) => void }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(precio ? String(precio) : '');
  const valor = texto.trim() === '' ? null : Number(texto.replace(/[^\d]/g, ''));
  const valido = valor === null || (Number.isInteger(valor) && valor > 0 && valor < 1_000_000);

  if (editando) {
    return (
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valido) return;
          onGuardar(valor);
          setEditando(false);
        }}
      >
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          Desde S/
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            inputMode="numeric"
            className="field !w-24 !py-1 text-xs"
            placeholder="1200"
            aria-label="Precio desde, en soles"
            aria-invalid={!valido}
            autoFocus
          />
        </label>
        <button type="submit" disabled={!valido} className="btn btn-primary !px-3 !py-1 text-xs">
          Guardar
        </button>
        <button type="button" onClick={() => setEditando(false)} className="btn btn-ghost !px-3 !py-1 text-xs">
          Cancelar
        </button>
      </form>
    );
  }

  return (
    <div
      className={
        'mt-3 flex items-center justify-between gap-2 rounded-lg px-3 py-2 ' +
        (precio ? 'bg-accent/5' : 'border border-dashed border-caution/50')
      }
    >
      <div className="min-w-0">
        <p className="text-[11px] text-ink-subtle uppercase">Precio para el cliente</p>
        {precio ? (
          <p className="text-base font-semibold text-ink tabular-nums">desde {solesEnteros(precio)}</p>
        ) : (
          <p className="text-xs text-caution">Sin precio: el cliente no verá ninguno</p>
        )}
      </div>
      <button type="button" onClick={() => setEditando(true)} className="btn btn-ghost shrink-0 !px-3 !py-1 text-xs">
        {precio ? 'Cambiar' : 'Poner precio'}
      </button>
    </div>
  );
}

function VistaAmpliada({ base, onCerrar }: { base: PlantillaBase; onCerrar: () => void }) {
  const [movil, setMovil] = useState(false);
  const documento = useMemo(() => documentoDe(base), [base]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-surface-deep/95 p-4 backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-label={`Vista previa de ${base.nombre}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-semibold">{base.nombre}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setMovil(!movil)} className="btn btn-ghost !py-1.5 text-sm">
            {movil ? 'Ver escritorio' : 'Ver móvil'}
          </button>
          <button type="button" onClick={onCerrar} className="btn btn-primary !py-1.5 text-sm">
            Cerrar
          </button>
        </div>
      </div>
      <div className="flex flex-1 justify-center overflow-hidden rounded-xl border border-line bg-white">
        <iframe
          title={`Vista previa de ${base.nombre}`}
          srcDoc={documento}
          sandbox="allow-scripts"
          className={'h-full border-0 ' + (movil ? 'w-[390px]' : 'w-full')}
        />
      </div>
    </div>
  );
}
