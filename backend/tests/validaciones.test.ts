import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarPlaca, validarIngreso } from "../src/validators/ingresoValidator";

test("normaliza la placa", () => {
  assert.equal(normalizarPlaca(" abc-123 "), "ABC123");
});

test("acepta placas válidas por tipo", () => {
  assert.equal(validarIngreso({ placa: "ABC123", idTipo: 1, idParqueadero: 1 }).valido, true);
  assert.equal(validarIngreso({ placa: "XYZ12D", idTipo: 2, idParqueadero: 1 }).valido, true);
  assert.equal(validarIngreso({ placa: "BIC0042", idTipo: 3, idParqueadero: 2 }).valido, true);
});

test("rechaza placas con formato incorrecto", () => {
  const r = validarIngreso({ placa: "AB1234", idTipo: 1, idParqueadero: 1 });
  assert.equal(r.valido, false);
  assert.match(r.errores.placa, /ABC123/);
  assert.equal(validarIngreso({ placa: "ABC123", idTipo: 2, idParqueadero: 1 }).valido, false);
});

test("exige los campos obligatorios", () => {
  const r = validarIngreso({});
  assert.equal(r.valido, false);
  assert.ok(r.errores.placa);
  assert.ok(r.errores.idTipo);
  assert.ok(r.errores.idParqueadero);
});

test("limita la longitud de marca y color", () => {
  const r = validarIngreso({ placa: "ABC123", idTipo: 1, idParqueadero: 1, color: "x".repeat(21) });
  assert.equal(r.valido, false);
  assert.ok(r.errores.color);
});

test("el ingreso de una bicicleta ignora la marca", () => {
  const r = validarIngreso({ placa: "BIC0042", idTipo: 3, idParqueadero: 2, marca: "GW" });
  assert.equal(r.valido, true);
  assert.equal(r.datos?.marca, undefined);
});
