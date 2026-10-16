import { useEffect, useState, type ReactNode } from 'react';
import { formatearWhatsapp, enlaceWhatsapp } from '../../lib/contacto';
import {
  ingenierosParaAdmin,
  miPerfilIngeniero,
  miVerificacion,
  revisarIngeniero,
  verificarIngeniero,
  textoEstrellas,
  type IngenieroAdmin,
  type MiPerfil,
  textoServicios,
} from '../../lib/ingenieros';
import { CATEGORIAS_NEGOCIO } from '../../lib/plantillas';
import { primerosPasosIngenieros, textoFaltantes, type Paso } from '../../lib/primerosPasos';
import { FormularioPerfil } from '../ingenieros/FormularioPerfil';
import { FotoIngeniero } from '../ingenieros/TarjetaIngeniero';
import { Bandera } from '../ui/Bandera';
import { AvisosWhatsapp } from '../ingenieros/AvisosWhatsapp';
import { TuPaginaPublica } from '../ingenieros/TuPaginaPublica';
import { MisTrabajos } from '../ingenieros/MisTrabajos';
import { InsigniaVerificado, QUE_ES_VERIFICADO } from '../ui/InsigniaVerificado';
import { pedirVerificacion } from '../../lib/api';
import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Ingenieros del marketplace
// ---------------------------------------------------------------------------
// El administrador revisa las solicitudes (aprobar o rechazar), pausa o
// reactiva a los ingenieros y edita su propio perfil. Los demás ingenieros
// solo ven y editan el suyo.
// ---------------------------------------------------------------------------

const etiquetaRubro = (valor: string) => CATEGORIAS_NEGOCIO.find((c) => c.valor === valor)?.etiqueta ?? valor;

export function IngenierosPanel({ esAdmin }: { esAdmin: boolean }) {
  return (
    <section className="mx-auto max-w-4xl px-5 py-8">
      {esAdmin && <EquipoAdmin />}
      <MiPerfilIngeniero esAdmin={esAdmin} />
    </section>
  );
}

function MiPerfilIngeniero({ esAdmin }: { esAdmin: boolean }) {
  const [perfil, setPerfil] = useState<MiPerfil | null | undefined>(undefined);
  // El texto del aviso tras guardar; null si no hay.
  const [guardado, setGuardado] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    void miPerfilIngeniero().then((p) => {
      if (vigente) setPerfil(p);
    });
    return () => {
      vigente = false;
    };
  }, []);

  return (
    <div className={esAdmin ? 'mt-12 border-t border-line pt-10' : ''}>
      <h2 className="text-2xl">Tu perfil</h2>
      <p className="mt-1 mb-6 text-sm text-ink-muted">
        Es lo que ven los dueños de negocio al elegir quién les construye la web.
        {esAdmin && !perfil && perfil !== undefined && ' Complétalo para aparecer tú también entre los ingenieros.'}
      </p>
      {guardado && (
        <p role="status" className="mb-4 text-sm text-positive">
          {guardado}
        </p>
      )}
      {perfil?.slug && perfil.estado === 'aprobado' && <TuPaginaPublica slug={perfil.slug} />}
      {perfil?.estado === 'aprobado' && <MiInsignia esAdmin={esAdmin} />}
      {perfil?.estado === 'aprobado' && <MisTrabajos />}
      {perfil === undefined ? (
        <p className="text-sm text-ink-subtle">Cargando…</p>
      ) : (
        <div className="card p-6">
          <FormularioPerfil
            inicial={perfil}
            textoBoton="Guardar perfil"
            onGuardado={(estado) => {
              // Un miembro de equipo que crea su perfil público: lo revisa el administrador.
              const enRevision = estado === 'pendiente';
              setGuardado(
                enRevision
                  ? '✓ Perfil guardado. AIB+ lo revisará antes de mostrarlo en el buscador.'
                  : '✓ Perfil guardado.'
              );
              setTimeout(() => setGuardado(null), enRevision ? 8000 : 3000);
            }}
          />
        </div>
      )}
      {/* Al administrador le avisa el WhatsApp configurado en el servidor. */}
      {!esAdmin && perfil && <AvisosWhatsapp />}
    </div>
  );
}

