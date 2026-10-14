import { useEffect, useState } from 'react';
import { ApiError, prepararPropuestaAbi } from '../../lib/api';
import { enlaceWhatsapp } from '../../lib/contacto';
import { miPlan } from '../../lib/planes';
import type { ProyectoCompleto } from '../../lib/proyectos';
import {
  ETAPAS_SUGERIDAS,
  enviarPropuesta,
  marcarCobro,
  montos,
  montosEtapas,
  propuestaDeEncargo,
  retirarPropuesta,
  textoPlazo,
  urlPropuesta,
  type EtapaNueva,
  type Propuesta,
} from '../../lib/propuestas';
import { solesEnteros } from '../../lib/servicios';
import { EntregasIngeniero } from './Entregas';
import { TarjetaPropuesta } from './TarjetaPropuesta';

// ---------------------------------------------------------------------------
// La propuesta, dentro del encargo (panel del ingeniero)
// ---------------------------------------------------------------------------
// Arma la propuesta (precio, plazo, qué incluye, forma de pago, validez), se
// la manda al cliente por WhatsApp con su enlace, ve su respuesta y, aceptada,
// marca lo que cobró. Por etapas, además entrega cada una (Entregas.tsx). Con
// Pro, ABI llena el formulario («Que ABI la prepare») y él la revisa.
// ---------------------------------------------------------------------------

