import { asyncHandler } from "../utils/asyncHandler";
import * as authService from "../services/authService";
import { AuthenticatedRequest } from "../middlewares/auth";

export const postLogin = asyncHandler(async (req, res) => {
  res.json(await authService.iniciarSesion(req.body?.correo, req.body?.contrasena));
});

export const getMe = asyncHandler<AuthenticatedRequest>(async (req, res) => {
  res.json(req.usuario);
});

export const postRegistro = asyncHandler(async (req, res) => {
  res.status(201).json(await authService.registrarCliente(req.body ?? {}));
});
