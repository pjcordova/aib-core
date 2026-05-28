import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import { DashboardIngeniero } from "./components/DashboardIngeniero";

// Render principal con rutas
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Ruta principal: formulario gusano */}
        <Route path="/" element={<App />} />

        {/* Ruta del Dashboard del Ingeniero */}
        <Route path="/dashboard" element={<DashboardIngeniero />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
