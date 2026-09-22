import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import estacionamientoRoutes from "./routes/estacionamientoRoutes";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/estacionamiento", estacionamientoRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Parkway backend escuchando en el puerto ${PORT}`);
});
