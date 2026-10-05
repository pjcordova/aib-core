import { useEffect, useMemo, useRef, useState } from 'react';
import type { TokenUsage } from '../../lib/api';
import {
  aplicarPaleta,
  cssDePaleta,
  documentoEditable,
  MENSAJE_EDICION,
  MENSAJE_PALETA,
  MENSAJE_PEDIR_FOTO,
  MENSAJE_PONER_FOTO,
  sanearDocumento,
} from '../../lib/edicion';
import { subirFoto } from '../../lib/fotos';
import { construirDocumento } from '../../lib/marca';
import { PALETAS, type FichaWeb, type Paleta } from '../../lib/servicios';
import { CompartirMaqueta } from './CompartirMaqueta';
import { ComentarioMaqueta } from './ComentarioMaqueta';
import { conAnimaciones } from '../../lib/animaciones';

type EstadoGuardado = 'inactivo' | 'guardando' | 'guardado' | 'fallo';
type EstadoAceptacion = 'inactivo' | 'procesando' | 'aceptado' | 'fallo';
type Vista = 'escritorio' | 'movil' | 'codigo';
type EstadoEdicion = 'inactivo' | 'guardando' | 'fallo';
type EstadoFoto = 'inactivo' | 'subiendo' | 'fallo';

interface Props {
  /** Cuerpo generado por IA; se monta con construirDocumento. */
  cuerpo?: string;
  /** Página ya completa (plantillas del ingeniero). Tiene prioridad sobre `cuerpo`. */
  documento?: string;
  /** Nombre de la plantilla usada, si la hay. */
  plantilla?: string;
  /** Id de la plantilla base: hace falta para recalcular sus colores al editar. */
  plantillaBase?: string;
  ficha: FichaWeb;
  usage?: TokenUsage | null;
  guardado?: EstadoGuardado;
  aceptacion?: EstadoAceptacion;
  onRegenerar?: () => void;
  onAceptar?: () => void;
  /**
   * Guarda lo que el cliente editó a mano. Si no se pasa, no se puede editar.
   * Devuelve si se guardó.
   */
  onGuardarEdicion?: (cambios: { documento: string; paleta: Paleta }) => Promise<boolean>;
  /** Proyecto guardado: con él se puede crear un enlace para compartir. */
  proyectoId?: string | null;
  /**
   * El estado del encargo ya se muestra encima (proyecto reabierto): no se
   * repite el aviso de aceptado, que diría algo distinto de la etapa real.
   */
  conSeguimiento?: boolean;
}

/**
 * Maqueta web del cliente. Se pinta en un iframe con `sandbox="allow-scripts"`
 * y sin `allow-same-origin`: el script de Bootstrap puede mover los
 * desplegables, pero nada de lo que haya dentro puede leer la sesión de la app.
 */
