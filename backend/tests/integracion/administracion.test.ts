import "./entorno";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN, CHAPINERO, cerrar, CLIENTE1, fallaCon, OPERADOR1, OPERADOR2, reiniciarBase, uno, ZONA_T } from "./base";
import * as sedes from "../../src/services/parqueaderoService";
import * as usuarios from "../../src/services/usuarioService";
import * as reportes from "../../src/services/reporteService";
import * as prediccion from "../../src/services/prediccionService";
import * as horario from "../../src/services/horarioService";
import * as estacionamiento from "../../src/services/estacionamientoService";
import * as cliente from "../../src/services/clienteService";
import { leerFiltrosReporte } from "../../src/validators/reporteValidator";

/**
 * Integración de la administración: sedes (RF05), usuarios (RF02),
 * reportes (RF13), horario, predicción y pronóstico (RF15).
 */
before(reiniciarBase);
after(cerrar);

const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const sedeNueva = (nombre: string, autos = 6) => ({
  nombre,
  direccion: "Calle 1 # 2-3",
  ciudad: "Bogotá",
  pisos: 2,
  espaciosPorPiso: [{ 1: autos, 2: 2, 3: 1 }, { 1: autos, 2: 0, 3: 0 }],
  tarifas: [
    { idTipo: 1, valor_hora: 5000, valor_fraccion: 1500, valor_dia: 35000 },
    { idTipo: 2, valor_hora: 2000, valor_fraccion: 600, valor_dia: 15000 },
    { idTipo: 3, valor_hora: 800, valor_fraccion: 200, valor_dia: 5000 },
  ],
  horarios: [1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia, abre: "00:00", cierra: "24:00" })),
  operadores: [OPERADOR2.id_usuario],
});

describe("sedes", () => {
  let id = 0;

  test("crea una sede con pisos, tarifas, horario y operadores", async () => {
    const s = await sedes.crear(sedeNueva("Sede Usaquén"), ADMIN.id_usuario);
    id = s.id_parqueadero;
    const espacios = await uno<{ n: string }>("SELECT count(*) n FROM espacio WHERE id_parqueadero = $1", [id]);
    assert.equal(Number(espacios.n), 6 + 2 + 1 + 6);
    assert.deepEqual(s.operadores, [OPERADOR2.id_usuario]);
    assert.ok((await sedes.listar()).some((x: { id_parqueadero: number }) => x.id_parqueadero === id));
    assert.ok((await sedes.operadores()).length >= 2);
    await fallaCon(sedes.crear(sedeNueva("Sede Usaquén"), ADMIN.id_usuario), 409);
    await fallaCon(sedes.crear({ nombre: "" }, ADMIN.id_usuario), 400);
  });

  test("edita la sede: agrega espacios y cambia la tarifa", async () => {
    const s = await sedes.actualizar(id, { ...sedeNueva("Sede Usaquén Norte", 8) }, ADMIN.id_usuario);
    assert.equal(s.nombre, "Sede Usaquén Norte");
    const espacios = await uno<{ n: string }>("SELECT count(*) n FROM espacio WHERE id_parqueadero = $1", [id]);
    assert.equal(Number(espacios.n), 8 + 2 + 1 + 8);
    await fallaCon(sedes.actualizar(999, sedeNueva("No existe"), ADMIN.id_usuario), 404);
    await fallaCon(sedes.actualizar(0, sedeNueva("X"), ADMIN.id_usuario), 400);
    await fallaCon(sedes.obtener(999), 404);
  });

  test("no deja quitar espacios ocupados ni marcar fuera de servicio uno ocupado", async () => {
    const r = await estacionamiento.registrarIngreso({ placa: "USA123", idTipo: 1, idParqueadero: id }, OPERADOR2);
    const ocupado = await uno<{ id_espacio: number }>("SELECT id_espacio FROM registro_estacionamiento WHERE id_registro = $1", [r.id_registro]);
    await fallaCon(sedes.cambiarEstadoEspacio(ocupado.id_espacio, "FUERA_DE_SERVICIO", ADMIN.id_usuario), 409, /ocupado/);
    // Una sede sin espacios de automóvil no es válida.
    await fallaCon(sedes.actualizar(id, sedeNueva("Sede Usaquén Norte", 0), ADMIN.id_usuario), 400);
    await estacionamiento.registrarSalida(r.id_registro, OPERADOR2, { metodo: "EFECTIVO" });
  });

  test("marca un espacio fuera de servicio y lo vuelve a habilitar", async () => {
    const libre = await uno<{ id_espacio: number }>("SELECT id_espacio FROM espacio WHERE id_parqueadero = $1 AND estado = 'LIBRE' ORDER BY id_espacio LIMIT 1", [id]);
    const estado = () => uno<{ estado: string }>("SELECT estado FROM espacio WHERE id_espacio = $1", [libre.id_espacio]);
    await sedes.cambiarEstadoEspacio(libre.id_espacio, "FUERA_DE_SERVICIO", ADMIN.id_usuario);
    assert.equal((await estado()).estado, "FUERA_DE_SERVICIO");
    const resumen = await estacionamiento.resumen(id);
    assert.equal(resumen.totales.fuera_de_servicio, 1);
    await sedes.cambiarEstadoEspacio(libre.id_espacio, "LIBRE", ADMIN.id_usuario);
    assert.equal((await estado()).estado, "LIBRE");
    await fallaCon(sedes.cambiarEstadoEspacio(libre.id_espacio, "ROTO", ADMIN.id_usuario), 400);
    await fallaCon(sedes.cambiarEstadoEspacio(999999, "LIBRE", ADMIN.id_usuario), 404);
  });
});

