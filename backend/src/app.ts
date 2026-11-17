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
import { NODO_ID } from "./distribuido/config";
import { jwks } from "./distribuido/llaves";
import { saludDistribuida } from "./distribuido/salud";

/** Configuración de la aplicación Express (separada de index.ts para poder probarla). */
export const app = express();

app.use(cors());
app.use(express.json());

// Sistemas distribuidos: cada respuesta dice qué réplica la atendió, para
// observar el balanceo de carga del gateway y el relevo ante fallas.
app.use((_req, res, next) => {
  res.setHeader("X-Parkway-Nodo", NODO_ID);
  next();
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Estado de este nodo y de sus dependencias (base, réplica, Redis, RabbitMQ, outbox).
app.get("/api/salud/distribuida", saludDistribuida);

// Llave pública de firma de los tokens (JWKS, RFC 7517). Los demás
// servicios la usan para verificar tokens sin conocer ningún secreto.
app.get("/.well-known/jwks.json", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(jwks());
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
