import path from "path";
import fs from "fs";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes";
import catalogoRoutes from "./routes/catalogoRoutes";
import estacionamientoRoutes from "./routes/estacionamientoRoutes";
import clienteRoutes from "./routes/clienteRoutes";
import adminRoutes from "./routes/adminRoutes";
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

app.use("/api", (_req, res) => res.status(404).json({ error: "Ruta no encontrada" }));
app.use(errorHandler);

// En producción el mismo servidor entrega el frontend compilado, así basta
// con un solo servicio y no hay que configurar CORS ni otra URL de la API.
const frontend = path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(frontend)) {
  app.use(express.static(frontend, { maxAge: "1h", index: false }));
  app.get("*", (_req, res) => res.sendFile(path.join(frontend, "index.html")));
}
