import { test } from "node:test";
import assert from "node:assert/strict";
import { ahoraLocal, estadoEn, Horario, motivoParaNoReservar } from "../src/services/horarioService";

// Lunes a sábado de 6:00 a 22:00, domingo de 8:00 a 20:00
const chapinero: Horario[] = [
  ...[1, 2, 3, 4, 5, 6].map((dia) => ({ dia, abre: "06:00", cierra: "22:00" })),
  { dia: 7, abre: "08:00", cierra: "20:00" },
];
const continuo: Horario[] = [1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia, abre: "00:00", cierra: "24:00" }));
const h = (hh: number, mm = 0) => hh * 60 + mm;

test("la sede está abierta dentro del horario y cerrada fuera de él", () => {
  assert.equal(estadoEn(chapinero, 1, h(10)).abierto, true);
  assert.equal(estadoEn(chapinero, 1, h(5, 59)).abierto, false);
  assert.equal(estadoEn(chapinero, 1, h(22)).abierto, false);
  assert.equal(estadoEn(chapinero, 7, h(7)).abierto, false);
});

test("indica la próxima apertura", () => {
  assert.match(estadoEn(chapinero, 1, h(5)).mensaje, /hoy a las 6:00/);
  assert.match(estadoEn(chapinero, 6, h(23)).mensaje, /mañana a las 8:00/);
  assert.match(estadoEn([{ dia: 1, abre: "07:00", cierra: "12:00" }], 3, h(9)).mensaje, /el lunes a las 7:00/);
});

test("una sede de 24 horas no tiene hora de cierre", () => {
  const e = estadoEn(continuo, 3, h(3));
  assert.equal(e.abierto, true);
  assert.equal(e.minutosParaCerrar, null);
});

test("el cierre a medianoche continúa en el día siguiente", () => {
  const horario: Horario[] = [
    { dia: 5, abre: "18:00", cierra: "24:00" },
    { dia: 6, abre: "00:00", cierra: "03:00" },
  ];
  const e = estadoEn(horario, 5, h(23, 30));
  assert.equal(e.minutosParaCerrar, 210);
  assert.match(e.mensaje, /3:00 de mañana/);
});

test("no se puede reservar con la sede cerrada ni si la reserva pasa del cierre", () => {
  assert.equal(motivoParaNoReservar(chapinero, 2, h(12), 30), null);
  assert.match(motivoParaNoReservar(chapinero, 2, h(23), 30) ?? "", /cerrada/);
  assert.match(motivoParaNoReservar(chapinero, 2, h(21, 45), 30) ?? "", /cierra en 15 minutos/);
  assert.equal(motivoParaNoReservar(continuo, 2, h(23, 50), 30), null);
});

test("calcula el día y la hora en Bogotá", () => {
  // 2026-10-19 es lunes. 03:30 UTC son las 22:30 del domingo en Bogotá (UTC-5).
  assert.deepEqual(ahoraLocal(new Date("2026-10-19T03:30:00Z"), "America/Bogota"), { dia: 7, minuto: h(22, 30) });
  assert.deepEqual(ahoraLocal(new Date("2026-10-19T15:05:00Z"), "America/Bogota"), { dia: 1, minuto: h(10, 5) });
});
