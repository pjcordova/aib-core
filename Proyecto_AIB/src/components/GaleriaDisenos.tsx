import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { textoEstrellas } from '../lib/ingenieros';
import { empezarConfirmando } from '../lib/perfilPublico';
import { etiquetaNivel } from '../lib/plantillaPropia';
import { solesEnteros, type TipoServicio } from '../lib/servicios';
import { documentoDeVitrina, type DisenoVitrina } from '../lib/vitrina';
import { MiniVista } from './panel/MiniVista';
import { FotoIngeniero } from './ingenieros/TarjetaIngeniero';
import { InsigniaVerificado } from './ui/InsigniaVerificado';
import { InsigniaPro } from './ui/InsigniaPro';
import { Bandera } from './ui/Bandera';

type Clave = Exclude<TipoServicio, 'otro'>;

/**
 * Diseños de los ingenieros con su precio y quién los construye. «Lo quiero»
 * empieza la prueba con ese ingeniero (o, si el diseño es de la biblioteca,
 * con el servicio). En la portada y en las páginas de cada servicio.
 */
export function GaleriaDisenos({
  disenos,
  onProbar,
}: {
  disenos: DisenoVitrina[];
  onProbar: (clave?: Clave) => void;
}) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [empezando, setEmpezando] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loQuiero = async (d: DisenoVitrina) => {
    const clave = d.servicio as Clave;
    if (!d.ingeniero.slug) {
      onProbar(clave);
      return;
    }
    setEmpezando(d.id);
    setError('');
    const nombre = d.ingeniero.nombre.split(/\s+/)[0];
    const r = await empezarConfirmando(d.ingeniero.slug, nombre, signOut);
    setEmpezando(null);
    if (r === 'ok') navigate('/mi-web', { state: { clave } });
    else if (r === 'con_cuenta') navigate('/');
    else if (r === 'lleno') setError(`${nombre} recibió muchas solicitudes hoy. Prueba con otro diseño o vuelve mañana.`);
    else if (r !== 'cancelado') setError('No pudimos empezar. Revisa tu conexión y vuelve a intentarlo.');
  };

  return (
    <>
      {error && (
        <p role="alert" className="mt-6 text-center text-sm text-negative">
          {error}
        </p>
      )}
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {disenos.map((d) => (
          <TarjetaDiseno
            key={d.id}
            diseno={d}
            empezando={empezando === d.id}
            ocupado={empezando !== null}
            onQuiero={() => void loQuiero(d)}
          />
        ))}
      </div>
    </>
  );
}

function TarjetaDiseno({
  diseno: d,
  empezando,
  ocupado,
  onQuiero,
}: {
  diseno: DisenoVitrina;
  empezando: boolean;
  ocupado: boolean;
  onQuiero: () => void;
}) {
  const documento = useMemo(() => documentoDeVitrina(d), [d]);
  if (!documento) return null;
  const nombre = d.ingeniero.nombre;

  return (
    <article className="card flex flex-col overflow-hidden">
      <MiniVista documento={documento} titulo={`Diseño ${d.nombre}`} alto={240} interactiva />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink">{d.nombre}</p>
          {d.nivel !== 'basica' && (
            <span className="rounded-full bg-accent-alt/20 px-2 py-0.5 text-[11px] font-medium text-ink">
              {etiquetaNivel(d.nivel)}
            </span>
          )}
        </div>
        {d.descripcion && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{d.descripcion}</p>}
        <div className="mt-3 flex items-center gap-2">
          <FotoIngeniero nombre={nombre} foto={d.ingeniero.foto_url} tamano={28} />
          <p className="min-w-0 text-xs text-ink-muted">
            Lo construye <span className="font-medium text-ink">{nombre}</span> <Bandera pais={d.ingeniero.pais} />
            {d.ingeniero.verificado && (
              <>
                {' '}
                <InsigniaVerificado />
              </>
            )}
            {d.ingeniero.destacado && (
              <>
                {' '}
                <InsigniaPro />
              </>
            )}
            <span className="block">{textoEstrellas(d.ingeniero.promedio, d.ingeniero.resenas)}</span>
          </p>
        </div>
        {d.precio_desde !== null && (
          <p className="mt-3 text-base font-semibold text-ink tabular-nums">desde {solesEnteros(d.precio_desde)}</p>
        )}
        <div className="mt-auto flex gap-2 pt-4">
          <button type="button" onClick={onQuiero} disabled={ocupado} className="btn btn-primary flex-1">
            {empezando ? 'Preparando…' : 'Lo quiero'}
          </button>
          {d.ingeniero.slug && (
            <Link to={`/ing/${d.ingeniero.slug}`} className="btn btn-ghost">
              Ver ingeniero
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
