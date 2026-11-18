import { PoolClient } from "pg";
import { pool } from "../db/pool";
import * as espacioRepository from "../repositories/espacioRepository";
import * as vehiculoRepository from "../repositories/vehiculoRepository";
import * as registroRepository from "../repositories/registroRepository";
import * as catalogoRepository from "../repositories/catalogoRepository";
import * as pagoRepository from "../repositories/pagoRepository";
import { transactionManager } from "../transactions/transactionManager";
import { AppError, badRequest, conflict, notFound } from "../errors/AppError";
import { UsuarioToken } from "../middlewares/auth";
import { verificarAcceso } from "./accesoService";
import { calcularValor } from "./tarifaService";
import { topeMinuto } from "./topeTarifarioService";
import { cobrar } from "./pagoService";
import { FORMATO_PLACA, normalizarPlaca, TIPOS_VEHICULO } from "../validators/ingresoValidator";
import { conCandado } from "../distribuido/redis";

/**
 * Corrección de un ingreso o de un cobro cuando el operador registró mal el
 * vehículo (otra placa u otro tipo) y reclamos del cliente.
 *
 * Como los formatos de placa de carro, moto y bicicleta no se cruzan, un tipo
 * equivocado siempre viene con una placa equivocada: por eso la corrección
 * recibe la placa y el tipo correctos juntos.
 *
 * - Vehículo dentro (CORREGIR_INGRESO): se cambian placa, tipo, espacio y
 *   tarifa del registro abierto. La salida se cobrará con la tarifa correcta.
 * - Visita ya cobrada (CORREGIR_COBRO, administrador): se recalcula con la
 *   tarifa y el tope del tipo correcto. Solo se permite si el valor no sube:
 *   se anula el pago, se emite uno nuevo por el valor correcto y la devolución
 *   queda en la bitácora.
 * - Reclamos (RECLAMO / RESPONDER_RECLAMO): el cliente reporta un cobro desde
 *   su historial y el administrador lo resuelve o lo rechaza.
 *
 * Todas las operaciones usan la entidad registro_estacionamiento en la
 * bitácora; así los avisos encuentran la sede sin conocer la tabla reclamo.
 */

const NOMBRE_TIPO: Record<number, string> = { 1: "automóvil", 2: "motocicleta", 3: "bicicleta" };
const pesos = (v: number) => `$ ${Math.round(v).toLocaleString("es-CO")}`;

interface DatosCorreccion {
  placa: string;
  idTipo: number;
  marca?: string;
  color?: string;
  motivo: string;
}

export function validarCorreccion(body: Record<string, unknown>): DatosCorreccion {
  const errores: Record<string, string> = {};
  const idTipo = Number(body.idTipo);
  if (!FORMATO_PLACA[idTipo]) errores.idTipo = "Seleccione el tipo de vehículo correcto";
  const placa = normalizarPlaca(body.placa);
  if (!placa) errores.placa = "Escriba la placa correcta";
  else if (FORMATO_PLACA[idTipo] && !FORMATO_PLACA[idTipo].regex.test(placa)) {
    errores.placa = `Formato inválido para ${NOMBRE_TIPO[idTipo]}. Ejemplo: ${FORMATO_PLACA[idTipo].ejemplo}`;
  }
  const motivo = String(body.motivo ?? "").trim();
  if (motivo.length < 5) errores.motivo = "Explique qué se corrige (por ejemplo, «era moto, no carro»)";
  else if (motivo.length > 200) errores.motivo = "Máximo 200 caracteres";
  const texto = (v: unknown) => (v == null || String(v).trim() === "" ? undefined : String(v).trim().slice(0, 30));
  if (Object.keys(errores).length) throw badRequest("Revise los campos del formulario", errores);
  return { placa, idTipo, marca: texto(body.marca), color: texto(body.color), motivo };
}

/** El vehículo correcto: si existe debe ser de ese tipo; si no, se crea (salvo bicicletas sin código). */
async function vehiculoCorrecto(client: PoolClient, d: DatosCorreccion) {
  const v = await vehiculoRepository.buscarParaActualizar(client, d.placa);
  if (v) {
    if (v.id_tipo !== d.idTipo) throw conflict(`La placa ${d.placa} está registrada como ${NOMBRE_TIPO[v.id_tipo]}`);
    if (d.marca || d.color) await vehiculoRepository.actualizarDatos(client, d.placa, d.marca, d.color);
    return;
  }
  if (d.idTipo === TIPOS_VEHICULO.BICICLETA) throw notFound(`No hay ninguna bicicleta con el código ${d.placa}`);
  await vehiculoRepository.crear(client, d);
}

