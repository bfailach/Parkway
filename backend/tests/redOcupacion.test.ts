import { test } from "node:test";
import assert from "node:assert/strict";
import { esFestivo, PESOS, predecir, vectorEntrada } from "../src/ia/redOcupacion";
import { nivelDe } from "../src/services/prediccionService";

test("la red tiene 65 parámetros (6×8 + 8 + 8 + 1)", () => {
  const n = PESOS.W1.flat().length + PESOS.b1.length + PESOS.w2.length + 1;
  assert.equal(PESOS.W1.length, 6);
  assert.equal(n, 65);
});

test("la salida siempre está entre 0 y 1", () => {
  for (const x of [[0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1], [0.5, 0.2, 0, 0.7, 0.9, 0.1]]) {
    const { y } = predecir(x);
    assert.ok(y > 0 && y < 1);
  }
});

test("las entradas se escalan al rango de 0 a 1", () => {
  const x = vectorEntrada({ hora: 17, dia: 1, festivo: false, ocupacionActual: 0.72, ocupacionSemanaAnterior: 1.4, reservas: -1 });
  assert.deepEqual(x.map((v) => Math.round(v * 100) / 100), [0.74, 0.17, 0, 0.72, 1, 0]);
});

test("un martes hábil a las 3 p. m. predice más ocupación que un domingo a las 3 a. m.", () => {
  const pico = predecir(vectorEntrada({ hora: 15, dia: 1, festivo: false, ocupacionActual: 0.8, ocupacionSemanaAnterior: 0.82, reservas: 0.03 })).y;
  const madrugada = predecir(vectorEntrada({ hora: 3, dia: 6, festivo: false, ocupacionActual: 0.05, ocupacionSemanaAnterior: 0.06, reservas: 0 })).y;
  assert.ok(pico > 0.6, `pico ${pico}`);
  assert.ok(madrugada < 0.2, `madrugada ${madrugada}`);
});

test("calcula los festivos de Colombia con la Ley Emiliani", () => {
  for (const f of ["2026-01-12", "2026-04-03", "2026-05-18", "2026-06-08", "2026-11-16", "2026-12-08"]) assert.ok(esFestivo(f), f);
  assert.equal(esFestivo("2026-11-11"), false);
});

test("niveles de alerta", () => {
  assert.equal(nivelDe(0.5), "NORMAL");
  assert.equal(nivelDe(0.85), "ALTA");
  assert.equal(nivelDe(0.9), "CRITICA");
});
