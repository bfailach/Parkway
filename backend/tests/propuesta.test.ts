import { test } from "node:test";
import assert from "node:assert/strict";
import { maximosPorTramo, revisarTarifas, TOPES_DECRETO_026 } from "../src/services/topeTarifarioService";
import { leerAutorizacion } from "../src/services/consentimientoService";
import { firmarQr, verificarQr } from "../src/services/qrService";
import { leerAvisoPersonal } from "../src/tiempoReal/canales";

/** Pruebas unitarias de las funciones de la propuesta (sin base de datos). */

test("topes: máximos por tramo para $230 por minuto", () => {
  assert.deepEqual(maximosPorTramo(230), { valor_hora: 13800, valor_fraccion: 3450, valor_dia: 331200 });
});

test("topes: una tarifa en el límite cumple y una por encima no", () => {
  const limite = [{ idTipo: 2, valor_hora: 161 * 60, valor_fraccion: 161 * 15, valor_dia: 161 * 1440 }];
  assert.deepEqual(revisarTarifas(limite, TOPES_DECRETO_026, false), {});
  const errores = revisarTarifas([{ ...limite[0], valor_fraccion: 161 * 15 + 1 }], TOPES_DECRETO_026, false);
  assert.match(errores.tarifa_2, /motocicletas.*fracción de 15 min/);
});

test("topes: con Sello Oro las bicicletas no pueden cobrar", () => {
  const bici = [{ idTipo: 3, valor_hora: 600, valor_fraccion: 150, valor_dia: 6000 }];
  assert.deepEqual(revisarTarifas(bici, TOPES_DECRETO_026, false), {});
  assert.match(revisarTarifas(bici, TOPES_DECRETO_026, true).tarifa_3, /Sello Oro/);
});

test("autorización: la casilla es obligatoria y la opcional por defecto es no", () => {
  assert.throws(() => leerAutorizacion({}), /Revise/);
  assert.throws(() => leerAutorizacion({ aceptaTratamiento: "true" }), /Revise/);
  assert.deepEqual(leerAutorizacion({ aceptaTratamiento: true }), { comunicaciones: false });
  assert.deepEqual(leerAutorizacion({ aceptaTratamiento: true, aceptaComunicaciones: true }), { comunicaciones: true });
});

test("QR: el token lleva la sede, vence y no acepta alteraciones", () => {
  const token = firmarQr(7);
  const v = verificarQr(token);
  assert.equal(v.sede, 7);
  const horas = (v.exp * 1000 - Date.now()) / 3_600_000;
  assert.ok(horas > 23 && horas <= 24);
  const [h, p, f] = token.split(".");
  const otraSede = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), sede: 8 })).toString("base64url");
  assert.throws(() => verificarQr(`${h}.${otraSede}.${f}`), /no es válido/);
});

test("aviso de actividad: solo pasa la forma esperada", () => {
  assert.deepEqual(leerAvisoPersonal('{"tipo":"actividad","sede":3,"operacion":"INGRESO"}'), { tipo: "actividad", sede: 3, operacion: "INGRESO" });
  assert.equal(leerAvisoPersonal('{"tipo":"actividad","sede":0,"operacion":"INGRESO"}'), null);
  assert.equal(leerAvisoPersonal('{"tipo":"actividad","sede":3,"operacion":"<script>"}'), null);
  assert.equal(leerAvisoPersonal('{"tipo":"otro","sede":3,"operacion":"INGRESO"}'), null);
  assert.equal(leerAvisoPersonal("no es json"), null);
});
