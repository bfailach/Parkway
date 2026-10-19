import { NextFunction, Request, Response } from "express";

/**
 * Envuelve un controlador asíncrono para que los errores lleguen al
 * manejador central de Express en lugar de quedar como promesas rechazadas.
 */
export const asyncHandler =
  <R extends Request = Request>(fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req as R, res, next).catch(next);
  };
