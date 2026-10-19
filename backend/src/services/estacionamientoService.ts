import * as espacioRepository from "../repositories/espacioRepository";
import * as vehiculoRepository from "../repositories/vehiculoRepository";
import * as registroRepository from "../repositories/registroRepository";
import * as catalogoRepository from "../repositories/catalogoRepository";
import { transactionManager } from "../transactions/transactionManager";
import { DatosIngreso } from "../validators/ingresoValidator";
import { calcularMinutos, calcularValor } from "./tarifaService";
import { badRequest, conflict, notFound } from "../errors/AppError";

/**
 * Servicio de Estacionamiento (capa de lógica de negocio).
 * Las operaciones que modifican datos se ejecutan dentro de una unidad de
 * trabajo del TransactionManager, que confirma o revierte todo junto y
 * deja la operación en la bitácora.
 */

async function validarSede(idParqueadero: number) {
  if (!Number.isInteger(idParqueadero) || idParqueadero <= 0) throw badRequest("Seleccione la sede");
  if (!(await catalogoRepository.existeParqueadero(idParqueadero))) throw notFound("La sede no existe");
}

// ---------------------------------------------------------------------
// Consultas (RF05)
// ---------------------------------------------------------------------
export async function consultarDisponibilidad(idParqueadero: number, idTipo: number) {
  return espacioRepository.listarDisponibles(idParqueadero, idTipo);
}

export async function resumen(idParqueadero: number) {
  await validarSede(idParqueadero);
  const porTipo = await espacioRepository.resumenPorTipo(idParqueadero);
  const totales = porTipo.reduce(
    (acc, t) => ({
      total: acc.total + t.total,
      libres: acc.libres + t.libres,
      ocupados: acc.ocupados + t.ocupados,
      fuera_de_servicio: acc.fuera_de_servicio + t.fuera_de_servicio,
    }),
    { total: 0, libres: 0, ocupados: 0, fuera_de_servicio: 0 }
  );
  return { idParqueadero, actualizado: new Date().toISOString(), totales, porTipo };
}

export async function mapaEspacios(idParqueadero: number) {
  await validarSede(idParqueadero);
  return espacioRepository.listarConOcupacion(idParqueadero);
}

export async function totalesDelDia(idParqueadero: number) {
  await validarSede(idParqueadero);
  return registroRepository.totalesDelDia(idParqueadero);
}

/** Vehículos dentro del parqueadero con el valor acumulado hasta ahora. */
export async function vehiculosActivos(idParqueadero: number, placa?: string) {
  await validarSede(idParqueadero);
  const ahora = new Date();
  const filas = await registroRepository.listarActivos(idParqueadero, placa?.toUpperCase());
  return filas.map((r) => {
    const minutos = calcularMinutos(new Date(r.fecha_ingreso), ahora);
    const valor_estimado = r.valor_hora != null ? calcularValor(minutos, r) : null;
    return { ...r, minutos_transcurridos: minutos, valor_estimado };
  });
}

export async function historial(f: { idParqueadero: number; placa?: string; desde?: string; hasta?: string }) {
  await validarSede(f.idParqueadero);
  const fecha = /^\d{4}-\d{2}-\d{2}$/;
  if (f.desde && !fecha.test(f.desde)) throw badRequest("Fecha 'desde' inválida (AAAA-MM-DD)");
  if (f.hasta && !fecha.test(f.hasta)) throw badRequest("Fecha 'hasta' inválida (AAAA-MM-DD)");
  return registroRepository.listarHistorial({ ...f, placa: f.placa?.toUpperCase(), limite: 200 });
}

