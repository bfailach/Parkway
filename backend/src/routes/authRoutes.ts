import { Router } from "express";
import { getMe, postLogin } from "../controllers/authController";
import { verificarToken } from "../middlewares/auth";

const router = Router();

router.post("/login", postLogin); // RF01
router.get("/me", verificarToken, getMe);

export default router;
