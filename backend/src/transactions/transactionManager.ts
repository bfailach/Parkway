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
 */
export interface OpcionesTransaccion<T> {
  /** Obtiene el identificador de la entidad afectada a partir del resultado. */
  idEntidad?: (resultado: T) => string | number;
  /** Datos adicionales para la bitácora (se guardan en la columna JSONB). */
  detalle?: (resultado: T) => Record<string, unknown>;
}

export class TransactionManager {
  /**
   * Ejecuta `work` dentro de una transacción de PostgreSQL y registra el
   * resultado (CONFIRMADA o REVERTIDA) en la tabla `transaccion`.
   *
   * @param idUsuario      Usuario que ejecuta la operación (para la bitácora)
   * @param tipoOperacion  Ej: "INGRESO", "SALIDA", "PAGO", "RESERVA"
   * @param entidad        Nombre de la tabla/entidad afectada
   * @param work           Función que recibe el cliente de conexión ya dentro
   *                       de la transacción y ejecuta las operaciones de negocio
   */
  async ejecutar<T>(
    idUsuario: number,
    tipoOperacion: string,
    entidad: string,
    work: (client: PoolClient) => Promise<T>,
    opciones: OpcionesTransaccion<T> = {}
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const resultado = await work(client);

      await client.query(
        `INSERT INTO transaccion (id_usuario, tipo_operacion, entidad, id_entidad, estado, fecha_fin, detalle)
         VALUES ($1, $2, $3, $4, 'CONFIRMADA', now(), $5)`,
        [
          idUsuario,
          tipoOperacion,
          entidad,
          opciones.idEntidad ? String(opciones.idEntidad(resultado)) : null,
          opciones.detalle ? JSON.stringify(opciones.detalle(resultado)) : null,
        ]
      );

      await client.query("COMMIT");
      client.release();
      return resultado;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } finally {
        // Se libera la conexión ANTES de registrar la reversión. Si se
        // retuviera mientras se pide otra conexión para la bitácora, con
        // muchas operaciones fallidas simultáneas el pool se agotaría y
        // todas quedarían esperando entre sí.
        client.release();
      }

      // La reversión se registra en una transacción aparte, ya que la
      // transacción original fue revertida.
      try {
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
      } catch (logError) {
        // eslint-disable-next-line no-console
        console.error("No se pudo registrar la reversión en la bitácora", logError);
      }

      throw error;
    }
  }
}

export const transactionManager = new TransactionManager();
