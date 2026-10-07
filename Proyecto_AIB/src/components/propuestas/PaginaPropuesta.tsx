import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { avisarRespuestaPropuesta } from '../../lib/api';
import { propuestaPorToken, responderPropuesta, type PropuestaPublica } from '../../lib/propuestas';
import { FotoIngeniero } from '../ingenieros/TarjetaIngeniero';
import { PiePagina } from '../ui/PiePagina';
import { Wordmark } from '../ui/Primitives';
import { TarjetaPropuesta } from './TarjetaPropuesta';

// ---------------------------------------------------------------------------
// La propuesta que recibe el cliente (/propuesta/:token)
// ---------------------------------------------------------------------------
// Se abre desde el WhatsApp que le manda su ingeniero, sin cuenta: ve el
// precio, el plazo, qué incluye y la forma de pago, y la acepta con un clic o
// pide cambios. Su ingeniero se entera por WhatsApp.
// ---------------------------------------------------------------------------

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'long' });

export function PaginaPropuesta() {
  const { token = '' } = useParams();
  const [propuesta, setPropuesta] = useState<PropuestaPublica | null | undefined>(undefined);
  const [pidiendoCambios, setPidiendoCambios] = useState(false);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => setPropuesta(await propuestaPorToken(token));

  useEffect(() => {
    let vigente = true;
    void propuestaPorToken(token).then((p) => {
      if (vigente) setPropuesta(p);
    });
    return () => {
      vigente = false;
    };
  }, [token]);

  useEffect(() => {
    if (propuesta?.negocio) document.title = `Propuesta para ${propuesta.negocio} · AIB+`;
  }, [propuesta]);

  const responder = async (acepta: boolean) => {
    if (!acepta && comentario.trim().length < 3) {
      setError('Cuéntale qué te gustaría cambiar.');
      return;
    }
    setEnviando(true);
    setError('');
    const r = await responderPropuesta(token, acepta, acepta ? '' : comentario.trim());
    if (r === 'ok') {
      void avisarRespuestaPropuesta(token);
      setPidiendoCambios(false);
      await cargar();
    } else {
      setError(
        r === 'vencida'
          ? 'Esta propuesta ya venció. Pídele una nueva a tu ingeniero.'
          : r === 'ya_respondida'
            ? 'Esta propuesta ya fue respondida.'
            : 'No pudimos guardar tu respuesta. Vuelve a intentarlo.'
      );
      await cargar();
    }
    setEnviando(false);
  };

  if (propuesta === undefined) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    );
  }

  if (propuesta === null) {
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-3xl text-ink">No encontramos esta propuesta</h1>
          <p className="mt-3 text-sm text-ink-muted">Revisa el enlace o pídele a tu ingeniero que te lo envíe de nuevo.</p>
          <Link to="/" className="btn btn-primary mt-6 inline-flex">
            Ir a AIB+
          </Link>
        </div>
      </div>
    );
  }

  const ing = propuesta.ingeniero;
  // Sin perfil de ingeniero (el administrador aún no lo armó) llega «AIB+».
  const sinPerfil = ing.nombre === 'AIB+';
  const primerNombre = sinPerfil ? 'tu ingeniero' : ing.nombre.split(/\s+/)[0];
  // Al empezar una frase.
  const Quien = primerNombre.charAt(0).toUpperCase() + primerNombre.slice(1);

  return (
    <div className="min-h-screen">
      <header className="cabecera-marca sticky top-0 z-20">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="Ir a la portada de AIB+">
            <Wordmark />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-xs font-medium tracking-[0.2em] text-ink-subtle uppercase">Propuesta</p>
        <h1 className="mt-2 text-3xl text-balance sm:text-4xl">
          {propuesta.cliente ? `${propuesta.cliente}, ` : ''}esta es la propuesta para {propuesta.negocio ?? 'tu web'}
        </h1>

        {!sinPerfil && (
          <div className="mt-5 flex items-center gap-3">
            <FotoIngeniero nombre={ing.nombre} foto={ing.foto_url} tamano={44} />
            <p className="text-sm text-ink-muted">
              De <span className="font-medium text-ink">{ing.nombre}</span>
              {ing.titular ? ` · ${ing.titular}` : ''}
              {ing.slug && (
                <>
                  {' · '}
                  <Link to={`/ing/${ing.slug}`} className="text-accent hover:underline">
                    Ver su perfil
                  </Link>
                </>
              )}
            </p>
          </div>
        )}

        <div className="mt-6">
          <TarjetaPropuesta propuesta={propuesta} />
        </div>

        {/* ---------------------------------------------------- responder */}
        <div className="mt-6">
          {propuesta.estado === 'enviada' ? (
            pidiendoCambios ? (
              <div className="card p-5">
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium text-ink">¿Qué te gustaría cambiar?</span>
                  <textarea
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value.slice(0, 800))}
                    rows={4}
                    className="field"
                    placeholder="Ej: ¿Se puede en 2 semanas? / Prefiero pagar 30 % al empezar."
                    autoFocus
                  />
                </label>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => setPidiendoCambios(false)} className="btn btn-ghost">
                    Volver
                  </button>
                  <button type="button" onClick={() => void responder(false)} disabled={enviando} className="btn btn-primary">
                    {enviando ? 'Enviando…' : `Enviar a ${primerNombre}`}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`¿Aceptas la propuesta de ${primerNombre}? Le avisaremos para que empiece.`)) {
                      void responder(true);
                    }
                  }}
                  disabled={enviando}
                  className="btn btn-primary flex-1 py-3 text-base"
                >
                  {enviando ? 'Guardando…' : 'Aceptar propuesta'}
                </button>
                <button type="button" onClick={() => setPidiendoCambios(true)} className="btn btn-ghost flex-1 py-3 text-base">
                  Pedir cambios
                </button>
              </div>
            )
          ) : propuesta.estado === 'aceptada' ? (
            <p className="rounded-xl border border-positive/30 bg-positive/10 p-4 text-sm text-ink" role="status">
              <strong>✓ Aceptaste esta propuesta</strong>
              {propuesta.respondida_en ? ` el ${fecha(propuesta.respondida_en)}` : ''}. {Quien} ya está al tanto y empieza
              a construir tu web.
            </p>
          ) : propuesta.estado === 'cambios' ? (
            <p className="rounded-xl border border-accent-alt/50 bg-accent-alt/10 p-4 text-sm text-ink" role="status">
              <strong>Pediste cambios:</strong> «{propuesta.comentario_cliente}». {Quien} te enviará una nueva propuesta.
            </p>
          ) : propuesta.estado === 'vencida' ? (
            <p className="rounded-xl border border-line p-4 text-sm text-ink-muted" role="status">
              Esta propuesta venció el {fecha(`${propuesta.valida_hasta}T12:00:00`)}. Pídele a {primerNombre} una nueva.
            </p>
          ) : (
            <p className="rounded-xl border border-line p-4 text-sm text-ink-muted" role="status">
              Esta propuesta ya no está vigente: {primerNombre} te enviará otra.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-negative">
              {error}
            </p>
          )}
        </div>

        <p className="mt-8 text-xs text-ink-subtle">
          El pago lo coordinas directamente con {primerNombre}. AIB+ no cobra nada al cliente.
        </p>
      </main>

      <PiePagina />
    </div>
  );
}
