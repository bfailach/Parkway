import { asyncHandler } from "../utils/asyncHandler";
import * as bitacoraRepository from "../repositories/bitacoraRepository";
import { badRequest } from "../errors/AppError";
import { AuthenticatedRequest } from "../middlewares/auth";
import * as parqueaderoService from "../services/parqueaderoService";

type Req = AuthenticatedRequest;

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

// Sedes
export const getParqueaderos = asyncHandler(async (_req, res) => {
  res.json(await parqueaderoService.listar());
});

export const getParqueadero = asyncHandler(async (req, res) => {
  res.json(await parqueaderoService.obtener(Number(req.params.id)));
});

export const postParqueadero = asyncHandler<Req>(async (req, res) => {
  res.status(201).json(await parqueaderoService.crear(req.body ?? {}, req.usuario!.id_usuario));
});

export const putParqueadero = asyncHandler<Req>(async (req, res) => {
  res.json(await parqueaderoService.actualizar(Number(req.params.id), req.body ?? {}, req.usuario!.id_usuario));
});

export const patchEspacio = asyncHandler<Req>(async (req, res) => {
  await parqueaderoService.cambiarEstadoEspacio(Number(req.params.id), req.body?.estado, req.usuario!.id_usuario);
  res.status(204).end();
});

export const getOperadores = asyncHandler(async (_req, res) => {
  res.json(await parqueaderoService.operadores());
});
