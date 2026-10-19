import { asyncHandler } from "../utils/asyncHandler";
import * as bitacoraRepository from "../repositories/bitacoraRepository";
import { badRequest } from "../errors/AppError";

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const getBitacora = asyncHandler(async (req, res) => {
  const desde = texto(req.query.desde);
  const hasta = texto(req.query.hasta);
  if ((desde && !FECHA.test(desde)) || (hasta && !FECHA.test(hasta))) throw badRequest("Fecha inválida (AAAA-MM-DD)");
  const estado = texto(req.query.estado);
  if (estado && !["INICIADA", "CONFIRMADA", "REVERTIDA"].includes(estado)) throw badRequest("Estado inválido");
  const [filas, tipos] = await Promise.all([
    bitacoraRepository.listar({ tipo: texto(req.query.tipo), estado, desde, hasta, limite: 300 }),
    bitacoraRepository.tiposDeOperacion(),
  ]);
  res.json({ filas, tipos });
});
