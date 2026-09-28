import { useMemo, useState } from 'react';
import type { TokenUsage } from '../../lib/api';
import { construirDocumento } from '../../lib/marca';
import type { FichaWeb } from '../../lib/servicios';

type EstadoGuardado = 'inactivo' | 'guardando' | 'guardado' | 'fallo';
type EstadoAceptacion = 'inactivo' | 'procesando' | 'aceptado' | 'fallo';
type Vista = 'escritorio' | 'movil' | 'codigo';

interface Props {
  /** Cuerpo generado por IA; se monta con construirDocumento. */
  cuerpo?: string;
  /** Página ya completa (plantillas del ingeniero). Tiene prioridad sobre `cuerpo`. */
  documento?: string;
  /** Nombre de la plantilla usada, si la hay. */
  plantilla?: string;
  ficha: FichaWeb;
  usage?: TokenUsage | null;
  guardado?: EstadoGuardado;
  aceptacion?: EstadoAceptacion;
  onRegenerar?: () => void;
  onAceptar?: () => void;
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
  ficha,
  usage,
  guardado = 'inactivo',
  aceptacion = 'inactivo',
  onRegenerar,
  onAceptar,
}: Props) {
  const [vista, setVista] = useState<Vista>('escritorio');
  const [copiado, setCopiado] = useState(false);

  const documento = useMemo(
    () => documentoListo ?? construirDocumento(cuerpo, ficha),
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
            Es una primera idea para validar el estilo. Los textos y fotos finales los
            afinas con el ingeniero.
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
                className={
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                  (vista === v ? 'bg-accent text-surface-deep' : 'text-ink-muted hover:text-ink')
                }
              >
                {texto}
              </button>
            ))}
          </div>

          <button type="button" onClick={descargar} className="btn btn-ghost">
            Descargar
          </button>
          {onRegenerar && !aceptado && (
            <button
              type="button"
              onClick={onRegenerar}
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
        </div>
      </div>

      {aceptacion === 'fallo' && (
        <p role="alert" className="mb-4 rounded-lg border border-negative/30 bg-negative/10 px-4 py-2.5 text-sm text-negative">
          No pudimos enviar tu proyecto al ingeniero. Vuelve a intentarlo en un momento.
        </p>
      )}

      {aceptado && (
        <p className="mb-4 rounded-lg border border-positive/30 bg-positive/10 px-4 py-3 text-sm text-ink">
          ¡Listo! Tu proyecto ya está con el equipo de ingeniería junto a toda la
          información que nos diste. Te contactarán con una propuesta.
        </p>
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
              title={`Maqueta web de ${ficha.empresa}`}
              srcDoc={documento}
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
