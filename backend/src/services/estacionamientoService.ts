import * as espacioRepository from "../repositories/espacioRepository";

/**
 * Servicio de Estacionamiento (capa de lógica de negocio).
 * En esta fase inicial se implementa únicamente la consulta de
 * disponibilidad como ejemplo funcional de extremo a extremo
 * (controlador -> servicio -> repositorio -> base de datos).
 * Las operaciones transaccionales (registrar ingreso, registrar salida,
 * procesar pago) se construirán sobre el TransactionManager en fases
 * posteriores.
 */
export async function consultarDisponibilidad(idParqueadero: number, idTipo: number) {
  return espacioRepository.listarDisponibles(idParqueadero, idTipo);
}
