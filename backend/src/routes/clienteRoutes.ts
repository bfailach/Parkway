import { Router } from "express";
import * as c from "../controllers/clienteController";
import { AuthenticatedRequest, requiereRol, verificarToken } from "../middlewares/auth";
import { asyncHandler } from "../utils/asyncHandler";
import * as qr from "../services/qrService";
import * as actividad from "../services/actividadService";
import * as correccion from "../services/correccionService";

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
router.get("/preferencias", c.getPreferencias); // notificaciones
router.put("/preferencias", c.putPreferencias);
// Avisos: reserva vencida, pago anulado y nuevo cobro sobre sus vehículos
router.get("/actividad", asyncHandler<AuthenticatedRequest>(async (req, res) => {
  res.json(await actividad.deCliente(req.usuario!.id_usuario, req.query.desde));
}));
// Entrada con QR (autoservicio): ver la sede del código y registrar el ingreso
router.get("/ingreso-qr/:token", asyncHandler<AuthenticatedRequest>(async (req, res) => {
  res.json(await qr.consultar(req.params.token, req.usuario!.id_usuario));
}));
router.post("/ingreso-qr", asyncHandler<AuthenticatedRequest>(async (req, res) => {
  res.status(201).json(await qr.ingresar(req.usuario!, req.body ?? {}));
}));
// Reclamos sobre el cobro de una visita
router.get("/reclamos", asyncHandler<AuthenticatedRequest>(async (req, res) => {
  res.json(await correccion.misReclamos(req.usuario!.id_usuario));
}));
router.post("/reclamos", asyncHandler<AuthenticatedRequest>(async (req, res) => {
  res.status(201).json(await correccion.crearReclamo(req.usuario!.id_usuario, req.body ?? {}));
}));

export default router;
