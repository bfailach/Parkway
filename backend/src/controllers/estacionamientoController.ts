import { Request, Response } from "express";
import * as estacionamientoService from "../services/estacionamientoService";

export async function getDisponibilidad(req: Request, res: Response) {
  try {
    const idParqueadero = Number(req.query.idParqueadero);
    const idTipo = Number(req.query.idTipo);

    if (!idParqueadero || !idTipo) {
      return res.status(400).json({ error: "idParqueadero e idTipo son requeridos" });
    }

    const espacios = await estacionamientoService.consultarDisponibilidad(idParqueadero, idTipo);
    return res.status(200).json(espacios);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return res.status(500).json({ error: "Error al consultar disponibilidad" });
  }
}
