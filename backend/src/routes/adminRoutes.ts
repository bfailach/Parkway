import { Router } from "express";
import * as c from "../controllers/adminController";
import { requiereRol, verificarToken } from "../middlewares/auth";

/** Rutas exclusivas del administrador. */
const router = Router();
router.use(verificarToken, requiereRol("ADMINISTRADOR"));

router.get("/bitacora", c.getBitacora); // RF14
router.get("/reportes/:tipo", c.getReporte); // RF13: ocupacion, rotacion o ingresos; ?formato=csv para descargar
router.get("/parqueaderos", c.getParqueaderos);
router.get("/parqueaderos/:id", c.getParqueadero);
router.post("/parqueaderos", c.postParqueadero);
router.put("/parqueaderos/:id", c.putParqueadero);
router.patch("/espacios/:id", c.patchEspacio); // fuera de servicio / habilitar
router.get("/operadores", c.getOperadores);

// RF02: gestión de usuarios
router.get("/usuarios", c.getUsuarios);
router.get("/usuarios/:id", c.getUsuario);
router.post("/usuarios", c.postUsuario);
router.put("/usuarios/:id", c.putUsuario);
router.patch("/usuarios/:id/estado", c.patchEstadoUsuario); // activar, inactivar o bloquear

export default router;
