import * as vehiculoRepository from "../repositories/vehiculoRepository";
import * as reservaRepository from "../repositories/reservaRepository";
import * as registroRepository from "../repositories/registroRepository";
import * as espacioRepository from "../repositories/espacioRepository";
import * as catalogoRepository from "../repositories/catalogoRepository";
import { transactionManager } from "../transactions/transactionManager";
import { DatosVehiculo, PREFERENCIAS_POR_DEFECTO, validarPreferencias } from "../validators/clienteValidator";
import { normalizarPlaca, TIPOS_VEHICULO } from "../validators/ingresoValidator";
import * as usuarioRepository from "../repositories/usuarioRepository";
import * as horarioService from "./horarioService";
import { calcularMinutos, calcularValor } from "./tarifaService";
import { badRequest, conflict, forbidden, notFound } from "../errors/AppError";

/**
 * Servicio del cliente.
 * - RF04: registrar, consultar y quitar sus vehículos.
 * - RF10: reservar un espacio, consultar y cancelar sus reservas.
 * - RF03: consultar su estado actual y su historial.
 *
 * Una reserva aparta el primer espacio libre del tipo de vehículo en la
 * sede elegida. El cliente tiene RESERVA_MINUTOS para llegar; si no llega,
 * la reserva expira y el espacio vuelve a quedar libre.
 */
export const RESERVA_MINUTOS = Number(process.env.RESERVA_MINUTOS) || 30;

// ---------------------------------------------------------------------
// Vehículos (RF04)
// ---------------------------------------------------------------------
export function misVehiculos(idCliente: number) {
  return vehiculoRepository.listarDelCliente(idCliente);
}

export async function registrarVehiculo(idCliente: number, datos: DatosVehiculo) {
  const placa = await transactionManager.ejecutar(
    idCliente,
    "REGISTRO_VEHICULO",
    "vehiculo",
    async (client) => {
      // Las bicicletas no tienen placa: reciben el siguiente código BICI.
      if (datos.idTipo === TIPOS_VEHICULO.BICICLETA) {
        const codigo = await vehiculoRepository.siguienteCodigoBicicleta(client);
        await vehiculoRepository.crear(client, { ...datos, placa: codigo, idCliente });
        return codigo;
      }
      const existente = await vehiculoRepository.buscarParaActualizar(client, datos.placa);
      if (!existente) {
        await vehiculoRepository.crear(client, { ...datos, idCliente });
        return datos.placa;
      }
      if (existente.id_cliente === idCliente) throw conflict(`La placa ${datos.placa} ya está en su cuenta`);
      if (existente.id_cliente !== null) throw conflict(`La placa ${datos.placa} está registrada por otro cliente`);
      if (existente.id_tipo !== datos.idTipo) throw conflict(`La placa ${datos.placa} está registrada con otro tipo de vehículo`);
      // Vehículo que ya había entrado como visitante: se asocia a la cuenta.
      await vehiculoRepository.asociarCliente(client, { placa: datos.placa, idCliente, marca: datos.marca, color: datos.color });
      return datos.placa;
    },
    { idEntidad: (p) => p, detalle: (p) => ({ placa: p }) }
  );
  return (await vehiculoRepository.listarDelCliente(idCliente)).find((v) => v.placa === placa);
}

export async function quitarVehiculo(idCliente: number, placaTexto: string) {
  const placa = normalizarPlaca(placaTexto);
  await transactionManager.ejecutar(
    idCliente,
    "QUITAR_VEHICULO",
    "vehiculo",
    async (client) => {
      const v = await vehiculoRepository.buscarParaActualizar(client, placa);
      if (!v || v.id_cliente !== idCliente) throw notFound("El vehículo no está en su cuenta");
      if (await registroRepository.buscarAbiertoPorPlaca(client, placa)) {
        throw conflict("No puede quitar un vehículo que está dentro del parqueadero");
      }
      if (await reservaRepository.activaPorPlaca(client, placa)) {
        throw conflict("Cancele primero la reserva activa de este vehículo");
      }
      await vehiculoRepository.desasociarCliente(client, placa);
      return placa;
    },
    { idEntidad: (p) => p }
  );
}