// ---------------------------------------------------------------------
// RF06 - Registrar ingreso
// ---------------------------------------------------------------------
export async function registrarIngreso(datos: DatosIngreso, idOperador: number) {
  await validarSede(datos.idParqueadero);

  const registro = await transactionManager.ejecutar(
    idOperador,
    "INGRESO",
    "registro_estacionamiento",
    async (client) => {
      // 1. Vehículo: se crea si no existe. Si existe, el tipo debe coincidir.
      const vehiculo = await vehiculoRepository.buscarParaActualizar(client, datos.placa);
      if (!vehiculo) {
        await vehiculoRepository.crear(client, datos);
      } else {
        if (vehiculo.id_tipo !== datos.idTipo) {
          throw conflict(`La placa ${datos.placa} está registrada con otro tipo de vehículo`);
        }
        await vehiculoRepository.completarDatos(client, datos.placa, datos.marca, datos.color);
      }

      // 2. No puede haber dos ingresos abiertos para la misma placa.
      if (await registroRepository.buscarAbiertoPorPlaca(client, datos.placa)) {
        throw conflict(`El vehículo ${datos.placa} ya se encuentra dentro del parqueadero`);
      }

      // 3. Espacio: el elegido por el operador o el primer libre del tipo.
      let espacio;
      if (datos.idEspacio) {
        espacio = await espacioRepository.bloquearParaAsignacion(client, datos.idEspacio);
        if (!espacio || espacio.id_parqueadero !== datos.idParqueadero) throw notFound("El espacio no existe en esta sede");
        if (espacio.id_tipo !== datos.idTipo) throw conflict(`El espacio ${espacio.codigo} no corresponde al tipo de vehículo`);
        if (espacio.estado !== "LIBRE") throw conflict(`El espacio ${espacio.codigo} no está libre`);
      } else {
        espacio = await espacioRepository.tomarPrimerLibre(client, datos.idParqueadero, datos.idTipo);
        if (!espacio) throw conflict("No hay espacios libres para este tipo de vehículo en la sede");
      }

      // 4. Tarifa vigente del tipo de vehículo.
      const tarifa = await catalogoRepository.tarifaActiva(client, datos.idTipo);
      if (!tarifa) throw conflict("No hay una tarifa activa para este tipo de vehículo");

      // 5. Abrir el registro y ocupar el espacio.
      const nuevo = await registroRepository.crearIngreso(client, {
        placa: datos.placa,
        idEspacio: espacio.id_espacio,
        idTarifa: tarifa.id_tarifa,
        idOperador,
      });
      await espacioRepository.actualizarEstado(client, espacio.id_espacio, "OCUPADO");

      return { ...nuevo, codigo_espacio: espacio.codigo };
    },
    {
      idEntidad: (r) => r.id_registro,
      detalle: (r) => ({ placa: r.placa, espacio: r.codigo_espacio }),
    }
  );

  return registroRepository.obtenerDetalle(registro.id_registro);
}

// ---------------------------------------------------------------------
// RF07 - Registrar salida
// ---------------------------------------------------------------------
export async function registrarSalida(idRegistro: number, idOperador: number) {
  if (!Number.isInteger(idRegistro) || idRegistro <= 0) throw badRequest("Registro inválido");

  await transactionManager.ejecutar(
    idOperador,
    "SALIDA",
    "registro_estacionamiento",
    async (client) => {
      const r = await registroRepository.bloquearConTarifa(client, idRegistro);
      if (!r) throw notFound("El registro no existe");
      if (r.estado !== "ABIERTO") throw conflict(`El vehículo ${r.placa} ya registró su salida`);
      if (r.valor_hora == null) throw conflict("El registro no tiene tarifa asociada");

      const fechaSalida = new Date(r.ahora);
      const minutos = calcularMinutos(new Date(r.fecha_ingreso), fechaSalida);
      const valor = calcularValor(minutos, r);

      const cerrado = await registroRepository.cerrar(client, { idRegistro, idOperador, fechaSalida, minutos, valor });
      await espacioRepository.actualizarEstado(client, r.id_espacio, "LIBRE");
      return cerrado;
    },
    {
      idEntidad: (r) => r.id_registro,
      detalle: (r) => ({ placa: r.placa, minutos: r.minutos, valor: Number(r.valor_calculado) }),
    }
  );

  return registroRepository.obtenerDetalle(idRegistro);
}
