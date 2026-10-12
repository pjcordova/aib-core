import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, matchPath } from 'react-router-dom';

// El sistema de diseño. Sin este import, ni Tailwind ni los tokens llegan al
// navegador — que es exactamente lo que pasaba antes.
import './index.css';

import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { diferido, type Diferido } from './lib/diferido';

// Cada página se descarga aparte (lib/diferido.ts): quien llega desde Google a
// un rubro no baja el cuestionario, la vista previa ni el panel del ingeniero.
const App = diferido(() => import('./App').then((m) => m.default));
const PanelIngeniero = diferido(() => import('./components/panel/PanelIngeniero').then((m) => m.PanelIngeniero));
const MaquetaPublica = diferido(() => import('./components/MaquetaPublica').then((m) => m.MaquetaPublica));
const EntradaInvitacion = diferido(() => import('./components/EntradaInvitacion').then((m) => m.EntradaInvitacion));
const EmpezarPrueba = diferido(() => import('./components/EmpezarPrueba').then((m) => m.EmpezarPrueba));
const UneteIngeniero = diferido(() => import('./components/ingenieros/UneteIngeniero').then((m) => m.UneteIngeniero));
const UnirseEquipo = diferido(() => import('./components/ingenieros/UnirseEquipo').then((m) => m.UnirseEquipo));
const Ingresar = diferido(() => import('./components/Ingresar').then((m) => m.Ingresar));
const PerfilPublico = diferido(() => import('./components/ingenieros/PerfilPublico').then((m) => m.PerfilPublico));
const PaginaPropuesta = diferido(() => import('./components/propuestas/PaginaPropuesta').then((m) => m.PaginaPropuesta));
const PaginaResena = diferido(() => import('./components/PaginaResena').then((m) => m.PaginaResena));
const Explorar = diferido(() => import('./components/Explorar').then((m) => m.Explorar));
const Privacidad = diferido(() => import('./components/PaginasLegales').then((m) => m.Privacidad));
const Terminos = diferido(() => import('./components/PaginasLegales').then((m) => m.Terminos));
const PaginaServicio = diferido(() => import('./components/PaginaServicio').then((m) => m.PaginaServicio));
const PaginaRubro = diferido(() => import('./components/PaginaRubro').then((m) => m.PaginaRubro));

/** La página de cada ruta, para bajar primero la de entrada. Mismo orden que <Routes>. */
const PAGINAS: [string, Diferido<object>][] = [
  ['/', App],
  ['/mi-web', App],
  ['/dashboard', PanelIngeniero],
  ['/ver/:token', MaquetaPublica],
  ['/i/:token', EntradaInvitacion],
  ['/probar', EmpezarPrueba],
  ['/ingenieros', UneteIngeniero],
  ['/equipo/:token', UnirseEquipo],
  ['/ingresar', Ingresar],
  ['/ing/:slug', PerfilPublico],
  ['/propuesta/:token', PaginaPropuesta],
  ['/explorar', Explorar],
  ['/servicios/:slug', PaginaServicio],
  ['/rubros/:slug', PaginaRubro],
  ['/privacidad', Privacidad],
  ['/terminos', Terminos],
  ['/resena/:token', PaginaResena],
];

// Tras publicar una versión nueva, una pestaña abierta con la anterior pide
// trozos de código que ya no existen: se recarga (como mucho una vez por
// minuto, para no entrar en un ciclo si el problema es la conexión).
window.addEventListener('vite:preloadError', (evento) => {
  try {
    if (Date.now() - Number(sessionStorage.getItem('aib-recarga') ?? 0) < 60_000) return;
    sessionStorage.setItem('aib-recarga', String(Date.now()));
  } catch {
    return;
  }
  evento.preventDefault();
  window.location.reload();
});

const cargando = (
  <div className="grid min-h-screen place-items-center" role="status">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
  </div>
);

const raiz = ReactDOM.createRoot(document.getElementById('root')!);
const mostrar = () =>
  raiz.render(
    <React.StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <Suspense fallback={cargando}>
            <Routes>
              {/* La portada; con cuenta, la app. Cada ruta con su propia instancia. */}
              <Route path="/" element={<App key="inicio" />} />
              {/* La prueba sin cuenta y la invitación de un ingeniero. */}
              <Route path="/mi-web" element={<App key="mi-web" />} />
              {/* Lo del ingeniero: el cliente que abre su enlace desde el celular no baja el panel ni ABI. */}
              <Route path="/dashboard" element={<PanelIngeniero />} />
              {/* Maqueta compartida por un cliente: pública, sin sesión. */}
              <Route path="/ver/:token" element={<MaquetaPublica />} />
              {/* Invitación del ingeniero: el cliente entra sin crear cuenta. */}
              <Route path="/i/:token" element={<EntradaInvitacion />} />
              {/* «Pruébalo gratis» en la portada: sin cuenta, como una invitación. */}
              <Route path="/probar" element={<EmpezarPrueba />} />
              {/* Ingenieros que quieren sumarse: postulan con su perfil. */}
              <Route path="/ingenieros" element={<UneteIngeniero />} />
              {/* El enlace con el que el dueño de un plan Negocio suma a su equipo. */}
              <Route path="/equipo/:token" element={<UnirseEquipo />} />
              {/* Entrar con cuenta aunque el navegador tenga abierta una prueba sin cuenta. */}
              <Route path="/ingresar" element={<Ingresar />} />
              {/* La página pública de cada ingeniero, para compartir con sus clientes. */}
              <Route path="/ing/:slug" element={<PerfilPublico />} />
              {/* La propuesta que el ingeniero le manda al cliente, para aceptarla sin cuenta. */}
              <Route path="/propuesta/:token" element={<PaginaPropuesta />} />
              {/* El buscador de ingenieros: por servicio, rubro, presupuesto y reseñas. */}
              <Route path="/explorar" element={<Explorar />} />
              {/* Una página por servicio, para quien llega desde Google. */}
              <Route path="/servicios/:slug" element={<PaginaServicio />} />
              {/* Y una por tipo de negocio: «página web para restaurantes»… */}
              <Route path="/rubros/:slug" element={<PaginaRubro />} />
              {/* Política de privacidad y términos: Google los pide para verificar la marca. */}
              <Route path="/privacidad" element={<Privacidad />} />
              <Route path="/terminos" element={<Terminos />} />
              {/* La reseña que deja el cliente con el enlace de su ingeniero, sin cuenta. */}
              <Route path="/resena/:token" element={<PaginaResena />} />
              {/* Cualquier otra ruta vuelve al inicio en vez de dejar la página en blanco. */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>
  );

// Primero se baja la página de entrada; mientras tanto sigue a la vista el
// HTML prerenderizado (o la pantalla en blanco de siempre). Si falla, se
// muestra igual y la ruta lo vuelve a intentar.
const entrada = PAGINAS.find(([ruta]) => matchPath(ruta, window.location.pathname))?.[1] ?? App;
entrada.precargar().then(mostrar, mostrar);
