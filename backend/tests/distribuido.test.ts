import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "crypto";
import jwt from "jsonwebtoken";
import { CircuitBreaker, CircuitoAbiertoError, TiempoAgotadoError } from "../src/distribuido/circuitBreaker";
import * as llaves from "../src/distribuido/llaves";

/** Pruebas unitarias de los mecanismos de la arquitectura distribuida. */

test("circuit breaker: se abre tras los fallos seguidos y responde de inmediato", async () => {
  const cb = new CircuitBreaker("prueba", { umbral: 2, esperaMs: 60_000, timeoutMs: 100 });
  const falla = () => Promise.reject(new Error("caído"));
  await assert.rejects(cb.ejecutar(falla), /caído/);
  assert.equal(cb.estado, "CERRADO");
  await assert.rejects(cb.ejecutar(falla), /caído/);
  assert.equal(cb.estado, "ABIERTO");
  let llamada = false;
  await assert.rejects(
    cb.ejecutar(async () => {
      llamada = true;
    }),
    CircuitoAbiertoError
  );
  assert.equal(llamada, false, "con el circuito abierto no se llama a la dependencia");
});

test("circuit breaker: pasa a semiabierto y se cierra si la prueba funciona", async () => {
  const cb = new CircuitBreaker("prueba", { umbral: 1, esperaMs: 20, timeoutMs: 100 });
  await assert.rejects(cb.ejecutar(() => Promise.reject(new Error("x"))));
  assert.equal(cb.estado, "ABIERTO");
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(cb.estado, "SEMIABIERTO");
  assert.equal(await cb.ejecutar(async () => 7), 7);
  assert.equal(cb.estado, "CERRADO");
});

test("circuit breaker: una dependencia lenta agota el tiempo de espera", async () => {
  const cb = new CircuitBreaker("lenta", { umbral: 5, timeoutMs: 30 });
  await assert.rejects(cb.ejecutar(() => new Promise((r) => setTimeout(r, 200))), TiempoAgotadoError);
});

test("tokens ES256: se firman con la llave privada y se publican en el JWKS", async () => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  process.env.JWT_PRIVATE_KEY = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  // El módulo lee la llave en su primer uso, que ocurre aquí.
  const token = llaves.firmarToken({ id_usuario: 1, rol: "ADMINISTRADOR" }, "secreto", "5m");
  const cabecera = jwt.decode(token, { complete: true })!.header;
  assert.equal(cabecera.alg, "ES256");
  const { keys } = llaves.jwks();
  assert.equal(keys.length, 1);
  assert.equal(keys[0].kid, cabecera.kid);
  assert.equal(keys[0].d, undefined, "el JWKS no expone la parte privada");
  assert.equal(llaves.verificarToken(token, "secreto").rol, "ADMINISTRADOR");

  // Un token HS256 firmado con la llave pública como secreto (confusión de algoritmos) se rechaza.
  const falso = jwt.sign({ id_usuario: 1, rol: "ADMINISTRADOR" }, "otro-secreto", { algorithm: "HS256" });
  assert.throws(() => llaves.verificarToken(falso, "secreto"));
  delete process.env.JWT_PRIVATE_KEY;
});
