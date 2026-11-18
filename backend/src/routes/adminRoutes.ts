import { Router } from "express";
import * as c from "../controllers/adminController";
import { AuthenticatedRequest, requiereRol, verificarToken } from "../middlewares/auth";
import { asyncHandler } from "../utils/asyncHandler";
import * as correccion from "../services/correccionService";

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

// RF08 y RF09: pagos, anulación y nuevo cobro
router.get("/pagos", c.getPagos);
router.post("/pagos/:id/anular", c.postAnularPago);
router.post("/registros/:id/pago", c.postCobrarDeNuevo);

// Corrección de un cobro por vehículo mal registrado y reclamos de clientes
router.get("/registros/:id/simular-cobro", asyncHandler<AuthenticatedRequest>(async (req, res) => {
  res.json(await correccion.simularCobro(req.usuario!, Number(req.params.id), Number(req.query.idTipo)));
}));
router.post("/registros/:id/corregir-cobro", asyncHandler<AuthenticatedRequest>(async (req, res) => {
  res.json(await correccion.corregirCobro(req.usuario!, Number(req.params.id), req.body ?? {}));
}));
router.get("/reclamos", asyncHandler(async (req, res) => {
  res.json(await correccion.listarReclamos(req.query.estado));
}));
router.post("/reclamos/:id/responder", asyncHandler<AuthenticatedRequest>(async (req, res) => {
  res.json(await correccion.responderReclamo(req.usuario!, Number(req.params.id), req.body ?? {}));
}));

// RF02: gestión de usuarios
router.get("/usuarios", c.getUsuarios);
router.get("/usuarios/:id", c.getUsuario);
router.post("/usuarios", c.postUsuario);
router.put("/usuarios/:id", c.putUsuario);
router.patch("/usuarios/:id/estado", c.patchEstadoUsuario); // activar, inactivar o bloquear

export default router;