function EquipoAdmin() {
  const [lista, setLista] = useState<IngenieroAdmin[] | null | undefined>(undefined);
  // Cuánto le falta a cada uno para empezar a recibir clientes.
  const [pasos, setPasos] = useState<Map<string, Paso[]>>(new Map());
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const enlace = `${window.location.origin}/ingenieros`;

  const cargar = () =>
    ingenierosParaAdmin().then((l) => {
      setLista(l);
    });

  useEffect(() => {
    let vigente = true;
    void ingenierosParaAdmin().then((l) => {
      if (vigente) setLista(l);
    });
    void primerosPasosIngenieros().then((p) => {
      if (vigente) setPasos(p);
    });
    return () => {
      vigente = false;
    };
  }, []);

  const accion = async (ing: IngenieroAdmin, que: 'aprobar' | 'rechazar' | 'pausar' | 'reactivar') => {
    if (que === 'rechazar' && !window.confirm(`¿Rechazar la solicitud de ${ing.nombre}?`)) return;
    setTrabajando(ing.user_id);
    await revisarIngeniero(ing.user_id, que);
    await cargar();
    setTrabajando(null);
  };

  const verificar = async (ing: IngenieroAdmin, si: boolean) => {
    const pregunta = si
      ? `¿Verificar a ${ing.nombre}? Hazlo solo si comprobaste su identidad (su DNI en una videollamada) y revisaste al menos un trabajo real suyo.`
      : `¿Quitarle la insignia «Verificado» a ${ing.nombre}?`;
    if (!window.confirm(pregunta)) return;
    setTrabajando(ing.user_id);
    await verificarIngeniero(ing.user_id, si);
    await cargar();
    setTrabajando(null);
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  const otros = (lista ?? []).filter((i) => !i.es_admin);
  const pendientes = otros.filter((i) => i.estado === 'pendiente');
  const equipo = otros.filter((i) => i.estado === 'aprobado' || i.estado === 'pausado');
  const rechazados = otros.filter((i) => i.estado === 'rechazado');

  return (
    <div>
      <header>
        <h2 className="text-2xl">Ingenieros</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Comparte el enlace con los ingenieros que quieras sumar. Postulan con su perfil y tú decides quién entra.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-line bg-surface-deep/70 px-3 py-2 font-mono text-xs text-ink">{enlace}</span>
          <button type="button" onClick={() => void copiar()} className="btn btn-ghost !px-3 !py-1.5 text-xs">
            {copiado ? '✓ Copiado' : 'Copiar enlace'}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Te invito a unirte a AIB+ como ingeniero: ${enlace}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary !px-3 !py-1.5 text-xs"
          >
            Enviar por WhatsApp
          </a>
        </div>
      </header>

      {lista === undefined ? (
        <p className="mt-6 text-sm text-ink-subtle">Cargando…</p>
      ) : lista === null ? (
        <p className="mt-6 text-sm text-negative">No se pudieron leer las solicitudes.</p>
      ) : (
        <>
          <h3 className="mt-8 mb-3 text-xs font-semibold tracking-wide text-accent uppercase">
            Solicitudes por revisar · {pendientes.length}
          </h3>
          {pendientes.length === 0 ? (
            <p className="text-sm text-ink-muted">No hay solicitudes pendientes.</p>
          ) : (
            <ul className="space-y-3">
              {pendientes.map((ing) => (
                <FilaIngeniero key={ing.user_id} ing={ing} ocupado={trabajando === ing.user_id}>
                  <button type="button" onClick={() => void accion(ing, 'aprobar')} className="btn btn-primary !px-3 !py-1.5 text-xs">
                    Aprobar
                  </button>
                  <button
                    type="button"
                    onClick={() => void accion(ing, 'rechazar')}
                    className="btn btn-ghost !px-3 !py-1.5 text-xs text-negative hover:border-negative/50"
                  >
                    Rechazar
                  </button>
                </FilaIngeniero>
              ))}
            </ul>
          )}

          <h3 className="mt-8 mb-3 text-xs font-semibold tracking-wide text-accent uppercase">
            Tu equipo · {equipo.length}
          </h3>
          {equipo.length === 0 ? (
            <p className="text-sm text-ink-muted">Todavía no has aprobado a ningún ingeniero.</p>
          ) : (
            <ul className="space-y-3">
              {equipo.map((ing) => (
                <FilaIngeniero key={ing.user_id} ing={ing} ocupado={trabajando === ing.user_id} pasos={pasos.get(ing.user_id)}>
                  {ing.verificado_en ? (
                    <button type="button" onClick={() => void verificar(ing, false)} className="btn btn-ghost !px-3 !py-1.5 text-xs">
                      Quitar insignia
                    </button>
                  ) : (
                    <button type="button" onClick={() => void verificar(ing, true)} className="btn btn-primary !px-3 !py-1.5 text-xs">
                      Verificar
                    </button>
                  )}
                  {ing.estado === 'aprobado' ? (
                    <button type="button" onClick={() => void accion(ing, 'pausar')} className="btn btn-ghost !px-3 !py-1.5 text-xs">
                      Pausar
                    </button>
                  ) : (
                    <button type="button" onClick={() => void accion(ing, 'reactivar')} className="btn btn-ghost !px-3 !py-1.5 text-xs">
                      Reactivar
                    </button>
                  )}
                </FilaIngeniero>
              ))}
            </ul>
          )}

          {rechazados.length > 0 && (
            <p className="mt-6 text-xs text-ink-subtle">
              Rechazadas: {rechazados.map((i) => i.nombre).join(', ')}. Si mejoran su perfil, vuelven a «por revisar».
            </p>
          )}
        </>
      )}
    </div>
  );
}

function FilaIngeniero({
  ing,
  ocupado,
  pasos,
  children,
}: {
  ing: IngenieroAdmin;
  ocupado: boolean;
  /** Sus primeros pasos (solo los aprobados o en pausa). */
  pasos?: Paso[];
  children: ReactNode;
}) {
  const primerNombre = ing.nombre.split(' ')[0];
  const chat = ing.whatsapp ? enlaceWhatsapp(ing.whatsapp, `Hola ${primerNombre}, te escribo de AIB+.`) : null;
  const hechos = pasos?.filter((p) => p.hecho).length ?? 0;
  const faltan = pasos && hechos < pasos.length ? textoFaltantes(pasos) : '';
  const recordarle =
    faltan && ing.whatsapp
      ? enlaceWhatsapp(
          ing.whatsapp,
          `Hola ${primerNombre}, para que empieces a recibir clientes en AIB+ te falta ${faltan}. Lo haces en un momento desde tu panel, en «Hoy»: ${window.location.origin}/dashboard`
        )
      : null;
  return (
    <li className={'card p-4 ' + (ocupado ? 'opacity-60' : '')}>
      <div className="flex items-start gap-3">
        <FotoIngeniero nombre={ing.nombre} foto={ing.foto_url} tamano={48} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink">
              {ing.nombre} <Bandera pais={ing.pais} />
            </p>
            {ing.estado === 'pausado' && (
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-subtle">Pausado</span>
            )}
            {ing.verificado_en && <InsigniaVerificado />}
            {!ing.verificado_en && ing.verificacion_pedida_en && (
              <span className="rounded-full bg-caution/15 px-2 py-0.5 text-[11px] font-medium text-ink">Pidió la insignia</span>
            )}
          </div>
          <p className="text-sm text-ink-muted">{ing.titular}</p>
          <p className="mt-1 text-xs text-ink-subtle">
            {[
              ing.correo,
              ing.whatsapp && formatearWhatsapp(ing.whatsapp),
              ing.ciudad,
              ing.anios_experiencia != null && `${ing.anios_experiencia} años de experiencia`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {ing.especialidades.length > 0 && (
            <p className="mt-1 text-xs text-ink-muted">{ing.especialidades.map(etiquetaRubro).join(' · ')}</p>
          )}
          {ing.servicios && ing.servicios.length > 0 && (
            <p className="mt-1 text-xs text-ink-muted">
              <span className="text-ink-subtle">Servicios:</span> {textoServicios(ing.servicios, ing.servicios_otros)}
              {ing.servicios_otros && ing.servicios_otros.length > 0 && (
                <span className="ml-1 rounded-full bg-accent-alt/20 px-2 py-0.5 text-[11px] text-ink">
                  pide formulario para {ing.servicios_otros.length === 1 ? '1 servicio' : `${ing.servicios_otros.length} servicios`}
                </span>
              )}
            </p>
          )}
          {ing.bio && <p className="mt-2 text-sm whitespace-pre-line text-ink">{ing.bio}</p>}
          {ing.portafolio_url && (
            <a
              href={ing.portafolio_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mt-1 inline-block text-sm text-accent underline underline-offset-2"
            >
              Portafolio ↗
            </a>
          )}
          {ing.estado !== 'pendiente' && (
            <p className="mt-2 text-xs text-ink-muted">
              {ing.encargos} {ing.encargos === 1 ? 'encargo' : 'encargos'} · {textoEstrellas(ing.promedio, ing.resenas)}
            </p>
          )}
          {pasos && pasos.length > 0 && (
            <p className={'mt-1 text-xs ' + (faltan ? 'text-caution' : 'text-positive')}>
              Primeros pasos: {hechos} de {pasos.length}
              {faltan ? ` · le falta ${faltan}` : ' ✓'}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {children}
        {recordarle && (
          <a href={recordarle} target="_blank" rel="noopener noreferrer" className="btn btn-primary !px-3 !py-1.5 text-xs">
            Recordarle sus pasos
          </a>
        )}
        {chat && (
          <a href={chat} target="_blank" rel="noopener noreferrer" className="btn btn-ghost !px-3 !py-1.5 text-xs">
            Escribirle
          </a>
        )}
      </div>
    </li>
  );
}

/**
 * En «Tu perfil»: la insignia «Verificado». Si no la tiene, la pide y al
 * administrador le llega un WhatsApp. El administrador se la pone él mismo.
 */
function MiInsignia({ esAdmin }: { esAdmin: boolean }) {
  const [estado, setEstado] = useState<{ verificado: boolean; pedidaEn: string | null } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    let vigente = true;
    void miVerificacion().then((v) => vigente && setEstado(v));
    return () => {
      vigente = false;
    };
  }, []);

  if (!estado) return null;

  const pedir = async () => {
    setEnviando(true);
    setMensaje('');
    const r = await pedirVerificacion();
    setEnviando(false);
    if (r === 'ok' || r === 'ya_pedida') {
      setEstado({ ...estado, pedidaEn: estado.pedidaEn ?? new Date().toISOString() });
      setMensaje(r === 'ok' ? 'Listo: el administrador te escribirá para coordinar la verificación.' : 'Ya la pediste esta semana: el administrador te escribirá.');
    } else if (r === 'ya_verificado') {
      setEstado({ verificado: true, pedidaEn: null });
    } else {
      setMensaje('No pudimos enviar tu pedido. Vuelve a intentarlo en un momento.');
    }
  };

  const marcarme = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setEnviando(true);
    if (await verificarIngeniero(user.id, true)) setEstado({ verificado: true, pedidaEn: null });
    setEnviando(false);
  };

  return (
    <div className="card mb-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-xl">
            Insignia {estado.verificado ? <InsigniaVerificado tamano="md" /> : '«Verificado»'}
          </h3>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">
            {estado.verificado
              ? `Ya la tienes: sale en tu tarjeta, en tu página y en tus diseños, y apareces antes en las búsquedas. ${QUE_ES_VERIFICADO}`
              : 'Da más confianza a los clientes y te pone antes en las búsquedas. Para dártela, el administrador comprueba tu identidad (tu DNI en una videollamada corta) y revisa al menos un trabajo real tuyo.'}
          </p>
        </div>
        {!estado.verificado &&
          (esAdmin ? (
            <button type="button" onClick={() => void marcarme()} disabled={enviando} className="btn btn-primary">
              Marcarme como verificado
            </button>
          ) : estado.pedidaEn ? (
            <span className="rounded-full bg-caution/15 px-3 py-1.5 text-xs font-medium text-ink">Pedida: te escribiremos</span>
          ) : (
            <button type="button" onClick={() => void pedir()} disabled={enviando} className="btn btn-primary">
              {enviando ? 'Enviando…' : 'Pedir verificación'}
            </button>
          ))}
      </div>
      {mensaje && (
        <p role="status" className="mt-3 text-sm text-ink-muted">
          {mensaje}
        </p>
      )}
    </div>
  );
}
