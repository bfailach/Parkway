import { PoolClient } from "pg";
import * as pagoRepository from "../repositories/pagoRepository";
import * as registroRepository from "../repositories/registroRepository";
import * as bitacoraRepository from "../repositories/bitacoraRepository";
import { transactionManager } from "../transactions/transactionManager";
import { AppError, badRequest, conflict, notFound } from "../errors/AppError";
import { calcularCambio, DatosPago, METODOS, validarAnulacion, validarPago } from "../validators/pagoValidator";
import { FiltrosPagos } from "../repositories/pagoRepository";

/**
 * Pagos y comprobantes (RF08) y anulación (RF09).
 *
 * El pago se registra en la misma transacción que la salida: se cierra el
 * registro, se libera el espacio, se aprueba el pago y se emite el
 * comprobante, o no pasa nada. Un índice único impide dos pagos aprobados
 * para el mismo registro y otro impide registrar dos veces la misma
 * referencia de tarjeta o transferencia (idempotencia).
 */

export function leerPago(body: Record<string, unknown>): DatosPago {
  const v = validarPago(body);
  if (!v.valido) throw badRequest("Revise los datos del pago", v.errores);
  return v.datos;
}

const pesos = (v: number) => `$ ${Math.round(v).toLocaleString("es-CO")}`;

/**
 * Registra el pago aprobado y su comprobante dentro de una transacción ya
 * abierta. También deja la fila PAGO en la bitácora.
 */
export async function cobrar(
  client: PoolClient,
  c: { idRegistro: number; idOperador: number; monto: number; pago: DatosPago; placa: string }
) {
  const efectivo = c.pago.metodo === "EFECTIVO" ? calcularCambio(c.monto, c.pago.recibido) : null;
  if (c.pago.metodo === "EFECTIVO" && !efectivo) {
    // Con el paso de los minutos el valor pudo subir desde que se abrió la pantalla.
    throw new AppError(409, `El valor a pagar es ${pesos(c.monto)}`, {
      recibido: `Faltan ${pesos(c.monto - (c.pago.recibido ?? 0))}`,
    });
  }
  const idPago = await pagoRepository.crear(client, {
    idRegistro: c.idRegistro,
    idOperador: c.idOperador,
    monto: c.monto,
    metodo: c.pago.metodo,
    referencia: c.pago.referencia,
    recibido: efectivo?.recibido ?? null,
    cambio: efectivo?.cambio ?? null,
  });
  const comprobante = await pagoRepository.emitirComprobante(client, idPago, c.monto);
  await bitacoraRepository.registrar(client, {
    idUsuario: c.idOperador,
    tipo: "PAGO",
    entidad: "pago",
    idEntidad: idPago,
    detalle: { placa: c.placa, valor: c.monto, metodo: c.pago.metodo, comprobante },
  });
  return { idPago, comprobante };
}

export function obtener(idPago: number) {
  return pagoRepository.obtener(idPago);
}

export async function listar(f: FiltrosPagos) {
  const [pagos, totales] = await Promise.all([pagoRepository.listar(f), pagoRepository.totalesPorMetodo(f)]);
  const porMetodo = METODOS.map((m) => totales.find((t) => t.metodo === m) ?? { metodo: m, pagos: 0, total: 0, anulados: 0, total_anulado: 0 });
  return {
    pagos,
    totales: {
      porMetodo,
      total: porMetodo.reduce((a, t) => a + t.total, 0),
      pagos: porMetodo.reduce((a, t) => a + t.pagos, 0),
      anulados: porMetodo.reduce((a, t) => a + t.anulados, 0),
      totalAnulado: porMetodo.reduce((a, t) => a + t.total_anulado, 0),
    },
  };
}

/** RF09: el administrador anula un pago con error. El pago queda ANULADO, no se borra. */
export async function anular(idPago: number, body: Record<string, unknown>, idAdmin: number) {
  if (!Number.isInteger(idPago) || idPago <= 0) throw notFound("El pago no existe");
  const v = validarAnulacion(body);
  if (!v.valido) throw badRequest("Revise el motivo", v.errores);
  await transactionManager.ejecutar(
    idAdmin,
    "ANULAR_PAGO",
    "pago",
    async (client) => {
      const p = await pagoRepository.bloquear(client, idPago);
      if (!p) throw notFound("El pago no existe");
      if (p.estado === "ANULADO") throw conflict(`El pago del comprobante ${p.comprobante} ya estaba anulado`);
      if (p.estado !== "APROBADO") throw conflict("Solo se pueden anular pagos aprobados");
      await pagoRepository.anular(client, idPago, idAdmin, v.datos.motivo);
      return p;
    },
    {
      idEntidad: () => idPago,
      detalle: (p) => ({ comprobante: p.comprobante, valor: Number(p.monto), metodo: p.metodo, motivo: v.datos.motivo }),
    }
  );
  return pagoRepository.obtener(idPago);
}

/**
 * Vuelve a cobrar un registro cuyo pago se anuló. El valor es el que se
 * calculó en la salida; el nuevo pago lleva su propio comprobante.
 */
export async function cobrarDeNuevo(idRegistro: number, body: Record<string, unknown>, idAdmin: number) {
  if (!Number.isInteger(idRegistro) || idRegistro <= 0) throw notFound("El registro no existe");
  const pago = leerPago(body);
  const { idPago } = await transactionManager.ejecutar(
    idAdmin,
    "COBRO_NUEVO",
    "registro_estacionamiento",
    async (client) => {
      const r = await registroRepository.bloquearConTarifa(client, idRegistro);
      if (!r) throw notFound("El registro no existe");
      if (r.estado !== "CERRADO") throw conflict("El vehículo sigue dentro: el pago se registra con la salida");
      if (await pagoRepository.aprobadoDe(client, idRegistro)) throw conflict("Este registro ya tiene un pago aprobado");
      const monto = Number(r.valor_calculado);
      if (!(monto > 0)) throw conflict("Este registro no tiene valor por cobrar");
      return cobrar(client, { idRegistro, idOperador: idAdmin, monto, pago, placa: r.placa });
    },
    { idEntidad: () => idRegistro, detalle: (x) => ({ comprobante: x.comprobante, metodo: pago.metodo }) }
  );
  return pagoRepository.obtener(idPago);
}
