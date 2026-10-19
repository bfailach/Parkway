import { Router } from "express";
import { getParqueaderos, getTiposVehiculo } from "../controllers/catalogoController";

const router = Router();

router.get("/parqueaderos", getParqueaderos);
router.get("/tipos-vehiculo", getTiposVehiculo);

export default router;
