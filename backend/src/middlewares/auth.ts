import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

/**
 * Módulo de seguridad (esqueleto inicial).
 * Verifica el token JWT enviado en la cabecera Authorization y adjunta
 * el usuario decodificado a la petición. La emisión de tokens (login) y
 * la autorización por rol se completarán junto con el caso de uso
 * CU01 - Iniciar sesión en una fase posterior.
 */
export interface AuthenticatedRequest extends Request {
  usuario?: { id_usuario: number; rol: string };
}

export function verificarToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token no proporcionado" });
  }

  const token = header.substring("Bearer ".length);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    req.usuario = payload as { id_usuario: number; rol: string };
    return next();
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}
