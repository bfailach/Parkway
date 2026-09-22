import { PoolClient } from "pg";
import { pool } from "../db/pool";

/**
 * GestorTransacciones (clase de control)
 *
 * Concentra la demarcación de las unidades de trabajo (BEGIN / COMMIT /
 * ROLLBACK) y el registro en la bitácora (tabla `transaccion`), tal como
 * se definió en la arquitectura de la Fase 1. Los servicios de negocio no
 * abren conexiones ni manejan SQL de control de transacciones por su
 * cuenta: solicitan aquí una unidad de trabajo y ejecutan dentro de ella
 * las operaciones necesarias mediante los repositorios.
 *
 * Esta es una implementación inicial (esqueleto) para la fase de
 * estructura de datos y backend. La lógica de negocio de cada caso de uso
 * (reservar espacio, registrar ingreso/salida, procesar pago, etc.) se
 * desarrollará en fases posteriores sobre esta base.
 */
export class TransactionManager {
  /**
   * Ejecuta `work` dentro de una transacción de PostgreSQL y registra el
   * resultado (CONFIRMADA o REVERTIDA) en la tabla `transaccion`.
   *
   * @param idUsuario   Usuario que ejecuta la operación (para la bitácora)
   * @param tipoOperacion  Ej: "INGRESO", "SALIDA", "PAGO", "RESERVA"
   * @param entidad     Nombre de la tabla/entidad afectada
   * @param work        Función que recibe el cliente de conexión ya dentro
   *                    de la transacción y ejecuta las operaciones de negocio
   */
  async ejecutar<T>(
    idUsuario: number,
    tipoOperacion: string,
    entidad: string,
    work: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const resultado = await work(client);

      await client.query(
        `INSERT INTO transaccion (id_usuario, tipo_operacion, entidad, estado, fecha_fin)
         VALUES ($1, $2, $3, 'CONFIRMADA', now())`,
        [idUsuario, tipoOperacion, entidad]
      );

      await client.query("COMMIT");
      return resultado;
    } catch (error) {
      await client.query("ROLLBACK");

      // La reversión se registra en una transacción aparte, ya que la
      // transacción original fue revertida.
      await pool.query(
        `INSERT INTO transaccion (id_usuario, tipo_operacion, entidad, estado, fecha_fin, detalle)
         VALUES ($1, $2, $3, 'REVERTIDA', now(), $4)`,
        [
          idUsuario,
          tipoOperacion,
          entidad,
          JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
        ]
      );

      throw error;
    } finally {
      client.release();
    }
  }
}

export const transactionManager = new TransactionManager();
