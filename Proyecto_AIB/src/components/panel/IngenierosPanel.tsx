import { useEffect, useState, type ReactNode } from 'react';
import { formatearWhatsapp, enlaceWhatsapp } from '../../lib/contacto';
import {
  ingenierosParaAdmin,
  miPerfilIngeniero,
  revisarIngeniero,
  textoEstrellas,
  type IngenieroAdmin,
  type MiPerfil,
  textoServicios,
} from '../../lib/ingenieros';
import { CATEGORIAS_NEGOCIO } from '../../lib/plantillas';
import { FormularioPerfil } from '../ingenieros/FormularioPerfil';
import { FotoIngeniero } from '../ingenieros/TarjetaIngeniero';
import { AvisosWhatsapp } from '../ingenieros/AvisosWhatsapp';
import { TuPaginaPublica } from '../ingenieros/TuPaginaPublica';

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
  const [guardado, setGuardado] = useState(false);

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
          ✓ Perfil guardado.
        </p>
      )}
      {perfil?.slug && perfil.estado === 'aprobado' && <TuPaginaPublica slug={perfil.slug} />}
      {perfil === undefined ? (
        <p className="text-sm text-ink-subtle">Cargando…</p>
      ) : (
        <div className="card p-6">
          <FormularioPerfil
            inicial={perfil}
            textoBoton="Guardar perfil"
            onGuardado={() => {
              setGuardado(true);
              setTimeout(() => setGuardado(false), 3000);
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
                <FilaIngeniero key={ing.user_id} ing={ing} ocupado={trabajando === ing.user_id}>
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
  children,
}: {
  ing: IngenieroAdmin;
  ocupado: boolean;
  children: ReactNode;
}) {
  const chat = ing.whatsapp ? enlaceWhatsapp(ing.whatsapp, `Hola ${ing.nombre.split(' ')[0]}, te escribo de AIB+.`) : null;
  return (
    <li className={'card p-4 ' + (ocupado ? 'opacity-60' : '')}>
      <div className="flex items-start gap-3">
        <FotoIngeniero nombre={ing.nombre} foto={ing.foto_url} tamano={48} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink">{ing.nombre}</p>
            {ing.estado === 'pausado' && (
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-subtle">Pausado</span>
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
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {children}
        {chat && (
          <a href={chat} target="_blank" rel="noopener noreferrer" className="btn btn-ghost !px-3 !py-1.5 text-xs">
            Escribirle
          </a>
        )}
      </div>
    </li>
  );
}