describe("usuarios", () => {
  let idNuevo = 0;
  const datos = {
    nombre: "Pedro Gómez", documento: "1023456789", correo: "pedro@parkway.test",
    rol: "OPERADOR", turno: "DIA", contrasena: "Pedro1234", sedes: [CHAPINERO],
  };

  test("crea un operador con sus sedes y filtra la lista", async () => {
    const u = await usuarios.crear(datos, ADMIN.id_usuario);
    idNuevo = u.id_usuario;
    assert.deepEqual(u.sedes, [CHAPINERO]);
    assert.equal((await usuarios.listar({ q: "pedro" })).length, 1);
    assert.ok((await usuarios.listar({ rol: "operador", estado: "activo" })).length >= 3);
    await fallaCon((async () => usuarios.listar({ rol: "JEFE" }))(), 400);
    await fallaCon(usuarios.crear(datos, ADMIN.id_usuario), 409);
    await fallaCon(usuarios.crear({ ...datos, correo: "x@parkway.test", documento: "5555555", sedes: [999] }, ADMIN.id_usuario), 400);
  });

  test("al pasarlo a cliente pierde las sedes; la contraseña cambia solo si se envía", async () => {
    const u = await usuarios.actualizar(idNuevo, { ...datos, rol: "CLIENTE", contrasena: "", estado: "ACTIVO" }, ADMIN.id_usuario);
    assert.equal(u.rol, "CLIENTE");
    assert.equal(u.turno, null);
    assert.deepEqual(u.sedes, []);
    await fallaCon(usuarios.actualizar(999999, datos, ADMIN.id_usuario), 404);
    await fallaCon(usuarios.obtener(0), 404);
  });

  test("inactivar a un cliente cancela su reserva y libera el espacio", async () => {
    const r = await cliente.reservar(CLIENTE1, { placa: "ABC123", idParqueadero: ZONA_T });
    const u = await usuarios.cambiarEstado(CLIENTE1, "INACTIVO", ADMIN.id_usuario);
    assert.equal(u.estado, "INACTIVO");
    const e = await uno<{ estado: string }>("SELECT estado FROM espacio WHERE id_espacio = $1", [r.id_espacio]);
    assert.equal(e.estado, "LIBRE");
    await usuarios.cambiarEstado(CLIENTE1, "ACTIVO", ADMIN.id_usuario);
    await fallaCon(usuarios.cambiarEstado(CLIENTE1, "BORRADO", ADMIN.id_usuario), 400);
  });

  test("el administrador no se desactiva y siempre queda uno activo", async () => {
    await fallaCon(usuarios.cambiarEstado(ADMIN.id_usuario, "INACTIVO", ADMIN.id_usuario), 409, /propia cuenta/);
    const otro = await usuarios.actualizar(idNuevo, { ...datos, rol: "ADMINISTRADOR", turno: "NOCHE", estado: "ACTIVO" }, ADMIN.id_usuario);
    assert.equal(otro.rol, "ADMINISTRADOR");
    await usuarios.cambiarEstado(ADMIN.id_usuario, "INACTIVO", idNuevo);
    await fallaCon(usuarios.cambiarEstado(idNuevo, "INACTIVO", ADMIN.id_usuario), 409);
    await usuarios.cambiarEstado(ADMIN.id_usuario, "ACTIVO", idNuevo);
  });
});

