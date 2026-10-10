import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ingenierosDisponibles, type IngenieroPublico } from '../lib/ingenieros';
import { empezarConfirmando } from '../lib/perfilPublico';
import { CATEGORIAS_NEGOCIO } from '../lib/plantillas';
import { obtenerServicio, solesEnteros, type TipoServicio } from '../lib/servicios';
import { preciosIngenieros, type PreciosIngeniero } from '../lib/vitrina';
import { TarjetaIngeniero } from './ingenieros/TarjetaIngeniero';
import { PiePagina } from './ui/PiePagina';
import { Wordmark } from './ui/Primitives';

// ---------------------------------------------------------------------------
// Buscador de ingenieros (/explorar)
// ---------------------------------------------------------------------------
// Como en un marketplace: el cliente filtra por servicio, tipo de negocio y
// presupuesto, ordena por estrellas, reseñas o precio, y empieza con quien
// elija. Sin cuenta. ?servicio=crm llega con el servicio ya elegido.
// ---------------------------------------------------------------------------

type Clave = Exclude<TipoServicio, 'otro'>;
type Orden = 'estrellas' | 'resenas' | 'precio' | 'nuevos';

const CLAVES: Clave[] = ['web', 'crm', 'erp', 'automatizacion', 'app-movil'];

const TOPES: { valor: number; etiqueta: string }[] = [
  { valor: 1500, etiqueta: 'Hasta S/ 1,500' },
  { valor: 4000, etiqueta: 'Hasta S/ 4,000' },
  { valor: 10000, etiqueta: 'Hasta S/ 10,000' },
];

const ORDENES: { valor: Orden; etiqueta: string }[] = [
  { valor: 'estrellas', etiqueta: 'Mejor calificados' },
  { valor: 'resenas', etiqueta: 'Más reseñas' },
  { valor: 'precio', etiqueta: 'Menor precio' },
  { valor: 'nuevos', etiqueta: 'Más nuevos' },
];

/** Si ofrece el servicio. La tienda online cuenta como web. */
const ofrece = (ing: IngenieroPublico, clave: Clave) =>
  (ing.servicios ?? ['web']).includes(clave) || (clave === 'web' && (ing.servicios ?? []).includes('tienda-online'));

const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const etiquetaRubro = (v: string) => CATEGORIAS_NEGOCIO.find((c) => c.valor === v)?.etiqueta ?? v;

/** Lo que se busca con texto: nombre, titular, presentación, ciudad, rubros y servicios. */
function textoDe(ing: IngenieroPublico): string {
  return normalizar(
    [
      ing.nombre,
      ing.titular,
      ing.bio,
      ing.ciudad ?? '',
      ...ing.especialidades.map(etiquetaRubro),
      ...(ing.servicios ?? []).map((s) => obtenerServicio(s).nombre),
      ...(ing.servicios_otros ?? []),
    ].join(' ')
  );
}

