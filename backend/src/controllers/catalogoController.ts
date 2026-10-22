import { asyncHandler } from "../utils/asyncHandler";
import * as catalogoRepository from "../repositories/catalogoRepository";
import * as horarioRepository from "../repositories/horarioRepository";
import * as horarioService from "../services/horarioService";
import { notFound } from "../errors/AppError";

/** Sedes con su horario, si están abiertas ahora y sus tarifas vigentes. */
export const getParqueaderos = asyncHandler(async (_req, res) => {
  const [sedes, horarios, tarifas] = await Promise.all([
    catalogoRepository.listarParqueaderos(),
    horarioRepository.listarTodos(),
    catalogoRepository.tarifasVigentes(),
  ]);
  const { dia, minuto } = horarioService.ahoraLocal();
  res.json(
    sedes.map((s) => {
      const h = horarios.get(s.id_parqueadero) ?? [];
      const estado = horarioService.estadoEn(h, dia, minuto);
      return {
        ...s,
        horarios: h,
        abierto: estado.abierto,
        estado_horario: estado.mensaje,
        tarifas: tarifas.filter((t) => t.id_parqueadero === s.id_parqueadero),
      };
    })
  );
});

/** Estado del horario de una sede ahora mismo (para el formulario de reserva). */
export const getHorario = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await catalogoRepository.existeParqueadero(id))) throw notFound("La sede no existe");
  res.json(await horarioService.estadoActual(id));
});

export const getTiposVehiculo = asyncHandler(async (req, res) => {
  const id = Number(req.query.idParqueadero);
  res.json(await catalogoRepository.listarTiposVehiculo(Number.isInteger(id) && id > 0 ? id : undefined));
});
