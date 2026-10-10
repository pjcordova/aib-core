import { useEffect, useRef, useState } from 'react';
import type { QAHistory } from '../../Types/productOwner';
import { ApiError, generarPrototipo, type TokenUsage } from '../../lib/api';
import {
  actualizarVistaPrevia,
  enviarEncargo,
  guardarEdicion,
  guardarProyecto,
  type PlantillaUsada,
} from '../../lib/proyectos';
import {
  conContenido,
  listarPlantillasActivas,
  plantillasDeServicio,
  registrarEvento,
  type PlantillaDelCatalogo,
} from '../../lib/catalogo';
import { renderizarPlantilla } from '../../lib/plantillas';
import { comoPregunta, formularioServicio } from '../../lib/formularios';
import { elegirIngeniero as asignarIngeniero } from '../../lib/ingenieros';
import {
  PALETAS,
  PREGUNTAS_SERVICIO,
  PRESUPUESTOS,
  claveServicio,
  etiquetaDe,
  obtenerServicio,
  solesEnteros,
  type FichaWeb,
  type Paleta,
  type Pregunta,
  type TipoServicio,
} from '../../lib/servicios';
import { ContactoEncargo, type DatosEncargo } from '../ContactoEncargo';
import { ElegirIngeniero } from '../ingenieros/ElegirIngeniero';
import { PrototypePreview } from '../PrototypePreviewDiferido';
import { ErrorState } from '../ui/Primitives';
import { EleccionPlantilla, PasoLogo, PasoMultiple, PasoOpcion, PasoPaleta, Progreso } from './FlujoWeb';
import { WebPreview } from './WebPreview';

type Fase = 'preguntas' | 'buscando' | 'eligiendo' | 'construyendo' | 'listo' | 'error';
type EstadoGuardado = 'inactivo' | 'guardando' | 'guardado' | 'fallo';
type EstadoAceptacion = 'inactivo' | 'procesando' | 'aceptado' | 'fallo';

const MAX_EMPRESA = 80;
const MAX_RUBRO = 600;
const MIN_RUBRO = 10;

const PASO_NEGOCIO: Pregunta = {
  id: 'negocio',
  tipo: 'negocio',
  titulo: 'Para empezar, cuéntanos de tu negocio',
  ayuda: 'Con esto la vista previa ya llevará tu nombre.',
};
const PASO_LOGO: Pregunta = {
  id: 'logo',
  tipo: 'logo',
  titulo: '¿Tienes logo? Súbelo y lo ponemos',
  ayuda: 'Si no tienes, no pasa nada: usaremos el nombre de tu negocio.',
  opcional: true,
};
const PASO_PALETA: Pregunta = {
  id: 'paleta',
  tipo: 'paleta',
  titulo: '¿Con qué colores te lo imaginas?',
  ayuda: 'Elige la que más se parezca a tu marca. Luego se puede ajustar.',
};
const PASO_PRESUPUESTO: Pregunta = {
  id: 'presupuesto',
  tipo: 'opcion',
  titulo: 'Última: ¿con qué presupuesto cuentas, más o menos?',
  ayuda: 'Es solo para que el ingeniero te proponga algo a tu medida.',
  opciones: PRESUPUESTOS,
};

interface Props {
  tipo: Exclude<TipoServicio, 'web'>;
  /** Con tipo 'otro': el servicio que escribió su ingeniero ("Chatbots"). */
  otro?: string;
  /** Nombre del negocio ya conocido (cliente invitado): se rellena, editable. */
  empresaInicial?: string;
  /**
   * Llegó con el enlace de su ingeniero: responde aquí sus preguntas y no
   * elige a otro.
   */
  conSuIngeniero: boolean;
  /** El cliente pasó la primera pregunta. Se avisa una vez, con el nombre de su negocio. */
  onEmpezar?: (empresa: string) => void;
  /** Avisa al padre cuando el proyecto queda guardado, para refrescar listas. */
  onGuardado?: () => void;
}