export function Explorar() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [parametros, setParametros] = useSearchParams();
  const inicial = parametros.get('servicio');

  const [ingenieros, setIngenieros] = useState<IngenieroPublico[] | null>(null);
  const [precios, setPrecios] = useState<Map<string, PreciosIngeniero>>(new Map());
  const [busqueda, setBusqueda] = useState('');
  const [servicio, setServicio] = useState<Clave | ''>(CLAVES.includes(inicial as Clave) ? (inicial as Clave) : '');
  const [rubro, setRubro] = useState('');
  const [tope, setTope] = useState<number | null>(null);
  const [orden, setOrden] = useState<Orden>('estrellas');
  const [empezando, setEmpezando] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Encuentra a tu ingeniero · AIB+';
    let vigente = true;
    void Promise.all([ingenierosDisponibles(), preciosIngenieros()]).then(([l, p]) => {
      if (!vigente) return;
      setIngenieros(l);
      setPrecios(p);
    });
    return () => {
      vigente = false;
    };
  }, []);

  const elegirServicio = (c: Clave | '') => {
    setServicio(c);
    // Que el enlace se pueda compartir con el filtro puesto.
    setParametros(c ? { servicio: c } : {}, { replace: true });
  };

  /** El precio «desde» que importa: el del servicio elegido o el más bajo. */
  const desdeDe = (ing: IngenieroPublico): number | null => {
    const p = precios.get(ing.id);
    if (!p) return null;
    return servicio ? (p.desde_por_servicio[servicio] ?? null) : p.desde;
  };

  const resultados = useMemo(() => {
    const termino = normalizar(busqueda.trim());
    const lista = (ingenieros ?? []).filter((ing) => {
      if (servicio && !ofrece(ing, servicio)) return false;
      if (rubro && !ing.especialidades.includes(rubro)) return false;
      if (tope !== null) {
        const desde = desdeDe(ing);
        if (desde === null || desde > tope) return false;
      }
      if (termino && !termino.split(/\s+/).every((t) => textoDe(ing).includes(t))) return false;
      return true;
    });
    const precio = (ing: IngenieroPublico) => desdeDe(ing) ?? Number.POSITIVE_INFINITY;
    return [...lista].sort((a, b) => {
      if (orden === 'precio') return precio(a) - precio(b);
      if (orden === 'resenas') return b.resenas - a.resenas || Number(b.promedio ?? 0) - Number(a.promedio ?? 0);
      if (orden === 'nuevos') {
        return Date.parse(precios.get(b.id)?.creado_en ?? '') - Date.parse(precios.get(a.id)?.creado_en ?? '') || 0;
      }
      return Number(b.promedio ?? 0) - Number(a.promedio ?? 0) || b.resenas - a.resenas;
    });
    // desdeDe depende de precios y servicio, que ya están en la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingenieros, precios, busqueda, servicio, rubro, tope, orden]);

  const trabajarCon = async (ing: IngenieroPublico) => {
    if (!ing.slug) return;
    setEmpezando(ing.id);
    setError('');
    const nombre = ing.nombre.split(/\s+/)[0];
    const r = await empezarConfirmando(ing.slug, nombre, signOut);
    setEmpezando(null);
    if (r === 'ok') navigate('/mi-web', { state: servicio ? { clave: servicio } : null });
    else if (r === 'con_cuenta') navigate('/');
    else if (r === 'lleno') setError(`${nombre} recibió muchas solicitudes hoy. Prueba con otro ingeniero o vuelve mañana.`);
    else if (r !== 'cancelado') setError('No pudimos empezar. Revisa tu conexión y vuelve a intentarlo.');
  };

  const hayFiltros = !!(busqueda.trim() || servicio || rubro || tope !== null);
  const limpiar = () => {
    setBusqueda('');
    elegirServicio('');
    setRubro('');
    setTope(null);
  };

  return (
    <div className="min-h-screen">
      <header className="cabecera-marca sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="Ir a la portada de AIB+">
            <Wordmark />
          </Link>
          <Link to="/probar" className="btn btn-primary">
            Pruébalo gratis
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="text-4xl text-balance sm:text-5xl">Encuentra a tu ingeniero</h1>
        <p className="mt-3 max-w-2xl text-ink-muted">
          Filtra por lo que necesitas, compara precios y reseñas, y empieza con quien elijas. Ves cómo quedaría tu proyecto
          gratis y sin crear cuenta.
        </p>

        {/* --------------------------------------------------------- filtros */}
        <div className="card mt-8 space-y-4 p-5">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Busca por nombre, ciudad o especialidad"
            aria-label="Buscar ingenieros"
            className="field"
          />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Servicio">
            {[{ clave: '' as const, nombre: 'Todos los servicios', icono: '' }, ...CLAVES.map((c) => ({ clave: c, ...obtenerServicio(c) }))].map(
              (s) => (
                <button
                  key={s.clave || 'todos'}
                  type="button"
                  onClick={() => elegirServicio(s.clave)}
                  aria-pressed={servicio === s.clave}
                  className={
                    'rounded-full border px-3.5 py-1.5 text-sm transition-colors ' +
                    (servicio === s.clave
                      ? 'border-accent bg-accent text-white'
                      : 'border-line-strong bg-surface-raised text-ink hover:border-accent/50')
                  }
                >
                  {s.icono && <span aria-hidden="true">{s.icono} </span>}
                  {s.nombre}
                </button>
              )
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-ink-subtle">Tipo de negocio</span>
              <select value={rubro} onChange={(e) => setRubro(e.target.value)} className="field">
                <option value="">Cualquiera</option>
                {CATEGORIAS_NEGOCIO.filter((c) => c.valor !== 'otro').map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-ink-subtle">Presupuesto</span>
              <select
                value={tope ?? ''}
                onChange={(e) => setTope(e.target.value ? Number(e.target.value) : null)}
                className="field"
              >
                <option value="">Cualquiera</option>
                {TOPES.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-ink-subtle">Ordenar por</span>
              <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)} className="field">
                {ORDENES.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-negative">
            {error}
          </p>
        )}

        {/* ------------------------------------------------------ resultados */}
        {ingenieros === null ? (
          <p className="mt-10 text-sm text-ink-subtle" role="status">
            Buscando ingenieros…
          </p>
        ) : (
          <>
            <p className="mt-8 text-sm text-ink-muted" role="status">
              {resultados.length === 1 ? '1 ingeniero' : `${resultados.length} ingenieros`}
              {servicio ? ` de ${obtenerServicio(servicio).nombre}` : ''}
              {hayFiltros && (
                <>
                  {' · '}
                  <button type="button" onClick={limpiar} className="text-accent hover:underline">
                    Quitar filtros
                  </button>
                </>
              )}
            </p>
            {resultados.length === 0 ? (
              <div className="card mt-4 p-8 text-center">
                <p className="font-medium text-ink">Nadie coincide con esos filtros</p>
                <p className="mt-1 text-sm text-ink-muted">
                  Prueba con otro presupuesto o quita algún filtro. Los ingenieros sin precios publicados no salen al filtrar por
                  presupuesto.
                </p>
              </div>
            ) : (
              <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {resultados.map((ing) => {
                  const p = precios.get(ing.id);
                  const desde = desdeDe(ing);
                  const nombre = ing.nombre.split(/\s+/)[0];
                  return (
                    <TarjetaIngeniero
                      key={ing.id}
                      ingeniero={ing}
                      rubroDelCliente={rubro || undefined}
                      extra={
                        <p className="mt-3 text-sm">
                          {desde !== null ? (
                            <span className="font-semibold text-ink">desde {solesEnteros(desde)}</span>
                          ) : (
                            <span className="text-ink-subtle">Precio a consultar</span>
                          )}
                          {p && p.disenos > 0 && (
                            <span className="text-ink-subtle">
                              {' · '}
                              {p.disenos} {p.disenos === 1 ? 'diseño' : 'diseños'}
                            </span>
                          )}
                          {p && p.entregados > 0 && (
                            <span className="text-ink-subtle">
                              {' · '}
                              {p.entregados} {p.entregados === 1 ? 'proyecto entregado' : 'proyectos entregados'}
                            </span>
                          )}
                        </p>
                      }
                      accion={
                        ing.slug ? (
                          <div className="flex w-full flex-col items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void trabajarCon(ing)}
                              disabled={empezando !== null}
                              className="btn btn-primary w-full !py-2 text-sm"
                            >
                              {empezando === ing.id ? 'Preparando…' : `Trabajar con ${nombre}`}
                            </button>
                            <Link to={`/ing/${ing.slug}`} className="text-sm font-medium text-accent hover:underline">
                              Ver su página y sus diseños →
                            </Link>
                          </div>
                        ) : undefined
                      }
                    />
                  );
                })}
              </div>
            )}
          </>
        )}

        <div className="mt-14 rounded-3xl border border-line bg-surface-raised p-8 text-center">
          <h2 className="text-2xl">¿Prefieres que te guiemos?</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-ink-muted">
            Responde unas preguntas sobre tu negocio, mira los diseños con tu nombre y elige al ingeniero al final.
          </p>
          <Link to={servicio ? `/probar?servicio=${servicio}` : '/probar'} className="btn btn-primary mt-5 inline-flex px-6 py-3">
            Pruébalo gratis
          </Link>
        </div>
      </main>

      <PiePagina />
    </div>
  );
}
