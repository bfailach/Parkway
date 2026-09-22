import { PoolClient } from "pg";
import { pool } from "../db/pool";

/**
 * Repositorio de Espacio (patrón Repository).
 * Traduce operaciones del dominio a sentencias SQL parametrizadas.
 * Las funciones que reciben `client` deben usarse dentro de una unidad de
 * trabajo abierta por el TransactionManager; las que usan `pool`
 * directamente son consultas de solo lectura fuera de una transacción.
 */

export interface Espacio {
  id_espacio: number;
  id_parqueadero: number;
  id_tipo: number;
  codigo: string;
  estado: "LIBRE" | "RESERVADO" | "OCUPADO" | "FUERA_DE_SERVICIO";
  version: number;
}

export async function listarDisponibles(
  idParqueadero: number,
  idTipo: number
): Promise<Espacio[]> {
  const { rows } = await pool.query(
    `SELECT * FROM espacio
     WHERE id_parqueadero = $1 AND id_tipo = $2 AND estado = 'LIBRE'
     ORDER BY codigo`,
    [idParqueadero, idTipo]
  );
  return rows;
}

export async function bloquearParaAsignacion(
  client: PoolClient,
  idEspacio: number
): Promise<Espacio | null> {
  const { rows } = await client.query(
    `SELECT * FROM espacio WHERE id_espacio = $1 FOR UPDATE`,
    [idEspacio]
  );
  return rows[0] ?? null;
}

export async function actualizarEstado(
  client: PoolClient,
  idEspacio: number,
  nuevoEstado: Espacio["estado"]
): Promise<void> {
  await client.query(
    `UPDATE espacio SET estado = $2, version = version + 1 WHERE id_espacio = $1`,
    [idEspacio, nuevoEstado]
  );
}
