import { Router } from "express";
import { getHorario, getParqueaderos, getTiposVehiculo } from "../controllers/catalogoController";

const router = Router();

router.get("/parqueaderos", getParqueaderos);
router.get("/parqueaderos/:id/horario", getHorario);
router.get("/tipos-vehiculo", getTiposVehiculo); // ?idParqueadero=1 para las tarifas de esa sede

export default router;
