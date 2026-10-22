import { Request, Response } from "express";
import * as estacionamientoService from "../services/estacionamientoService";
import { AuthenticatedRequest } from "../middlewares/auth";
import { validarIngreso } from "../validators/ingresoValidator";
import { badRequest } from "../errors/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import * as accesoService from "../services/accesoService";

type Req = AuthenticatedRequest;
const numero = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? Number(v) : undefined);

/** Verifica que el operador tenga acceso a la sede de la consulta. */
async function sedePermitida(req: Req) {
  const id = sede(req);
  if (Number.isInteger(id) && id > 0) await accesoService.verificarAcceso(req.usuario!, id);
  return id;
}

const sede = (req: Request) => Number(req.query.idParqueadero);
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export const getDisponibilidad = asyncHandler(async (req, res: Response) => {
  const idParqueadero = Number(req.query.idParqueadero);
  const idTipo = Number(req.query.idTipo);
  if (!idParqueadero || !idTipo) throw badRequest("idParqueadero e idTipo son requeridos");
  res.json(await estacionamientoService.consultarDisponibilidad(idParqueadero, idTipo));
});

export const getResumen = asyncHandler(async (req, res) => {
  res.json(await estacionamientoService.resumen(sede(req)));
});

export const getPlano = asyncHandler(async (req, res) => {
  res.json(await estacionamientoService.planoPublico(sede(req)));
});

export const getEspacios = asyncHandler<Req>(async (req, res) => {
  res.json(await estacionamientoService.mapaEspacios(await sedePermitida(req)));
});

export const getTotalesDia = asyncHandler<Req>(async (req, res) => {
  res.json(await estacionamientoService.totalesDelDia(await sedePermitida(req)));
});

export const getActivos = asyncHandler<Req>(async (req, res) => {
  res.json(await estacionamientoService.vehiculosActivos(await sedePermitida(req), texto(req.query.placa)));
});

export const getHistorial = asyncHandler<Req>(async (req, res) => {
  const q = req.query;
  const orden = texto(q.orden) as "fecha" | "valor" | "tiempo" | undefined;
  res.json(
    await estacionamientoService.historial({
      idParqueadero: await sedePermitida(req),
      placa: texto(q.placa),
      idTipo: numero(q.idTipo),
      marca: texto(q.marca),
      color: texto(q.color),
      desde: texto(q.desde),
      hasta: texto(q.hasta),
      minutosMin: numero(q.minutosMin),
      minutosMax: numero(q.minutosMax),
      valorMin: numero(q.valorMin),
      valorMax: numero(q.valorMax),
      orden,
      agrupar: texto(q.agrupar),
    })
  );
});

export const postIngreso = asyncHandler<Req>(async (req, res) => {
  const v = validarIngreso(req.body ?? {});
  if (!v.valido || !v.datos) throw badRequest("Revise los campos del formulario", v.errores);
  const registro = await estacionamientoService.registrarIngreso(v.datos, req.usuario!);
  res.status(201).json(registro);
});

export const postSalida = asyncHandler<Req>(async (req, res) => {
  const registro = await estacionamientoService.registrarSalida(Number(req.params.idRegistro), req.usuario!);
  res.json(registro);
});

export const getReservas = asyncHandler<Req>(async (req, res) => {
  res.json(await estacionamientoService.reservasDeLaSede(await sedePermitida(req)));
});

export const getMisSedes = asyncHandler<Req>(async (req, res) => {
  res.json(await accesoService.misSedes(req.usuario!));
});

export const getBuscarVehiculos = asyncHandler<Req>(async (req, res) => {
  res.json(await estacionamientoService.buscarVehiculos(texto(req.query.q) ?? "", numero(req.query.idTipo)));
});

export const getVehiculo = asyncHandler<Req>(async (req, res) => {
  res.json(await estacionamientoService.vehiculoPorPlaca(req.params.placa));
});
