import { useEffect, useState } from 'react';
import { ApiError, sugerirPreguntas } from '../../lib/api';
import {
  TIPOS_PREGUNTA,
  guardarFormulario,
  maximoPreguntas,
  type PreguntaPropia,
  type ServicioDelIngeniero,
  type TipoPreguntaPropia,
} from '../../lib/formularios';
import { PREGUNTAS_ENCARGO, PREGUNTAS_SERVICIO, PREGUNTAS_WEB, type TipoServicio } from '../../lib/servicios';

/** Mientras se escribe, las opciones van en un texto: una por línea. */
interface Borrador {
  titulo: string;
  tipo: TipoPreguntaPropia;
  opciones: string;
}

const aBorrador = (p: { titulo: string; tipo: TipoPreguntaPropia; opciones?: string[] }): Borrador => ({
  titulo: p.titulo,
  tipo: p.tipo,
  opciones: (p.opciones ?? []).join('\n'),
});

const lineas = (texto: string) =>
  texto
    .split('\n')
    .map((o) => o.trim())
    .filter(Boolean);

/** Lo que AIB+ ya pregunta en ese servicio, para no repetirlo. */
function preguntasDeAibPlus(clave: string): string[] {
  const comunes = ['Nombre del negocio y a qué se dedica', 'Logo y colores', 'Presupuesto'];
  if (clave === 'web') {
    return [
      ...PREGUNTAS_WEB.filter((p) => !['negocio', 'logo', 'paleta', 'presupuesto'].includes(p.id)).map((p) => p.titulo),
      ...comunes,
      ...PREGUNTAS_ENCARGO.map((p) => p.titulo),
    ];
  }
  const tipo = (clave.startsWith('otro:') ? 'otro' : clave) as Exclude<TipoServicio, 'web'>;
  return [
    ...(PREGUNTAS_SERVICIO[tipo] ?? []).map((p) => p.titulo),
    ...comunes,
    PREGUNTAS_ENCARGO.find((p) => p.id === 'alcance-plazo')?.titulo ?? '¿Para cuándo lo necesitas?',
  ];
}

/**
 * Las preguntas propias del ingeniero para un servicio. Se suman a las de
 * AIB+: para entender mejor a su cliente y cotizar con menos idas y vueltas.
 */
