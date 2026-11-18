import { Router } from "express";
import { AuthenticatedRequest, requiereRol, verificarToken } from "../middlewares/auth";
import { asyncHandler } from "../utils/asyncHandler";
import * as topes from "../services/topeTarifarioService";
import * as consentimientos from "../services/consentimientoService";

/**
 * Funciones de la propuesta de Sistemas Distribuidos:
 *   GET  /api/topes-tarifarios                 topes del Decreto 026 de 2026 (público)
 *   GET  /api/topes-tarifarios/revision        tarifas activas que superan el tope (administrador)
 *   GET  /api/politica-datos                   aviso de privacidad y finalidades (público)
 *   GET  /api/usuarios/me/consentimientos      autorizaciones vigentes e historial (sesión)
 *   POST /api/usuarios/me/consentimientos      otorgar o revocar una finalidad opcional (sesión)
 */
type Req = AuthenticatedRequest;
const router = Router();

router.get(
  "/topes-tarifarios",
  asyncHandler(async (_req, res) => {
    const lista = await topes.listarTopes();
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json(lista.map((t) => ({ ...t, maximos: topes.maximosPorTramo(t.valor_minuto) })));
  })
);
router.get(
  "/topes-tarifarios/revision",
  verificarToken,
  requiereRol("ADMINISTRADOR"),
  asyncHandler(async (_req, res) => {
    res.json(await topes.tarifasFueraDeTope());
  })
);

router.get("/politica-datos", (_req, res) => res.json(consentimientos.POLITICA));
router.get(
  "/usuarios/me/consentimientos",
  verificarToken,
  asyncHandler<Req>(async (req, res) => {
    res.json(await consentimientos.misConsentimientos(req.usuario!.id_usuario));
  })
);
router.post(
  "/usuarios/me/consentimientos",
  verificarToken,
  asyncHandler<Req>(async (req, res) => {
    res.status(201).json(await consentimientos.cambiar(req.usuario!.id_usuario, req.body ?? {}));
  })
);

export default router;
