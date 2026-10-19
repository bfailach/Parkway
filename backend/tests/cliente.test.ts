import { test } from "node:test";
import assert from "node:assert/strict";
import { validarCuenta, validarVehiculo } from "../src/validators/clienteValidator";

const cuenta = { nombre: "Ana Pérez", documento: "1.020.304.050", correo: "Ana@Correo.co", telefono: "300 123 4567", contrasena: "clave1234" };

test("acepta una cuenta válida y normaliza los datos", () => {
  const r = validarCuenta(cuenta);
  assert.equal(r.valido, true);
  if (r.valido) {
    assert.equal(r.datos.documento, "1020304050");
    assert.equal(r.datos.correo, "ana@correo.co");
    assert.equal(r.datos.telefono, "3001234567");
  }
});

test("exige contraseña con letras y números de al menos 8 caracteres", () => {
  const corta = validarCuenta({ ...cuenta, contrasena: "ab1" });
  assert.equal(corta.valido, false);
  const sinNumeros = validarCuenta({ ...cuenta, contrasena: "solamenteletras" });
  assert.equal(sinNumeros.valido, false);
  if (!sinNumeros.valido) assert.match(sinNumeros.errores.contrasena, /letras y números/);
});

test("rechaza documento y correo inválidos", () => {
  const r = validarCuenta({ ...cuenta, documento: "12ab", correo: "sin-arroba" });
  assert.equal(r.valido, false);
  if (!r.valido) {
    assert.ok(r.errores.documento);
    assert.ok(r.errores.correo);
  }
});

test("valida la placa del vehículo según el tipo", () => {
  assert.equal(validarVehiculo({ placa: "qwe-123", idTipo: 1 }).valido, true);
  assert.equal(validarVehiculo({ placa: "QWE12R", idTipo: 2 }).valido, true);
  const r = validarVehiculo({ placa: "QWE123", idTipo: 2 });
  assert.equal(r.valido, false);
  if (!r.valido) assert.match(r.errores.placa, /ABC12D/);
});

test("las bicicletas no guardan marca", () => {
  const r = validarVehiculo({ placa: "BIC0042", idTipo: 3, marca: "GW", color: "Negro" });
  assert.equal(r.valido, true);
  if (r.valido) {
    assert.equal(r.datos.marca, undefined);
    assert.equal(r.datos.color, "Negro");
  }
});
