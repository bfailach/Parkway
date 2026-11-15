import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularCambio, numeroComprobante, validarAnulacion, validarPago } from "../src/validators/pagoValidator";
import { mensajeDeError } from "../src/middlewares/errorHandler";

test("efectivo: lo recibido es opcional y acepta puntos de miles", () => {
  const exacto = validarPago({ metodo: "efectivo" });
  assert.deepEqual(exacto, { valido: true, datos: { metodo: "EFECTIVO", referencia: null, recibido: null } });
  const billete = validarPago({ metodo: "EFECTIVO", recibido: "$ 50.000" });
  assert.equal(billete.valido && billete.datos.recibido, 50000);
  const raro = validarPago({ metodo: "EFECTIVO", recibido: "cincuenta" });
  assert.equal(raro.valido, false);
});

test("tarjeta y transferencia exigen su referencia con el formato correcto", () => {
  assert.equal(validarPago({ metodo: "TARJETA" }).valido, false);
  assert.equal(validarPago({ metodo: "TARJETA", referencia: "12AB56" }).valido, false);
  const tarjeta = validarPago({ metodo: "tarjeta", referencia: " 482 913 " });
  assert.equal(tarjeta.valido && tarjeta.datos.referencia, "482913");
  const transferencia = validarPago({ metodo: "TRANSFERENCIA", referencia: "nq-2026-00981" });
  assert.equal(transferencia.valido && transferencia.datos.referencia, "NQ-2026-00981");
  // En tarjeta y transferencia no se guarda efectivo recibido.
  assert.equal(validarPago({ metodo: "TARJETA", referencia: "123456", recibido: 5000 }).valido && true, true);
});

test("rechaza un medio de pago que no existe", () => {
  const r = validarPago({ metodo: "CHEQUE" });
  assert.equal(r.valido, false);
  if (!r.valido) assert.ok(r.errores.metodo);
});

test("calcula el cambio y detecta cuando no alcanza", () => {
  assert.deepEqual(calcularCambio(7000, 10000), { recibido: 10000, cambio: 3000 });
  assert.deepEqual(calcularCambio(7000, null), { recibido: 7000, cambio: 0 });
  assert.equal(calcularCambio(7000, 5000), null);
});

test("numera los comprobantes con el año y seis dígitos", () => {
  assert.equal(numeroComprobante(2026, 123), "PKW-2026-000123");
});

test("la anulación exige un motivo claro", () => {
  assert.equal(validarAnulacion({ motivo: "error" }).valido, false);
  const r = validarAnulacion({ motivo: "  Se cobró   dos veces  al cliente " });
  assert.equal(r.valido && r.datos.motivo, "Se cobró dos veces al cliente");
});

test("la bitácora guarda un mensaje claro cuando se repite una referencia", () => {
  assert.equal(mensajeDeError({ code: "23505", constraint: "uq_pago_referencia" }), "Esa referencia ya se registró en otro pago");
  assert.equal(mensajeDeError(new Error("otro")), "otro");
});
