import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AvisoConexion } from "./components/Instalar";
import { PanelDiagnostico } from "./components/Diagnostico";
import "./lib/diagnostico";
import { registrarServiceWorker } from "./lib/pwa";
import "@fontsource/big-shoulders-display/700.css";
import "@fontsource/big-shoulders-display/800.css";
import "@fontsource/big-shoulders-display/900.css";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "./styles.css";

// Aplicación instalable (PWA): solo en producción.
registrarServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AvisoConexion />
    <App />
    <PanelDiagnostico />
  </StrictMode>
);
