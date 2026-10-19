import { Router } from "express";
import { getBitacora } from "../controllers/adminController";
import { requiereRol, verificarToken } from "../middlewares/auth";

/** Rutas exclusivas del administrador. */
const router = Router();
router.use(verificarToken, requiereRol("ADMINISTRADOR"));

router.get("/bitacora", getBitacora); // RF14

export default router;
