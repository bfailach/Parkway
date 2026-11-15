import { test } from "node:test";
import assert from "node:assert/strict";
import { leerFiltrosBitacora } from "../src/validators/bitacoraValidator";

test("lee todos los filtros del documento: usuario, tipo, entidad, estado y fecha", () => {
  const r = leerFiltrosBitacora({
    idUsuario: "2", tipo: "ingreso", entidad: "Registro_Estacionamiento", idEntidad: "149",
    estado: "revertida", desde: "2026-11-01", hasta: "2026-11-15",
  });
  assert.equal(r.valido, true);
  if (r.valido) {
    assert.deepEqual(r.filtros, {
      idUsuario: 2, tipo: "INGRESO", entidad: "registro_estacionamiento", idEntidad: "149",
      estado: "REVERTIDA", desde: "2026-11-01", hasta: "2026-11-15",
    });
  }
});

test("los filtros vacíos se ignoran", () => {
  const r = leerFiltrosBitacora({ idUsuario: "", tipo: "  ", entidad: undefined });
  assert.equal(r.valido, true);
  if (r.valido) assert.deepEqual(r.filtros, {});
});

test("rechaza valores inválidos y fechas al revés", () => {
  const r = leerFiltrosBitacora({ idUsuario: "abc", entidad: "usuario; DROP", estado: "BORRADA", desde: "2026-11-15", hasta: "2026-11-01" });
  assert.equal(r.valido, false);
  if (!r.valido) {
    assert.ok(r.errores.idUsuario);
    assert.ok(r.errores.entidad);
    assert.ok(r.errores.estado);
    assert.match(r.errores.hasta, /anterior/);
  }
});
