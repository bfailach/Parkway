import { NextFunction, Request, Response } from "express";
import { verificarToken as verificarFirma } from "../distribuido/llaves";
import { estadoSesion } from "../repositories/usuarioRepository";

/**
 * Módulo de seguridad (RF01, RNF01).
 * - verificarToken: valida el JWT de la cabecera Authorization, confirma
 *   en la base de datos que el usuario sigue activo y adjunta el usuario
 *   con su rol actual a la petición. Así, inactivar a un usuario o cambiar
 *   su rol (RF02) surte efecto de inmediato y no cuando vence el token.
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

export async function verificarToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token no proporcionado" });
  }

  const token = header.substring("Bearer ".length);
  let payload: UsuarioToken;
  try {
    // ES256 con llave pública (varios nodos) o HS256 con el secreto (un nodo).
    payload = verificarFirma(token, JWT_SECRET()) as unknown as UsuarioToken;
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }

  try {
    const actual = await estadoSesion(payload.id_usuario);
    if (!actual || actual.estado !== "ACTIVO") {
      return res.status(401).json({ error: "Su cuenta está inactiva. Comuníquese con el administrador." });
    }
    req.usuario = { id_usuario: payload.id_usuario, nombre: actual.nombre, rol: actual.rol };
    return next();
  } catch (error) {
    return next(error);
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
