import "./entorno";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN, CHAPINERO, CLIENTE1, CLIENTE2, cerrar, fallaCon, OPERADOR1, reiniciarBase, uno } from "./base";
import * as estacionamiento from "../../src/services/estacionamientoService";
import * as correccion from "../../src/services/correccionService";
import * as actividad from "../../src/services/actividadService";
import { calcularValor } from "../../src/services/tarifaService";

// Tarifas de Chapinero en seed.sql
const CARRO = { valor_hora: 4000, valor_fraccion: 1500, valor_dia: 30000 };
const MOTO = { valor_hora: 2000, valor_fraccion: 800, valor_dia: 15000 };

/**
 * El operador registró mal el vehículo (otra placa y otro tipo). Se corrige
 * mientras está dentro, o después de pagado con devolución, y el cliente
 * puede reclamar.
 */
before(reiniciarBase);
after(cerrar);

/** Ingreso de hace `minutos` minutos con la placa y el tipo dados. */
async function ingresoAtrasado(placa: string, idTipo: number, minutos: number) {
  const r = await estacionamiento.registrarIngreso({ placa, idTipo, idParqueadero: CHAPINERO }, OPERADOR1);
  await uno(`UPDATE registro_estacionamiento SET fecha_ingreso = now() - make_interval(mins => $2) WHERE id_registro = $1`, [r.id_registro, minutos]);
  return r;
}

describe("B. corregir un ingreso abierto", () => {
  test("cambia placa, tipo, espacio y tarifa; la salida se cobra como moto", async () => {
    // La moto XYZ78D de Cliente Dos entró registrada como el carro XYZ788.
    const r = await ingresoAtrasado("XYZ788", 1, 120);
    await fallaCon(correccion.corregirIngreso(OPERADOR1, r.id_registro, { placa: "XYZ78D", idTipo: 1, motivo: "era moto" }), 400); // formato
    await fallaCon(correccion.corregirIngreso(OPERADOR1, r.id_registro, { placa: "XYZ78D", idTipo: 2 }), 400); // falta el motivo
    const c = await correccion.corregirIngreso(OPERADOR1, r.id_registro, { placa: "xyz-78d", idTipo: 2, motivo: "Era una moto, no un carro" });
    assert.equal(c.placa, "XYZ78D");
    assert.equal(c.id_tipo, 2);
    assert.equal(c.valor_hora, 2000);
    const viejo = await uno<{ estado: string }>(`SELECT estado FROM espacio WHERE codigo = $1 AND id_parqueadero = $2`, [r.codigo_espacio, CHAPINERO]);
    assert.equal(viejo.estado, "LIBRE");

    const avisos = await actividad.deCliente(CLIENTE2);
    const aviso = avisos.find((a) => a.operacion === "CORREGIR_INGRESO");
    assert.equal(aviso?.placa_anterior, "XYZ788");
    assert.equal(aviso?.tipo, "motocicleta");

    const s = await estacionamiento.registrarSalida(r.id_registro, OPERADOR1, { metodo: "EFECTIVO", recibido: 100000 });
    assert.equal(s.valor_calculado, calcularValor(s.minutos, MOTO)); // tarifa de moto, no de carro
    assert.ok(s.valor_calculado < calcularValor(s.minutos, CARRO));
  });

  test("no corrige a una placa que ya está dentro ni una visita terminada", async () => {
    const a = await estacionamiento.registrarIngreso({ placa: "AAA111", idTipo: 1, idParqueadero: CHAPINERO }, OPERADOR1);
    const b = await estacionamiento.registrarIngreso({ placa: "BBB222", idTipo: 1, idParqueadero: CHAPINERO }, OPERADOR1);
    await fallaCon(correccion.corregirIngreso(OPERADOR1, b.id_registro, { placa: "AAA111", idTipo: 1, motivo: "otra placa" }), 409);
    await fallaCon(correccion.corregirIngreso(OPERADOR1, b.id_registro, { placa: "BBB222", idTipo: 1, motivo: "sin cambios" }), 409);
    await estacionamiento.registrarSalida(a.id_registro, OPERADOR1, { metodo: "EFECTIVO", recibido: 100000 });
    await fallaCon(correccion.corregirIngreso(OPERADOR1, a.id_registro, { placa: "AAA11B", idTipo: 2, motivo: "era moto" }), 409);
    await estacionamiento.registrarSalida(b.id_registro, OPERADOR1, { metodo: "EFECTIVO", recibido: 100000 });
  });
});

