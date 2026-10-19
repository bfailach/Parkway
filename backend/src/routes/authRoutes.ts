import { Router } from "express";
import { getMe, postLogin, postRegistro } from "../controllers/authController";
import { verificarToken } from "../middlewares/auth";

const router = Router();

router.post("/login", postLogin); // RF01
router.post("/registro", postRegistro); // RF01: cuenta de cliente
router.get("/me", verificarToken, getMe);

export default router;