/** Hoy + n días, como AAAA-MM-DD (en Lima). */
function enDias(n: number): string {
  const d = new Date(Date.now() + n * 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

/** Una web o un sistema (CRM, ERP, app…). Los encargos de antes de los servicios eran webs. */
function esWeb(encargo: ProyectoCompleto): boolean {
  if (encargo.documentacion?.tipo) return encargo.documentacion.tipo === 'web';
  return !encargo.tipoServicio || encargo.tipoServicio === 'web';
}

/**
 * Para no empezar de cero: lo principal de la documentación (sin lo de
 * prioridad baja) o, si aún no la tiene, lo típico de su servicio.
 */
function incluyeSugerido(encargo: ProyectoCompleto): string[] {
  const doc = encargo.documentacion;
  const funcionalidades = (doc?.funcionalidades ?? [])
    .filter((f) => f.prioridad !== 'baja' && f.nombre?.trim())
    .slice(0, 8)
    .map((f) => f.nombre.trim());

  if (esWeb(encargo)) {
    const paginas = doc?.mapa_sitio?.map((p) => p.pagina).filter(Boolean) ?? [];
    const secciones = encargo.ficha?.secciones?.length ?? 0;
    const web =
      paginas.length > 1
        ? `Web de ${paginas.length} páginas${paginas.join(', ').length <= 100 ? `: ${paginas.join(', ')}` : ''}`
        : secciones > 0
          ? `Página web de ${secciones + 1} secciones`
          : 'Página web completa';
    return [
      web,
      ...(funcionalidades.length ? funcionalidades : ['Botón de WhatsApp']),
      'Diseño adaptado a celular',
      'Dominio .com y hosting por 1 año',
      '2 rondas de cambios',
    ];
  }

  const queEs =
    encargo.tipoServicio === 'app-movil' ? 'la app' : encargo.tipoServicio === 'automatizacion' ? 'la automatización' : 'el sistema';
  return [
    encargo.servicio,
    ...(funcionalidades.length
      ? funcionalidades
      : encargo.tipoServicio === 'app-movil'
        ? []
        : ['Acceso desde computadora y celular']),
    `Capacitación para usar ${queEs}`,
    '2 rondas de cambios',
  ];
}

export function PropuestaEncargo({
  encargo,
  etapasSugeridas,
}: {
  encargo: ProyectoCompleto;
  /** «Usar en mi propuesta» de la documentación: cada clic trae una `vez` nueva. */
  etapasSugeridas?: { etapas: EtapaNueva[]; vez: number } | null;
}) {
  const [propuesta, setPropuesta] = useState<Propuesta | null | undefined>(undefined);
  const [armando, setArmando] = useState(false);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  // El plan de la documentación con el que se abre el formulario.
  const [vezAtendida, setVezAtendida] = useState<number | null>(null);
  const [plan, setPlan] = useState<EtapaNueva[] | null>(null);
  const [planSinUso, setPlanSinUso] = useState(false);

  const cargar = async () => setPropuesta(await propuestaDeEncargo(encargo.id));

  useEffect(() => {
    let vigente = true;
    void propuestaDeEncargo(encargo.id).then((p) => {
      if (vigente) setPropuesta(p);
    });
    return () => {
      vigente = false;
    };
  }, [encargo.id]);

  if (propuesta === undefined) return null;

  // Un clic nuevo en «Usar en mi propuesta»: abre el formulario por etapas
  // con ese plan, salvo que ya haya una propuesta aceptada.
  if (etapasSugeridas && etapasSugeridas.vez !== vezAtendida) {
    const aceptada = propuesta?.estado === 'aceptada';
    setVezAtendida(etapasSugeridas.vez);
    setPlanSinUso(aceptada);
    if (!aceptada) {
      setPlan(etapasSugeridas.etapas);
      setArmando(true);
    }
  }

  const cerrarFormulario = () => {
    setArmando(false);
    setPlan(null);
  };

  const enlace = propuesta ? urlPropuesta(propuesta.token) : '';
  const nombreCliente = encargo.contacto?.nombre?.split(/\s+/)[0] ?? '';
  const whatsapp =
    propuesta && encargo.contacto?.whatsapp
      ? enlaceWhatsapp(
          encargo.contacto.whatsapp,
          `Hola ${nombreCliente}, te envío la propuesta para ${esWeb(encargo) ? 'tu web' : 'tu proyecto'}: ${solesEnteros(propuesta.precio)}, lista en ${textoPlazo(
            propuesta.plazo_dias
          )}. Aquí la ves con el detalle y la puedes aceptar: ${enlace}`
        )
      : null;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.prompt('Copia el enlace:', enlace);
    }
  };

  const hacer = async (accion: () => Promise<boolean>) => {
    setOcupado(true);
    setError('');
    if (!(await accion())) setError('No se pudo guardar. Vuelve a intentarlo.');
    await cargar();
    setOcupado(false);
  };

  const abierta = propuesta && ['enviada', 'cambios', 'vencida'].includes(propuesta.estado);

  return (
    <section id={`propuesta-${encargo.id}`} className="mb-6 scroll-mt-24 rounded-xl border border-line p-4" aria-label="Propuesta">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-wide text-accent uppercase">Propuesta</p>
        {!armando && (!propuesta || propuesta.estado === 'retirada') && (
          <button type="button" onClick={() => setArmando(true)} className="btn btn-primary !py-1.5 text-sm">
            Armar propuesta
          </button>
        )}
      </div>
      {planSinUso && (
        <p className="mt-2 rounded-lg border border-accent-alt/50 bg-accent-alt/10 px-3 py-2 text-sm text-ink">
          Este encargo ya tiene una propuesta aceptada, así que el plan de la documentación queda solo como referencia.
        </p>
      )}

      {armando ? (
        <FormularioPropuesta
          key={vezAtendida ?? 0}
          encargo={encargo}
          anterior={propuesta && propuesta.estado !== 'aceptada' ? propuesta : null}
          etapasIniciales={plan}
          onCancelar={cerrarFormulario}
          onEnviada={async () => {
            cerrarFormulario();
            await cargar();
          }}
        />
      ) : !propuesta || propuesta.estado === 'retirada' ? (
        <p className="mt-2 text-sm text-ink-muted">
          Cuando conversen el precio, ármale una propuesta formal: precio, plazo, qué incluye y forma de pago. La acepta con un
          clic y el encargo pasa a «En desarrollo».
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {propuesta.estado === 'cambios' && propuesta.comentario_cliente && (
            <p className="rounded-lg border border-accent-alt/50 bg-accent-alt/10 px-3 py-2 text-sm text-ink">
              <strong>{nombreCliente || 'El cliente'} pidió cambios:</strong> «{propuesta.comentario_cliente}»
            </p>
          )}
          <TarjetaPropuesta propuesta={propuesta} />

          {propuesta.estado === 'enviada' && (
            <div className="flex flex-wrap items-center gap-2">
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                  Enviar por WhatsApp
                </a>
              )}
              <button type="button" onClick={() => void copiar()} className="btn btn-ghost">
                {copiado ? '✓ Copiado' : 'Copiar enlace'}
              </button>
              <a href={enlace} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                Ver como el cliente ↗
              </a>
            </div>
          )}

          {propuesta.estado === 'aceptada' &&
            (propuesta.hitos.length > 0 ? (
              <EntregasIngeniero
                hitos={propuesta.hitos}
                enlace={enlace}
                nombreCliente={nombreCliente}
                whatsappCliente={encargo.contacto?.whatsapp ?? null}
                onCambio={cargar}
              />
            ) : (
              <Cobros propuesta={propuesta} ocupado={ocupado} onMarcar={(t, v) => void hacer(() => marcarCobro(propuesta.id, t, v))} />
            ))}

          {abierta && (
            <div className="flex flex-wrap gap-3 text-sm">
              <button type="button" onClick={() => setArmando(true)} className="font-medium text-accent hover:underline">
                {propuesta.estado === 'enviada' ? 'Hacer otra versión' : 'Enviar una nueva versión'}
              </button>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => {
                  if (window.confirm('¿Retirar esta propuesta? El cliente ya no podrá aceptarla.')) {
                    void hacer(() => retirarPropuesta(propuesta.id));
                  }
                }}
                className="text-ink-muted hover:text-negative"
              >
                Retirar
              </button>
            </div>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-negative">
          {error}
        </p>
      )}
    </section>
  );
}