describe("C y D. reclamo y corrección de un cobro ya pagado", () => {
  test("el cliente reclama con el comprobante y el administrador devuelve la diferencia", async () => {
    const r = await ingresoAtrasado("XYZ781", 1, 180);
    const s = await estacionamiento.registrarSalida(r.id_registro, OPERADOR1, { metodo: "TARJETA", referencia: "555123" });
    const carro = calcularValor(s.minutos, CARRO);
    const moto = calcularValor(s.minutos, MOTO);
    assert.equal(s.valor_calculado, carro);

    // D. La visita quedó a otra placa: el cliente la reporta con el número del comprobante.
    await fallaCon(correccion.crearReclamo(CLIENTE2, { comprobante: s.comprobante, motivo: "corto" }), 400);
    const rec = await correccion.crearReclamo(CLIENTE2, { comprobante: s.comprobante, motivo: "Me cobraron como carro y llegué en mi moto XYZ78D" });
    await fallaCon(correccion.crearReclamo(CLIENTE2, { comprobante: s.comprobante, motivo: "Otra vez el mismo reclamo" }), 409);
    const pendientes = await correccion.listarReclamos("PENDIENTE");
    assert.equal(pendientes.length, 1);
    assert.equal(pendientes[0].placa, "XYZ781");

    // C. Vista previa y corrección.
    const sim = await correccion.simularCobro(ADMIN, r.id_registro, 2);
    assert.deepEqual([sim.valor, sim.devolucion, sim.permitido], [moto, carro - moto, true]);
    const c = await correccion.corregirCobro(ADMIN, r.id_registro, {
      placa: "XYZ78D", idTipo: 2, motivo: "El vehículo era la moto del cliente", idReclamo: rec.id_reclamo,
    });
    assert.deepEqual([c.valor_anterior, c.valor, c.devolucion, c.metodo], [carro, moto, carro - moto, "TARJETA"]);
    assert.ok(c.comprobante && c.comprobante !== s.comprobante);

    const pagos = await uno<{ anulados: number; aprobado: string; ref: string }>(
      `SELECT count(*) FILTER (WHERE estado = 'ANULADO')::int AS anulados,
              max(monto) FILTER (WHERE estado = 'APROBADO') AS aprobado,
              max(referencia_externa) FILTER (WHERE estado = 'APROBADO') AS ref
         FROM pago WHERE id_registro = $1`,
      [r.id_registro]
    );
    assert.deepEqual([pagos.anulados, Number(pagos.aprobado)], [1, moto]);
    assert.match(pagos.ref, /^555123-C\d+$/);
    const reg = await uno<{ placa: string; valor_calculado: string }>(`SELECT placa, valor_calculado FROM registro_estacionamiento WHERE id_registro = $1`, [r.id_registro]);
    assert.deepEqual([reg.placa, Number(reg.valor_calculado)], ["XYZ78D", moto]);
    const bit = await uno<{ detalle: { devolucion: number } }>(`SELECT detalle FROM transaccion WHERE tipo_operacion = 'CORREGIR_COBRO' AND id_entidad = $1`, [String(r.id_registro)]);
    assert.equal(bit.detalle.devolucion, carro - moto);

    const mios = await correccion.misReclamos(CLIENTE2);
    assert.equal(mios[0].estado, "RESUELTO");
    const aviso = (await actividad.deCliente(CLIENTE2)).find((a) => a.operacion === "CORREGIR_COBRO");
    assert.equal(aviso?.devolucion, carro - moto);
  });

  test("la corrección nunca sube el cobro ni toca una visita en curso", async () => {
    const r = await ingresoAtrasado("CCC33C", 2, 60);
    await fallaCon(correccion.corregirCobro(ADMIN, r.id_registro, { placa: "CCC333", idTipo: 1, motivo: "era carro" }), 409); // sigue dentro
    await estacionamiento.registrarSalida(r.id_registro, OPERADOR1, { metodo: "EFECTIVO", recibido: 100000 });
    await fallaCon(correccion.corregirCobro(ADMIN, r.id_registro, { placa: "CCC333", idTipo: 1, motivo: "era carro" }), 409); // subiría
  });

  test("el administrador rechaza un reclamo con una respuesta y el cliente se entera", async () => {
    const r = await ingresoAtrasado("ABC123", 1, 60);
    await estacionamiento.registrarSalida(r.id_registro, OPERADOR1, { metodo: "EFECTIVO", recibido: 100000 });
    await fallaCon(correccion.crearReclamo(CLIENTE2, { idRegistro: r.id_registro, motivo: "No es mi vehículo pero reclamo" }), 404);
    const rec = await correccion.crearReclamo(CLIENTE1, { idRegistro: r.id_registro, motivo: "Creo que me cobraron de más" });
    await fallaCon(correccion.responderReclamo(ADMIN, rec.id_reclamo, { estado: "RECHAZADO" }), 400);
    await correccion.responderReclamo(ADMIN, rec.id_reclamo, { estado: "RECHAZADO", respuesta: "La visita duró una hora: el cobro es correcto" });
    await fallaCon(correccion.responderReclamo(ADMIN, rec.id_reclamo, { estado: "RESUELTO", respuesta: "otra vez" }), 409);
    const aviso = (await actividad.deCliente(CLIENTE1)).find((a) => a.operacion === "RESPONDER_RECLAMO");
    assert.equal(aviso?.resultado, "RECHAZADO");
    assert.match(String(aviso?.respuesta), /una hora/);
  });
});
