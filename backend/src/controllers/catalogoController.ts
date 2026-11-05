import { asyncHandler } from "../utils/asyncHandler";
import * as catalogoRepository from "../repositories/catalogoRepository";
import * as horarioRepository from "../repositories/horarioRepository";
import * as horarioService from "../services/horarioService";
import { notFound } from "../errors/AppError";
import * as prediccionService from "../services/prediccionService";
import pesosRed from "../ia/pesos_red.json";

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

/**
 * Ocupación esperada de la sede dentro de una hora, calculada por la red
 * neuronal (sección 14). ?idTipo=1 la limita a un tipo de vehículo.
 * Si la sede va a estar casi llena, incluye una sede alternativa.
 */
export const getPrediccion = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await catalogoRepository.existeParqueadero(id))) throw notFound("La sede no existe");
  const tipo = Number(req.query.idTipo);
  const p = await prediccionService.predecirConAlternativa(id, Number.isInteger(tipo) && tipo > 0 ? tipo : null);
  if (!p) throw notFound("La sede no tiene espacios para ese tipo de vehículo");
  res.json(p);
});

/** Pesos y métricas de la red, para el simulador de la página "Red neuronal". */
export const getRed = asyncHandler(async (_req, res) => {
  res.json({ ...pesosRed, umbralAlerta: prediccionService.UMBRAL_ALERTA });
});
