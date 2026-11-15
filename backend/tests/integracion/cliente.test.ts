import "./entorno";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { CHAPINERO, cerrar, CLIENTE1, CLIENTE2, fallaCon, OPERADOR1, reiniciarBase, uno, ZONA_T } from "./base";
import * as cliente from "../../src/services/clienteService";
import * as estacionamiento from "../../src/services/estacionamientoService";
import * as auth from "../../src/services/authService";
import { expirarVencidas } from "../../src/repositories/reservaRepository";

/**
 * Integración de las funciones del cliente: cuenta (RF01), vehículos (RF04),
 * reservas (RF10), estado e historial (RF03) y notificaciones.
 */
before(reiniciarBase);
after(cerrar);

describe("cuenta", () => {
  test("crea la cuenta e inicia la sesión", async () => {
    const s = await auth.registrarCliente({ nombre: "Ana Pérez", documento: "1020304050", correo: "ana@correo.co", contrasena: "clave1234" });
    assert.ok(s.token);
    assert.equal(s.usuario.rol, "CLIENTE");
    const otra = await auth.iniciarSesion("ANA@correo.co", "clave1234");
    assert.equal(otra.usuario.id_usuario, s.usuario.id_usuario);
    await fallaCon(auth.registrarCliente({ nombre: "Otra Ana", documento: "1020304050", correo: "otra@correo.co", contrasena: "clave1234" }), 409);
    await fallaCon(auth.registrarCliente({ nombre: "A", documento: "x", correo: "x", contrasena: "1" }), 400);
  });

  test("rechaza contraseñas incorrectas y usuarios inactivos", async () => {
    await fallaCon(auth.iniciarSesion("cliente1@parkway.test", "mala"), 401);
    await fallaCon(auth.iniciarSesion("nadie@parkway.test", "Cliente123*"), 401);
    await fallaCon(auth.iniciarSesion("", ""), 400);
    await uno("UPDATE usuario SET estado = 'BLOQUEADO' WHERE correo = 'ana@correo.co'");
    await fallaCon(auth.iniciarSesion("ana@correo.co", "clave1234"), 403);
  });
});

describe("vehículos", () => {
  test("registra un carro y una bicicleta con su código", async () => {
    const carro = await cliente.registrarVehiculo(CLIENTE1, { placa: "QWE123", idTipo: 1, marca: "Kia", color: "Azul" });
    assert.equal(carro.placa, "QWE123");
    const bici = await cliente.registrarVehiculo(CLIENTE1, { placa: "", idTipo: 3, color: "Roja" });
    assert.match(bici.placa, /^BICI\d{3}$/);
    const mios = await cliente.misVehiculos(CLIENTE1);
    assert.ok(mios.length >= 4);
    await fallaCon(cliente.registrarVehiculo(CLIENTE2, { placa: "QWE123", idTipo: 1 }), 409);
  });

  test("quita un vehículo propio y no uno ajeno", async () => {
    await fallaCon(cliente.quitarVehiculo(CLIENTE2, "QWE123"), 404);
    await cliente.quitarVehiculo(CLIENTE1, "qwe-123");
    assert.ok(!(await cliente.misVehiculos(CLIENTE1)).some((v: { placa: string }) => v.placa === "QWE123"));
  });
});

