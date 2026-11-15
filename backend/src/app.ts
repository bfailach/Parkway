import path from "path";
import fs from "fs";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes";
import catalogoRoutes from "./routes/catalogoRoutes";
import estacionamientoRoutes from "./routes/estacionamientoRoutes";
import clienteRoutes from "./routes/clienteRoutes";
import adminRoutes from "./routes/adminRoutes";
import { getPronostico } from "./controllers/catalogoController";
import { errorHandler } from "./middlewares/errorHandler";

/** Configuración de la aplicación Express (separada de index.ts para poder probarla). */
export const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/catalogos", catalogoRoutes);
app.use("/api/estacionamiento", estacionamientoRoutes);
app.use("/api/cliente", clienteRoutes);
app.use("/api/admin", adminRoutes);
// Ruta del documento maestro (sección 13) para el pronóstico de 24 horas.
app.get("/api/prediccion", getPronostico);

app.use("/api", (_req, res) => res.status(404).json({ error: "Ruta no encontrada" }));
app.use(errorHandler);

// En producción el mismo servidor entrega el frontend compilado, así basta
// con un solo servicio y no hay que configurar CORS ni otra URL de la API.
const frontend = path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(frontend)) {
  app.use(
    express.static(frontend, {
      index: false,
      setHeaders(res, archivo) {
        const nombre = path.basename(archivo);
        if (archivo.includes(`${path.sep}assets${path.sep}`)) {
          // El nombre lleva una huella del contenido: nunca cambia.
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (nombre === "sw.js" || nombre === "manifest.webmanifest") {
          // App instalable (PWA): las actualizaciones deben llegar enseguida.
          res.setHeader("Cache-Control", "no-cache");
          if (nombre === "sw.js") res.setHeader("Service-Worker-Allowed", "/");
          if (nombre === "manifest.webmanifest") res.setHeader("Content-Type", "application/manifest+json");
        } else {
          res.setHeader("Cache-Control", "public, max-age=3600");
        }
      },
    })
  );
  app.get("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(frontend, "index.html"));
  });
}