export function WebPreview({
  cuerpo = '',
  documento: documentoListo,
  plantilla,
  plantillaBase,
  ficha,
  usage,
  guardado = 'inactivo',
  aceptacion = 'inactivo',
  onRegenerar,
  onAceptar,
  onGuardarEdicion,
  proyectoId,
  conSeguimiento = false,
}: Props) {
  const [vista, setVista] = useState<Vista>('escritorio');
  const [copiado, setCopiado] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);

  // Edición en vivo
  const [editando, setEditando] = useState(false);
  const [baseEdicion, setBaseEdicion] = useState('');
  const [borrador, setBorrador] = useState<string | null>(null);
  const [paletaEdicion, setPaletaEdicion] = useState<Paleta>(ficha.paleta);
  const [estadoEdicion, setEstadoEdicion] = useState<EstadoEdicion>('inactivo');
  const [seEdito, setSeEdito] = useState(false);
  const [estadoFoto, setEstadoFoto] = useState<EstadoFoto>('inactivo');
  const [errorFoto, setErrorFoto] = useState('');
  const marco = useRef<HTMLIFrameElement>(null);
  const selectorFoto = useRef<HTMLInputElement>(null);
  /** Hueco de la maqueta que espera la foto que se está eligiendo. */
  const huecoPendiente = useRef<number | null>(null);

  const documento = useMemo(
    // Las maquetas guardadas antes de las animaciones las reciben al mostrarse.
    () => (documentoListo ? conAnimaciones(documentoListo) : construirDocumento(cuerpo, ficha)),
    [documentoListo, cuerpo, ficha]
  );

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(documento);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  const descargar = () => {
    const url = URL.createObjectURL(new Blob([documento], { type: 'text/html;charset=utf-8' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'index.html';
    enlace.click();
    URL.revokeObjectURL(url);
  };

  const aceptado = aceptacion === 'aceptado';
  const puedeEditar = !!onGuardarEdicion && !aceptado;
  const puedeCompartir = !!proyectoId && guardado === 'guardado';

  // Mientras se edita, el iframe muestra una copia con el editor dentro. Se
  // calcula una sola vez al entrar: si cambiara con cada tecla, se recargaría.
  const documentoEnPantalla = useMemo(
    () => (editando ? documentoEditable(baseEdicion) : documento),
    [editando, baseEdicion, documento]
  );

  // La maqueta avisa de cada cambio. Solo se atiende a nuestro propio iframe.
  useEffect(() => {
    if (!editando) return;
    const alRecibir = (e: MessageEvent) => {
      if (e.source !== marco.current?.contentWindow) return;
      const datos = e.data as { tipo?: unknown; html?: unknown; hueco?: unknown } | null;
      if (datos?.tipo === MENSAJE_EDICION && typeof datos.html === 'string' && datos.html.length < 5_000_000) {
        setBorrador(datos.html);
      }
      if (datos?.tipo === MENSAJE_PEDIR_FOTO && Number.isInteger(datos.hueco)) {
        huecoPendiente.current = datos.hueco as number;
        selectorFoto.current?.click();
      }
    };
    window.addEventListener('message', alRecibir);
    return () => window.removeEventListener('message', alRecibir);
  }, [editando]);

  // Las paletas de siempre, más la del cliente si es otra (la de su logo).
  const paletas = PALETAS.some((p) => p.id === ficha.paleta.id) ? PALETAS : [ficha.paleta, ...PALETAS];
  const mismaPaleta = (a: Paleta, b: Paleta) => a.primario === b.primario && a.secundario === b.secundario;
  const hayCambios = borrador !== null || !mismaPaleta(paletaEdicion, ficha.paleta);

  const empezarEdicion = () => {
    setBaseEdicion(documento);
    setBorrador(null);
    setPaletaEdicion(ficha.paleta);
    setEstadoEdicion('inactivo');
    if (vista === 'codigo') setVista('escritorio');
    setCompartiendo(false);
    setEditando(true);
  };

  const elegirPaleta = (p: Paleta) => {
    setPaletaEdicion(p);
    // Se aplica dentro de la maqueta sin recargarla: no se pierde lo escrito.
    marco.current?.contentWindow?.postMessage({ tipo: MENSAJE_PALETA, css: cssDePaleta(p, plantillaBase) }, '*');
  };

  /** Sube la foto elegida y se la manda a la maqueta para que la coloque. */
  const alElegirFoto = async (archivo: File | undefined) => {
    const hueco = huecoPendiente.current;
    huecoPendiente.current = null;
    if (!archivo || hueco === null) return;
    setEstadoFoto('subiendo');
    setErrorFoto('');
    try {
      const url = await subirFoto(archivo);
      marco.current?.contentWindow?.postMessage({ tipo: MENSAJE_PONER_FOTO, hueco, url }, '*');
      setEstadoFoto('inactivo');
    } catch (e) {
      setErrorFoto(e instanceof Error ? e.message : 'No pudimos subir la foto.');
      setEstadoFoto('fallo');
    }
  };

  const cancelarEdicion = () => {
    setEditando(false);
    setBorrador(null);
  };

  const guardarEdicion = async () => {
    if (!onGuardarEdicion) return;
    const final = sanearDocumento(aplicarPaleta(borrador ?? baseEdicion, cssDePaleta(paletaEdicion, plantillaBase)));
    setEstadoEdicion('guardando');
    const ok = await onGuardarEdicion({ documento: final, paleta: paletaEdicion });
    if (!ok) {
      setEstadoEdicion('fallo');
      return;
    }
    setEstadoEdicion('inactivo');
    setEditando(false);
    setBorrador(null);
    setSeEdito(true);
  };

  const regenerar = () => {
    if (!onRegenerar) return;
    if (seEdito && !window.confirm('Si pruebas otra versión perderás los cambios que hiciste. ¿Continuar?')) return;
    onRegenerar();
  };

  return (
    <div className="animate-fade-up py-6">
      {/* ---------------------------------------------------------- cabecera */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">
              🌐 Maqueta web
            </span>
            {plantilla && (
              <span className="text-[11px] text-ink-subtle">Basada en «{plantilla}»</span>
            )}
            <IndicadorGuardado estado={guardado} />
          </div>
          <h2 className="truncate text-xl font-semibold" title={ficha.empresa}>
            Así se vería la web de {ficha.empresa}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {puedeEditar
              ? 'Es una primera idea: con «Editar» cambias los textos, los colores y pones tus propias fotos.'
              : 'Es una primera idea para validar el estilo. Los textos y fotos finales los afinas con el ingeniero.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-lg border border-line bg-surface-overlay/60 p-0.5"
            role="tablist"
            aria-label="Cambiar vista"
          >
            {(
              [
                ['escritorio', 'Escritorio'],
                ['movil', 'Móvil'],
                ['codigo', 'Código'],
              ] as const
            ).map(([v, texto]) => (
              <button
                key={v}
                role="tab"
                aria-selected={vista === v}
                onClick={() => setVista(v)}
                disabled={editando && v === 'codigo'}
                className={
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                  (vista === v ? 'bg-accent text-surface-deep' : 'text-ink-muted hover:text-ink')
                }
              >
                {texto}
              </button>
            ))}
          </div>

          {editando ? (
            <>
              <button type="button" onClick={cancelarEdicion} disabled={estadoEdicion === 'guardando'} className="btn btn-ghost">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void guardarEdicion()}
                disabled={!hayCambios || estadoEdicion === 'guardando' || estadoFoto === 'subiendo'}
                className="btn btn-primary"
              >
                {estadoEdicion === 'guardando' ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={descargar} className="btn btn-ghost">
                Descargar
              </button>
              {puedeCompartir && (
                <button
                  type="button"
                  onClick={() => setCompartiendo((abierto) => !abierto)}
                  aria-expanded={compartiendo}
                  className="btn btn-ghost"
                >
                  🔗 Compartir
                </button>
              )}
              {puedeEditar && (
                <button type="button" onClick={empezarEdicion} disabled={aceptacion === 'procesando'} className="btn btn-ghost">
                  ✏️ Editar
                </button>
              )}
              {onRegenerar && !aceptado && (
                <button
                  type="button"
                  onClick={regenerar}
                  disabled={aceptacion === 'procesando'}
                  className="btn btn-ghost"
                >
                  Probar otra versión
                </button>
              )}
              {onAceptar && !aceptado && (
                <button
                  type="button"
                  onClick={onAceptar}
                  disabled={aceptacion === 'procesando' || guardado !== 'guardado'}
                  title={guardado !== 'guardado' ? 'Se habilita cuando la maqueta queda guardada' : undefined}
                  className="btn btn-primary"
                >
                  {aceptacion === 'procesando' ? 'Enviando…' : '¡Me gusta, sigamos!'}
                </button>
              )}
              {aceptado && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-sm font-medium text-positive">
                  ✓ Enviado al ingeniero
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {aceptacion === 'fallo' && (
        <p role="alert" className="mb-4 rounded-lg border border-negative/30 bg-negative/10 px-4 py-2.5 text-sm text-negative">
          No pudimos enviar tu proyecto al ingeniero. Vuelve a intentarlo en un momento.
        </p>
      )}

      {aceptado && !conSeguimiento && (
        <p className="mb-4 rounded-lg border border-positive/30 bg-positive/10 px-4 py-3 text-sm text-ink">
          ¡Listo! Tu proyecto ya está con el equipo de ingeniería junto a toda la
          información que nos diste. Te contactarán con una propuesta.
        </p>
      )}

      {compartiendo && puedeCompartir && !editando && proyectoId && (
        <CompartirMaqueta proyectoId={proyectoId} empresa={ficha.empresa} />
      )}

      {editando && (
        <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm text-ink">
            <strong>Modo edición.</strong> Toca un texto para cambiarlo, o una imagen
            (borde naranja) para poner tu foto.
          </p>
          <input
            ref={selectorFoto}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              void alElegirFoto(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {estadoFoto === 'subiendo' && (
            <p className="mt-2 text-sm text-ink-muted" role="status">
              Subiendo tu foto…
            </p>
          )}
          {estadoFoto === 'fallo' && (
            <p role="alert" className="mt-2 text-sm text-negative">
              {errorFoto}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Colores de la web">
            <span className="mr-1 text-xs text-ink-subtle">Colores:</span>
            {paletas.map((p) => {
              const elegida = mismaPaleta(p, paletaEdicion);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => elegirPaleta(p)}
                  aria-pressed={elegida}
                  aria-label={`Paleta ${p.nombre}`}
                  title={p.nombre}
                  className={
                    'flex -space-x-1.5 rounded-full border p-1 transition-colors ' +
                    (elegida ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:border-accent/50')
                  }
                >
                  <span className="h-5 w-5 rounded-full ring-1 ring-black/10" style={{ background: p.primario }} />
                  <span className="h-5 w-5 rounded-full ring-1 ring-black/10" style={{ background: p.secundario }} />
                </button>
              );
            })}
          </div>
          {estadoEdicion === 'fallo' && (
            <p role="alert" className="mt-3 text-sm text-negative">
              No pudimos guardar tus cambios. Revisa tu conexión y vuelve a intentarlo.
            </p>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------ marco */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface-deep shadow-[var(--shadow-lifted)]">
        <div className="flex items-center gap-2 border-b border-line bg-surface-overlay px-4 py-2.5">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-negative/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-caution/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-positive/70" />
          </span>
          <span className="mx-auto truncate rounded-md bg-surface-deep/70 px-3 py-0.5 text-[11px] text-ink-subtle">
            {vista === 'codigo' ? 'index.html' : dominioDe(ficha.empresa)}
          </span>
        </div>

        {vista === 'codigo' ? (
          <div className="relative">
            <button
              type="button"
              onClick={copiar}
              className="btn btn-ghost absolute top-3 right-3 z-10 !py-1 text-xs"
            >
              {copiado ? '✓ Copiado' : 'Copiar'}
            </button>
            <pre className="h-[720px] overflow-auto p-5 font-mono text-xs leading-relaxed text-ink-muted">
              {documento}
            </pre>
          </div>
        ) : (
          <div className="flex justify-center bg-surface-deep/60">
            <iframe
              ref={marco}
              title={`Maqueta web de ${ficha.empresa}`}
              srcDoc={documentoEnPantalla}
              sandbox="allow-scripts"
              className={
                'h-[720px] border-0 bg-white transition-[width] duration-300 ' +
                (vista === 'movil' ? 'w-[390px] border-x border-line' : 'w-full')
              }
            />
          </div>
        )}
      </div>

      {usage && (
        <p className="mt-3 text-right text-[11px] text-ink-subtle tabular-nums">
          Generada con {usage.input_tokens.toLocaleString('es')} tokens de entrada y{' '}
          {usage.output_tokens.toLocaleString('es')} de salida
        </p>
      )}

      {puedeCompartir && !editando && proyectoId && <ComentarioMaqueta proyectoId={proyectoId} />}
    </div>
  );
}

/** Dominio de ejemplo para la barra del navegador simulado. */
function dominioDe(empresa: string): string {
  const base = empresa
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 30);
  return `${base || 'tuempresa'}.pe`;
}

function IndicadorGuardado({ estado }: { estado: EstadoGuardado }) {
  if (estado === 'inactivo') return null;
  const textos = { guardando: 'Guardando…', guardado: '✓ Guardada', fallo: 'No se pudo guardar' } as const;
  const colores = { guardando: 'text-ink-subtle', guardado: 'text-positive', fallo: 'text-negative' } as const;
  return (
    <span className={'text-[11px] ' + colores[estado]} role="status">
      {textos[estado]}
    </span>
  );
}