export function EditorFormulario({
  servicio,
  iniciales,
  onGuardado,
  onCerrar,
}: {
  servicio: ServicioDelIngeniero;
  iniciales: PreguntaPropia[];
  onGuardado: (preguntas: PreguntaPropia[]) => void;
  onCerrar: () => void;
}) {
  const maximo = maximoPreguntas(servicio.clave);
  const deAibPlus = preguntasDeAibPlus(servicio.clave);
  const [borradores, setBorradores] = useState<Borrador[]>(() => iniciales.map(aBorrador));
  const [sugiriendo, setSugiriendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCerrar]);

  const cambiar = (i: number, cambios: Partial<Borrador>) =>
    setBorradores((prev) => prev.map((b, j) => (j === i ? { ...b, ...cambios } : b)));
  const quitar = (i: number) => setBorradores((prev) => prev.filter((_, j) => j !== i));
  const mover = (i: number, paso: -1 | 1) =>
    setBorradores((prev) => {
      const j = i + paso;
      if (j < 0 || j >= prev.length) return prev;
      const copia = [...prev];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });

  const sugerir = async () => {
    setSugiriendo(true);
    setError('');
    try {
      const libres = maximo - borradores.length;
      const sugeridas = await sugerirPreguntas(servicio.nombre, Math.max(libres, 1), [
        ...deAibPlus,
        ...borradores.map((b) => b.titulo).filter(Boolean),
      ]);
      setBorradores((prev) => [...prev, ...sugeridas.map(aBorrador)].slice(0, maximo));
      if (sugeridas.length === 0) setError('No se nos ocurrió nada nuevo. Escríbelas tú o vuelve a intentarlo.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos sugerir preguntas. Vuelve a intentarlo.');
    } finally {
      setSugiriendo(false);
    }
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const malas = borradores.findIndex(
      (b) => b.titulo.trim().length < 3 || (b.tipo !== 'texto' && lineas(b.opciones).length < 2)
    );
    if (malas >= 0) {
      setError(`Revisa la pregunta ${malas + 1}: necesita un texto y, si es de opciones, al menos 2 opciones.`);
      return;
    }
    setGuardando(true);
    setError('');
    const r = await guardarFormulario(
      servicio.clave,
      borradores.map((b) => ({ titulo: b.titulo, tipo: b.tipo, opciones: b.tipo === 'texto' ? undefined : lineas(b.opciones) }))
    );
    setGuardando(false);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    onGuardado(r.preguntas);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-editor-formulario"
    >
      <form onSubmit={(e) => void guardar(e)} className="card animate-fade-up max-h-[92vh] w-full max-w-3xl overflow-y-auto p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="titulo-editor-formulario" className="text-2xl">
              {servicio.icono} {servicio.nombre}: tus preguntas
            </h2>
            <p className="mt-1 max-w-xl text-sm text-ink-muted">
              Se suman a las de AIB+ para que llegues a la propuesta con todo lo que necesitas.{' '}
              {servicio.clave === 'web'
                ? 'Las responde el cliente al aceptar, cuando ya te eligió.'
                : 'Tu cliente de enlace las responde en el formulario; el de la plataforma, al aceptar, cuando ya te eligió.'}
            </p>
          </div>
          <button type="button" onClick={onCerrar} className="btn btn-ghost !py-1.5 text-sm">
            Cerrar
          </button>
        </div>

        <details className="mt-5 rounded-xl border border-line bg-surface-overlay/40 p-3 text-sm">
          <summary className="cursor-pointer font-medium text-ink">Lo que AIB+ ya pregunta ({deAibPlus.length})</summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-ink-muted">
            {deAibPlus.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </details>

        <div className="mt-6 space-y-4">
          {borradores.length === 0 && (
            <p className="rounded-xl border border-dashed border-line p-5 text-center text-sm text-ink-muted">
              Aún no tienes preguntas propias para este servicio. Pide sugerencias a AIB+ o escríbelas tú.
            </p>
          )}
          {borradores.map((b, i) => (
            <fieldset key={i} className="rounded-xl border border-line p-4">
              <legend className="px-1 text-xs font-semibold tracking-wide text-ink-subtle uppercase">Pregunta {i + 1}</legend>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <input
                  value={b.titulo}
                  onChange={(e) => cambiar(i, { titulo: e.target.value.replace(/[<>{}]/g, '').slice(0, 140) })}
                  className="field"
                  placeholder="Ej: ¿Cuántos productos venderías?"
                  aria-label={`Texto de la pregunta ${i + 1}`}
                />
                <select
                  value={b.tipo}
                  onChange={(e) => cambiar(i, { tipo: e.target.value as TipoPreguntaPropia })}
                  className="field sm:!w-auto"
                  aria-label={`Tipo de la pregunta ${i + 1}`}
                >
                  {TIPOS_PREGUNTA.map((t) => (
                    <option key={t.valor} value={t.valor}>
                      {t.etiqueta}
                    </option>
                  ))}
                </select>
              </div>
              {b.tipo !== 'texto' && (
                <label className="mt-3 block text-xs text-ink-muted">
                  Opciones (una por línea, de 2 a 8)
                  <textarea
                    value={b.opciones}
                    onChange={(e) => cambiar(i, { opciones: e.target.value.replace(/[<>{}]/g, '') })}
                    rows={3}
                    className="field mt-1 text-sm"
                    placeholder={'Menos de 50\nDe 50 a 200\nMás de 200'}
                  />
                </label>
              )}
              <div className="mt-2 flex justify-end gap-3 text-xs">
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="text-ink-muted hover:text-ink disabled:opacity-30">
                  ↑ Subir
                </button>
                <button
                  type="button"
                  onClick={() => mover(i, 1)}
                  disabled={i === borradores.length - 1}
                  className="text-ink-muted hover:text-ink disabled:opacity-30"
                >
                  ↓ Bajar
                </button>
                <button type="button" onClick={() => quitar(i)} className="text-ink-subtle hover:text-negative">
                  Quitar
                </button>
              </div>
            </fieldset>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setBorradores((prev) => [...prev, { titulo: '', tipo: 'opcion', opciones: '' }])}
            disabled={borradores.length >= maximo}
            className="btn btn-ghost text-sm"
          >
            + Añadir pregunta
          </button>
          <button
            type="button"
            onClick={() => void sugerir()}
            disabled={sugiriendo || borradores.length >= maximo}
            className="btn btn-ghost text-sm"
          >
            {sugiriendo ? 'Pensando…' : '✨ Sugerir con IA'}
          </button>
          <span className="text-xs text-ink-subtle">
            {borradores.length} de {maximo}
          </span>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-negative">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCerrar} className="btn btn-ghost">
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className="btn btn-primary">
            {guardando ? 'Guardando…' : 'Guardar preguntas'}
          </button>
        </div>
      </form>
    </div>
  );
}
