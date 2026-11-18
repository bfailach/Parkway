import "./entorno";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN, CHAPINERO, CLIENTE1, cerrar, fallaCon, OPERADOR1, OPERADOR2, reiniciarBase, uno, ZONA_T } from "./base";
import * as auth from "../../src/services/authService";
import * as consentimientos from "../../src/services/consentimientoService";
import * as topes from "../../src/services/topeTarifarioService";
import * as sedes from "../../src/services/parqueaderoService";
import * as qr from "../../src/services/qrService";
import * as actividad from "../../src/services/actividadService";
import * as estacionamiento from "../../src/services/estacionamientoService";
import * as pagos from "../../src/services/pagoService";
import { Client } from "pg";
import type { UsuarioToken } from "../../src/middlewares/auth";

/**
 * Funciones de la propuesta contra PostgreSQL: topes tarifarios del
 * Decreto 026 de 2026, autorización de datos (Ley 1581 de 2012) y entrada
 * con QR.
 */
before(reiniciarBase);
after(cerrar);

const CLIENTE: UsuarioToken = { id_usuario: CLIENTE1, nombre: "Cliente Uno", rol: "CLIENTE" };

describe("topes tarifarios (Decreto 026 de 2026)", () => {
  test("lista los seis topes vigentes y las tarifas de prueba los cumplen", async () => {
    const t = await topes.listarTopes();
    assert.equal(t.length, 6);
    assert.equal(t.find((x) => x.id_tipo === 1 && !x.sello_oro)?.valor_minuto, 230);
    assert.equal(t.find((x) => x.id_tipo === 3 && x.sello_oro)?.valor_minuto, 0);
    assert.deepEqual(await topes.tarifasFueraDeTope(), []);
  });

  test("rechaza con 422 una sede cuya tarifa supera el tope y no deja nada a medias", async () => {
    const sede = {
      nombre: "Sede Cara",
      direccion: "Calle 9",
      ciudad: "Bogotá",
      pisos: 1,
      espaciosPorPiso: [{ 1: 3, 2: 0, 3: 0 }],
      // 20.000 la hora para automóvil: el tope es 230 × 60 = 13.800.
      tarifas: [{ idTipo: 1, valor_hora: 20000, valor_fraccion: 1500, valor_dia: 30000 }],
      horarios: [1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia, abre: "00:00", cierra: "24:00" })),
      operadores: [],
    };
    await fallaCon(sedes.crear(sede, ADMIN.id_usuario), 422, /tope de \$230 por minuto/);
    const n = await uno<{ n: string }>("SELECT count(*) n FROM parqueadero WHERE nombre = 'Sede Cara'");
    assert.equal(Number(n.n), 0, "la transacción se revirtió");
    const bitacora = await uno<{ estado: string }>(
      "SELECT estado FROM transaccion WHERE tipo_operacion = 'CREAR_PARQUEADERO' ORDER BY id_transaccion DESC LIMIT 1"
    );
    assert.equal(bitacora.estado, "REVERTIDA");
    // La misma sede con una tarifa dentro del tope sí se crea.
    sede.tarifas[0].valor_hora = 13800;
    const creada = await sedes.crear(sede, ADMIN.id_usuario);
    assert.ok(creada.id_parqueadero > 0);

    // Con Sello Oro el tope sube a $253: 15.000 la hora pasa (máximo 15.180).
    sede.nombre = "Sede Sello Oro";
    sede.tarifas[0].valor_hora = 15000;
    await fallaCon(sedes.crear(sede, ADMIN.id_usuario), 422);
    const oro = await sedes.crear({ ...sede, selloOro: true }, ADMIN.id_usuario);
    assert.equal(oro.sello_oro, true);
  });

  test("revisarTarifas aplica el tope de Sello Oro", () => {
    const tarifa = [{ idTipo: 1, valor_hora: 15000, valor_fraccion: 3700, valor_dia: 60000 }];
    assert.ok(Object.keys(topes.revisarTarifas(tarifa, topes.TOPES_DECRETO_026, false)).length === 1);
    assert.deepEqual(topes.revisarTarifas(tarifa, topes.TOPES_DECRETO_026, true), {}); // 253 × 60 = 15.180
  });
});

describe("autorización de datos (Ley 1581 de 2012)", () => {
  test("sin la autorización no se crea la cuenta", async () => {
    await fallaCon(
      auth.registrarCliente({ nombre: "Sin Permiso", documento: "55555555", correo: "sin@correo.co", contrasena: "clave1234" }),
      400
    );
    const n = await uno<{ n: string }>("SELECT count(*) n FROM usuario WHERE correo = 'sin@correo.co'");
    assert.equal(Number(n.n), 0);
  });

  test("guarda la autorización con la cuenta y permite revocar solo la opcional", async () => {
    const s = await auth.registrarCliente({
      nombre: "Con Permiso",
      documento: "66666666",
      correo: "con@correo.co",
      contrasena: "clave1234",
      aceptaTratamiento: true,
      aceptaComunicaciones: true,
    });
    const id = s.usuario.id_usuario;
    let c = await consentimientos.misConsentimientos(id);
    assert.deepEqual(
      c.vigentes.map((v) => [v.finalidad, v.otorgado]),
      [["SERVICIO", true], ["COMUNICACIONES", true]]
    );
    assert.equal(c.vigentes[0].versionPolitica, consentimientos.VERSION_POLITICA);

    c = await consentimientos.cambiar(id, { finalidad: "COMUNICACIONES", otorgado: false });
    assert.equal(c.vigentes[1].otorgado, false);
    assert.equal(c.historial.length, 3, "el historial conserva la decisión anterior");
    await fallaCon(consentimientos.cambiar(id, { finalidad: "SERVICIO", otorgado: false }), 400);
    await fallaCon(consentimientos.cambiar(id, { finalidad: "OTRA", otorgado: true }), 400);
  });
});

