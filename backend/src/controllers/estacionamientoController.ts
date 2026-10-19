import { Request, Response } from "express";
import * as estacionamientoService from "../services/estacionamientoService";
import { AuthenticatedRequest } from "../middlewares/auth";
import { validarIngreso } from "../validators/ingresoValidator";
import { badRequest } from "../errors/AppError";
import { asyncHandler } from "../utils/asyncHandler";

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

export const getEspacios = asyncHandler(async (req, res) => {
  res.json(await estacionamientoService.mapaEspacios(sede(req)));
});

export const getTotalesDia = asyncHandler(async (req, res) => {
  res.json(await estacionamientoService.totalesDelDia(sede(req)));
});

export const getActivos = asyncHandler(async (req, res) => {
  res.json(await estacionamientoService.vehiculosActivos(sede(req), texto(req.query.placa)));
});

export const getHistorial = asyncHandler(async (req, res) => {
  res.json(
    await estacionamientoService.historial({
      idParqueadero: sede(req),
      placa: texto(req.query.placa),
      desde: texto(req.query.desde),
      hasta: texto(req.query.hasta),
    })
  );
});

export const postIngreso = asyncHandler<AuthenticatedRequest>(async (req, res) => {
  const v = validarIngreso(req.body ?? {});
  if (!v.valido || !v.datos) throw badRequest("Revise los campos del formulario", v.errores);
  const registro = await estacionamientoService.registrarIngreso(v.datos, req.usuario!.id_usuario);
  res.status(201).json(registro);
});

export const postSalida = asyncHandler<AuthenticatedRequest>(async (req, res) => {
  const registro = await estacionamientoService.registrarSalida(Number(req.params.idRegistro), req.usuario!.id_usuario);
  res.json(registro);
});

export const getReservas = asyncHandler(async (req, res) => {
  res.json(await estacionamientoService.reservasDeLaSede(sede(req)));
});