describe("reservas", () => {
  let idReserva = 0;

  test("reserva aparta un espacio y lo marca RESERVADO", async () => {
    const r = await cliente.reservar(CLIENTE1, { placa: "ABC123", idParqueadero: CHAPINERO });
    idReserva = r.id_reserva;
    assert.equal(r.estado, "ACTIVA");
    const e = await uno<{ estado: string }>("SELECT estado FROM espacio WHERE id_espacio = $1", [r.id_espacio]);
    assert.equal(e.estado, "RESERVADO");
    await fallaCon(cliente.reservar(CLIENTE1, { placa: "ABC123", idParqueadero: CHAPINERO }), 409, /reserva activa/);
    await fallaCon(cliente.reservar(CLIENTE2, { placa: "ABC123", idParqueadero: CHAPINERO }), 403);
    await fallaCon(cliente.reservar(CLIENTE1, { placa: "", idParqueadero: 0 }), 400);
    await fallaCon(cliente.reservar(CLIENTE1, { placa: "ABC123", idParqueadero: 999 }), 404);
  });

  test("el estado del cliente muestra la reserva", async () => {
    const estado = await cliente.miEstado(CLIENTE1);
    assert.equal(estado.reservas.length, 1);
    assert.equal((await cliente.misReservas(CLIENTE1))[0].id_reserva, idReserva);
    const sede = await estacionamiento.reservasDeLaSede(CHAPINERO);
    assert.equal(sede.length, 1);
  });

  test("al llegar, el vehículo entra al espacio reservado y la reserva se cumple", async () => {
    const reserva = await uno<{ id_espacio: number }>("SELECT id_espacio FROM reserva WHERE id_reserva = $1", [idReserva]);
    const r = await estacionamiento.registrarIngreso({ placa: "ABC123", idTipo: 1, idParqueadero: CHAPINERO }, OPERADOR1);
    assert.equal(r.id_reserva, idReserva);
    const espacio = await uno<{ id_espacio: number }>("SELECT id_espacio FROM registro_estacionamiento WHERE id_registro = $1", [r.id_registro]);
    assert.equal(espacio.id_espacio, reserva.id_espacio);
    const cumplida = await uno<{ estado: string }>("SELECT estado FROM reserva WHERE id_reserva = $1", [idReserva]);
    assert.equal(cumplida.estado, "CUMPLIDA");
    const estado = await cliente.miEstado(CLIENTE1);
    assert.equal(estado.dentro.length, 1);
    await fallaCon(cliente.reservar(CLIENTE1, { placa: "ABC123", idParqueadero: CHAPINERO }), 409, /ya está dentro/);
    await estacionamiento.registrarSalida(r.id_registro, OPERADOR1, { metodo: "EFECTIVO" });
    const historial = await cliente.miHistorial(CLIENTE1);
    assert.equal(historial.length, 1);
    assert.ok(historial[0].comprobante);
  });

  test("cancelar libera el espacio", async () => {
    const r = await cliente.reservar(CLIENTE2, { placa: "XYZ78D", idParqueadero: ZONA_T });
    await fallaCon(cliente.cancelarReserva(CLIENTE1, r.id_reserva), 404);
    const cancelada = await cliente.cancelarReserva(CLIENTE2, r.id_reserva);
    assert.equal(cancelada.estado, "CANCELADA");
    const e = await uno<{ estado: string }>("SELECT estado FROM espacio WHERE id_espacio = $1", [r.id_espacio]);
    assert.equal(e.estado, "LIBRE");
    await fallaCon(cliente.cancelarReserva(CLIENTE2, r.id_reserva), 409, /ya no está activa/);
    await fallaCon(cliente.cancelarReserva(CLIENTE2, 0), 400);
  });

  test("una reserva vencida expira y libera el espacio", async () => {
    const r = await cliente.reservar(CLIENTE2, { placa: "XYZ78D", idParqueadero: ZONA_T });
    await uno("UPDATE reserva SET fecha_inicio = now() - interval '1 hour', fecha_fin = now() - interval '1 minute' WHERE id_reserva = $1", [r.id_reserva]);
    assert.equal(await expirarVencidas(), 1);
    const e = await uno<{ estado: string }>("SELECT estado FROM espacio WHERE id_espacio = $1", [r.id_espacio]);
    assert.equal(e.estado, "LIBRE");
    const bitacora = await uno<{ n: string }>("SELECT count(*) n FROM transaccion WHERE tipo_operacion = 'EXPIRACION'");
    assert.equal(Number(bitacora.n), 1);
  });

  test("no se reserva con la sede cerrada", async () => {
    await uno("UPDATE horario SET abre = '00:00', cierra = '00:01'");
    await fallaCon(cliente.reservar(CLIENTE2, { placa: "XYZ78D", idParqueadero: ZONA_T }), 409);
    await uno("UPDATE horario SET abre = '00:00', cierra = '24:00'");
  });
});

describe("notificaciones", () => {
  test("guarda y lee las preferencias, con valores por defecto", async () => {
    const porDefecto = await cliente.misPreferencias(CLIENTE2);
    assert.equal(porDefecto.cadaMinutos, 30);
    const guardadas = await cliente.guardarPreferencias(CLIENTE2, { ...porDefecto, cadaMinutos: 60, montoAviso: 20000 });
    assert.equal(guardadas.cadaMinutos, 60);
    assert.equal((await cliente.misPreferencias(CLIENTE2)).montoAviso, 20000);
    await fallaCon(cliente.guardarPreferencias(CLIENTE2, { cadaMinutos: 7 }), 400);
  });
});