// ---------------------------------------------------------------------
// B. Corregir un ingreso abierto (operador o administrador)
// ---------------------------------------------------------------------
export async function corregirIngreso(usuario: UsuarioToken, idRegistro: number, body: Record<string, unknown>) {
  if (!Number.isInteger(idRegistro) || idRegistro <= 0) throw badRequest("Registro inválido");
  const d = validarCorreccion(body);
  // Mismo candado por placa que el ingreso: nadie más registra esta placa mientras tanto.
  await conCandado(`placa:${d.placa}`, () => transactionManager.ejecutar(
    usuario.id_usuario,
    "CORREGIR_INGRESO",
    "registro_estacionamiento",
    async (client) => {
      const r = await registroRepository.bloquearConTarifa(client, idRegistro);
      if (!r) throw notFound("El registro no existe");
      await verificarAcceso(usuario, r.id_parqueadero, client);
      if (r.estado !== "ABIERTO") throw conflict(`El vehículo ${r.placa} ya no está dentro: corrija el cobro desde Pagos`);
      if (r.placa === d.placa && r.id_tipo === d.idTipo) throw conflict("La placa y el tipo ya son esos: no hay nada que corregir");

      await vehiculoCorrecto(client, d);
      if (r.placa !== d.placa && (await registroRepository.buscarAbiertoPorPlaca(client, d.placa))) {
        throw conflict(`El vehículo ${d.placa} ya se encuentra dentro del parqueadero`);
      }

      // Espacio del tipo correcto: se conserva si ya lo es; si no, el primer libre del tipo.
      const actual = await espacioRepository.bloquearParaAsignacion(client, r.id_espacio);
      let espacio = actual!;
      if (actual!.id_tipo !== d.idTipo) {
        const libre = await espacioRepository.tomarPrimerLibre(client, r.id_parqueadero, d.idTipo);
        if (!libre) throw conflict(`No hay espacios libres para ${NOMBRE_TIPO[d.idTipo]} en la sede`);
        await espacioRepository.actualizarEstado(client, actual!.id_espacio, "LIBRE");
        await espacioRepository.actualizarEstado(client, libre.id_espacio, "OCUPADO");
        espacio = libre;
      }
      const tarifa = await catalogoRepository.tarifaActiva(client, r.id_parqueadero, d.idTipo);
      if (!tarifa) throw conflict("La sede no tiene una tarifa activa para ese tipo de vehículo");

      await client.query(
        `UPDATE registro_estacionamiento SET placa = $2, id_espacio = $3, id_tarifa = $4 WHERE id_registro = $1`,
        [idRegistro, d.placa, espacio.id_espacio, tarifa.id_tarifa]
      );
      return {
        id_registro: idRegistro,
        placa: d.placa,
        placa_anterior: r.placa,
        tipo: NOMBRE_TIPO[d.idTipo],
        tipo_anterior: NOMBRE_TIPO[r.id_tipo],
        espacio: espacio.codigo,
        espacio_anterior: r.codigo_espacio,
        valor_hora: Number(tarifa.valor_hora),
      };
    },
    { idEntidad: (x) => x.id_registro, detalle: (x) => ({ ...x, id_registro: undefined, motivo: d.motivo }) }
  ));
  return registroRepository.obtenerDetalle(idRegistro);
}

