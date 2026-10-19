import { asyncHandler } from "../utils/asyncHandler";
import * as catalogoRepository from "../repositories/catalogoRepository";

export const getParqueaderos = asyncHandler(async (_req, res) => {
  res.json(await catalogoRepository.listarParqueaderos());
});

export const getTiposVehiculo = asyncHandler(async (_req, res) => {
  res.json(await catalogoRepository.listarTiposVehiculo());
});
