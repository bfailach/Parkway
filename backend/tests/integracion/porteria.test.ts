import "./entorno";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN, CHAPINERO, cerrar, fallaCon, OPERADOR1, OPERADOR2, reiniciarBase, uno, ZONA_T } from "./base";
import * as estacionamiento from "../../src/services/estacionamientoService";
import * as pagos from "../../src/services/pagoService";
import * as acceso from "../../src/services/accesoService";

/**
 * Integración de la portería contra PostgreSQL: ingreso (RF06), salida con
 * pago (RF07, RF08), anulación y nuevo cobro (RF09), acceso por sede y las
 * consultas del personal.
 */
before(reiniciarBase);
after(cerrar);

const auto = (placa: string, idParqueadero = CHAPINERO) => ({ placa, idTipo: 1, idParqueadero });

describe("ingreso", () => {
  test("asigna el primer espacio libre del piso 1 y ocupa el espacio", async () => {
    const r = await estacionamiento.registrarIngreso({ ...auto("AAA111"), marca: "Kia", color: "Rojo" }, OPERADOR1);
    assert.equal(r.placa, "AAA111");
    assert.equal(r.estado, "ABIERTO");
    assert.equal(r.codigo_espacio, "A-01");
    const e = await uno<{ estado: string }>("SELECT estado FROM espacio WHERE codigo = 'A-01' AND id_parqueadero = $1", [CHAPINERO]);
    assert.equal(e.estado, "OCUPADO");
    const v = await estacionamiento.vehiculoPorPlaca("AAA111");
    assert.equal(v.marca, "Kia");
  });

  test("rechaza un segundo ingreso de la misma placa", async () => {
    await fallaCon(estacionamiento.registrarIngreso(auto("AAA111"), OPERADOR1), 409, /ya se encuentra dentro/);
  });

  test("rechaza un tipo de vehículo distinto al registrado", async () => {
    await fallaCon(estacionamiento.registrarIngreso({ placa: "ABC123", idTipo: 2, idParqueadero: CHAPINERO }, OPERADOR1), 409);
  });

  test("un operador solo trabaja en las sedes asignadas", async () => {
    await fallaCon(estacionamiento.registrarIngreso(auto("BBB222"), OPERADOR2), 403, /No tiene acceso/);
    assert.deepEqual(await acceso.sedesPermitidas(OPERADOR2), [ZONA_T]);
    assert.equal(await acceso.sedesPermitidas(ADMIN), "todas");
    assert.equal((await acceso.misSedes(OPERADOR2)).length, 1);
    assert.equal((await acceso.misSedes(ADMIN)).length, 2);
  });

  test("una bicicleta sin registro recibe un código nuevo", async () => {
    const r = await estacionamiento.registrarIngreso({ placa: "", idTipo: 3, idParqueadero: CHAPINERO, generarCodigo: true }, OPERADOR1);
    assert.match(r.placa, /^BICI\d{3}$/);
    const encontrados = await estacionamiento.buscarVehiculos("BICI", 3);
    assert.ok(encontrados.some((v: { placa: string }) => v.placa === r.placa));
  });

  test("sin espacios libres responde 409", async () => {
    // Zona T tiene 4 espacios de moto.
    for (const p of ["MOA10A", "MOB20B", "MOC30C", "MOD40D"]) {
      await estacionamiento.registrarIngreso({ placa: p, idTipo: 2, idParqueadero: ZONA_T }, OPERADOR2);
    }
    await fallaCon(estacionamiento.registrarIngreso({ placa: "MOE50E", idTipo: 2, idParqueadero: ZONA_T }, OPERADOR2), 409, /No hay espacios/);
  });

  test("la sede debe existir", async () => {
    await fallaCon(estacionamiento.registrarIngreso(auto("CCC333", 999), ADMIN), 404);
  });
});

