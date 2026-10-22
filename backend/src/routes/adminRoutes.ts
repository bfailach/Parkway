import { Router } from "express";
import * as c from "../controllers/adminController";
import { requiereRol, verificarToken } from "../middlewares/auth";

/** Rutas exclusivas del administrador. */
const router = Router();
router.use(verificarToken, requiereRol("ADMINISTRADOR"));

router.get("/bitacora", c.getBitacora); // RF14
router.get("/parqueaderos", c.getParqueaderos);
router.get("/parqueaderos/:id", c.getParqueadero);
router.post("/parqueaderos", c.postParqueadero);
router.put("/parqueaderos/:id", c.putParqueadero);
router.patch("/espacios/:id", c.patchEspacio); // fuera de servicio / habilitar
router.get("/operadores", c.getOperadores);

export default router;
