import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

/**
 * Módulo de seguridad (RF01, RNF01).
 * - verificarToken: valida el JWT de la cabecera Authorization y adjunta
 *   el usuario a la petición.
 * - requiereRol: restringe una ruta a uno o varios roles.
 */
export type Rol = "CLIENTE" | "OPERADOR" | "ADMINISTRADOR";

export interface UsuarioToken {
  id_usuario: number;
  nombre: string;
  rol: Rol;
}

export interface AuthenticatedRequest extends Request {
  usuario?: UsuarioToken;
}

export const JWT_SECRET = () => process.env.JWT_SECRET || "dev-secret";

export function verificarToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token no proporcionado" });
  }

  const token = header.substring("Bearer ".length);
  try {
    const payload = jwt.verify(token, JWT_SECRET()) as UsuarioToken;
    req.usuario = { id_usuario: payload.id_usuario, nombre: payload.nombre, rol: payload.rol };
    return next();
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}

export function requiereRol(...roles: Rol[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.usuario) return res.status(401).json({ error: "No autenticado" });
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: "No tiene permiso para esta operación" });
    }
    return next();
  };
}
