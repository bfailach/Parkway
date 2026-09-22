import { Router } from "express";
import { getDisponibilidad } from "../controllers/estacionamientoController";

const router = Router();

// GET /api/estacionamiento/disponibilidad?idParqueadero=1&idTipo=1
router.get("/disponibilidad", getDisponibilidad);

export default router;
