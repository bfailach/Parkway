import { Router } from "express";
import * as c from "../controllers/estacionamientoController";
import { requiereRol, verificarToken } from "../middlewares/auth";

const router = Router();

// Consultas públicas de disponibilidad (RF05): no requieren sesión
// GET /api/estacionamiento/disponibilidad?idParqueadero=1&idTipo=1
router.get("/disponibilidad", c.getDisponibilidad);
// GET /api/estacionamiento/resumen?idParqueadero=1
router.get("/resumen", c.getResumen);

// Operación de portería: solo operadores y administradores
const personal = [verificarToken, requiereRol("OPERADOR", "ADMINISTRADOR")];

router.get("/espacios", ...personal, c.getEspacios);
router.get("/totales-dia", ...personal, c.getTotalesDia);
router.get("/activos", ...personal, c.getActivos);
router.get("/historial", ...personal, c.getHistorial);
router.post("/ingreso", ...personal, c.postIngreso); // RF06
router.post("/salida/:idRegistro", ...personal, c.postSalida); // RF07

export default router;
