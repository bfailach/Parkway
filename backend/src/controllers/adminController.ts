import { asyncHandler } from "../utils/asyncHandler";
import * as bitacoraRepository from "../repositories/bitacoraRepository";
import { badRequest } from "../errors/AppError";
import { leerFiltrosBitacora } from "../validators/bitacoraValidator";
import { AuthenticatedRequest } from "../middlewares/auth";
import * as parqueaderoService from "../services/parqueaderoService";
import * as usuarioService from "../services/usuarioService";

type Req = AuthenticatedRequest;

export const getBitacora = asyncHandler(async (req, res) => {
  const v = leerFiltrosBitacora(req.query as Record<string, unknown>);
  if (!v.valido) throw badRequest("Revise los filtros", v.errores);
  const [filas, opciones] = await Promise.all([bitacoraRepository.listar({ ...v.filtros, limite: 300 }), bitacoraRepository.opciones()]);
  res.json({ filas, ...opciones });
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

// Usuarios (RF02)
export const getUsuarios = asyncHandler(async (req, res) => {
  res.json(await usuarioService.listar(req.query));
});

export const getUsuario = asyncHandler(async (req, res) => {
  res.json(await usuarioService.obtener(Number(req.params.id)));
});

export const postUsuario = asyncHandler<Req>(async (req, res) => {
  res.status(201).json(await usuarioService.crear(req.body ?? {}, req.usuario!.id_usuario));
});

export const putUsuario = asyncHandler<Req>(async (req, res) => {
  res.json(await usuarioService.actualizar(Number(req.params.id), req.body ?? {}, req.usuario!.id_usuario));
});

export const patchEstadoUsuario = asyncHandler<Req>(async (req, res) => {
  res.json(await usuarioService.cambiarEstado(Number(req.params.id), req.body?.estado, req.usuario!.id_usuario));
});