/**
 * CRM, ERP, automatización, app móvil o un servicio «Otro» de su ingeniero.
 * Mismo espíritu que la web: pocas preguntas de un clic (las de AIB+ y, si
 * llegó con su enlace, las de su ingeniero) y al final ve cómo quedaría.
 *
 * Lo que ve son las plantillas que los ingenieros subieron para ese servicio,
 * con su nombre y sus colores; elegir una es elegir a quien la construye. Si
 * aún no hay ninguna, o ninguna le convence, la IA arma un prototipo.
 */
export function FlujoServicio({ tipo, otro, empresaInicial, conSuIngeniero, onEmpezar, onGuardado }: Props) {
  const servicio = obtenerServicio(tipo);
  const nombre = tipo === 'otro' && otro ? otro : servicio.nombre;
  const clave = claveServicio(tipo, otro);

  const [paso, setPaso] = useState(0);
  const [fase, setFase] = useState<Fase>('preguntas');

  // Respuestas
  const [empresa, setEmpresa] = useState(empresaInicial ?? '');
  const [rubro, setRubro] = useState('');
  const [respuestas, setRespuestas] = useState<Record<string, string | string[]>>({});
  const [logo, setLogo] = useState<string | null>(null);
  const [paletaLogo, setPaletaLogo] = useState<Paleta | null>(null);
  const [paleta, setPaleta] = useState<Paleta | null>(null);
  const [delIngeniero, setDelIngeniero] = useState<Pregunta[]>([]);

  // Resultado
  const [candidatas, setCandidatas] = useState<PlantillaDelCatalogo[]>([]);
  const [plantillaUsada, setPlantillaUsada] = useState<PlantillaUsada | null>(null);
  const [documento, setDocumento] = useState('');
  const [codigo, setCodigo] = useState('');
  const [consumo, setConsumo] = useState<TokenUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<EstadoGuardado>('inactivo');
  const [aceptacion, setAceptacion] = useState<EstadoAceptacion>('inactivo');
  const [eligiendoIngeniero, setEligiendoIngeniero] = useState(false);
  const [pidiendoContacto, setPidiendoContacto] = useState(false);
  const [ingenieroElegido, setIngenieroElegido] = useState<string | null>(null);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const proyectoId = useRef<string | null>(null);
  /** El mismo id, como estado: la vista previa lo necesita para compartir. */
  const [idGuardado, setIdGuardado] = useState<string | null>(null);
  const reintentar = useRef<(() => void) | null>(null);

  // Las preguntas de su ingeniero, si llegó con su enlace. Llegan mientras
  // contesta la primera.
  useEffect(() => {
    if (!conSuIngeniero) return;
    let vigente = true;
    void formularioServicio(clave).then((p) => {
      if (vigente) setDelIngeniero(p.map((q) => comoPregunta(q, 'ing-')));
    });
    return () => {
      vigente = false;
    };
  }, [conSuIngeniero, clave]);

  const especificas = [...PREGUNTAS_SERVICIO[tipo], ...delIngeniero];
  const preguntas = [PASO_NEGOCIO, ...especificas, PASO_LOGO, PASO_PALETA, PASO_PRESUPUESTO];
  const total = preguntas.length;
  const pregunta = preguntas[Math.min(paso, total - 1)];
  const presupuesto = typeof respuestas.presupuesto === 'string' ? respuestas.presupuesto : '';

  const ficha = (): FichaWeb => ({
    empresa: empresa.trim(),
    categoria: '',
    rubro: rubro.trim(),
    logo,
    paleta: paleta ?? PALETAS[0],
    secciones: [],
    estilo: '',
    presupuesto,
  });

  const textoRespuesta = (p: Pregunta): string => {
    const r = respuestas[p.id];
    if (Array.isArray(r)) return r.map((v) => etiquetaDe(p.opciones, v)).join(', ');
    return r ? etiquetaDe(p.opciones, r.trim()) : '';
  };

  /** Pregunta → respuesta: lo que leen la IA, la documentación y el panel del ingeniero. */
  const historialDe = (f: FichaWeb, plantilla: PlantillaUsada | null): QAHistory[] => [
    { question_id: 'servicio', question: 'Servicio que pide', answer: nombre },
    { question_id: 'empresa', question: 'Nombre de la empresa', answer: f.empresa },
    { question_id: 'rubro', question: '¿A qué se dedica la empresa?', answer: f.rubro },
    ...especificas.flatMap((p) => {
      const respuesta = textoRespuesta(p);
      return respuesta ? [{ question_id: p.id, question: p.titulo, answer: respuesta }] : [];
    }),
    { question_id: 'logo', question: '¿Tiene logo?', answer: f.logo ? 'Sí, lo adjuntó' : 'No' },
    {
      question_id: 'paleta',
      question: 'Colores',
      answer: `${f.paleta.nombre} (${f.paleta.primario} y ${f.paleta.secundario})`,
    },
    { question_id: 'presupuesto', question: 'Presupuesto aproximado', answer: etiquetaDe(PRESUPUESTOS, f.presupuesto) },
    ...(plantilla ? [{ question_id: 'plantilla', question: 'Plantilla elegida', answer: plantilla.nombre }] : []),
    ...(plantilla?.precio_desde
      ? [
          {
            question_id: 'precio-orientativo',
            question: 'Precio orientativo que vio el cliente al elegir el diseño',
            answer: `Desde ${solesEnteros(plantilla.precio_desde)}`,
          },
        ]
      : []),
  ];

  const servicioDe = (f: FichaWeb) => `${nombre} para ${f.empresa}`;

  /* -------------------------------------------------------------- navegación */

  const empezado = useRef(false);
  const avanzar = () => {
    if (paso === 0 && !empezado.current) {
      empezado.current = true;
      onEmpezar?.(empresa.trim());
    }
    if (paso < total - 1) setPaso(paso + 1);
  };

  const puedeSeguir = (p: Pregunta): boolean => {
    if (p.tipo === 'negocio') return empresa.trim().length > 0 && rubro.trim().length >= MIN_RUBRO;
    if (p.tipo === 'logo' || p.opcional) return true;
    if (p.tipo === 'paleta') return !!paleta;
    const r = respuestas[p.id];
    if (p.tipo === 'texto') return typeof r === 'string' && r.trim().length >= 3;
    return Array.isArray(r) ? r.length > 0 : !!r;
  };

  const responder = (id: string, valor: string | string[]) => setRespuestas((prev) => ({ ...prev, [id]: valor }));

  /* ----------------------------------------------------------- persistencia */

  /** Guarda el proyecto al enseñar la vista previa, o la cambia si ya estaba. */
  const guardar = async (
    vista: { documento?: string; reactCode?: string },
    plantilla: PlantillaUsada | null,
    usage?: TokenUsage
  ) => {
    const f = ficha();
    const historial = historialDe(f, plantilla);
    setGuardado('guardando');
    if (proyectoId.current) {
      const { ok } = await actualizarVistaPrevia(proyectoId.current, {
        documento: vista.documento,
        react_code: vista.reactCode,
        plantilla: plantilla ?? undefined,
        historial,
        usage: usage ?? null,
      });
      setGuardado(ok ? 'guardado' : 'fallo');
      return;
    }
    const { id, error: errorGuardado } = await guardarProyecto({
      servicio: servicioDe(f),
      historial,
      tipoServicio: tipo,
      servicioOtro: tipo === 'otro' ? otro : undefined,
      documento: vista.documento,
      reactCode: vista.reactCode,
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

  /** Tras la última pregunta: las plantillas de este servicio. */
  const terminar = async () => {
    setFase('buscando');
    const f = ficha();
    const activas = await listarPlantillasActivas();
    const mejores = await conContenido(plantillasDeServicio(activas, clave, f));
    if (mejores.length === 0) {
      void generarConIA();
      return;
    }
    setCandidatas(mejores);
    setFase('eligiendo');
    for (const c of mejores) void registrarEvento(c.fila.id, 'mostrada');
  };

  /** Eligió una plantilla: es instantáneo, sin IA. */
  const elegirPlantilla = async (c: PlantillaDelCatalogo) => {
    const f = ficha();
    // Al aceptar, el encargo va directo a quien la diseñó (salvo las de AIB+).
    const autor = c.fila.ingeniero && !c.fila.ingeniero.es_admin ? c.fila.ingeniero : null;
    const usada: PlantillaUsada = {
      id: c.fila.id,
      base: c.base.id,
      nombre: c.fila.nombre,
      precio_desde: c.fila.precio_desde,
      ...(autor ? { ingeniero_id: autor.id, ingeniero: autor.nombre } : {}),
    };
    if (plantillaUsada?.id !== c.fila.id) void registrarEvento(c.fila.id, 'elegida');
    const doc = renderizarPlantilla(c.base, { descripcion: f.rubro }, f);
    setPlantillaUsada(usada);
    setDocumento(doc);
    setCodigo('');
    setConsumo(null);
    setError(null);
    setFase('listo');
    await guardar({ documento: doc }, usada);
  };

  /** Sin plantillas de este servicio, o ninguna le convence: prototipo con IA. */
  const generarConIA = async () => {
    const f = ficha();
    setPlantillaUsada(null);
    setFase('construyendo');
    setError(null);
    try {
      const { code, usage } = await generarPrototipo(servicioDe(f), historialDe(f, null));
      setCodigo(code);
      setDocumento('');
      setConsumo(usage ?? null);
      setFase('listo');
      await guardar({ reactCode: code }, null, usage);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos armar la vista previa.');
      setFase('error');
      reintentar.current = () => void generarConIA();
    }
  };

  /** Cambios a mano en la plantilla (textos, fotos, colores): sin IA. */
  const guardarCambios = async (cambios: { documento: string; paleta: Paleta }) => {
    if (!proyectoId.current) return false;
    const { ok } = await guardarEdicion(proyectoId.current, cambios);
    if (ok) {
      setDocumento(cambios.documento);
      setPaleta(cambios.paleta);
    }
    return ok;
  };

  /** «¡Me gusta, sigamos!»: quién lo construye y, después, su contacto. */
  const quiereAceptar = async () => {
    const id = proyectoId.current;
    if (!id) return;
    if (conSuIngeniero) {
      setPidiendoContacto(true);
      return;
    }
    const autor = plantillaUsada?.ingeniero_id;
    if (autor) {
      const r = await asignarIngeniero(id, autor);
      if (r === 'ok' || r === 'propio') {
        setIngenieroElegido(r === 'ok' ? (plantillaUsada?.ingeniero ?? null) : null);
        setPidiendoContacto(true);
        return;
      }
    }
    setEligiendoIngeniero(true);
  };

  /** Dejó sus datos: el encargo pasa al ingeniero. */
  const aceptar = async (datos: DatosEncargo) => {
    const id = proyectoId.current;
    if (!id) return;
    const f = ficha();
    setAceptacion('procesando');
    setErrorEnvio(null);
    const { ok, error: errorAceptar } = await enviarEncargo(id, {
      servicio: servicioDe(f),
      historial: historialDe(f, plantillaUsada),
      ...datos,
    });
    if (!ok) {
      console.error('[AIB+] Error enviando el encargo:', errorAceptar);
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
          <p className="text-sm text-ink-subtle">Buscando diseños de {nombre}…</p>
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
        conPrecios
        mostrarAutor={!conSuIngeniero}
        textoAMedida="Que la IA arme una vista previa a tu medida. Tarda cerca de un minuto."
      />
    );
  }

  if (fase === 'construyendo') {
    return <PantallaConstruyendo empresa={empresa.trim()} />;
  }

  if (fase === 'listo' && (documento || codigo)) {
    const verOtros = candidatas.length > 0 && aceptacion !== 'aceptado' && aceptacion !== 'procesando' && (
      <p className="-mt-2 text-center text-sm">
        <button type="button" onClick={() => setFase('eligiendo')} className="text-accent hover:underline">
          ← Ver los otros diseños
        </button>
      </p>
    );

    return (
      <div>
        {documento ? (
          <WebPreview
            documento={documento}
            plantilla={plantillaUsada?.nombre}
            plantillaBase="propia"
            ficha={ficha()}
            guardado={guardado}
            aceptacion={aceptacion}
            onAceptar={() => void quiereAceptar()}
            onGuardarEdicion={guardarCambios}
            proyectoId={idGuardado}
            servicio={{ nombre, icono: servicio.icono }}
          />
        ) : (
          <PrototypePreview
            code={codigo}
            servicio={servicioDe(ficha())}
            respuestas={historialDe(ficha(), null).length}
            usage={consumo}
            guardado={guardado}
            aceptacion={aceptacion}
            onAceptar={guardado === 'guardado' ? () => void quiereAceptar() : undefined}
            onRegenerar={() => void generarConIA()}
          />
        )}
        {verOtros}

        {eligiendoIngeniero && idGuardado && (
          <ElegirIngeniero
            proyectoId={idGuardado}
            servicio={tipo}
            onElegido={(elegido) => {
              setIngenieroElegido(elegido);
              setEligiendoIngeniero(false);
              setPidiendoContacto(true);
            }}
            onCancelar={() => setEligiendoIngeniero(false)}
          />
        )}
        {pidiendoContacto && (
          <ContactoEncargo
            ingeniero={ingenieroElegido}
            tipoServicio={tipo}
            // Su cliente de enlace ya respondió las preguntas de su ingeniero.
            preguntasDe={conSuIngeniero ? null : idGuardado}
            enviando={aceptacion === 'procesando'}
            error={errorEnvio}
            onEnviar={(datos) => void aceptar(datos)}
            onCancelar={() => setPidiendoContacto(false)}
          />
        )}
      </div>
    );
  }

  const ultimo = paso === total - 1;
  // Elegir una opción ya avanza (salvo la última, que tiene su botón).
  const avanzaSola = !ultimo && (pregunta.tipo === 'paleta' || pregunta.tipo === 'opcion');

  return (
    <div className="mx-auto max-w-2xl py-8">
      {paso === 0 && (
        <p className="animate-fade-up mb-6 text-center text-sm text-ink-muted">
          {servicio.icono} <strong className="text-ink">{nombre}</strong> para tu negocio. Son {total} preguntas rápidas,
          casi todas con un clic, y al final verás cómo quedaría.
        </p>
      )}

      <Progreso actual={paso + 1} total={total} etiqueta={nombre} />

      <article key={pregunta.id} className="card animate-fade-up mt-6 p-6 sm:p-8">
        <h2 className="text-xl font-semibold text-balance">{pregunta.titulo}</h2>
        {pregunta.ayuda && <p className="mt-1.5 text-sm text-ink-muted">{pregunta.ayuda}</p>}
        {pregunta.id.startsWith('ing-') && (
          <p className="mt-1.5 text-xs text-accent">Pregunta de tu ingeniero</p>
        )}

        <div className="mt-6">
          {pregunta.tipo === 'negocio' ? (
            <PasoNegocio empresa={empresa} rubro={rubro} onEmpresa={setEmpresa} onRubro={setRubro} />
          ) : pregunta.tipo === 'logo' ? (
            <PasoLogo estado={{ logo, paletaLogo }} acciones={{ setLogo, setPaletaLogo }} />
          ) : pregunta.tipo === 'paleta' ? (
            <PasoPaleta
              estado={{ paleta, paletaLogo }}
              acciones={{
                setPaleta: (p) => {
                  setPaleta(p);
                  avanzar();
                },
              }}
            />
          ) : pregunta.tipo === 'multiple' ? (
            <PasoMultiple
              pregunta={pregunta}
              valores={Array.isArray(respuestas[pregunta.id]) ? (respuestas[pregunta.id] as string[]) : []}
              onCambio={(v) => responder(pregunta.id, v)}
            />
          ) : pregunta.tipo === 'opcion' ? (
            <PasoOpcion
              pregunta={pregunta}
              valor={typeof respuestas[pregunta.id] === 'string' ? (respuestas[pregunta.id] as string) : ''}
              onElegir={(v) => {
                responder(pregunta.id, v);
                if (!ultimo) avanzar();
              }}
            />
          ) : (
            <textarea
              className="field min-h-[110px] resize-y"
              value={typeof respuestas[pregunta.id] === 'string' ? (respuestas[pregunta.id] as string) : ''}
              maxLength={MAX_RUBRO}
              onChange={(e) => responder(pregunta.id, e.target.value)}
              aria-label={pregunta.titulo}
              placeholder={pregunta.opcional ? 'Opcional' : undefined}
              autoFocus
            />
          )}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3">
          {paso > 0 ? (
            <button type="button" onClick={() => setPaso(paso - 1)} className="btn btn-ghost">
              ← Atrás
            </button>
          ) : (
            <span />
          )}
          {ultimo ? (
            <button type="button" onClick={() => void terminar()} disabled={!puedeSeguir(pregunta)} className="btn btn-primary">
              ¡Ver cómo quedaría! ✨
            </button>
          ) : avanzaSola ? null : (
            <button type="button" onClick={avanzar} disabled={!puedeSeguir(pregunta)} className="btn btn-primary">
              {pregunta.tipo === 'logo' && !logo ? 'Seguir sin logo' : 'Continuar'}
            </button>
          )}
        </div>
      </article>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function PasoNegocio({
  empresa,
  rubro,
  onEmpresa,
  onRubro,
}: {
  empresa: string;
  rubro: string;
  onEmpresa: (v: string) => void;
  onRubro: (v: string) => void;
}) {
  const corto = rubro.trim().length > 0 && rubro.trim().length < MIN_RUBRO;
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="empresa-servicio" className="block text-sm font-medium text-ink-muted">
          ¿Cómo se llama tu negocio, marca u organización?
        </label>
        <input
          id="empresa-servicio"
          className="field"
          value={empresa}
          maxLength={MAX_EMPRESA}
          onChange={(e) => onEmpresa(e.target.value)}
          placeholder="Ej: Dulce Tentación"
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="rubro-servicio" className="block text-sm font-medium text-ink-muted">
          ¿A qué se dedica y a quién atiende?
        </label>
        <textarea
          id="rubro-servicio"
          className="field min-h-[110px] resize-y"
          value={rubro}
          maxLength={MAX_RUBRO}
          onChange={(e) => onRubro(e.target.value)}
          placeholder="Ej: Somos una distribuidora de abarrotes en Arequipa. Vendemos a bodegas y minimarkets, con 4 vendedores en la calle."
        />
        <p className={'text-xs ' + (corto ? 'text-caution' : 'text-ink-subtle')}>
          {corto ? 'Cuéntanos un poquito más: qué haces y a quién.' : 'Mientras más nos cuentes, mejor te entenderá el ingeniero.'}
        </p>
      </div>
    </div>
  );
}

const PASOS_CONSTRUCCION = [
  'Leyendo lo que nos contaste',
  'Diseñando las pantallas',
  'Escribiendo los componentes',
  'Compilando la vista previa',
];

/**
 * El prototipo tarda cerca de un minuto: en vez de un spinner mudo se cuenta
 * qué está pasando, y la espera se hace más corta.
 */
function PantallaConstruyendo({ empresa }: { empresa: string }) {
  const [paso, setPaso] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPaso((p) => Math.min(p + 1, PASOS_CONSTRUCCION.length - 1)), 9000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="animate-fade-up mx-auto max-w-lg py-20 text-center">
      <div className="relative mx-auto mb-8 h-16 w-16">
        <div className="absolute inset-0 animate-ping rounded-full bg-accent/20" />
        <div className="absolute inset-0 grid place-items-center rounded-full border border-accent/40 bg-surface-raised">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" />
        </div>
      </div>

      <h2 className="text-2xl font-semibold text-balance">
        ¡Gracias! Estamos armando la vista previa para {empresa}
      </h2>
      <p className="mt-2 text-sm text-ink-muted">Suele tardar cerca de un minuto. Ya casi.</p>

      <ul className="mt-9 space-y-3 text-left">
        {PASOS_CONSTRUCCION.map((texto, i) => (
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
