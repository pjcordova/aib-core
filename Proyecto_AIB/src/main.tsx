import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// El sistema de diseño. Sin este import, ni Tailwind ni los tokens llegan al
// navegador — que es exactamente lo que pasaba antes.
import './index.css';

import App from './App';
import { DashboardIngeniero } from './components/DashboardIngeniero';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/dashboard" element={<DashboardIngeniero />} />
          {/* Cualquier otra ruta vuelve al inicio en vez de dejar la página en blanco. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
