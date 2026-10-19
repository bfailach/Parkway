import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularMinutos, calcularValor } from "../src/services/tarifaService";

// Tarifa de automóvil del seed: hora 4.000, fracción 1.500, día 30.000
const auto = { valor_hora: 4000, valor_fraccion: 1500, valor_dia: 30000 };

test("cobra una fracción por los primeros minutos", () => {
  assert.equal(calcularValor(1, auto), 1500);
  assert.equal(calcularValor(15, auto), 1500);
  assert.equal(calcularValor(16, auto), 3000);
});

test("cobra horas completas más fracciones iniciadas", () => {
  assert.equal(calcularValor(60, auto), 4000);
  assert.equal(calcularValor(80, auto), 4000 + 2 * 1500); // 1 h 20 min
  assert.equal(calcularValor(125, auto), 2 * 4000 + 1500); // 2 h 5 min
});

test("el valor de un día no supera el valor_dia", () => {
  assert.equal(calcularValor(10 * 60, auto), 30000); // 10 h = 40.000 -> tope 30.000
  assert.equal(calcularValor(1440, auto), 30000);
});

test("suma días completos y el tiempo restante", () => {
  assert.equal(calcularValor(1440 + 30, auto), 30000 + 2 * 1500);
  assert.equal(calcularValor(2 * 1440 + 23 * 60, auto), 3 * 30000);
});

test("calcularMinutos redondea hacia arriba y nunca devuelve 0", () => {
  const t0 = new Date("2026-10-19T08:00:00Z");
  assert.equal(calcularMinutos(t0, new Date("2026-10-19T08:00:10Z")), 1);
  assert.equal(calcularMinutos(t0, new Date("2026-10-19T09:20:01Z")), 81);
  assert.equal(calcularMinutos(t0, t0), 1);
});
