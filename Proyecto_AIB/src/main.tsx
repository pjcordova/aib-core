import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// El sistema de diseño. Sin este import, ni Tailwind ni los tokens llegan al
// navegador — que es exactamente lo que pasaba antes.
import './index.css';

import App from './App';
import { MaquetaPublica } from './components/MaquetaPublica';
import { EntradaInvitacion } from './components/EntradaInvitacion';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

// Lo del ingeniero se descarga solo cuando él entra: el cliente que abre su
// enlace desde el celular no baja el panel, ABI ni el informe antiguo (este
// último trae Excel, PDF y gráficos, más de 800 KB).
const PanelIngeniero = lazy(() =>
  import('./components/panel/PanelIngeniero').then((m) => ({ default: m.PanelIngeniero }))
);
const DashboardIngeniero = lazy(() =>
  import('./components/DashboardIngeniero').then((m) => ({ default: m.DashboardIngeniero }))
);

const cargando = (
  <div className="grid min-h-screen place-items-center" role="status">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
  </div>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={cargando}>
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/dashboard" element={<PanelIngeniero />} />
            {/* Maqueta compartida por un cliente: pública, sin sesión. */}
            <Route path="/ver/:token" element={<MaquetaPublica />} />
            {/* Invitación del ingeniero: el cliente entra sin crear cuenta. */}
            <Route path="/i/:token" element={<EntradaInvitacion />} />
            {/* Vista antigua del formulario, sin enlazar desde ningún sitio. */}
            <Route path="/dashboard/legado" element={<DashboardIngeniero />} />
            {/* Cualquier otra ruta vuelve al inicio en vez de dejar la página en blanco. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
