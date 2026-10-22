import * as espacioRepository from "../repositories/espacioRepository";
import * as vehiculoRepository from "../repositories/vehiculoRepository";
import * as registroRepository from "../repositories/registroRepository";
import * as catalogoRepository from "../repositories/catalogoRepository";
import * as reservaRepository from "../repositories/reservaRepository";
import { transactionManager } from "../transactions/transactionManager";
import { DatosIngreso } from "../validators/ingresoValidator";
import { calcularMinutos, calcularValor } from "./tarifaService";
import { badRequest, conflict, notFound } from "../errors/AppError";
import { UsuarioToken } from "../middlewares/auth";
import { verificarAcceso } from "./accesoService";
import { FiltrosHistorial } from "../repositories/registroRepository";
import { normalizarPlaca, TIPOS_VEHICULO } from "../validators/ingresoValidator";

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

export async function planoPublico(idParqueadero: number) {
  await validarSede(idParqueadero);
  return espacioRepository.listarPlano(idParqueadero);
}

export async function reservasDeLaSede(idParqueadero: number) {
  await validarSede(idParqueadero);
  await reservaRepository.expirarVencidas();
  return reservaRepository.deLaSede(idParqueadero);
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

export type FiltrosHistorialEntrada = Omit<FiltrosHistorial, "limite"> & { agrupar?: string };

export async function historial(f: FiltrosHistorialEntrada) {
  await validarSede(f.idParqueadero);
  const fecha = /^\d{4}-\d{2}-\d{2}$/;
  if (f.desde && !fecha.test(f.desde)) throw badRequest("Fecha 'desde' inválida (AAAA-MM-DD)");
  if (f.hasta && !fecha.test(f.hasta)) throw badRequest("Fecha 'hasta' inválida (AAAA-MM-DD)");
  if (f.desde && f.hasta && f.desde > f.hasta) throw badRequest("La fecha inicial debe ser anterior a la final");
  for (const [k, v] of Object.entries({ minutosMin: f.minutosMin, minutosMax: f.minutosMax, valorMin: f.valorMin, valorMax: f.valorMax })) {
    if (v != null && (!Number.isFinite(v) || v < 0)) throw badRequest(`Filtro '${k}' inválido`);
  }
  if (f.minutosMin != null && f.minutosMax != null && f.minutosMin > f.minutosMax) throw badRequest("El tiempo mínimo supera al máximo");
  if (f.valorMin != null && f.valorMax != null && f.valorMin > f.valorMax) throw badRequest("El valor mínimo supera al máximo");
  if (f.orden && !["fecha", "valor", "tiempo"].includes(f.orden)) throw badRequest("Orden inválido");
  const filtros = { ...f, placa: f.placa ? normalizarPlaca(f.placa) : undefined, limite: 300 };
  return f.agrupar === "vehiculo" ? registroRepository.historialPorVehiculo(filtros) : registroRepository.listarHistorial(filtros);
}

// ---------------------------------------------------------------------
// Vehículos registrados: el operador los busca para el ingreso
// ---------------------------------------------------------------------
export function buscarVehiculos(texto: string, idTipo?: number) {
  const q = normalizarPlaca(texto);
  if (q.length < 2) return Promise.resolve([]);
  return vehiculoRepository.buscar(q, idTipo);
}

export async function vehiculoPorPlaca(placa: string) {
  const v = await vehiculoRepository.obtenerConDueno(normalizarPlaca(placa));
  if (!v) throw notFound("No hay un vehículo registrado con esa placa o código");
  return v;
}

// ---------------------------------------------------------------------
// RF06 - Registrar ingreso
// ---------------------------------------------------------------------
export async function registrarIngreso(datos: DatosIngreso, usuario: UsuarioToken) {
  await validarSede(datos.idParqueadero);
  await verificarAcceso(usuario, datos.idParqueadero);
  await reservaRepository.expirarVencidas();
  const idOperador = usuario.id_usuario;

  const registro = await transactionManager.ejecutar(
    idOperador,
    "INGRESO",
    "registro_estacionamiento",
    async (client) => {
      // 1. Vehículo.
      //    Bicicletas: se buscan por su código. Una bicicleta sin registro
      //    recibe un código nuevo (BICI001...) en esta misma transacción.
      //    Carros y motos: se crean si no existen. Si existen, el tipo debe
      //    coincidir y se actualizan marca y color con lo que confirmó el
      //    operador (el formulario trae los datos guardados).
      const esBicicleta = datos.idTipo === TIPOS_VEHICULO.BICICLETA;
      if (esBicicleta && datos.generarCodigo) {
        datos = { ...datos, placa: await vehiculoRepository.siguienteCodigoBicicleta(client) };
        await vehiculoRepository.crear(client, datos);
      } else {
        const vehiculo = await vehiculoRepository.buscarParaActualizar(client, datos.placa);
        if (!vehiculo && esBicicleta) {
          throw notFound(`No hay ninguna bicicleta con el código ${datos.placa}. Búsquela de nuevo o genere un código.`);
        }
        if (!vehiculo) {
          await vehiculoRepository.crear(client, datos);
        } else {
          if (vehiculo.id_tipo !== datos.idTipo) {
            throw conflict(`La placa ${datos.placa} está registrada con otro tipo de vehículo`);
          }
          await vehiculoRepository.actualizarDatos(client, datos.placa, datos.marca, datos.color);
        }
      }

      // 2. No puede haber dos ingresos abiertos para la misma placa.
      if (await registroRepository.buscarAbiertoPorPlaca(client, datos.placa)) {
        throw conflict(`El vehículo ${datos.placa} ya se encuentra dentro del parqueadero`);
      }

      // 3. Espacio: el reservado por el cliente, el elegido por el operador
      //    o el primer libre del tipo.
      let espacio;
      let idReserva: number | undefined;
      const reserva = await reservaRepository.activaPorPlaca(client, datos.placa);
      if (reserva && reserva.id_parqueadero !== datos.idParqueadero) {
        // El vehículo llegó a otra sede: la reserva ya no se usará.
        await reservaRepository.cambiarEstado(client, reserva.id_reserva, "CANCELADA");
        const apartado = await espacioRepository.bloquearParaAsignacion(client, reserva.id_espacio);
        if (apartado?.estado === "RESERVADO") await espacioRepository.actualizarEstado(client, reserva.id_espacio, "LIBRE");
      }
      if (reserva && reserva.id_parqueadero === datos.idParqueadero) {
        espacio = await espacioRepository.bloquearParaAsignacion(client, reserva.id_espacio);
        if (!espacio || espacio.estado !== "RESERVADO") throw conflict("El espacio de la reserva no está disponible");
        await reservaRepository.cambiarEstado(client, reserva.id_reserva, "CUMPLIDA");
        idReserva = reserva.id_reserva;
      } else if (datos.idEspacio) {
        espacio = await espacioRepository.bloquearParaAsignacion(client, datos.idEspacio);
        if (!espacio || espacio.id_parqueadero !== datos.idParqueadero) throw notFound("El espacio no existe en esta sede");
        if (espacio.id_tipo !== datos.idTipo) throw conflict(`El espacio ${espacio.codigo} no corresponde al tipo de vehículo`);
        if (espacio.estado !== "LIBRE") throw conflict(`El espacio ${espacio.codigo} no está libre`);
      } else {
        espacio = await espacioRepository.tomarPrimerLibre(client, datos.idParqueadero, datos.idTipo);
        if (!espacio) throw conflict("No hay espacios libres para este tipo de vehículo en la sede");
      }

      // 4. Tarifa vigente de la sede para el tipo de vehículo.
      const tarifa = await catalogoRepository.tarifaActiva(client, datos.idParqueadero, datos.idTipo);
      if (!tarifa) throw conflict("La sede no tiene una tarifa activa para este tipo de vehículo");

      // 5. Abrir el registro y ocupar el espacio.
      const nuevo = await registroRepository.crearIngreso(client, {
        placa: datos.placa,
        idEspacio: espacio.id_espacio,
        idTarifa: tarifa.id_tarifa,
        idOperador,
        idReserva,
      });
      await espacioRepository.actualizarEstado(client, espacio.id_espacio, "OCUPADO");

      return { ...nuevo, codigo_espacio: espacio.codigo };
    },
    {
      idEntidad: (r) => r.id_registro,
      detalle: (r) => ({ placa: r.placa, espacio: r.codigo_espacio, reserva: r.id_reserva ?? null }),
    }
  );

  return registroRepository.obtenerDetalle(registro.id_registro);
}

// ---------------------------------------------------------------------
// RF07 - Registrar salida
// ---------------------------------------------------------------------
export async function registrarSalida(idRegistro: number, usuario: UsuarioToken) {
  if (!Number.isInteger(idRegistro) || idRegistro <= 0) throw badRequest("Registro inválido");
  const idOperador = usuario.id_usuario;

  await transactionManager.ejecutar(
    idOperador,
    "SALIDA",
    "registro_estacionamiento",
    async (client) => {
      const r = await registroRepository.bloquearConTarifa(client, idRegistro);
      if (!r) throw notFound("El registro no existe");
      await verificarAcceso(usuario, r.id_parqueadero);
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