/** Aceptada: el ingeniero marca cuándo recibió el adelanto y el saldo. */
function Cobros({
  propuesta: p,
  ocupado,
  onMarcar,
}: {
  propuesta: Propuesta;
  ocupado: boolean;
  onMarcar: (tipo: 'adelanto' | 'saldo', valor: boolean) => void;
}) {
  const { adelanto, saldo } = montos(p.precio, p.adelanto_pct);
  const filas = [
    adelanto > 0 && { tipo: 'adelanto' as const, texto: `Recibí el adelanto (${solesEnteros(adelanto)})`, hecho: !!p.adelanto_cobrado_en },
    saldo > 0 && { tipo: 'saldo' as const, texto: `Recibí el saldo (${solesEnteros(saldo)})`, hecho: !!p.saldo_cobrado_en },
  ].filter(Boolean) as { tipo: 'adelanto' | 'saldo'; texto: string; hecho: boolean }[];

  return (
    <div className="rounded-lg bg-positive/5 px-3 py-2.5">
      <p className="text-sm font-medium text-ink">¡Aceptada! Lleva la cuenta de lo que te pagan:</p>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        {filas.map((f) => (
          <label key={f.tipo} className="inline-flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={f.hecho} disabled={ocupado} onChange={(e) => onMarcar(f.tipo, e.target.checked)} />
            {f.texto}
          </label>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-ink-subtle">Solo lo ves tú (y tu equipo). AIB+ no cobra comisión.</p>
    </div>
  );
}

function FormularioPropuesta({
  encargo,
  anterior,
  etapasIniciales,
  onCancelar,
  onEnviada,
}: {
  encargo: ProyectoCompleto;
  /** Para una nueva versión: arranca con los datos de la anterior. */
  anterior: Propuesta | null;
  /** El plan por etapas de la documentación: arranca «Por etapas» con él. */
  etapasIniciales: EtapaNueva[] | null;
  onCancelar: () => void;
  onEnviada: () => void;
}) {
  const semanasIniciales = anterior ? anterior.plazo_dias : 21;
  const [precio, setPrecio] = useState(
    String(anterior?.precio ?? encargo.plantilla?.precio_desde ?? '')
  );
  const [plazo, setPlazo] = useState(String(semanasIniciales % 7 === 0 ? semanasIniciales / 7 : semanasIniciales));
  const [unidad, setUnidad] = useState<'semanas' | 'dias'>(semanasIniciales % 7 === 0 ? 'semanas' : 'dias');
  const [incluye, setIncluye] = useState((anterior?.incluye.length ? anterior.incluye : incluyeSugerido(encargo)).join('\n'));
  // Un porcentaje de adelanto, o 'etapas'.
  const [pago, setPago] = useState<number | 'etapas'>(
    etapasIniciales || anterior?.hitos.length ? 'etapas' : (anterior?.adelanto_pct ?? 50)
  );
  const [etapas, setEtapas] = useState(
    (etapasIniciales ?? (anterior?.hitos.length ? anterior.hitos : ETAPAS_SUGERIDAS)).map((h) => ({
      titulo: h.titulo,
      porcentaje: String(h.porcentaje),
      dias: String(h.dias),
    }))
  );
  const [validaHasta, setValidaHasta] = useState(enDias(15));
  const [nota, setNota] = useState(anterior?.nota ?? '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  // ABI viene con Pro y Negocio. Si no se puede leer el plan, se ofrece: el servidor lo comprueba.
  const [conAbi, setConAbi] = useState<boolean | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [razon, setRazon] = useState('');
  const [errorAbi, setErrorAbi] = useState('');

  useEffect(() => {
    let vigente = true;
    void miPlan().then((p) => {
      if (vigente) setConAbi(p ? p.plan !== 'free' : true);
    });
    return () => {
      vigente = false;
    };
  }, []);

  /** Llena el formulario con la propuesta de ABI. No guarda nada. */
  const prepararConAbi = async () => {
    setPreparando(true);
    setErrorAbi('');
    try {
      const p = await prepararPropuestaAbi(encargo.id);
      setPrecio(String(p.precio));
      if (p.etapas.length >= 2) {
        setPago('etapas');
        setEtapas(p.etapas.map((h) => ({ titulo: h.titulo, porcentaje: String(h.porcentaje), dias: String(h.dias) })));
      } else {
        setPago(p.adelanto_pct);
        setPlazo(String(p.plazo_dias % 7 === 0 ? p.plazo_dias / 7 : p.plazo_dias));
        setUnidad(p.plazo_dias % 7 === 0 ? 'semanas' : 'dias');
      }
      if (p.incluye.length) setIncluye(p.incluye.join('\n'));
      setNota(p.nota.slice(0, 800));
      setRazon(p.razon || 'Lista según la documentación y el presupuesto del cliente.');
    } catch (e) {
      setErrorAbi(e instanceof ApiError ? e.message : 'ABI no pudo preparar la propuesta. Vuelve a intentarlo.');
    } finally {
      setPreparando(false);
    }
  };

  const porEtapas = pago === 'etapas';
  const adelanto = porEtapas ? 0 : pago;
  const valorPrecio = Number(precio.replace(/[^\d]/g, ''));
  const valorPlazo = Number(plazo.replace(/[^\d]/g, ''));
  const etapasListas = etapas.map((h) => ({
    titulo: h.titulo.replace(/[<>]/g, '').trim(),
    porcentaje: Number(h.porcentaje) || 0,
    dias: Number(h.dias) || 0,
  }));
  const sumaPorcentajes = etapasListas.reduce((suma, h) => suma + h.porcentaje, 0);
  const sumaDias = etapasListas.reduce((suma, h) => suma + h.dias, 0);
  const montosDeEtapas = montosEtapas(valorPrecio || 0, etapasListas.map((h) => h.porcentaje));
  const dias = porEtapas ? sumaDias : unidad === 'semanas' ? valorPlazo * 7 : valorPlazo;
  const lineas = incluye
    .split('\n')
    .map((l) => l.replace(/[<>]/g, '').trim().slice(0, 140))
    .filter(Boolean)
    .slice(0, 15);
  const { adelanto: montoAdelanto } = montos(valorPrecio || 0, adelanto);

  const cambiarEtapa = (i: number, campo: 'titulo' | 'porcentaje' | 'dias', valor: string) =>
    setEtapas((todas) =>
      todas.map((h, j) =>
        j !== i
          ? h
          : { ...h, [campo]: campo === 'titulo' ? valor.replace(/[<>]/g, '').slice(0, 60) : valor.replace(/[^\d]/g, '').slice(0, 3) }
      )
    );

  const errorEtapas = (): string => {
    if (etapasListas.some((h) => h.titulo.length < 2)) return 'Ponle nombre a cada etapa.';
    if (etapasListas.some((h) => h.porcentaje < 1 || h.dias < 1)) return 'Cada etapa necesita su porcentaje y sus días.';
    if (sumaPorcentajes !== 100) return `Los porcentajes deben sumar 100 % (ahora suman ${sumaPorcentajes} %).`;
    if (sumaDias > 365) return 'Las etapas suman más de un año.';
    return '';
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(valorPrecio > 0 && valorPrecio < 1_000_000)) return setError('Pon el precio en soles, sin decimales.');
    if (porEtapas && errorEtapas()) return setError(errorEtapas());
    if (!(dias >= 1 && dias <= 365)) return setError('Revisa el plazo (de 1 día a 52 semanas).');
    setEnviando(true);
    setError('');
    const r = await enviarPropuesta(encargo.id, {
      precio: valorPrecio,
      plazo_dias: dias,
      incluye: lineas,
      adelanto_pct: adelanto,
      valida_hasta: validaHasta,
      nota: nota.trim().slice(0, 800),
      etapas: porEtapas ? etapasListas : undefined,
    });
    setEnviando(false);
    if (r.estado === 'ok') return onEnviada();
    setError(
      r.estado === 'ya_aceptada'
        ? 'Este encargo ya tiene una propuesta aceptada.'
        : (r.error ?? 'No se pudo guardar la propuesta. Vuelve a intentarlo.')
    );
  };

  return (
    <form onSubmit={(e) => void enviar(e)} className="mt-3 space-y-4">
      {anterior && (
        <p className="text-xs text-ink-subtle">
          La nueva versión reemplaza a la anterior: el cliente verá solo esta.
        </p>
      )}
      {etapasIniciales && (
        <p className="text-xs text-ink-subtle">
          Las etapas vienen del plan de la documentación. Ajusta nombres, porcentajes y días si quieres, y pon tu precio.
        </p>
      )}
      {conAbi === false ? (
        <p className="text-xs text-ink-subtle">Con el plan Pro, ABI te prepara la propuesta con un clic.</p>
      ) : (
        conAbi && (
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 text-sm text-ink">
                <span className="font-medium">¿Te la prepara ABI?</span>{' '}
                <span className="text-ink-muted">Con la documentación, el presupuesto del cliente y tu estilo.</span>
              </p>
              <button
                type="button"
                onClick={() => void prepararConAbi()}
                disabled={preparando}
                className="btn btn-primary !px-3 !py-1.5 text-xs"
              >
                {preparando ? 'ABI la está preparando…' : razon ? 'Prepararla de nuevo' : '✨ Que ABI la prepare'}
              </button>
            </div>
            {razon && !preparando && (
              <div className="mt-2 text-sm text-ink-muted" role="status">
                <p>
                  <strong className="text-ink">Por qué así:</strong> {razon}
                </p>
                <p className="mt-1 text-xs text-ink-subtle">
                  Revísala y ajusta lo que quieras: el cliente no ve nada hasta que la guardes.
                </p>
              </div>
            )}
            {errorAbi && (
              <p role="alert" className="mt-2 text-sm text-negative">
                {errorAbi}
              </p>
            )}
          </div>
        )
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1.5 block text-ink-muted">Precio final</span>
          <span className="relative block">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle">S/</span>
            <input
              value={precio}
              onChange={(e) => setPrecio(e.target.value.replace(/[^\d]/g, '').slice(0, 7))}
              inputMode="numeric"
              placeholder="1200"
              className="field !pl-9 tabular-nums"
            />
          </span>
        </label>
        {porEtapas ? (
          <div className="text-sm">
            <span className="mb-1.5 block text-ink-muted">Plazo de entrega</span>
            <p className="field bg-surface-overlay/50 text-ink tabular-nums" aria-live="polite">
              {sumaDias > 0 ? textoPlazo(sumaDias) : '—'}
            </p>
            <span className="mt-1 block text-xs text-ink-subtle">La suma de las etapas</span>
          </div>
        ) : (
          <label className="block text-sm">
            <span className="mb-1.5 block text-ink-muted">Plazo de entrega</span>
            <span className="flex gap-2">
              <input
                value={plazo}
                onChange={(e) => setPlazo(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
                inputMode="numeric"
                className="field !w-20 tabular-nums"
                aria-label="Cantidad"
              />
              <select value={unidad} onChange={(e) => setUnidad(e.target.value as 'semanas' | 'dias')} className="field" aria-label="Unidad">
                <option value="semanas">semanas</option>
                <option value="dias">días</option>
              </select>
            </span>
          </label>
        )}
        <label className="block text-sm">
          <span className="mb-1.5 block text-ink-muted">Válida hasta</span>
          <input type="date" value={validaHasta} min={enDias(0)} onChange={(e) => setValidaHasta(e.target.value)} className="field" />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1.5 block text-ink-muted">Forma de pago</span>
        <select
          value={String(pago)}
          onChange={(e) => setPago(e.target.value === 'etapas' ? 'etapas' : Number(e.target.value))}
          className="field sm:!w-80"
        >
          <option value="50">50 % al empezar y 50 % al entregar</option>
          <option value="30">30 % al empezar y 70 % al entregar</option>
          <option value="100">Todo al empezar</option>
          <option value="0">Todo al entregar</option>
          <option value="etapas">Por etapas, al aprobar cada entrega</option>
        </select>
        {valorPrecio > 0 && !porEtapas && adelanto > 0 && adelanto < 100 && (
          <span className="mt-1 block text-xs text-ink-subtle tabular-nums">
            Adelanto: {solesEnteros(montoAdelanto)} · Saldo: {solesEnteros(valorPrecio - montoAdelanto)}
          </span>
        )}
      </label>

      {porEtapas && (
        <fieldset className="rounded-xl border border-line p-3 sm:p-4">
          <legend className="px-1 text-sm text-ink-muted">Etapas</legend>
          <p className="mb-3 text-xs text-ink-subtle">
            Entregas cada etapa, el cliente la aprueba con el enlace de la propuesta y te paga esa parte. De 2 a 5 etapas.
          </p>
          <div className="mb-1 grid grid-cols-[1fr_3.25rem_3.25rem_1.5rem] gap-2 text-xs text-ink-subtle sm:grid-cols-[1fr_4.5rem_4.5rem_5.5rem_1.75rem]">
            <span>Nombre</span>
            <span className="text-center">%</span>
            <span className="text-center">Días</span>
            <span className="hidden text-right sm:block">Monto</span>
            <span />
          </div>
          <ol className="space-y-2">
            {etapas.map((h, i) => (
              <li
                key={i}
                className="grid grid-cols-[1fr_3.25rem_3.25rem_1.5rem] items-center gap-2 sm:grid-cols-[1fr_4.5rem_4.5rem_5.5rem_1.75rem]"
              >
                <input
                  value={h.titulo}
                  onChange={(e) => cambiarEtapa(i, 'titulo', e.target.value)}
                  className="field"
                  placeholder={`Etapa ${i + 1}`}
                  aria-label={`Nombre de la etapa ${i + 1}`}
                />
                <input
                  value={h.porcentaje}
                  onChange={(e) => cambiarEtapa(i, 'porcentaje', e.target.value)}
                  inputMode="numeric"
                  className="field !px-1 text-center tabular-nums"
                  aria-label={`Porcentaje de la etapa ${i + 1}`}
                />
                <input
                  value={h.dias}
                  onChange={(e) => cambiarEtapa(i, 'dias', e.target.value)}
                  inputMode="numeric"
                  className="field !px-1 text-center tabular-nums"
                  aria-label={`Días de la etapa ${i + 1}`}
                />
                <span className="hidden text-right text-sm text-ink tabular-nums sm:block">
                  {valorPrecio > 0 && sumaPorcentajes === 100 ? solesEnteros(montosDeEtapas[i]) : '—'}
                </span>
                <button
                  type="button"
                  onClick={() => setEtapas((todas) => todas.filter((_, j) => j !== i))}
                  disabled={etapas.length <= 2}
                  className="grid h-7 w-6 place-items-center rounded-full text-ink-subtle hover:bg-surface-overlay hover:text-negative disabled:invisible sm:w-7"
                  aria-label={`Quitar la etapa ${i + 1}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            {etapas.length < 5 ? (
              <button
                type="button"
                onClick={() => setEtapas((todas) => [...todas, { titulo: '', porcentaje: '', dias: '' }])}
                className="font-medium text-accent hover:underline"
              >
                + Agregar etapa
              </button>
            ) : (
              <span />
            )}
            <span className={'tabular-nums ' + (sumaPorcentajes === 100 ? 'text-ink-muted' : 'text-negative')}>
              Suma: {sumaPorcentajes} %{sumaPorcentajes === 100 ? ' ✓' : ` (${sumaPorcentajes < 100 ? 'faltan' : 'sobran'} ${Math.abs(100 - sumaPorcentajes)} %)`}
            </span>
          </div>
        </fieldset>
      )}

      <label className="block text-sm">
        <span className="mb-1.5 block text-ink-muted">Qué incluye (una línea por cada cosa)</span>
        <textarea value={incluye} onChange={(e) => setIncluye(e.target.value)} rows={6} className="field" />
      </label>

      <label className="block text-sm">
        <span className="mb-1.5 block text-ink-muted">Mensaje para el cliente (opcional)</span>
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value.slice(0, 800))}
          rows={3}
          className="field"
          placeholder="Ej: Gracias por la confianza. Empezamos apenas confirmes."
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancelar} className="btn btn-ghost">
          Cancelar
        </button>
        <button type="submit" disabled={enviando} className="btn btn-primary">
          {enviando ? 'Guardando…' : 'Guardar propuesta'}
        </button>
      </div>
    </form>
  );
}