describe("reportes", () => {
  test("con movimiento del día, los tres reportes cuadran con los pagos", async () => {
    for (const p of ["REP101", "REP102", "REP103"]) {
      const r = await estacionamiento.registrarIngreso({ placa: p, idTipo: 1, idParqueadero: CHAPINERO }, OPERADOR1);
      await uno("UPDATE registro_estacionamiento SET fecha_ingreso = now() - interval '2 hours' WHERE id_registro = $1", [r.id_registro]);
      await estacionamiento.registrarSalida(r.id_registro, OPERADOR1, { metodo: p === "REP103" ? "TARJETA" : "EFECTIVO", referencia: "771205" });
    }
    const v = leerFiltrosReporte({ desde: hoy(), hasta: hoy(), idParqueadero: String(CHAPINERO), agrupacion: "dia" });
    assert.ok(v.valido);
    if (!v.valido) return;

    const ingresos = await reportes.ingresos(v.filtros);
    const pagado = await uno<{ total: string }>(
      `SELECT sum(p.monto) total FROM pago p
         JOIN registro_estacionamiento r USING (id_registro) JOIN espacio e USING (id_espacio)
        WHERE p.estado = 'APROBADO' AND e.id_parqueadero = $1`,
      [CHAPINERO]
    );
    assert.equal(ingresos.resumen.valor, Number(pagado.total));
    assert.equal(ingresos.resumen.salidas, 3);
    assert.ok(ingresos.resumen.porMetodo.tarjeta > 0);

    const ocupacion = await reportes.ocupacion(v.filtros);
    assert.ok(ocupacion.capacidad > 0);
    assert.ok(ocupacion.resumen.llegadas >= 3);

    const rotacion = await reportes.rotacion(v.filtros);
    assert.equal(rotacion.resumen.usos, 3);
    // Cada vehículo toma el primer espacio libre: los tres usaron A-01.
    assert.equal(rotacion.filas[0].codigo, "A-01");
    assert.equal(rotacion.filas[0].usos, 3);

    for (const tipo of reportes.TIPOS_REPORTE) {
      const r = await reportes.generar(tipo, v.filtros);
      assert.ok(r.columnas.length > 3);
    }
  });
});

describe("horario, predicción y pronóstico", () => {
  test("el horario y la predicción de la red responden para cada sede", async () => {
    const estado = await horario.estadoActual(CHAPINERO);
    assert.equal(estado.abierto, true);
    const p = await prediccion.predecirSede(CHAPINERO);
    assert.ok(p.ocupacionEstimada >= 0 && p.ocupacionEstimada <= 1);
    const conTipo = await prediccion.predecirConAlternativa(CHAPINERO, 1);
    assert.ok(conTipo && conTipo.ocupacionEstimada >= 0);
    const guardada = await uno<{ n: string }>("SELECT count(*) n FROM prediccion_ocupacion WHERE modelo = 'MLP'");
    assert.ok(Number(guardada.n) >= 1);
    // Con la sede casi llena, la predicción alerta y sugiere otra sede.
    await uno("UPDATE espacio SET estado = 'FUERA_DE_SERVICIO' WHERE id_parqueadero = $1 AND id_tipo = 1 AND codigo <> 'A-01'", [CHAPINERO]);
    const r = await estacionamiento.registrarIngreso({ placa: "LLN100", idTipo: 1, idParqueadero: CHAPINERO }, OPERADOR1);
    const llena = await prediccion.predecirConAlternativa(CHAPINERO, 1);
    assert.equal(llena?.alerta, true);
    assert.equal(llena?.alternativa?.idParqueadero !== CHAPINERO, true);
    await estacionamiento.registrarSalida(r.id_registro, OPERADOR1, { metodo: "EFECTIVO" });
    await uno("UPDATE espacio SET estado = 'LIBRE' WHERE id_parqueadero = $1 AND estado = 'FUERA_DE_SERVICIO'", [CHAPINERO]);
  });

  test("sin pronóstico calculado lo dice; con pronóstico lo corrige con la red", async () => {
    const vacio = await prediccion.pronostico(CHAPINERO);
    assert.equal(vacio.disponible, false);
    // Simula lo que guarda ia/pronostico_prophet.py.
    await uno(`INSERT INTO modelo_pronostico (id_parqueadero, entrenado, fuente, semanas, mape, mae_pp, cobertura, intervalo)
               VALUES ($1, now(), 'SIMULADA', 12, 16.5, 4.2, 79, 0.8)`, [CHAPINERO]);
    await uno(`INSERT INTO prediccion_ocupacion (id_parqueadero, id_tipo, fecha_hora, ocupacion_estimada, limite_inferior, limite_superior, modelo)
               SELECT $1, NULL, date_trunc('hour', now()) + make_interval(hours => h), 0.4, 0.3, 0.5, 'PROPHET'
                 FROM generate_series(1, 30) h`, [CHAPINERO]);
    const p = await prediccion.pronostico(CHAPINERO);
    assert.equal(p.disponible, true);
    assert.equal(p.horas.length, 24);
    assert.equal(p.modelo?.mape, 16.5);
    assert.ok(p.resumen?.mejorHora);
  });
});