describe("consultas del personal", () => {
  test("resumen, disponibilidad, plano y vehículos dentro", async () => {
    const r = await estacionamiento.resumen(CHAPINERO);
    const autos = r.porTipo.find((t: { id_tipo: number }) => t.id_tipo === 1)!;
    assert.ok(autos.ocupados >= 1);
    assert.equal(r.totales.total, r.porTipo.reduce((a: number, t: { total: number }) => a + t.total, 0));
    const libres = await estacionamiento.consultarDisponibilidad(CHAPINERO, 1);
    assert.ok(libres.length > 0);
    const plano = await estacionamiento.planoPublico(CHAPINERO);
    assert.ok(plano.every((e: Record<string, unknown>) => !("placa" in e) || e.placa === undefined));
    const mapa = await estacionamiento.mapaEspacios(CHAPINERO);
    assert.ok(mapa.some((e: { placa: string | null }) => e.placa === "AAA111"));
    const activos = await estacionamiento.vehiculosActivos(CHAPINERO, "aaa");
    assert.equal(activos.length, 1);
    assert.ok(activos[0].valor_estimado > 0);
    await fallaCon(estacionamiento.resumen(999), 404);
  });
});

describe("salida con pago", () => {
  let idEfectivo = 0;
  let idTarjeta = 0;

  test("efectivo: cierra el registro, libera el espacio y emite el comprobante con el cambio", async () => {
    const abierto = await uno<{ id_registro: number; id_espacio: number }>("SELECT id_registro, id_espacio FROM registro_estacionamiento WHERE placa = 'AAA111'");
    const r = await estacionamiento.registrarSalida(abierto.id_registro, OPERADOR1, { metodo: "EFECTIVO", recibido: 50000 });
    idEfectivo = r.id_pago;
    assert.equal(r.estado, "CERRADO");
    assert.match(r.comprobante, /^PKW-\d{4}-000001$/);
    assert.equal(r.metodo_pago, "EFECTIVO");
    assert.equal(r.cambio, 50000 - r.valor_calculado);
    const e = await uno<{ estado: string }>("SELECT estado FROM espacio WHERE id_espacio = $1", [abierto.id_espacio]);
    assert.equal(e.estado, "LIBRE");
    const b = await uno<{ n: string }>("SELECT count(*) n FROM transaccion WHERE tipo_operacion IN ('SALIDA', 'PAGO') AND estado = 'CONFIRMADA'");
    assert.equal(Number(b.n), 2);
  });

  test("no deja dar dos veces la salida", async () => {
    const id = (await uno<{ id_registro: number }>("SELECT id_registro FROM registro_estacionamiento WHERE placa = 'AAA111'")).id_registro;
    await fallaCon(estacionamiento.registrarSalida(id, OPERADOR1, { metodo: "EFECTIVO" }), 409, /ya registró su salida/);
  });

  test("si el efectivo no alcanza, no cierra nada", async () => {
    const r = await estacionamiento.registrarIngreso(auto("DDD444"), OPERADOR1);
    await fallaCon(estacionamiento.registrarSalida(r.id_registro, OPERADOR1, { metodo: "EFECTIVO", recibido: 100 }), 409, /valor a pagar/);
    const sigue = await uno<{ estado: string }>("SELECT estado FROM registro_estacionamiento WHERE id_registro = $1", [r.id_registro]);
    assert.equal(sigue.estado, "ABIERTO");
    const revertida = await uno<{ n: string }>("SELECT count(*) n FROM transaccion WHERE tipo_operacion = 'SALIDA' AND estado = 'REVERTIDA'");
    assert.ok(Number(revertida.n) >= 1);
  });

  test("tarjeta: la misma aprobación no se registra dos veces", async () => {
    const d = await uno<{ id_registro: number }>("SELECT id_registro FROM registro_estacionamiento WHERE placa = 'DDD444'");
    const r = await estacionamiento.registrarSalida(d.id_registro, OPERADOR1, { metodo: "TARJETA", referencia: "482913" });
    idTarjeta = r.id_pago;
    const otro = await estacionamiento.registrarIngreso(auto("EEE555"), OPERADOR1);
    await fallaCon(estacionamiento.registrarSalida(otro.id_registro, OPERADOR1, { metodo: "TARJETA", referencia: "482913" }), 409);
    const sigue = await uno<{ estado: string }>("SELECT estado FROM registro_estacionamiento WHERE id_registro = $1", [otro.id_registro]);
    assert.equal(sigue.estado, "ABIERTO");
    await estacionamiento.registrarSalida(otro.id_registro, OPERADOR1, { metodo: "TRANSFERENCIA", referencia: "nq-1" });
  });

  test("exige el medio de pago", async () => {
    await fallaCon(estacionamiento.registrarSalida(1, OPERADOR1, {}), 400);
    await fallaCon(estacionamiento.registrarSalida(0, OPERADOR1, { metodo: "EFECTIVO" }), 400);
    await fallaCon(estacionamiento.registrarSalida(99999, OPERADOR1, { metodo: "EFECTIVO" }), 404);
  });

  test("anular deja el pago ANULADO con su motivo y permite cobrar de nuevo", async () => {
    await fallaCon(pagos.anular(idTarjeta, { motivo: "corto" }, ADMIN.id_usuario), 400);
    const anulado = await pagos.anular(idTarjeta, { motivo: "El datáfono rechazó la tarjeta" }, ADMIN.id_usuario);
    assert.equal(anulado.estado, "ANULADO");
    assert.equal(anulado.anulado_por, "Admin General");
    assert.equal(anulado.sin_pago_vigente, true);
    await fallaCon(pagos.anular(idTarjeta, { motivo: "El datáfono rechazó la tarjeta" }, ADMIN.id_usuario), 409, /ya estaba anulado/);
    await fallaCon(pagos.anular(999999, { motivo: "No existe este pago" }, ADMIN.id_usuario), 404);

    const nuevo = await pagos.cobrarDeNuevo(anulado.id_registro, { metodo: "EFECTIVO" }, ADMIN.id_usuario);
    assert.equal(nuevo.estado, "APROBADO");
    assert.notEqual(nuevo.comprobante, anulado.comprobante);
    await fallaCon(pagos.cobrarDeNuevo(anulado.id_registro, { metodo: "EFECTIVO" }, ADMIN.id_usuario), 409, /ya tiene un pago aprobado/);
    await fallaCon(pagos.cobrarDeNuevo(999999, { metodo: "EFECTIVO" }, ADMIN.id_usuario), 404);
  });

  test("no se cobra de nuevo una visita que sigue dentro", async () => {
    const r = await estacionamiento.registrarIngreso(auto("FFF666"), OPERADOR1);
    await fallaCon(pagos.cobrarDeNuevo(r.id_registro, { metodo: "EFECTIVO" }, ADMIN.id_usuario), 409, /sigue dentro/);
  });

  test("el cierre de caja cuenta solo los pagos aprobados", async () => {
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    const caja = await pagos.listar({ desde: hoy, hasta: hoy });
    assert.equal(caja.totales.anulados, 1);
    assert.equal(caja.totales.pagos, 3); // AAA111, el nuevo cobro de DDD444 y EEE555
    const efectivo = caja.totales.porMetodo.find((m) => m.metodo === "EFECTIVO")!;
    assert.equal(efectivo.pagos, 2);
    const buscado = await pagos.listar({ desde: hoy, hasta: hoy, q: "DDD4" });
    assert.equal(buscado.pagos.length, 2);
    assert.ok(await pagos.obtener(idEfectivo));
  });

  test("totales del día e historial muestran el comprobante", async () => {
    const t = await estacionamiento.totalesDelDia(CHAPINERO);
    assert.equal(t.salidas_hoy, 3);
    assert.ok(t.recaudo_hoy > 0);
    const visitas = await estacionamiento.historial({ idParqueadero: CHAPINERO, orden: "valor" });
    assert.equal(visitas.length, 3);
    assert.ok(visitas.every((v: { comprobante: string | null }) => v.comprobante));
    const porVehiculo = await estacionamiento.historial({ idParqueadero: CHAPINERO, agrupar: "vehiculo", placa: "aaa" });
    assert.equal(porVehiculo[0].visitas, 1);
    await fallaCon(estacionamiento.historial({ idParqueadero: CHAPINERO, desde: "2026-12-01", hasta: "2026-11-01" }), 400);
    await fallaCon(estacionamiento.historial({ idParqueadero: CHAPINERO, minutosMin: 30, minutosMax: 10 }), 400);
    await fallaCon(estacionamiento.historial({ idParqueadero: CHAPINERO, orden: "nombre" as "fecha" }), 400);
  });
});