// ---------------------------------------------------------------------
// Reservas (RF10)
// ---------------------------------------------------------------------
export async function reservar(idCliente: number, body: Record<string, unknown>) {
  const placa = normalizarPlaca(body.placa);
  const idParqueadero = Number(body.idParqueadero);
  const errores: Record<string, string> = {};
  if (!placa) errores.placa = "Seleccione el vehículo";
  if (!Number.isInteger(idParqueadero) || idParqueadero <= 0) errores.idParqueadero = "Seleccione la sede";
  if (Object.keys(errores).length) throw badRequest("Revise los campos del formulario", errores);
  if (!(await catalogoRepository.existeParqueadero(idParqueadero))) throw notFound("La sede no existe");

  // Solo se reserva con la sede abierta y si el plazo termina antes del cierre.
  const horarios = await horarioService.horariosDe(idParqueadero);
  const { dia, minuto } = horarioService.ahoraLocal();
  const motivo = horarioService.motivoParaNoReservar(horarios, dia, minuto, RESERVA_MINUTOS);
  if (motivo) throw conflict(motivo);

  await reservaRepository.expirarVencidas();

  const reserva = await transactionManager.ejecutar(
    idCliente,
    "RESERVA",
    "reserva",
    async (client) => {
      // Bloquear el vehículo serializa las reservas de una misma placa.
      const v = await vehiculoRepository.buscarParaActualizar(client, placa);
      if (!v || v.id_cliente !== idCliente) throw forbidden("Ese vehículo no está registrado en su cuenta");
      if (await reservaRepository.activaPorPlaca(client, placa)) {
        throw conflict(`El vehículo ${placa} ya tiene una reserva activa`);
      }
      if (await registroRepository.buscarAbiertoPorPlaca(client, placa)) {
        throw conflict(`El vehículo ${placa} ya está dentro del parqueadero`);
      }
      const espacio = await espacioRepository.tomarPrimerLibre(client, idParqueadero, v.id_tipo);
      if (!espacio) throw conflict("No hay espacios libres para este tipo de vehículo en la sede");

      const nueva = await reservaRepository.crear(client, {
        idCliente,
        idEspacio: espacio.id_espacio,
        placa,
        minutos: RESERVA_MINUTOS,
      });
      await espacioRepository.actualizarEstado(client, espacio.id_espacio, "RESERVADO");
      return { ...nueva, codigo_espacio: espacio.codigo };
    },
    {
      idEntidad: (r) => r.id_reserva,
      detalle: (r) => ({ placa: r.placa, espacio: r.codigo_espacio }),
    }
  );
  return reservaRepository.obtener(reserva.id_reserva);
}

export async function cancelarReserva(idCliente: number, idReserva: number) {
  if (!Number.isInteger(idReserva) || idReserva <= 0) throw badRequest("Reserva inválida");
  await transactionManager.ejecutar(
    idCliente,
    "CANCELAR_RESERVA",
    "reserva",
    async (client) => {
      const r = await reservaRepository.bloquear(client, idReserva);
      if (!r || r.id_cliente !== idCliente) throw notFound("La reserva no existe");
      if (r.estado !== "ACTIVA") throw conflict("La reserva ya no está activa");
      await reservaRepository.cambiarEstado(client, idReserva, "CANCELADA");
      const e = await espacioRepository.bloquearParaAsignacion(client, r.id_espacio);
      if (e?.estado === "RESERVADO") await espacioRepository.actualizarEstado(client, r.id_espacio, "LIBRE");
      return r;
    },
    { idEntidad: (r) => r.id_reserva }
  );
  return reservaRepository.obtener(idReserva);
}

export async function misReservas(idCliente: number) {
  await reservaRepository.expirarVencidas();
  return reservaRepository.delCliente(idCliente);
}

// ---------------------------------------------------------------------
// Estado actual e historial (RF03)
// ---------------------------------------------------------------------
export async function miEstado(idCliente: number) {
  await reservaRepository.expirarVencidas();
  const ahora = new Date();
  const [dentro, reservas] = await Promise.all([
    registroRepository.delCliente(idCliente, "ABIERTO"),
    reservaRepository.activasDelCliente(idCliente),
  ]);
  return {
    ahora: ahora.toISOString(),
    minutosReserva: RESERVA_MINUTOS,
    dentro: dentro.map((r) => {
      const minutos = calcularMinutos(new Date(r.fecha_ingreso), ahora);
      return { ...r, minutos_transcurridos: minutos, valor_estimado: r.valor_hora != null ? calcularValor(minutos, r) : null };
    }),
    reservas,
  };
}

export function miHistorial(idCliente: number) {
  return registroRepository.delCliente(idCliente, "CERRADO");
}

// ---------------------------------------------------------------------
// Preferencias de notificación
// ---------------------------------------------------------------------
export async function misPreferencias(idCliente: number) {
  const p = await usuarioRepository.preferencias(idCliente);
  return { ...PREFERENCIAS_POR_DEFECTO, ...((p.notificaciones as object) ?? {}) };
}

export async function guardarPreferencias(idCliente: number, body: Record<string, unknown>) {
  const v = validarPreferencias(body);
  if (!v.valido) throw badRequest("Revise los campos del formulario", v.errores);
  await usuarioRepository.guardarPreferencias(idCliente, "notificaciones", v.datos);
  return v.datos;
}
