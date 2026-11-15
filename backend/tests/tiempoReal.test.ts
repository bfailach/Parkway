import { test } from "node:test";
import assert from "node:assert/strict";
import { crearAgrupador, leerAviso } from "../src/tiempoReal/servidor";

test("lee el número de sede del aviso del trigger", () => {
  assert.equal(leerAviso('{"sede":2}'), 2);
  assert.equal(leerAviso('{"sede":"3"}'), 3);
  assert.equal(leerAviso('{"sede":0}'), null);
  assert.equal(leerAviso("no es json"), null);
  assert.equal(leerAviso(undefined), null);
});

test("junta los avisos seguidos y entrega cada sede una vez", async () => {
  const entregas: number[][] = [];
  const avisar = crearAgrupador((s) => entregas.push(s), 20);
  [2, 1, 2, 2, 1].forEach(avisar);
  await new Promise((r) => setTimeout(r, 40));
  avisar(3);
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(entregas, [[1, 2], [3]]);
});
