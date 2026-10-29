import { test } from "node:test";
import assert from "node:assert/strict";
import { validarParqueadero } from "../src/validators/parqueaderoValidator";

const base = {
  nombre: "Sede Usaquén",
  direccion: "Calle 119 # 6-20",
  ciudad: "Bogotá",
  latitud: 4.6951,
  longitud: -74.0318,
  espacios: { 1: 20, 2: 6, 3: 0 },
  tarifas: [
    { idTipo: 1, valor_hora: 4200, valor_fraccion: 1500, valor_dia: 32000 },
    { idTipo: 2, valor_hora: 2000, valor_fraccion: 800, valor_dia: 15000 },
  ],
  horarios: [{ dia: 1, abre: "06:00", cierra: "22:00" }, { dia: 7, abre: "00:00", cierra: "24:00" }],
  operadores: [2, 2, 3],
};

test("acepta una sede válida", () => {
  const r = validarParqueadero(base);
  assert.equal(r.valido, true);
  if (r.valido) {
    assert.equal(r.datos.tarifas.length, 2); // sin tarifa de bicicleta: no tiene espacios
    assert.deepEqual(r.datos.operadores, [2, 3]);
  }
});

test("exige tarifa para cada tipo con espacios", () => {
  const r = validarParqueadero({ ...base, espacios: { 1: 20, 2: 6, 3: 4 } });
  assert.equal(r.valido, false);
  if (!r.valido) assert.ok(r.errores["tarifas.3.valor_hora"]);
});

test("rechaza horarios y tarifas incoherentes", () => {
  const r = validarParqueadero({
    ...base,
    horarios: [{ dia: 1, abre: "22:00", cierra: "06:00" }],
    tarifas: [
      { idTipo: 1, valor_hora: 4000, valor_fraccion: 5000, valor_dia: 3000 },
      base.tarifas[1],
    ],
  });
  assert.equal(r.valido, false);
  if (!r.valido) {
    assert.ok(r.errores["horarios.1"]);
    assert.ok(r.errores["tarifas.1.valor_fraccion"]);
    assert.ok(r.errores["tarifas.1.valor_dia"]);
  }
});

test("una sede necesita espacios y al menos un día de atención", () => {
  const r = validarParqueadero({ ...base, espacios: { 1: 0, 2: 0, 3: 0 }, horarios: [] });
  assert.equal(r.valido, false);
  if (!r.valido) {
    assert.ok(r.errores.espacios);
    assert.ok(r.errores.horarios);
  }
});

test("una sede de varios pisos valida cada piso", () => {
  const r = validarParqueadero({
    ...base,
    pisos: 2,
    espaciosPorPiso: [{ 1: 15, 2: 6, 3: 0 }, { 1: 15, 2: 0, 3: 0 }],
  });
  assert.equal(r.valido, true);
  if (r.valido) {
    assert.equal(r.datos.pisos, 2);
    assert.equal(r.datos.espacios[1], 30);
    assert.deepEqual(r.datos.espaciosPorPiso[1], { 1: 15, 2: 0, 3: 0 });
  }
  const vacio = validarParqueadero({ ...base, pisos: 2, espaciosPorPiso: [{ 1: 15, 2: 6, 3: 0 }, { 1: 0, 2: 0, 3: 0 }] });
  assert.equal(vacio.valido, false);
  if (!vacio.valido) assert.ok(vacio.errores["espacios.2"]);
  const muchos = validarParqueadero({ ...base, pisos: 9 });
  assert.equal(muchos.valido, false);
});

test("limita los espacios a cifras realistas", () => {
  const porPiso = validarParqueadero({ ...base, espacios: { 1: 151, 2: 81, 3: 61 } });
  assert.equal(porPiso.valido, false);
  if (!porPiso.valido) {
    assert.ok(porPiso.errores["espacios.1.1"]);
    assert.ok(porPiso.errores["espacios.1.2"]);
    assert.ok(porPiso.errores["espacios.1.3"]);
  }
  const sede = validarParqueadero({
    ...base,
    pisos: 5,
    espaciosPorPiso: Array.from({ length: 5 }, () => ({ 1: 140, 2: 20, 3: 10 })),
  });
  assert.equal(sede.valido, false);
  if (!sede.valido) {
    assert.ok(sede.errores["espacios.total.1"]); // 700 automóviles
    assert.ok(sede.errores["espacios.total"]); // 850 espacios
  }
});
