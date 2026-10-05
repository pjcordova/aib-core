// ---------------------------------------------------------------------------
// Portada pública
// ---------------------------------------------------------------------------
// Lo que ve quien llega a AIB+ sin sesión y sin invitación: un dueño de
// negocio que quiere saber qué es esto. Antes veía directamente el login.
// Todo lo que promete aquí existe en la app: preguntas casi todas de un clic,
// maqueta en un minuto con su nombre, logo y colores, fotos, enlace para
// compartir y un ingeniero que la construye si la acepta.
// ---------------------------------------------------------------------------

import { useNavigate } from 'react-router-dom';
import { Wordmark } from './ui/Primitives';

type Acceso = 'login' | 'registro';

const PASOS = [
  {
    titulo: 'Cuéntanos de tu negocio',
    texto: 'Nombre, rubro, para qué quieres la web y tus colores. Casi todo con un clic.',
  },
  {
    titulo: 'Mira tu web en un minuto',
    texto: 'Ves una primera versión con tu nombre y tu logo. Cambia los textos, los colores y pon tus fotos.',
  },
  {
    titulo: 'Un ingeniero la hace realidad',
    texto: 'Si te gusta, la envías y un ingeniero te contacta con una propuesta para construirla.',
  },
];

const RUBROS = [
  'Restaurantes y cafés',
  'Tiendas de ropa y moda',
  'Salud y belleza',
  'Consultoras y servicios',
  'Instituciones y ONG',
];

const INCLUYE = [
  'Tu nombre, tu logo y tus colores',
  'Botón de WhatsApp para que te escriban',
  'Se ve bien en el celular',
  'Tus propias fotos',
  'Un enlace para mostrársela a tu socio o tu familia',
];

export function Portada({ onAcceso }: { onAcceso: (modo: Acceso) => void }) {
  const navigate = useNavigate();
  // Sin cuenta: /probar abre una sesión de prueba y lleva al cuestionario.
  const probar = () => navigate('/probar');
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Wordmark />
        <button type="button" onClick={() => onAcceso('login')} className="btn btn-ghost">
          Ingresar
        </button>
      </header>

      <main>
        {/* -------------------------------------------------------- portada */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-16 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-16">
          <div className="animate-fade-up text-center lg:text-left">
            <p className="mb-4 text-xs font-medium tracking-[0.2em] text-ink-subtle uppercase">
              Para negocios y emprendedores
            </p>
            <h1 className="text-4xl leading-[1.1] text-balance sm:text-5xl lg:text-6xl">
              Mira cómo se vería la web de tu negocio, antes de pagar nada
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg lg:mx-0">
              Respondes unas preguntas, casi todas con un clic, y en un minuto ves una primera versión con
              tu nombre, tu logo y tus colores. Si te gusta, un ingeniero la hace realidad contigo.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <button type="button" onClick={probar} className="btn btn-primary w-full px-8 py-3 text-base sm:w-auto">
                Pruébalo gratis
              </button>
              <button
                type="button"
                onClick={() => onAcceso('login')}
                className="btn btn-ghost w-full px-6 py-3 text-base sm:w-auto"
              >
                Ya tengo cuenta
              </button>
            </div>
            <p className="mt-4 text-xs text-ink-subtle">Sin crear cuenta ni tarjeta.</p>
          </div>

          <CelularDeEjemplo />
        </section>

        {/* ------------------------------------------------- cómo funciona */}
        <section className="border-y border-line bg-surface-raised/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-center text-3xl sm:text-4xl">Así de simple</h2>
            <ol className="mt-10 grid gap-5 sm:grid-cols-3">
              {PASOS.map((paso, i) => (
                <li key={paso.titulo} className="card p-6">
                  <span className="font-display text-3xl text-accent-alt">{i + 1}</span>
                  <h3 className="mt-3 text-xl">{paso.titulo}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{paso.texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ------------------------------------------- rubros y qué incluye */}
        <section className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl">Diseños pensados para tu rubro</h2>
            <p className="mt-3 text-ink-muted">
              Te mostramos los diseños que mejor encajan con tu negocio y eliges el que más te guste.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {RUBROS.map((rubro) => (
                <li
                  key={rubro}
                  className="rounded-full border border-line-strong bg-surface-raised px-4 py-2 text-sm text-ink"
                >
                  {rubro}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-3xl">Lo que verás en tu web</h2>
            <ul className="mt-6 space-y-3">
              {INCLUYE.map((item) => (
                <li key={item} className="flex items-start gap-3 text-ink">
                  <span
                    className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] text-white"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ----------------------------------------------------- llamada final */}
        <section className="px-4 pb-20 sm:px-6">
          <div className="mx-auto max-w-4xl rounded-3xl bg-accent px-6 py-12 text-center text-white sm:px-12">
            <h2 className="text-3xl text-balance sm:text-4xl">Tu negocio merece una web que dé confianza</h2>
            <p className="mx-auto mt-3 max-w-lg text-white/75">Mírala hoy, decide después.</p>
            <button
              type="button"
              onClick={probar}
              className="btn mt-8 bg-accent-alt px-8 py-3 text-base text-ink hover:brightness-105"
            >
              Pruébalo gratis
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-ink-subtle sm:flex-row sm:px-6">
          <span>Cordova Solutions © {new Date().getFullYear()}</span>
          <button type="button" onClick={() => onAcceso('login')} className="hover:text-ink">
            ¿Eres ingeniero? Ingresa aquí
          </button>
        </div>
      </footer>
    </div>
  );
}

/** Una web de ejemplo dentro de un celular, hecha con cajas: no pesa nada. */
function CelularDeEjemplo() {
  return (
    <div className="animate-fade-up mx-auto w-full max-w-[300px]" aria-hidden="true">
      <div className="rounded-[2.75rem] bg-ink p-3 shadow-[var(--shadow-lifted)]">
        <div className="overflow-hidden rounded-[2.1rem] bg-white pb-6">
          <div className="flex items-center justify-between px-5 pt-7 pb-4">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-accent" />
              <span className="h-2 w-20 rounded-full bg-ink" />
            </div>
            <div className="flex gap-1.5">
              <span className="h-1.5 w-3 rounded-full bg-line" />
              <span className="h-1.5 w-3 rounded-full bg-line" />
              <span className="h-1.5 w-3 rounded-full bg-line" />
            </div>
          </div>
          <div className="mx-3 rounded-2xl bg-accent px-5 py-8">
            <span className="block h-3 w-40 rounded-full bg-white" />
            <span className="mt-2.5 block h-3 w-28 rounded-full bg-white" />
            <span className="mt-5 block h-1.5 w-44 rounded-full bg-white/45" />
            <span className="mt-2 block h-1.5 w-36 rounded-full bg-white/45" />
            <span className="mt-6 block h-7 w-24 rounded-full bg-accent-alt" />
          </div>
          <div className="mx-3 mt-4 grid grid-cols-2 gap-3">
            {['bg-[#ece5d6]', 'bg-[#e2e7ef]', 'bg-[#e2e7ef]', 'bg-[#ece5d6]'].map((tono, i) => (
              <div key={i}>
                <div className={'h-20 rounded-xl ' + tono} />
                <span className="mt-2 block h-1.5 w-16 rounded-full bg-ink" />
                <span className="mt-1.5 block h-1.5 w-8 rounded-full bg-accent-alt" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-ink-subtle">Ejemplo de cómo se ve en el celular</p>
    </div>
  );
}
