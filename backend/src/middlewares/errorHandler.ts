import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";

/**
 * Manejador central de errores.
 * - AppError: respuesta con su código y mensaje.
 * - Violación de unicidad en PostgreSQL (23505): 409. Ocurre cuando dos
 *   operadores intentan ocupar el mismo espacio o ingresar la misma placa
 *   al mismo tiempo y el índice único parcial rechaza la segunda operación.
 * - Cualquier otro error: 500 sin exponer detalles internos.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, detalles: err.detalles });
  }

  const pgError = err as { code?: string; constraint?: string };
  if (pgError?.code === "23505") {
    const mensajes: Record<string, string> = {
      ux_registro_abierto_por_placa: "El vehículo ya tiene un ingreso abierto",
      ux_registro_abierto_por_espacio: "El espacio ya fue ocupado por otro vehículo",
      usuario_correo_key: "Ya existe una cuenta con ese correo",
      usuario_documento_key: "Ya existe una cuenta con ese documento",
      parqueadero_nombre_key: "Ya existe una sede con ese nombre",
      vehiculo_pkey: "Ese vehículo ya está registrado",
    };
    const CAMPO: Record<string, string> = {
      usuario_correo_key: "correo",
      usuario_documento_key: "documento",
      parqueadero_nombre_key: "nombre",
    };
    const campo = CAMPO[pgError.constraint ?? ""] ?? null;
    const error = mensajes[pgError.constraint ?? ""] ?? "Registro duplicado";
    return res.status(409).json({ error, detalles: campo ? { [campo]: error } : undefined });
  }
  if (pgError?.code === "23514") {
    return res.status(400).json({ error: "Los datos no cumplen las reglas de validación" });
  }

  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: "Error interno del servidor" });
}
