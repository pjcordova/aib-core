import { useEffect, useRef, useState } from 'react';
import type { QAHistory } from '../../Types/productOwner';
import {
  generarPreviewWeb,
  rellenarPlantilla,
  ApiError,
  type TokenUsage,
} from '../../lib/api';
import {
  guardarProyecto,
  actualizarMaqueta,
  enviarEncargo,
  guardarEdicion,
  type PlantillaUsada,
} from '../../lib/proyectos';
import { prepararLogo, coloresDelLogo } from '../../lib/marca';
import {
  OBJETIVOS_WEB,
  PREGUNTAS_WEB,
  PALETAS,
  etiquetaDe,
  solesEnteros,
  techoPresupuesto,
  type FichaWeb,
  type Paleta,
  type Pregunta,
} from '../../lib/servicios';
import {
  listarPlantillasActivas,
  emparejar,
  registrarEvento,
  type PlantillaDelCatalogo,
} from '../../lib/catalogo';
import {
  CATEGORIAS_NEGOCIO,
  renderizarPlantilla,
  seccionesQueFaltan,
  type CategoriaNegocio,
} from '../../lib/plantillas';
import { obtenerPlantillaBase } from '../../plantillas';
import { ContactoEncargo, type DatosEncargo } from '../ContactoEncargo';
import { ErrorState } from '../ui/Primitives';
import { MiniVista } from '../panel/MiniVista';
import { WebPreview } from './WebPreview';

type Fase = 'preguntas' | 'buscando' | 'eligiendo' | 'generando' | 'listo' | 'error';
type EstadoGuardado = 'inactivo' | 'guardando' | 'guardado' | 'fallo';
type EstadoAceptacion = 'inactivo' | 'procesando' | 'aceptado' | 'fallo';

interface Props {
  /** Avisa al padre cuando el proyecto queda guardado, para refrescar listas. */
  onGuardado?: () => void;
  /** Nombre del negocio ya conocido (cliente invitado): se rellena, editable. */
  empresaInicial?: string;
  /** El cliente pasó la primera pregunta. Se avisa una vez. */
  onEmpezar?: () => void;
}

const MAX_EMPRESA = 80;
const MAX_RUBRO = 600;
const MIN_RUBRO = 10;

/**
 * Módulo web. Seis pasos, uno por pantalla, casi todos de un clic. No hay ni
 * una llamada a la IA mientras el cliente contesta.
 *
 * Al terminar, AIB+ busca en el catálogo del ingeniero las plantillas que
 * encajan con el negocio y le enseña las mejores ya con su nombre, su logo y
 * sus colores —eso es instantáneo y no gasta tokens—. El cliente elige una y
 * solo entonces la IA escribe sus textos. Si ninguna encaja, o prefiere algo a
 * medida, se genera una maqueta nueva como antes.
 */
