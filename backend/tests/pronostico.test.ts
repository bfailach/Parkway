import { test } from "node:test";
import assert from "node:assert/strict";
import { corregirConRed, HoraPronostico, resumirPronostico } from "../src/services/prediccionService";

const hora = (h: number, estimada: number, abierta = true): HoraPronostico => ({
  fecha: `2026-11-16T${String(h).padStart(2, "0")}:00`, hora: `${String(h).padStart(2, "0")}:00`,
  estimada, inferior: estimada - 0.05, superior: estimada + 0.05, abierta,
});

test("la mejor hora es la de menos ocupación entre las próximas 12 abiertas", () => {
  const horas = Array.from({ length: 24 }, (_, i) => hora(i, 0.5 + (i === 3 ? -0.3 : 0) + (i === 15 ? -0.45 : 0)));
  const r = resumirPronostico(horas);
  assert.equal(r.mejorHora?.hora, "03:00"); // la hora 15 está fuera de las próximas 12
  assert.equal(r.pico?.estimada, 0.5);
});

test("ignora las horas en que la sede está cerrada", () => {
  const horas = [hora(22, 0.05, false), hora(23, 0.02, false), hora(6, 0.3), hora(7, 0.92), hora(8, 0.95)];
  const r = resumirPronostico(horas);
  assert.equal(r.mejorHora?.hora, "06:00");
  assert.equal(r.pico?.hora, "08:00");
  assert.equal(r.horasCriticas, 2);
});

test("sin horas abiertas no sugiere ninguna", () => {
  const r = resumirPronostico([hora(1, 0.1, false), hora(2, 0.1, false)]);
  assert.equal(r.mejorHora, null);
  assert.equal(r.pico, null);
  assert.equal(r.horasCriticas, 0);
});

test("la red corrige la primera hora y la corrección se desvanece", () => {
  const horas = [hora(11, 0.3), hora(12, 0.4), hora(13, 0.45), hora(20, 0.2)];
  const c = corregirConRed(horas, 0.8, 0.5);
  assert.equal(c[0].estimada, 0.8);                 // la primera hora toma el valor de la red
  assert.ok(Math.abs(c[1].estimada - 0.65) < 1e-9);  // 0,4 + 0,5 x 0,5
  assert.ok(Math.abs(c[2].estimada - 0.575) < 1e-9); // 0,45 + 0,5 x 0,25
  assert.equal(c[0].prophet, 0.3);                    // se conserva lo que dijo Prophet
  assert.ok(Math.abs(c[0].superior - 0.85) < 1e-9);   // el rango se desplaza con la estimación
});

test("la corrección nunca sale del rango de 0 a 100 %", () => {
  const c = corregirConRed([hora(8, 0.9), hora(9, 0.97)], 1, 0.9);
  assert.ok(c.every((h) => h.estimada <= 1 && h.superior <= 1 && h.inferior >= 0));
});
