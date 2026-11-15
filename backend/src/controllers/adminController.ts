import { asyncHandler } from "../utils/asyncHandler";
import * as bitacoraRepository from "../repositories/bitacoraRepository";
import { badRequest } from "../errors/AppError";
import { leerFiltrosBitacora } from "../validators/bitacoraValidator";
import { leerFiltrosReporte } from "../validators/reporteValidator";
import * as reporteService from "../services/reporteService";
import { aCsv } from "../utils/csv";
import * as pagoService from "../services/pagoService";
import { METODOS } from "../validators/pagoValidator";
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

/**
 * Reportes (RF13): /api/admin/reportes/ocupacion, /rotacion o /ingresos.
 * Con ?formato=csv descarga el reporte como archivo para Excel.
 */
export const getReporte = asyncHandler(async (req, res) => {
  const tipo = req.params.tipo as reporteService.TipoReporte;
  if (!reporteService.TIPOS_REPORTE.includes(tipo)) throw badRequest("Reporte inválido: use ocupacion, rotacion o ingresos");
  const v = leerFiltrosReporte(req.query as Record<string, unknown>);
  if (!v.valido) throw badRequest("Revise los filtros", v.errores);
  const { columnas, ...reporte } = await reporteService.generar(tipo, v.filtros);
  if (req.query.formato === "csv") {
    const f = v.filtros;
    const nombre = `parkway_${tipo}_${f.desde}_a_${f.hasta}${f.idParqueadero ? `_sede${f.idParqueadero}` : ""}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    return res.send(aCsv(columnas, reporte.filas as unknown[]));
  }
  res.json({ tipo, filtros: v.filtros, ...reporte });
});

// Pagos (RF08) y anulación (RF09)
export const getPagos = asyncHandler(async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const v = leerFiltrosReporte({ desde: q.desde, hasta: q.hasta, idParqueadero: q.idParqueadero });
  if (!v.valido) throw badRequest("Revise los filtros", v.errores);
  const metodo = typeof q.metodo === "string" && q.metodo ? q.metodo.toUpperCase() : undefined;
  const estado = typeof q.estado === "string" && q.estado ? q.estado.toUpperCase() : undefined;
  if (metodo && !(METODOS as readonly string[]).includes(metodo)) throw badRequest("Medio de pago inválido");
  if (estado && !["APROBADO", "ANULADO"].includes(estado)) throw badRequest("Estado inválido");
  const texto = typeof q.q === "string" ? q.q.trim().slice(0, 40) : "";
  res.json(await pagoService.listar({ ...v.filtros, metodo, estado, q: texto || undefined }));
});

export const postAnularPago = asyncHandler<Req>(async (req, res) => {
  res.json(await pagoService.anular(Number(req.params.id), req.body ?? {}, req.usuario!.id_usuario));
});

export const postCobrarDeNuevo = asyncHandler<Req>(async (req, res) => {
  res.status(201).json(await pagoService.cobrarDeNuevo(Number(req.params.id), req.body ?? {}, req.usuario!.id_usuario));
});