export function FlujoWeb({ onGuardado, empresaInicial, onEmpezar }: Props) {
  const [paso, setPaso] = useState(0);
  const [fase, setFase] = useState<Fase>('preguntas');

  // Respuestas
  const [empresa, setEmpresa] = useState(empresaInicial ?? '');
  const [categoria, setCategoria] = useState<CategoriaNegocio | ''>('');
  const [rubro, setRubro] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [paletaLogo, setPaletaLogo] = useState<Paleta | null>(null);
  const [paleta, setPaleta] = useState<Paleta | null>(null);
  const [secciones, setSecciones] = useState<string[]>([]);
  const [estilo, setEstilo] = useState('');
  const [presupuesto, setPresupuesto] = useState('');
  const [objetivo, setObjetivo] = useState('');

  // Plantillas
  const [candidatas, setCandidatas] = useState<PlantillaDelCatalogo[]>([]);
  const [plantillaUsada, setPlantillaUsada] = useState<PlantillaUsada | null>(null);
  const ultimaElegida = useRef<PlantillaDelCatalogo | null>(null);

  // Resultado
  const [cuerpo, setCuerpo] = useState('');
  const [documento, setDocumento] = useState('');
  const [consumo, setConsumo] = useState<TokenUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<EstadoGuardado>('inactivo');
  const [aceptacion, setAceptacion] = useState<EstadoAceptacion>('inactivo');
  const [pidiendoContacto, setPidiendoContacto] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const proyectoId = useRef<string | null>(null);
  /** El mismo id, como estado: la maqueta lo necesita para ofrecer el enlace de compartir. */
  const [idGuardado, setIdGuardado] = useState<string | null>(null);
  const reintentar = useRef<(() => void) | null>(null);

  const pregunta = PREGUNTAS_WEB[paso];
  const total = PREGUNTAS_WEB.length;

  const ficha = (): FichaWeb => ({
    empresa: empresa.trim(),
    categoria,
    rubro: rubro.trim(),
    logo,
    paleta: paleta ?? PALETAS[0],
    secciones,
    estilo,
    presupuesto,
    objetivo,
  });

  const estiloTexto = (f: FichaWeb) =>
    etiquetaDe(PREGUNTAS_WEB.find((p) => p.id === 'estilo')?.opciones, f.estilo);

  /* -------------------------------------------------------------- navegación */

  const empezado = useRef(false);
  const avanzar = () => {
    if (paso === 0 && !empezado.current) {
      empezado.current = true;
      onEmpezar?.();
    }
    if (paso < total - 1) setPaso(paso + 1);
  };
  const retroceder = () => {
    if (paso > 0) setPaso(paso - 1);
  };

  /* ----------------------------------------------------------- persistencia */

  /**
   * Las respuestas se guardan también como historial pregunta → respuesta, el
   * mismo formato que usa el discovery con IA. Así la documentación y el
   * dashboard del ingeniero funcionan sin saber de dónde vienen.
   */
  const historialDe = (f: FichaWeb, plantilla: PlantillaUsada | null): QAHistory[] => {
    const seccionesPregunta = PREGUNTAS_WEB.find((p) => p.id === 'secciones');
    const presupuestoPregunta = PREGUNTAS_WEB.find((p) => p.id === 'presupuesto');
    // Lo que pidió y la plantilla no trae: el ingeniero tiene que añadirlo.
    const base = plantilla ? obtenerPlantillaBase(plantilla.base) : null;
    const faltan = base ? seccionesQueFaltan(base, f.secciones) : [];
    return [
      { question_id: 'empresa', question: 'Nombre de la empresa', answer: f.empresa },
      {
        question_id: 'categoria',
        question: 'Tipo de negocio',
        answer: CATEGORIAS_NEGOCIO.find((c) => c.valor === f.categoria)?.etiqueta ?? '—',
      },
      {
        question_id: 'objetivo',
        question: '¿Para qué quiere su web?',
        answer: etiquetaDe(OBJETIVOS_WEB, f.objetivo ?? '') || '—',
      },
      { question_id: 'rubro', question: '¿A qué se dedica la empresa?', answer: f.rubro },
      { question_id: 'logo', question: '¿Tiene logo?', answer: f.logo ? 'Sí, lo adjuntó' : 'No' },
      {
        question_id: 'paleta',
        question: 'Colores de la web',
        answer: `${f.paleta.nombre} (${f.paleta.primario} y ${f.paleta.secundario})`,
      },
      {
        question_id: 'secciones',
        question: 'Secciones de la web',
        answer: ['Portada', ...f.secciones.map((s) => etiquetaDe(seccionesPregunta?.opciones, s))].join(', '),
      },
      { question_id: 'estilo', question: 'Estilo visual', answer: estiloTexto(f) },
      {
        question_id: 'presupuesto',
        question: 'Presupuesto aproximado',
        answer: etiquetaDe(presupuestoPregunta?.opciones, f.presupuesto),
      },
      ...(plantilla
        ? [{ question_id: 'plantilla', question: 'Plantilla elegida', answer: plantilla.nombre }]
        : []),
      ...(plantilla?.precio_desde
        ? [
            {
              question_id: 'precio-orientativo',
              question: 'Precio orientativo que vio el cliente al elegir el diseño',
              answer: `Desde ${solesEnteros(plantilla.precio_desde)}`,
            },
          ]
        : []),
      ...(faltan.length
        ? [
            {
              question_id: 'secciones-pendientes',
              question: 'Secciones pedidas que la plantilla no incluye (hay que añadirlas)',
              answer: faltan.map((s) => etiquetaDe(seccionesPregunta?.opciones, s)).join(', '),
            },
          ]
        : []),
    ];
  };

  const servicioDe = (f: FichaWeb) => `Página web para ${f.empresa}`;

  /** Guarda o actualiza el proyecto después de enseñar la maqueta, nunca antes. */
  const guardar = async (
    cambios: { html?: string; documento?: string },
    plantilla: PlantillaUsada | null,
    usage?: TokenUsage
  ) => {
    const f = ficha();
    setGuardado('guardando');
    if (proyectoId.current) {
      const { ok } = await actualizarMaqueta(proyectoId.current, cambios, usage);
      setGuardado(ok ? 'guardado' : 'fallo');
      return;
    }
    const { id, error: errorGuardado } = await guardarProyecto({
      servicio: servicioDe(f),
      historial: historialDe(f, plantilla),
      tipoServicio: 'web',
      ...cambios,
      ficha: f,
      plantilla: plantilla ?? undefined,
      usage,
    });
    proyectoId.current = id;
    setIdGuardado(id);
    setGuardado(errorGuardado ? 'fallo' : 'guardado');
    if (!errorGuardado) onGuardado?.();
  };

  /* ---------------------------------------------------------------- acciones */

  /** Tras la última pregunta: ¿hay plantillas del ingeniero que encajen? */
  const terminar = async () => {
    setFase('buscando');
    const f = ficha();
    const activas = await listarPlantillasActivas();
    const mejores = emparejar(activas, {
      categoria,
      estilo,
      rubro: f.rubro,
      empresa: f.empresa,
      secciones: f.secciones,
    });

    if (mejores.length === 0) {
      void generarConIA();
      return;
    }

    setCandidatas(mejores);
    setFase('eligiendo');
    for (const c of mejores) void registrarEvento(c.fila.id, 'mostrada');
  };

  /** El cliente eligió una plantilla: la IA escribe solo sus textos. */
  const elegirPlantilla = async (c: PlantillaDelCatalogo) => {
    const f = ficha();
    const usada: PlantillaUsada = {
      id: c.fila.id,
      base: c.base.id,
      nombre: c.fila.nombre,
      precio_desde: c.fila.precio_desde,
    };
    const esNueva = ultimaElegida.current?.fila.id !== c.fila.id;
    ultimaElegida.current = c;

    if (esNueva) void registrarEvento(c.fila.id, 'elegida');
    setPlantillaUsada(usada);
    setCuerpo('');
    setFase('generando');
    setError(null);

    try {
      const { textos, usage } = await rellenarPlantilla(c.base.id, {
        empresa: f.empresa,
        rubro: f.rubro,
        estilo: estiloTexto(f),
        secciones: f.secciones,
        objetivo: f.objetivo,
      });
      const doc = renderizarPlantilla(c.base, textos, f);
      setDocumento(doc);
      setConsumo(usage ?? null);
      setFase('listo');
      await guardar({ documento: doc }, usada, usage);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos preparar tu maqueta.');
      setFase('error');
      reintentar.current = () => void elegirPlantilla(c);
    }
  };

  /** Maqueta nueva generada por IA: sin plantillas que encajen, o a petición. */
  const generarConIA = async () => {
    const f = ficha();
    setPlantillaUsada(null);
    setDocumento('');
    setFase('generando');
    setError(null);

    try {
      const seccionesPregunta = PREGUNTAS_WEB.find((p) => p.id === 'secciones');
      const { html, usage } = await generarPreviewWeb({
        empresa: f.empresa,
        rubro: f.rubro,
        estilo: estiloTexto(f),
        secciones: f.secciones.map((s) => etiquetaDe(seccionesPregunta?.opciones, s)),
        paleta: { nombre: f.paleta.nombre, primario: f.paleta.primario, secundario: f.paleta.secundario },
        objetivo: f.objetivo,
      });
      setCuerpo(html);
      setConsumo(usage ?? null);
      setFase('listo');
      await guardar({ html, documento: undefined }, null, usage);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos armar tu maqueta.');
      setFase('error');
      reintentar.current = () => void generarConIA();
    }
  };

  /** El cliente editó textos o colores a mano: se guarda sin pasar por la IA. */
  const guardarCambios = async (cambios: { documento: string; paleta: Paleta }) => {
    if (!proyectoId.current) return false;
    const { ok } = await guardarEdicion(proyectoId.current, cambios);
    if (ok) {
      setDocumento(cambios.documento);
      setPaleta(cambios.paleta);
    }
    return ok;
  };

  /** El cliente dejó sus datos en el último paso: el encargo pasa al ingeniero. */
  const aceptar = async (datos: DatosEncargo) => {
    if (!proyectoId.current) return;
    const f = ficha();
    setAceptacion('procesando');
    setErrorEnvio(null);
    const { ok, error: errorAceptar } = await enviarEncargo(proyectoId.current, {
      servicio: servicioDe(f),
      historial: historialDe(f, plantillaUsada),
      ...datos,
    });
    if (!ok) {
      console.error('[AIB+] Error enviando el encargo web:', errorAceptar);
      setErrorEnvio('No pudimos enviar tu proyecto. Revisa tu conexión y vuelve a intentarlo.');
      setAceptacion('inactivo');
      return;
    }
    if (plantillaUsada) void registrarEvento(plantillaUsada.id, 'aceptada');
    setPidiendoContacto(false);
    setAceptacion('aceptado');
    onGuardado?.();
  };

  /* ------------------------------------------------------------- pantallas */

  if (fase === 'error' && error) {
    return (
      <div className="py-16">
        <ErrorState message={error} onRetry={() => reintentar.current?.()} />
      </div>
    );
  }

  if (fase === 'buscando') {
    return (
      <div className="grid place-items-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
          <p className="text-sm text-ink-subtle">Buscando diseños para tu negocio…</p>
        </div>
      </div>
    );
  }

  if (fase === 'eligiendo') {
    return (
      <EleccionPlantilla
        candidatas={candidatas}
        ficha={ficha()}
        onElegir={(c) => void elegirPlantilla(c)}
        onAMedida={() => void generarConIA()}
      />
    );
  }

  if (fase === 'generando') {
    return <PantallaArmando empresa={empresa.trim()} conPlantilla={!!plantillaUsada} />;
  }

  if (fase === 'listo' && (documento || cuerpo)) {
    return (
      <div>
        <WebPreview
          cuerpo={cuerpo}
          documento={documento || undefined}
          plantilla={plantillaUsada?.nombre}
          plantillaBase={plantillaUsada?.base}
          ficha={ficha()}
          usage={consumo}
          guardado={guardado}
          aceptacion={aceptacion}
          onRegenerar={() =>
            void (plantillaUsada && ultimaElegida.current
              ? elegirPlantilla(ultimaElegida.current)
              : generarConIA())
          }
          onAceptar={() => setPidiendoContacto(true)}
          onGuardarEdicion={guardarCambios}
          proyectoId={idGuardado}
        />
        {pidiendoContacto && (
          <ContactoEncargo
            tipoServicio="web"
            objetivo={objetivo}
            enviando={aceptacion === 'procesando'}
            error={errorEnvio}
            onEnviar={(datos) => void aceptar(datos)}
            onCancelar={() => setPidiendoContacto(false)}
          />
        )}
        {candidatas.length > 0 && aceptacion !== 'aceptado' && aceptacion !== 'procesando' && (
          <p className="-mt-2 text-center text-sm">
            <button type="button" onClick={() => setFase('eligiendo')} className="text-accent hover:underline">
              ← Ver los otros diseños
            </button>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-8">
      {paso === 0 && (
        <p className="animate-fade-up mb-6 text-center text-sm text-ink-muted">
          ¡Hola! 👋 Vamos a imaginar tu web juntos. Son {total} preguntas rápidas, casi
          todas con un clic, y al final la verás funcionando.
        </p>
      )}

      <Progreso actual={paso + 1} total={total} />

      <article key={pregunta.id} className="card animate-fade-up mt-6 p-6 sm:p-8">
        <h2 className="text-xl font-semibold text-balance">{pregunta.titulo}</h2>
        {pregunta.ayuda && <p className="mt-1.5 text-sm text-ink-muted">{pregunta.ayuda}</p>}

        <div className="mt-6">
          <CuerpoPregunta
            pregunta={pregunta}
            estado={{ empresa, categoria, rubro, logo, paletaLogo, paleta, secciones, estilo, presupuesto, objetivo }}
            acciones={{
              setEmpresa,
              setCategoria,
              setRubro,
              setLogo,
              setPaletaLogo,
              setPaleta: (p) => {
                setPaleta(p);
                avanzar();
              },
              setSecciones,
              setEstilo: (v) => {
                setEstilo(v);
                avanzar();
              },
              setPresupuesto: (v) => setPresupuesto(v),
              setObjetivo: (v) => {
                setObjetivo(v);
                avanzar();
              },
            }}
          />
        </div>

        <Pie
          pregunta={pregunta}
          paso={paso}
          total={total}
          puedeSeguir={puedeSeguir(pregunta, { empresa, categoria, rubro, paleta, secciones, estilo, presupuesto, objetivo })}
          onAtras={retroceder}
          onSeguir={avanzar}
          onTerminar={() => void terminar()}
          logoSubido={!!logo}
        />
      </article>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * La elección "tipo Tinder": las plantillas que mejor encajan, ya con el
 * nombre, el logo y los colores del cliente. Es instantáneo y no gasta tokens;
 * los textos de ejemplo se sustituyen por los suyos al elegir.
 */
function EleccionPlantilla({
  candidatas,
  ficha,
  onElegir,
  onAMedida,
}: {
  candidatas: PlantillaDelCatalogo[];
  ficha: FichaWeb;
  onElegir: (c: PlantillaDelCatalogo) => void;
  onAMedida: () => void;
}) {
  return (
    <section className="animate-fade-up mx-auto max-w-5xl py-10">
      <div className="mb-8 text-center">
        <p className="mb-2 text-sm font-medium tracking-widest text-accent uppercase">¡Listo, {ficha.empresa}!</p>
        <h2 className="text-3xl font-bold text-balance">¿Cuál de estos diseños te gusta más?</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-ink-muted">
          Ya tienen tu nombre y tus colores. Elige uno y escribimos los textos pensando en tu
          negocio.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {candidatas.map((c) => (
          <article key={c.fila.id} className="card group overflow-hidden">
            <MiniVista
              documento={renderizarPlantilla(c.base, c.base.ejemplo, ficha)}
              titulo={`Diseño ${c.fila.nombre}`}
              alto={260}
            />
            <div className="p-4">
              <p className="font-semibold text-ink">{c.fila.nombre}</p>
              <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{c.base.descripcion}</p>
              <Cobertura faltan={seccionesQueFaltan(c.base, ficha.secciones)} />
              {c.fila.precio_desde !== null && (
                <PrecioOrientativo precio={c.fila.precio_desde} presupuesto={ficha.presupuesto} />
              )}
              <button type="button" onClick={() => onElegir(c)} className="btn btn-primary mt-4 w-full">
                Me gusta este
              </button>
            </div>
          </article>
        ))}

        <button
          type="button"
          onClick={onAMedida}
          className="card flex min-h-[260px] flex-col items-center justify-center gap-3 border-dashed p-6 text-center transition-colors hover:border-accent/60"
        >
          <span className="text-3xl" aria-hidden="true">
            ✨
          </span>
          <span className="font-semibold text-ink">Ninguno me convence</span>
          <span className="text-sm text-ink-muted">Crear un diseño a medida con IA. Tarda un poco más.</span>
        </button>
      </div>

      <p className="mt-6 text-center text-xs text-ink-subtle">
        Las fotos y los textos de ejemplo se cambian por los de tu negocio.
      </p>
    </section>
  );
}

/**
 * Si el diseño trae las secciones que pidió. Mejor decirlo aquí que dejar que
 * lo descubra en la maqueta: lo que falte lo añade el ingeniero.
 */
function Cobertura({ faltan }: { faltan: string[] }) {
  const opciones = PREGUNTAS_WEB.find((p) => p.id === 'secciones')?.opciones;
  if (faltan.length === 0) {
    return <p className="mt-2 text-xs text-positive">✓ Incluye todas las secciones que pediste</p>;
  }
  return (
    <p className="mt-2 text-xs text-ink-subtle">
      No incluye {faltan.map((s) => etiquetaDe(opciones, s)).join(', ')}: el ingeniero lo añade
      después.
    </p>
  );
}

/**
 * "Desde S/ X" que fijó el ingeniero. Si pasa del presupuesto que marcó el
 * cliente se le dice aquí, antes de que se ilusione con un diseño.
 */
function PrecioOrientativo({ precio, presupuesto }: { precio: number; presupuesto: string }) {
  const techo = techoPresupuesto(presupuesto);
  const excede = techo !== null && precio > techo;
  return (
    <p className="mt-2 text-sm">
      <span className="font-semibold text-ink">Desde {solesEnteros(precio)}</span>
      {excede && (
        <span className="mt-0.5 block text-xs text-caution">
          Está por encima del presupuesto que marcaste. Puedes elegirlo igual y conversarlo con el
          ingeniero.
        </span>
      )}
    </p>
  );
}

/* -------------------------------------------------------------------------- */

function puedeSeguir(
  p: Pregunta,
  r: {
    empresa: string;
    categoria: string;
    rubro: string;
    paleta: Paleta | null;
    secciones: string[];
    estilo: string;
    presupuesto: string;
    objetivo: string;
  }
): boolean {
  switch (p.id) {
    case 'negocio':
      return r.empresa.trim().length > 0 && !!r.categoria && r.rubro.trim().length >= MIN_RUBRO;
    case 'objetivo':
      return !!r.objetivo;
    case 'logo':
      return true;
    case 'paleta':
      return !!r.paleta;
    case 'secciones':
      return r.secciones.length > 0;
    case 'estilo':
      return !!r.estilo;
    case 'presupuesto':
      return !!r.presupuesto;
    default:
      return true;
  }
}

function Progreso({ actual, total }: { actual: number; total: number }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs">
        <span className="font-medium tracking-wide text-ink-muted uppercase">Tu web</span>
        <span className="text-ink-subtle tabular-nums">
          {actual} de {total}
        </span>
      </div>
      <div className="flex gap-1.5" role="progressbar" aria-valuenow={actual} aria-valuemax={total}>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={
              'h-1.5 flex-1 rounded-full transition-colors duration-500 ' +
              (i < actual ? 'bg-accent' : 'bg-line')
            }
          />
        ))}
      </div>
    </div>
  );
}

function Pie({
  pregunta,
  paso,
  total,
  puedeSeguir,
  onAtras,
  onSeguir,
  onTerminar,
  logoSubido,
}: {
  pregunta: Pregunta;
  paso: number;
  total: number;
  puedeSeguir: boolean;
  onAtras: () => void;
  onSeguir: () => void;
  onTerminar: () => void;
  logoSubido: boolean;
}) {
  const ultimo = paso === total - 1;
  // En estas preguntas un clic ya avanza, así que el botón sobra.
  const avanzaSola = pregunta.id === 'paleta' || pregunta.id === 'estilo' || pregunta.id === 'objetivo';

  return (
    <div className="mt-8 flex items-center justify-between gap-3">
      {paso > 0 ? (
        <button type="button" onClick={onAtras} className="btn btn-ghost">
          ← Atrás
        </button>
      ) : (
        <span />
      )}

      {ultimo ? (
        <button type="button" onClick={onTerminar} disabled={!puedeSeguir} className="btn btn-primary">
          ¡Ver mi web! ✨
        </button>
      ) : avanzaSola ? null : (
        <button type="button" onClick={onSeguir} disabled={!puedeSeguir} className="btn btn-primary">
          {pregunta.id === 'logo' && !logoSubido ? 'Seguir sin logo' : 'Continuar'}
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

interface EstadoRespuestas {
  empresa: string;
  categoria: CategoriaNegocio | '';
  rubro: string;
  logo: string | null;
  paletaLogo: Paleta | null;
  paleta: Paleta | null;
  secciones: string[];
  estilo: string;
  presupuesto: string;
  objetivo: string;
}

interface AccionesRespuestas {
  setEmpresa: (v: string) => void;
  setCategoria: (v: CategoriaNegocio) => void;
  setRubro: (v: string) => void;
  setLogo: (v: string | null) => void;
  setPaletaLogo: (p: Paleta | null) => void;
  setPaleta: (p: Paleta) => void;
  setSecciones: (v: string[]) => void;
  setEstilo: (v: string) => void;
  setPresupuesto: (v: string) => void;
  setObjetivo: (v: string) => void;
}

function CuerpoPregunta({
  pregunta,
  estado,
  acciones,
}: {
  pregunta: Pregunta;
  estado: EstadoRespuestas;
  acciones: AccionesRespuestas;
}) {
  switch (pregunta.tipo) {
    case 'negocio':
      return <PasoNegocio estado={estado} acciones={acciones} />;
    case 'logo':
      return <PasoLogo estado={estado} acciones={acciones} />;
    case 'paleta':
      return <PasoPaleta estado={estado} acciones={acciones} />;
    case 'multiple':
      return <PasoMultiple pregunta={pregunta} valores={estado.secciones} onCambio={acciones.setSecciones} />;
    case 'opcion':
      return (
        <PasoOpcion
          pregunta={pregunta}
          valor={
            pregunta.id === 'estilo' ? estado.estilo : pregunta.id === 'objetivo' ? estado.objetivo : estado.presupuesto
          }
          onElegir={
            pregunta.id === 'estilo'
              ? acciones.setEstilo
              : pregunta.id === 'objetivo'
                ? acciones.setObjetivo
                : acciones.setPresupuesto
          }
        />
      );
    default:
      return null;
  }
}

function PasoNegocio({ estado, acciones }: { estado: EstadoRespuestas; acciones: AccionesRespuestas }) {
  const corto = estado.rubro.trim().length > 0 && estado.rubro.trim().length < MIN_RUBRO;
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="empresa" className="block text-sm font-medium text-ink-muted">
          ¿Cómo se llama tu negocio, marca u organización?
        </label>
        <input
          id="empresa"
          className="field"
          value={estado.empresa}
          maxLength={MAX_EMPRESA}
          onChange={(e) => acciones.setEmpresa(e.target.value)}
          placeholder="Ej: Dulce Tentación"
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-ink-muted" id="tipo-negocio">
          ¿Qué tipo de negocio u organización es?
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="tipo-negocio">
          {CATEGORIAS_NEGOCIO.map((c) => {
            const elegida = estado.categoria === c.valor;
            return (
              <button
                key={c.valor}
                type="button"
                onClick={() => acciones.setCategoria(c.valor)}
                aria-pressed={elegida}
                className={
                  'rounded-full border px-3.5 py-1.5 text-sm transition-all ' +
                  (elegida
                    ? 'border-accent bg-accent/15 text-ink'
                    : 'border-line bg-surface-overlay/50 text-ink-muted hover:border-accent/50 hover:text-ink')
                }
              >
                {elegida ? '✓ ' : ''}
                {c.etiqueta}
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="rubro" className="block text-sm font-medium text-ink-muted">
          ¿A qué se dedica y a quién está dirigido?
        </label>
        <textarea
          id="rubro"
          className="field min-h-[110px] resize-y"
          value={estado.rubro}
          maxLength={MAX_RUBRO}
          onChange={(e) => acciones.setRubro(e.target.value)}
          placeholder="Ej: Somos una pastelería artesanal en Miraflores. Hacemos tortas personalizadas para cumpleaños y bodas, con delivery en Lima."
        />
        <p className={'text-xs ' + (corto ? 'text-caution' : 'text-ink-subtle')}>
          {corto
            ? 'Cuéntanos un poquito más: qué ofreces y a quién.'
            : 'Mientras más nos cuentes, más se parecerá a tu negocio.'}
        </p>
      </div>
    </div>
  );
}

function PasoLogo({ estado, acciones }: { estado: EstadoRespuestas; acciones: AccionesRespuestas }) {
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const cargar = async (archivo: File | undefined) => {
    if (!archivo) return;
    setProcesando(true);
    setError(null);
    try {
      const dataUri = await prepararLogo(archivo);
      acciones.setLogo(dataUri);
      acciones.setPaletaLogo(await coloresDelLogo(dataUri));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos leer ese archivo.');
    } finally {
      setProcesando(false);
    }
  };

  if (estado.logo) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-line bg-white/95 p-6">
        <img src={estado.logo} alt="Tu logo" className="max-h-28 w-auto" />
        {estado.paletaLogo && (
          <p className="flex items-center gap-2 text-xs text-gray-600">
            Colores detectados:
            <Muestra color={estado.paletaLogo.primario} />
            <Muestra color={estado.paletaLogo.secundario} />
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            acciones.setLogo(null);
            acciones.setPaletaLogo(null);
          }}
          className="text-xs text-gray-500 underline hover:text-gray-800"
        >
          Quitar y subir otro
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void cargar(e.dataTransfer.files?.[0]);
        }}
        disabled={procesando}
        className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line-strong bg-surface-deep/40 px-6 py-10 text-center transition-colors hover:border-accent/60"
      >
        <span className="text-3xl" aria-hidden="true">
          🖼️
        </span>
        <span className="font-medium text-ink">
          {procesando ? 'Preparando tu logo…' : 'Haz clic o arrastra tu logo aquí'}
        </span>
        <span className="text-xs text-ink-subtle">PNG, JPG o WEBP · hasta 3 MB</span>
      </button>
      <input
        ref={entrada}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => void cargar(e.target.files?.[0])}
      />
      {error && <p className="mt-3 text-sm text-negative">{error}</p>}
    </div>
  );
}

function PasoPaleta({ estado, acciones }: { estado: EstadoRespuestas; acciones: AccionesRespuestas }) {
  // Si subió logo, sus colores van primero: es lo más probable que quiera.
  const opciones = estado.paletaLogo ? [estado.paletaLogo, ...PALETAS] : PALETAS;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {opciones.map((p) => {
        const elegida = estado.paleta?.id === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => acciones.setPaleta(p)}
            aria-pressed={elegida}
            className={
              'flex items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-all hover:border-accent/60 ' +
              (elegida ? 'border-accent bg-accent/10' : 'border-line bg-surface-overlay/50')
            }
          >
            <span className="flex shrink-0 -space-x-2">
              <span className="h-9 w-9 rounded-full ring-2 ring-surface-raised" style={{ background: p.primario }} />
              <span className="h-9 w-9 rounded-full ring-2 ring-surface-raised" style={{ background: p.secundario }} />
            </span>
            <span className="min-w-0">
              <span className="block font-medium text-ink">{p.nombre}</span>
              {p.id === 'logo' && <span className="text-xs text-accent">Sugerida por tu logo</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PasoMultiple({
  pregunta,
  valores,
  onCambio,
}: {
  pregunta: Pregunta;
  valores: string[];
  onCambio: (v: string[]) => void;
}) {
  const maximo = pregunta.maximo ?? Infinity;
  const lleno = valores.length >= maximo;

  const alternar = (valor: string) => {
    if (valores.includes(valor)) onCambio(valores.filter((v) => v !== valor));
    else if (!lleno) onCambio([...valores, valor]);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {pregunta.opciones?.map((o) => {
          const marcada = valores.includes(o.valor);
          return (
            <button
              key={o.valor}
              type="button"
              onClick={() => alternar(o.valor)}
              disabled={!marcada && lleno}
              aria-pressed={marcada}
              className={
                'rounded-full border px-4 py-2 text-sm transition-all disabled:opacity-40 ' +
                (marcada
                  ? 'border-accent bg-accent/15 text-ink'
                  : 'border-line bg-surface-overlay/50 text-ink-muted hover:border-accent/50 hover:text-ink')
              }
            >
              {marcada ? '✓ ' : ''}
              {o.etiqueta}
            </button>
          );
        })}
      </div>
      {Number.isFinite(maximo) && (
        <p className="mt-3 text-xs text-ink-subtle">
          {valores.length} de {maximo} elegidas
        </p>
      )}
    </div>
  );
}

function PasoOpcion({
  pregunta,
  valor,
  onElegir,
}: {
  pregunta: Pregunta;
  valor: string;
  onElegir: (v: string) => void;
}) {
  return (
    <div className="grid gap-2">
      {pregunta.opciones?.map((o) => {
        const elegida = valor === o.valor;
        return (
          <button
            key={o.valor}
            type="button"
            onClick={() => onElegir(o.valor)}
            aria-pressed={elegida}
            className={
              'flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all hover:border-accent/60 ' +
              (elegida ? 'border-accent bg-accent/10' : 'border-line bg-surface-overlay/50')
            }
          >
            <span>
              <span className="block text-[15px] text-ink">{o.etiqueta}</span>
              {o.detalle && <span className="text-xs text-ink-subtle">{o.detalle}</span>}
            </span>
            {elegida && <span className="text-accent">✓</span>}
          </button>
        );
      })}
    </div>
  );
}

function Muestra({ color }: { color: string }) {
  return <span className="inline-block h-4 w-4 rounded-full border border-black/10" style={{ background: color }} />;
}

/* -------------------------------------------------------------------------- */

const PASOS_ARMADO = [
  'Leyendo lo que nos contaste',
  'Eligiendo la estructura de tu página',
  'Escribiendo los textos para tu negocio',
  'Aplicando tus colores y tu logo',
];

/** Una espera explicada se hace mucho más corta que un spinner mudo. */
const PASOS_PLANTILLA = [
  'Leyendo lo que nos contaste',
  'Escribiendo los textos para tu negocio',
  'Aplicando tus colores y tu logo',
];

function PantallaArmando({ empresa, conPlantilla = false }: { empresa: string; conPlantilla?: boolean }) {
  const pasos = conPlantilla ? PASOS_PLANTILLA : PASOS_ARMADO;
  const [paso, setPaso] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPaso((p) => Math.min(p + 1, pasos.length - 1)), 8000);
    return () => clearInterval(id);
  }, [pasos.length]);

  return (
    <div className="animate-fade-up mx-auto max-w-lg py-20 text-center">
      <div className="relative mx-auto mb-8 h-16 w-16">
        <div className="absolute inset-0 animate-ping rounded-full bg-accent/20" />
        <div className="absolute inset-0 grid place-items-center rounded-full border border-accent/40 bg-surface-raised">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" />
        </div>
      </div>

      <h2 className="text-2xl font-semibold">¡Gracias! Estamos armando la web de {empresa}</h2>
      <p className="mt-2 text-sm text-ink-muted">
        Suele tardar menos de un minuto. Ya casi.
      </p>

      <ul className="mt-9 space-y-3 text-left">
        {pasos.map((texto, i) => (
          <li key={texto} className="flex items-center gap-3 text-sm">
            <span
              className={
                'grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] transition-colors ' +
                (i < paso
                  ? 'border-positive bg-positive/15 text-positive'
                  : i === paso
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-line text-ink-subtle')
              }
            >
              {i < paso ? '✓' : i + 1}
            </span>
            <span className={i <= paso ? 'text-ink' : 'text-ink-subtle'}>{texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
