import { Router } from "express";
import { getHorario, getParqueaderos, getPrediccion, getRed, getTiposVehiculo } from "../controllers/catalogoController";

const router = Router();

router.get("/parqueaderos", getParqueaderos);
router.get("/parqueaderos/:id/horario", getHorario);
router.get("/parqueaderos/:id/prediccion", getPrediccion); // red neuronal: ocupación en una hora
router.get("/red-neuronal", getRed);
router.get("/tipos-vehiculo", getTiposVehiculo); // ?idParqueadero=1 para las tarifas de esa sede

export default router;
