import { test } from "node:test";
import assert from "node:assert/strict";
import { leerFiltrosReporte } from "../src/validators/reporteValidator";
import { aCsv, celdaCsv } from "../src/utils/csv";
import { agregarPorFranja, nombrePeriodo } from "../src/services/reporteService";

test("lee los filtros del reporte y agrupa por día por defecto", () => {
  const r = leerFiltrosReporte({ desde: "2026-11-01", hasta: "2026-11-15", idParqueadero: "2" });
  assert.equal(r.valido, true);
  if (r.valido) assert.deepEqual(r.filtros, { idParqueadero: 2, desde: "2026-11-01", hasta: "2026-11-15", agrupacion: "dia" });
});

test("rechaza periodos al revés, de más de un año o sin fechas", () => {
  const alReves = leerFiltrosReporte({ desde: "2026-11-15", hasta: "2026-11-01" });
  assert.equal(alReves.valido, false);
  const largo = leerFiltrosReporte({ desde: "2025-01-01", hasta: "2026-11-15" });
  assert.equal(largo.valido, false);
  if (!largo.valido) assert.match(largo.errores.hasta, /366/);
  const sinFechas = leerFiltrosReporte({ agrupacion: "año", idTipo: "9" });
  assert.equal(sinFechas.valido, false);
  if (!sinFechas.valido) {
    assert.ok(sinFechas.errores.desde && sinFechas.errores.hasta && sinFechas.errores.agrupacion && sinFechas.errores.idTipo);
  }
});

test("el CSV usa punto y coma, coma decimal y BOM para Excel en español", () => {
  const csv = aCsv(
    [{ titulo: "Sede", valor: (f: { s: string; v: number }) => f.s }, { titulo: "Ocupación (%)", valor: (f) => f.v, decimales: 1 }],
    [{ s: "Sede Chapinero", v: 42.25 }, { s: 'Sede "Norte"; piso 2', v: 7 }]
  );
  assert.ok(csv.startsWith("﻿"));
  assert.equal(csv.slice(1), 'Sede;Ocupación (%)\r\nSede Chapinero;42,3\r\n"Sede ""Norte""; piso 2";7,0\r\n');
});

test("el CSV neutraliza fórmulas y deja vacíos los valores nulos", () => {
  assert.equal(celdaCsv("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(celdaCsv("-5"), "'-5");
  assert.equal(celdaCsv(-5), "-5"); // los números negativos sí son números
  assert.equal(celdaCsv(null), "");
  assert.equal(celdaCsv(Number.NaN), "");
});

test("agrupa la ocupación por hora y separa días laborales de fines de semana y festivos", () => {
  const horas = [
    { fecha: "2026-11-13", hora: 9, ocupados: 8, llegadas: 4 }, // viernes
    { fecha: "2026-11-14", hora: 9, ocupados: 2, llegadas: 1 }, // sábado
    { fecha: "2026-11-16", hora: 9, ocupados: 4, llegadas: 0 }, // lunes festivo
    { fecha: "2026-11-13", hora: 10, ocupados: 20, llegadas: 0 }, // más que la capacidad
  ];
  const f = agregarPorFranja(horas, 10);
  const nueve = f.find((x) => x.hora === 9)!;
  assert.ok(Math.abs(nueve.promedio - 14 / 30) < 1e-9);
  assert.equal(nueve.promedioLaboral, 0.8);
  assert.ok(Math.abs(nueve.promedioLibre! - 0.3) < 1e-9);
  assert.equal(nueve.maximo, 0.8);
  assert.ok(Math.abs(nueve.llegadasPromedio - 5 / 3) < 1e-9);
  assert.equal(f.find((x) => x.hora === 10)!.maximo, 1); // nunca pasa de 100 %
  assert.equal(f.length, 2); // solo las horas con datos
});

test("nombra los periodos en español", () => {
  assert.equal(nombrePeriodo("2026-11-09", "dia"), "09/11/2026");
  assert.equal(nombrePeriodo("2026-11-09", "semana"), "Semana del 09/11/2026");
  assert.equal(nombrePeriodo("2026-11-01", "mes"), "noviembre de 2026");
});
