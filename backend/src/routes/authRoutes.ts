import { Router } from "express";
import { getMe, postLogin, postRegistro } from "../controllers/authController";
import { verificarToken } from "../middlewares/auth";
import { asyncHandler } from "../utils/asyncHandler";
import * as auth from "../services/authService";

const router = Router();

router.post("/login", postLogin); // RF01
router.post("/registro", postRegistro); // RF01: cuenta de cliente
router.get("/me", verificarToken, getMe);
// Inicio de sesión con Google: { credencial, aceptaTratamiento?, aceptaComunicaciones? }
router.get("/google/configuracion", (_req, res) => res.json(auth.configuracionGoogle()));
router.post("/google", asyncHandler(async (req, res) => res.json(await auth.ingresarConGoogle(req.body ?? {}))));

export default router;
