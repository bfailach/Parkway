import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes";
import catalogoRoutes from "./routes/catalogoRoutes";
import estacionamientoRoutes from "./routes/estacionamientoRoutes";
import clienteRoutes from "./routes/clienteRoutes";
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

app.use("/api", (_req, res) => res.status(404).json({ error: "Ruta no encontrada" }));
app.use(errorHandler);
