import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// El sistema de diseño. Sin este import, ni Tailwind ni los tokens llegan al
// navegador — que es exactamente lo que pasaba antes.
import './index.css';

import App from './App';
import { DashboardIngeniero } from './components/DashboardIngeniero';
import { MaquetaPublica } from './components/MaquetaPublica';
import { PanelIngeniero } from './components/panel/PanelIngeniero';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/dashboard" element={<PanelIngeniero />} />
          {/* Maqueta compartida por un cliente: pública, sin sesión. */}
          <Route path="/ver/:token" element={<MaquetaPublica />} />
          {/* Vista antigua del formulario, sin enlazar desde ningún sitio. */}
          <Route path="/dashboard/legado" element={<DashboardIngeniero />} />
          {/* Cualquier otra ruta vuelve al inicio en vez de dejar la página en blanco. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