describe("entrada con QR", () => {
  test("el operador genera el QR solo de sus sedes", async () => {
    const q = await qr.generar(OPERADOR1, CHAPINERO, "https://parkway.test");
    assert.match(q.url, /^https:\/\/parkway\.test\/#\/qr\//);
    assert.match(q.svg, /^<svg/);
    assert.ok(new Date(q.expira) > new Date());
    const sedesOp2 = await uno<{ ids: number[] }>(
      "SELECT array_agg(id_parqueadero) ids FROM operador_parqueadero WHERE id_usuario = $1",
      [OPERADOR2.id_usuario]
    );
    const ajena = [CHAPINERO, ZONA_T].find((s) => !(sedesOp2.ids ?? []).includes(s));
    if (ajena) await fallaCon(qr.generar(OPERADOR2, ajena, "https://parkway.test"), 403);
  });

  test("el cliente ingresa con su vehículo escaneando el QR", async () => {
    const token = qr.firmarQr(CHAPINERO);
    const info = await qr.consultar(token, CLIENTE1);
    assert.equal(info.sede, CHAPINERO);
    assert.ok(info.vehiculos.some((v: { placa: string }) => v.placa === "ABC123"));

    assert.ok(info.pase, "al escanear a tiempo recibe un pase");
    const r = await qr.ingresar(CLIENTE, { pase: info.pase, placa: "abc-123" });
    assert.equal(r.placa, "ABC123");
    assert.equal(r.estado, "ABIERTO");
    assert.equal(r.operador_ingreso, "Autoservicio (QR)");
    const b = await uno<{ detalle: { origen: string } }>(
      "SELECT detalle FROM transaccion WHERE tipo_operacion = 'INGRESO' ORDER BY id_transaccion DESC LIMIT 1"
    );
    assert.equal(b.detalle.origen, "QR");
    await fallaCon(qr.ingresar(CLIENTE, { token, placa: "ABC123" }), 409); // ya está dentro

    // El operador de la sede ve el ingreso en sus avisos.
    const avisos = await qr.ingresosRecientes(OPERADOR1, CHAPINERO);
    assert.equal(avisos[0].id_registro, r.id_registro);
    assert.equal(avisos[0].placa, "ABC123");
    assert.equal(avisos[0].cliente, "Juan Cliente");
  });

  test("rechaza vehículos ajenos y códigos alterados", async () => {
    const token = qr.firmarQr(CHAPINERO);
    await fallaCon(qr.ingresar(CLIENTE, { token, placa: "XYZ78D" }), 403); // es del cliente 2
    await fallaCon(qr.ingresar(CLIENTE, { token: token.slice(0, -2) + "xx", placa: "BICI001" }), 400);
    // Un token de sesión no sirve como QR.
    const sesion = await auth.iniciarSesion("cliente1@parkway.test", "Cliente123*");
    await fallaCon(qr.ingresar(CLIENTE, { token: sesion.token, placa: "BICI001" }), 400);
  });
});

describe("avisos de actividad", () => {
  test("el ingreso confirmado avisa por pg_notify con la sede y la operación", async () => {
    const oyente = new Client({ host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORT) || 5432, database: process.env.DB_NAME, user: process.env.DB_USER || "postgres", password: process.env.DB_PASSWORD || "postgres" });
    await oyente.connect();
    await oyente.query("LISTEN parkway_avisos");
    const llegada = new Promise<string>((resolver) => oyente.on("notification", (n) => resolver(n.payload ?? "")));
    const r = await estacionamiento.registrarIngreso({ placa: "AVS123", idTipo: 1, idParqueadero: CHAPINERO }, OPERADOR1);
    const aviso = JSON.parse(await llegada);
    await oyente.end();
    assert.deepEqual(aviso, { tipo: "actividad", sede: CHAPINERO, operacion: "INGRESO" });

    // El operador no recibe sus propias acciones; el administrador sí las ve.
    const delOperador = await actividad.dePersonal(OPERADOR1, CHAPINERO);
    assert.ok(!delOperador.some((a) => a.placa === "AVS123"));
    const delAdmin = await actividad.dePersonal(ADMIN, CHAPINERO);
    const visto = delAdmin.find((a) => a.placa === "AVS123");
    assert.equal(visto?.operacion, "INGRESO");
    assert.equal(visto?.espacio, r.codigo_espacio);
    // Y ve el ingreso con QR del cliente, marcado como tal.
    assert.ok(delAdmin.some((a) => a.operacion === "INGRESO" && a.origen === "QR" && a.placa === "ABC123"));
  });

  test("el cliente se entera si le anulan un pago", async () => {
    const activo = await uno<{ id_registro: number }>(
      "SELECT id_registro FROM registro_estacionamiento WHERE placa = 'ABC123' AND estado = 'ABIERTO'"
    );
    await estacionamiento.registrarSalida(activo.id_registro, OPERADOR1, { metodo: "EFECTIVO", recibido: 100000 });
    const pago = await uno<{ id_pago: number }>("SELECT id_pago FROM pago WHERE id_registro = $1", [activo.id_registro]);
    if (pago) {
      await pagos.anular(pago.id_pago, { motivo: "Billete falso detectado en el cierre" }, ADMIN.id_usuario);
      const avisos = await actividad.deCliente(CLIENTE1);
      const a = avisos.find((x) => x.operacion === "ANULAR_PAGO");
      assert.equal(a?.placa, "ABC123");
      assert.match(String(a?.motivo), /Billete falso/);
    }
  });
});
