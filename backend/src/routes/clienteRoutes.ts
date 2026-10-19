import { Router } from "express";
import * as c from "../controllers/clienteController";
import { requiereRol, verificarToken } from "../middlewares/auth";

/** Rutas del cliente autenticado. Cada consulta se limita a sus propios datos. */
const router = Router();
router.use(verificarToken, requiereRol("CLIENTE"));

router.get("/estado", c.getEstado); // RF03: vehículo dentro y reserva activa
router.get("/historial", c.getHistorial); // RF03: visitas anteriores
router.get("/vehiculos", c.getVehiculos); // RF04
router.post("/vehiculos", c.postVehiculo); // RF04
router.delete("/vehiculos/:placa", c.deleteVehiculo); // RF04
router.get("/reservas", c.getReservas); // RF10
router.post("/reservas", c.postReserva); // RF10
router.post("/reservas/:idReserva/cancelar", c.postCancelarReserva); // RF10

export default router;
