import { asyncHandler } from "../utils/asyncHandler";
import { AuthenticatedRequest } from "../middlewares/auth";
import * as clienteService from "../services/clienteService";
import { validarVehiculo } from "../validators/clienteValidator";
import { badRequest } from "../errors/AppError";

type Req = AuthenticatedRequest;
const id = (req: Req) => req.usuario!.id_usuario;

export const getEstado = asyncHandler<Req>(async (req, res) => {
  res.json(await clienteService.miEstado(id(req)));
});

export const getVehiculos = asyncHandler<Req>(async (req, res) => {
  res.json(await clienteService.misVehiculos(id(req)));
});

export const postVehiculo = asyncHandler<Req>(async (req, res) => {
  const v = validarVehiculo(req.body ?? {});
  if (!v.valido) throw badRequest("Revise los campos del formulario", v.errores);
  res.status(201).json(await clienteService.registrarVehiculo(id(req), v.datos));
});

export const deleteVehiculo = asyncHandler<Req>(async (req, res) => {
  await clienteService.quitarVehiculo(id(req), req.params.placa);
  res.status(204).end();
});

export const getReservas = asyncHandler<Req>(async (req, res) => {
  res.json(await clienteService.misReservas(id(req)));
});

export const postReserva = asyncHandler<Req>(async (req, res) => {
  res.status(201).json(await clienteService.reservar(id(req), req.body ?? {}));
});

export const postCancelarReserva = asyncHandler<Req>(async (req, res) => {
  res.json(await clienteService.cancelarReserva(id(req), Number(req.params.idReserva)));
});

export const getHistorial = asyncHandler<Req>(async (req, res) => {
  res.json(await clienteService.miHistorial(id(req)));
});
