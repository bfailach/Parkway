/**
 * Error de negocio con código HTTP asociado.
 * Los servicios lanzan AppError cuando una regla de negocio no se cumple
 * (por ejemplo, no hay espacios libres). El manejador de errores lo
 * traduce en una respuesta JSON con el código indicado.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detalles?: Record<string, string>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (msg: string, detalles?: Record<string, string>) => new AppError(400, msg, detalles);
export const unauthorized = (msg = "No autenticado") => new AppError(401, msg);
export const forbidden = (msg = "No tiene permiso para esta operación") => new AppError(403, msg);
export const notFound = (msg: string) => new AppError(404, msg);
export const conflict = (msg: string) => new AppError(409, msg);