// ---------------------------------------------------------------------
// C. Corregir un cobro ya pagado (administrador)
// ---------------------------------------------------------------------
export async function corregirCobro(usuario: UsuarioToken, idRegistro: number, body: Record<string, unknown>) {
  if (!Number.isInteger(idRegistro) || idRegistro <= 0) throw badRequest("Registro inválido");
  const d = validarCorreccion(body);
  const idReclamo = body.idReclamo != null && body.idReclamo !== "" ? Number(body.idReclamo) : null;
  if (idReclamo !== null && !(Number.isInteger(idReclamo) && idReclamo > 0)) throw badRequest("Reclamo inválido");

  const resultado = await conCandado(`placa:${d.placa}`, () => transactionManager.ejecutar(
    usuario.id_usuario,
    "CORREGIR_COBRO",
    "registro_estacionamiento",
    async (client) => {
      const r = await registroRepository.bloquearConTarifa(client, idRegistro);
      if (!r) throw notFound("El registro no existe");
      await verificarAcceso(usuario, r.id_parqueadero, client);
      if (r.estado !== "CERRADO") throw conflict("Solo se corrige el cobro de una visita terminada");
      if (r.placa === d.placa && r.id_tipo === d.idTipo) throw conflict("La placa y el tipo ya son esos: no hay nada que corregir");

      await vehiculoCorrecto(client, d);
      const tarifa = await catalogoRepository.tarifaActiva(client, r.id_parqueadero, d.idTipo);
      if (!tarifa) throw conflict("La sede no tiene una tarifa activa para ese tipo de vehículo");
      const anterior = Number(r.valor_calculado ?? 0);
      const valor = calcularValor(Number(r.minutos), { ...tarifa, tope_minuto: await topeMinuto(r.id_parqueadero, d.idTipo) });
      if (valor > anterior) {
        throw conflict(`Con el tipo correcto el valor sería ${pesos(valor)}, mayor que lo cobrado (${pesos(anterior)}). La corrección solo puede devolver dinero.`);
      }

      // Pago vigente: se anula y se emite uno nuevo por el valor correcto, con el mismo método.
      const vigente = await pagoRepository.aprobadoDe(client, idRegistro);
      let comprobante: string | null = null;
      let devolucion = 0;
      let metodo: string | null = null;
      if (vigente) {
        const p = await pagoRepository.bloquear(client, vigente.id_pago);
        await pagoRepository.anular(client, p.id_pago, usuario.id_usuario, `Corrección de cobro: ${d.motivo}`.slice(0, 200));
        devolucion = Number(p.monto) - valor;
        metodo = p.metodo;
        if (valor > 0) {
          const nuevo = await cobrar(client, {
            idRegistro,
            idOperador: usuario.id_usuario,
            monto: valor,
            placa: d.placa,
            pago: {
              metodo: p.metodo,
              recibido: p.metodo === "EFECTIVO" ? valor : null,
              // La referencia es única por método: se marca como corrección del pago anterior.
              referencia: p.metodo === "EFECTIVO" ? null : `${p.referencia_externa}-C${p.id_pago}`.slice(-60),
            },
          });
          comprobante = nuevo.comprobante;
        }
      }

      await client.query(
        `UPDATE registro_estacionamiento SET placa = $2, id_tarifa = $3, valor_calculado = $4 WHERE id_registro = $1`,
        [idRegistro, d.placa, tarifa.id_tarifa, valor]
      );
      let idClienteReclamo: number | null = null;
      if (idReclamo) {
        const { rows: rr } = await client.query(
          `UPDATE reclamo SET estado = 'RESUELTO', respuesta = $3, id_administrador = $4, fecha_respuesta = now()
            WHERE id_reclamo = $1 AND id_registro = $2 AND estado = 'PENDIENTE'
            RETURNING id_cliente`,
          [idReclamo, idRegistro, `Cobro corregido: ${d.motivo}. Devolución de ${pesos(devolucion)}.`.slice(0, 500), usuario.id_usuario]
        );
        if (!rr[0]) throw conflict("El reclamo ya fue respondido o no es de esta visita");
        idClienteReclamo = rr[0].id_cliente;
      }
      return {
        id_registro: idRegistro,
        placa: d.placa,
        placa_anterior: r.placa,
        tipo: NOMBRE_TIPO[d.idTipo],
        tipo_anterior: NOMBRE_TIPO[r.id_tipo],
        valor_anterior: anterior,
        valor,
        devolucion,
        metodo,
        comprobante,
        cliente: idClienteReclamo,
      };
    },
    { idEntidad: (x) => x.id_registro, detalle: (x) => ({ ...x, id_registro: undefined, motivo: d.motivo, reclamo: idReclamo }) }
  ));
  return { ...resultado, registro: await registroRepository.obtenerDetalle(idRegistro) };
}

