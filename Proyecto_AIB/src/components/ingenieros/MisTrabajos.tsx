import { useEffect, useState } from 'react';
import { subirFoto } from '../../lib/fotos';
import { misServicios, type ServicioDelIngeniero } from '../../lib/formularios';
import {
  MAX_TRABAJOS,
  borrarTrabajo,
  enlaceValido,
  guardarTrabajo,
  misTrabajos,
  normalizarEnlace,
  type Trabajo,
} from '../../lib/portafolio';
import { iconoDeClave, nombreDeClave } from '../../lib/servicios';

/**
 * En «Mi perfil»: los proyectos que ya hizo (dentro o fuera de AIB+), que
 * salen en su página pública con su enlace en vivo. Lo real da más confianza
 * que una plantilla.
 */
export function MisTrabajos() {
  const [trabajos, setTrabajos] = useState<Trabajo[] | null>(null);
  const [servicios, setServicios] = useState<ServicioDelIngeniero[]>([]);
  // 'nuevo': agregando uno; un trabajo: editando ese.
  const [editando, setEditando] = useState<Trabajo | 'nuevo' | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    void Promise.all([misTrabajos(), misServicios(false)]).then(([t, s]) => {
      if (!vigente) return;
      setTrabajos(t);
      setServicios(s);
    });
    return () => {
      vigente = false;
    };
  }, [version]);

  const quitar = async (t: Trabajo) => {
    if (!window.confirm(`¿Quitar «${t.titulo}» de tu página?`)) return;
    if (await borrarTrabajo(t.id)) setVersion((v) => v + 1);
  };

  if (trabajos === null) return null;

  return (
    <div className="card mb-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xl">Proyectos que ya hiciste</h3>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">
            Salen en tu página pública con su enlace en vivo. Pueden ser de AIB+ o de antes. Hasta {MAX_TRABAJOS}.
          </p>
        </div>
        {trabajos.length < MAX_TRABAJOS && !editando && (
          <button type="button" onClick={() => setEditando('nuevo')} className="btn btn-primary">
            Agregar proyecto
          </button>
        )}
      </div>

      {editando && (
        <FormularioTrabajo
          existente={editando === 'nuevo' ? undefined : editando}
          servicios={servicios}
          onCancelar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            setVersion((v) => v + 1);
          }}
        />
      )}

      {trabajos.length === 0 && !editando ? (
        <p className="mt-4 rounded-xl border border-dashed border-line p-5 text-center text-sm text-ink-muted">
          Aún no muestras ninguno. Agrega una web, un sistema o una app que hayas hecho: los clientes confían más en lo que
          pueden ver funcionando.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {trabajos.map((t) => (
            <li key={t.id} className="flex gap-3 rounded-xl border border-line p-3">
              <Miniatura trabajo={t} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{t.titulo}</p>
                <p className="text-xs text-ink-subtle">
                  {iconoDeClave(t.servicio)} {nombreDeClave(t.servicio)}
                </p>
                {t.enlace && (
                  <a
                    href={t.enlace}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="block truncate text-xs text-accent hover:underline"
                  >
                    {t.enlace.replace(/^https?:\/\//, '')}
                  </a>
                )}
                <div className="mt-1 flex gap-3 text-xs">
                  <button type="button" onClick={() => setEditando(t)} className="text-ink-muted hover:text-ink">
                    Editar
                  </button>
                  <button type="button" onClick={() => void quitar(t)} className="text-ink-subtle hover:text-negative">
                    Quitar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Miniatura({ trabajo }: { trabajo: Trabajo }) {
  return trabajo.imagen_url ? (
    <img src={trabajo.imagen_url} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
  ) : (
    <span className="grid h-16 w-24 shrink-0 place-items-center rounded-lg bg-surface-overlay text-2xl" aria-hidden="true">
      {iconoDeClave(trabajo.servicio)}
    </span>
  );
}

function FormularioTrabajo({
  existente,
  servicios,
  onCancelar,
  onGuardado,
}: {
  existente?: Trabajo;
  servicios: ServicioDelIngeniero[];
  onCancelar: () => void;
  onGuardado: () => void;
}) {
  const [titulo, setTitulo] = useState(existente?.titulo ?? '');
  const [servicio, setServicio] = useState(existente?.servicio ?? servicios[0]?.clave ?? 'web');
  const [enlace, setEnlace] = useState(existente?.enlace ?? '');
  const [descripcion, setDescripcion] = useState(existente?.descripcion ?? '');
  const [imagen, setImagen] = useState<string | null>(existente?.imagen_url ?? null);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // El de un proyecto ya guardado sale aunque ya no lo ofrezca.
  const opciones = servicios.some((s) => s.clave === servicio)
    ? servicios
    : [...servicios, { clave: servicio, nombre: nombreDeClave(servicio), icono: iconoDeClave(servicio) }];

  const elegirImagen = async (archivo: File | undefined) => {
    if (!archivo) return;
    setSubiendo(true);
    setError('');
    try {
      setImagen(await subirFoto(archivo));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos subir la imagen.');
    } finally {
      setSubiendo(false);
    }
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = normalizarEnlace(enlace);
    if (titulo.trim().length < 2) return setError('Ponle un nombre al proyecto.');
    if (url && !enlaceValido(url)) return setError('Revisa el enlace: debe ser una dirección web, como misitio.com.');
    setGuardando(true);
    setError('');
    const r = await guardarTrabajo(
      { titulo, servicio, enlace: url || null, descripcion: descripcion || null, imagen_url: imagen },
      existente?.id
    );
    setGuardando(false);
    if (r.error) return setError(r.error);
    onGuardado();
  };

  return (
    <form onSubmit={(e) => void guardar(e)} className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-ink-muted">Nombre del proyecto</span>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value.replace(/[<>{}]/g, '').slice(0, 80))}
            className="field"
            placeholder="Ej: Web de Panadería San José"
            autoFocus
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-muted">Servicio</span>
          <select value={servicio} onChange={(e) => setServicio(e.target.value)} className="field">
            {opciones.map((s) => (
              <option key={s.clave} value={s.clave}>
                {s.icono} {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-ink-muted">Enlace en vivo (opcional)</span>
          <input
            value={enlace}
            onChange={(e) => setEnlace(e.target.value)}
            className="field"
            placeholder="Ej: panaderiasanjose.pe"
            inputMode="url"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-ink-muted">Qué hiciste (opcional)</span>
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value.replace(/[<>{}]/g, '').slice(0, 240))}
            className="field"
            placeholder="Ej: Tienda online con pedidos por WhatsApp y pagos con Yape"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {imagen && <img src={imagen} alt="" className="h-16 w-24 rounded-lg object-cover" />}
        <label className="btn btn-ghost cursor-pointer !px-3 !py-1.5 text-xs">
          {subiendo ? 'Subiendo…' : imagen ? 'Cambiar imagen' : 'Subir una captura (opcional)'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={subiendo}
            onChange={(e) => {
              void elegirImagen(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        {imagen && (
          <button type="button" onClick={() => setImagen(null)} className="text-xs text-ink-subtle hover:text-negative">
            Quitar imagen
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-negative">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="btn btn-ghost">
          Cancelar
        </button>
        <button type="submit" disabled={guardando || subiendo} className="btn btn-primary">
          {guardando ? 'Guardando…' : existente ? 'Guardar cambios' : 'Agregar a mi página'}
        </button>
      </div>
    </form>
  );
}
