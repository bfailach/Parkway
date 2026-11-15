import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoRechazoCambio, validarUsuario } from "../src/validators/usuarioValidator";

const operador = {
  nombre: "  Pedro   Gómez ",
  documento: "1.023.456.789",
  correo: "Pedro@Parkway.test",
  telefono: "310 555 1234",
  rol: "operador",
  turno: "noche",
  contrasena: "clave1234",
  sedes: [2, "1", 2],
};

test("acepta un operador válido y normaliza los datos", () => {
  const r = validarUsuario(operador, { nuevo: true });
  assert.equal(r.valido, true);
  if (r.valido) {
    assert.equal(r.datos.nombre, "Pedro Gómez");
    assert.equal(r.datos.documento, "1023456789");
    assert.equal(r.datos.correo, "pedro@parkway.test");
    assert.equal(r.datos.rol, "OPERADOR");
    assert.equal(r.datos.turno, "NOCHE");
    assert.equal(r.datos.estado, "ACTIVO");
    assert.deepEqual(r.datos.sedes, [1, 2]);
  }
});

test("el cliente no lleva turno ni sedes", () => {
  const r = validarUsuario({ ...operador, rol: "CLIENTE", turno: "DIA" }, { nuevo: true });
  assert.equal(r.valido, true);
  if (r.valido) {
    assert.equal(r.datos.turno, null);
    assert.deepEqual(r.datos.sedes, []);
  }
});

test("el personal necesita turno y el rol debe existir", () => {
  const sinTurno = validarUsuario({ ...operador, turno: "" }, { nuevo: true });
  assert.equal(sinTurno.valido, false);
  if (!sinTurno.valido) assert.ok(sinTurno.errores.turno);
  const rolRaro = validarUsuario({ ...operador, rol: "SUPERVISOR" }, { nuevo: true });
  assert.equal(rolRaro.valido, false);
  if (!rolRaro.valido) assert.ok(rolRaro.errores.rol);
});

test("la contraseña es obligatoria al crear y opcional al editar", () => {
  const crear = validarUsuario({ ...operador, contrasena: "" }, { nuevo: true });
  assert.equal(crear.valido, false);
  const editar = validarUsuario({ ...operador, contrasena: "" }, { nuevo: false });
  assert.equal(editar.valido, true);
  const editarDebil = validarUsuario({ ...operador, contrasena: "corta" }, { nuevo: false });
  assert.equal(editarDebil.valido, false);
});

test("rechaza estado, documento y sedes inválidos", () => {
  const r = validarUsuario({ ...operador, estado: "BORRADO", documento: "12ab", sedes: [0] }, { nuevo: true });
  assert.equal(r.valido, false);
  if (!r.valido) {
    assert.ok(r.errores.estado);
    assert.ok(r.errores.documento);
    assert.ok(r.errores.sedes);
  }
});

const admin = { id_usuario: 1, rol: "ADMINISTRADOR" as const, estado: "ACTIVO" };

test("el administrador no puede quitarse el rol ni desactivarse", () => {
  assert.match(motivoRechazoCambio(1, admin, { rol: "OPERADOR", estado: "ACTIVO" }, 3)!, /propio rol/);
  assert.match(motivoRechazoCambio(1, admin, { rol: "ADMINISTRADOR", estado: "INACTIVO" }, 3)!, /propia cuenta/);
  assert.equal(motivoRechazoCambio(1, admin, { rol: "ADMINISTRADOR", estado: "ACTIVO" }, 1), null);
});

test("debe quedar al menos un administrador activo", () => {
  const otro = { ...admin, id_usuario: 7 };
  assert.match(motivoRechazoCambio(1, otro, { rol: "ADMINISTRADOR", estado: "BLOQUEADO" }, 1)!, /al menos un administrador/);
  assert.equal(motivoRechazoCambio(1, otro, { rol: "OPERADOR", estado: "ACTIVO" }, 2), null);
  // Cambios a usuarios que no son administradores no dependen del conteo.
  assert.equal(motivoRechazoCambio(1, { id_usuario: 4, rol: "CLIENTE", estado: "ACTIVO" }, { rol: "CLIENTE", estado: "INACTIVO" }, 1), null);
});