/** Vista previa para el administrador: cuánto costaría la visita con otra placa y tipo. */
export async function simularCobro(usuario: UsuarioToken, idRegistro: number, idTipo: number) {
  const r = await pool.query(
    `SELECT r.minutos, r.valor_calculado::float AS valor, r.estado, e.id_parqueadero
       FROM registro_estacionamiento r JOIN espacio e ON e.id_espacio = r.id_espacio WHERE r.id_registro = $1`,
    [idRegistro]
  ).then((x) => x.rows[0]);
  if (!r) throw notFound("El registro no existe");
  await verificarAcceso(usuario, r.id_parqueadero);
  if (!FORMATO_PLACA[idTipo]) throw badRequest("Tipo inválido");
  const client = await pool.connect();
  try {
    const tarifa = await catalogoRepository.tarifaActiva(client, r.id_parqueadero, idTipo);
    if (!tarifa) throw conflict("La sede no tiene una tarifa activa para ese tipo de vehículo");
    const valor = calcularValor(Number(r.minutos), { ...tarifa, tope_minuto: await topeMinuto(r.id_parqueadero, idTipo) });
    return { minutos: r.minutos, valor_anterior: r.valor, valor, devolucion: Math.max(0, r.valor - valor), permitido: valor <= r.valor };
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------
// D. Reclamos del cliente
// ---------------------------------------------------------------------
/** La tabla reclamo llega con migracion_propuesta.sql; sin ella se responde con claridad. */
function sinMigracion(e: unknown): never {
  if ((e as { code?: string }).code === "42P01") {
    throw new AppError(503, "Los reclamos requieren la migración migracion_propuesta.sql");
  }
  throw e;
}

export async function crearReclamo(idCliente: number, body: Record<string, unknown>) {
  // Desde el historial (idRegistro) o con el número del comprobante: si el
  // operador escribió otra placa, la visita no aparece en el historial del cliente.
  const comprobante = String(body.comprobante ?? "").trim().toUpperCase();
  const idRegistroBody = Number(body.idRegistro);
  if (!comprobante && !(Number.isInteger(idRegistroBody) && idRegistroBody > 0)) {
    throw badRequest("Revise los campos del formulario", { comprobante: "Escriba el número del comprobante" });
  }
  const motivo = String(body.motivo ?? "").trim();
  if (motivo.length < 10 || motivo.length > 500) {
    throw badRequest("Revise los campos del formulario", { motivo: "Cuéntenos qué pasó (entre 10 y 500 caracteres)" });
  }
  return transactionManager
    .ejecutar(
      idCliente,
      "RECLAMO",
      "registro_estacionamiento",
      async (client) => {
        const { rows } = comprobante
          ? await client.query(
              `SELECT r.id_registro, r.placa, r.estado FROM comprobante c
                 JOIN pago p ON p.id_pago = c.id_pago
                 JOIN registro_estacionamiento r ON r.id_registro = p.id_registro
                WHERE upper(c.numero) = $1`,
              [comprobante]
            )
          : await client.query(
              `SELECT r.id_registro, r.placa, r.estado FROM registro_estacionamiento r
                 JOIN vehiculo v ON v.placa = r.placa
                WHERE r.id_registro = $1 AND v.id_cliente = $2`,
              [idRegistroBody, idCliente]
            );
        if (!rows[0]) throw notFound(comprobante ? `No hay ningún comprobante ${comprobante}` : "Esa visita no es de uno de sus vehículos");
        const idRegistro = rows[0].id_registro as number;
        if (rows[0].estado !== "CERRADO") throw conflict("Puede reportar el cobro cuando la visita termine");
        try {
          await client.query("SAVEPOINT reclamo");
          const ins = await client.query(
            `INSERT INTO reclamo (id_registro, id_cliente, motivo) VALUES ($1, $2, $3) RETURNING id_reclamo, fecha_creacion`,
            [idRegistro, idCliente, motivo]
          );
          return { id_registro: idRegistro, placa: rows[0].placa, ...ins.rows[0] };
        } catch (e) {
          if ((e as { code?: string }).code === "23505") {
            await client.query("ROLLBACK TO SAVEPOINT reclamo");
            throw conflict("Ya tiene un reclamo pendiente sobre esta visita");
          }
          throw e;
        }
      },
      { idEntidad: (x) => x.id_registro, detalle: (x) => ({ placa: x.placa, reclamo: x.id_reclamo, cliente: idCliente, motivo: motivo.slice(0, 200) }) }
    )
    .catch(sinMigracion);
}

const SELECT_RECLAMO = `
  SELECT c.id_reclamo, c.id_registro, c.motivo, c.estado, c.respuesta, c.fecha_creacion, c.fecha_respuesta,
         r.placa, tv.id_tipo, tv.nombre AS tipo, r.minutos, r.valor_calculado::float AS valor,
         r.fecha_ingreso, r.fecha_salida, p.nombre AS sede, e.id_parqueadero,
         u.nombre AS cliente, a.nombre AS administrador
    FROM reclamo c
    JOIN registro_estacionamiento r ON r.id_registro = c.id_registro
    JOIN espacio e        ON e.id_espacio = r.id_espacio
    JOIN parqueadero p    ON p.id_parqueadero = e.id_parqueadero
    JOIN vehiculo v       ON v.placa = r.placa
    JOIN tipo_vehiculo tv ON tv.id_tipo = v.id_tipo
    JOIN usuario u        ON u.id_usuario = c.id_cliente
    LEFT JOIN usuario a   ON a.id_usuario = c.id_administrador`;

export async function misReclamos(idCliente: number) {
  try {
    const { rows } = await pool.query(`${SELECT_RECLAMO} WHERE c.id_cliente = $1 ORDER BY c.fecha_creacion DESC LIMIT 100`, [idCliente]);
    return rows;
  } catch (e) {
    if ((e as { code?: string }).code === "42P01") return [];
    throw e;
  }
}

export async function listarReclamos(estado?: unknown) {
  const filtro = typeof estado === "string" && ["PENDIENTE", "RESUELTO", "RECHAZADO"].includes(estado) ? estado : null;
  try {
    const { rows } = await pool.query(
      `${SELECT_RECLAMO} WHERE ($1::text IS NULL OR c.estado = $1)
        ORDER BY (c.estado = 'PENDIENTE') DESC, c.fecha_creacion DESC LIMIT 200`,
      [filtro]
    );
    return rows;
  } catch (e) {
    if ((e as { code?: string }).code === "42P01") return [];
    throw e;
  }
}

/** Respuesta sin corrección de cobro (rechazo o resolución por otra vía). */
export async function responderReclamo(usuario: UsuarioToken, idReclamo: number, body: Record<string, unknown>) {
  if (!Number.isInteger(idReclamo) || idReclamo <= 0) throw badRequest("Reclamo inválido");
  const estado = body.estado === "RESUELTO" ? "RESUELTO" : body.estado === "RECHAZADO" ? "RECHAZADO" : null;
  const respuesta = String(body.respuesta ?? "").trim();
  const errores: Record<string, string> = {};
  if (!estado) errores.estado = "Indique si el reclamo se resuelve o se rechaza";
  if (respuesta.length < 5 || respuesta.length > 500) errores.respuesta = "Escriba la respuesta para el cliente (5 a 500 caracteres)";
  if (Object.keys(errores).length) throw badRequest("Revise los campos del formulario", errores);

  return transactionManager
    .ejecutar(
      usuario.id_usuario,
      "RESPONDER_RECLAMO",
      "registro_estacionamiento",
      async (client) => {
        const { rows } = await client.query(
          `SELECT c.id_reclamo, c.id_registro, c.id_cliente, c.estado, r.placa, e.id_parqueadero
             FROM reclamo c
             JOIN registro_estacionamiento r ON r.id_registro = c.id_registro
             JOIN espacio e ON e.id_espacio = r.id_espacio
            WHERE c.id_reclamo = $1
            FOR UPDATE OF c`,
          [idReclamo]
        );
        const c = rows[0];
        if (!c) throw notFound("El reclamo no existe");
        await verificarAcceso(usuario, c.id_parqueadero, client);
        if (c.estado !== "PENDIENTE") throw conflict("El reclamo ya fue respondido");
        await client.query(
          `UPDATE reclamo SET estado = $2, respuesta = $3, id_administrador = $4, fecha_respuesta = now() WHERE id_reclamo = $1`,
          [idReclamo, estado, respuesta, usuario.id_usuario]
        );
        return { id_registro: c.id_registro, placa: c.placa, id_reclamo: idReclamo, cliente: c.id_cliente };
      },
      {
        idEntidad: (x) => x.id_registro,
        detalle: (x) => ({ placa: x.placa, reclamo: x.id_reclamo, cliente: x.cliente, resultado: estado, respuesta: respuesta.slice(0, 200) }),
      }
    )
    .catch(sinMigracion);
}
