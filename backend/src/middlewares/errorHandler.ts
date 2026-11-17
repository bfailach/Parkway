import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";

const MENSAJES_DUPLICADO: Record<string, string> = {
  ux_registro_abierto_por_placa: "El vehículo ya tiene un ingreso abierto",
  ux_registro_abierto_por_espacio: "El espacio ya fue ocupado por otro vehículo",
  usuario_correo_key: "Ya existe una cuenta con ese correo",
  usuario_documento_key: "Ya existe una cuenta con ese documento",
  parqueadero_nombre_key: "Ya existe una sede con ese nombre",
  vehiculo_pkey: "Ese vehículo ya está registrado",
  uq_pago_referencia: "Esa referencia ya se registró en otro pago",
  ux_pago_aprobado_por_registro: "Este registro ya tiene un pago aprobado",
  comprobante_numero_key: "El número de comprobante ya existe; intente de nuevo",
};

/** Mensaje claro para una violación de unicidad, según la restricción. */
export const mensajeDeDuplicado = (restriccion?: string) => MENSAJES_DUPLICADO[restriccion ?? ""] ?? "Registro duplicado";

/** Mensaje de un error para mostrar o guardar en la bitácora. */
export function mensajeDeError(err: unknown): string {
  const pg = err as { code?: string; constraint?: string };
  if (pg?.code === "23505") return mensajeDeDuplicado(pg.constraint);
  return err instanceof Error ? err.message : String(err);
}

/** Errores de conexión con PostgreSQL: servidor caído, apagándose o en recuperación. */
function esBaseNoDisponible(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  if (["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "57P01", "57P02", "57P03", "08006", "08001", "25006"].includes(e?.code ?? "")) {
    return true;
  }
  return /timeout exceeded when trying to connect|Connection terminated/i.test(e?.message ?? "");
}

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

    const CAMPO: Record<string, string> = {
      usuario_correo_key: "correo",
      usuario_documento_key: "documento",
      parqueadero_nombre_key: "nombre",
      uq_pago_referencia: "referencia",
    };
    const campo = CAMPO[pgError.constraint ?? ""] ?? null;
    const error = mensajeDeDuplicado(pgError.constraint);
    return res.status(409).json({ error, detalles: campo ? { [campo]: error } : undefined });
  }
  if (pgError?.code === "23514") {
    return res.status(400).json({ error: "Los datos no cumplen las reglas de validación" });
  }

  // Sistemas distribuidos: si la base de datos no está disponible (caída del
  // primario, promoción de la réplica, conexiones agotadas) se responde 503
  // con Retry-After, para que el cliente reintente en vez de darlo por perdido.
  if (esBaseNoDisponible(err)) {
    res.setHeader("Retry-After", "5");
    return res.status(503).json({ error: "El servicio no está disponible en este momento. Intente de nuevo en unos segundos." });
  }

  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: "Error interno del servidor" });
}
