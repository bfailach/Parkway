import { PoolClient } from "pg";
import { pool } from "../db/pool";

/**
 * Repositorio de Espacio (patrón Repository).
 * Traduce operaciones del dominio a sentencias SQL parametrizadas.
 * Las funciones que reciben `client` deben usarse dentro de una unidad de
 * trabajo abierta por el TransactionManager. Las que usan `pool`
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

export async function listarDisponibles(idParqueadero: number, idTipo: number): Promise<Espacio[]> {
  const { rows } = await pool.query(
    `SELECT * FROM espacio
     WHERE id_parqueadero = $1 AND id_tipo = $2 AND estado = 'LIBRE'
     ORDER BY codigo`,
    [idParqueadero, idTipo]
  );
  return rows;
}

/** Mapa completo de espacios de una sede, con la placa del vehículo que lo ocupa. */
export async function listarConOcupacion(idParqueadero: number) {
  const { rows } = await pool.query(
    `SELECT e.id_espacio, e.codigo, e.estado, e.id_tipo, t.nombre AS tipo,
            r.id_registro, COALESCE(r.placa, rs.placa) AS placa, r.fecha_ingreso,
            rs.id_reserva, rs.fecha_fin AS reserva_vence,
            v.marca, v.color, u.nombre AS cliente
       FROM espacio e
       JOIN tipo_vehiculo t ON t.id_tipo = e.id_tipo
       LEFT JOIN registro_estacionamiento r
              ON r.id_espacio = e.id_espacio AND r.estado = 'ABIERTO'
       LEFT JOIN reserva rs
              ON rs.id_espacio = e.id_espacio AND rs.estado = 'ACTIVA'
       LEFT JOIN vehiculo v ON v.placa = COALESCE(r.placa, rs.placa)
       LEFT JOIN usuario u  ON u.id_usuario = v.id_cliente
      WHERE e.id_parqueadero = $1
      ORDER BY e.id_tipo, e.codigo`,
    [idParqueadero]
  );
  return rows;
}

/**
 * Plano público de la sede: estado de cada espacio sin placas ni dueños.
 * Incluye marca y color del vehículo estacionado (lo que cualquiera ve en
 * el parqueadero) para dibujar el modelo 3D correspondiente.
 */
export async function listarPlano(idParqueadero: number) {
  const { rows } = await pool.query(
    `SELECT e.id_espacio, e.codigo, e.estado, e.id_tipo, t.nombre AS tipo, v.marca, v.color
       FROM espacio e
       JOIN tipo_vehiculo t ON t.id_tipo = e.id_tipo
       LEFT JOIN registro_estacionamiento r ON r.id_espacio = e.id_espacio AND r.estado = 'ABIERTO'
       LEFT JOIN vehiculo v ON v.placa = r.placa
      WHERE e.id_parqueadero = $1
      ORDER BY e.id_tipo, e.codigo`,
    [idParqueadero]
  );
  return rows;
}

/** Conteo de espacios por tipo y estado (RF05). */
export async function resumenPorTipo(idParqueadero: number) {
  const { rows } = await pool.query(
    `SELECT t.id_tipo, t.nombre AS tipo,
            count(*)::int                                            AS total,
            count(*) FILTER (WHERE e.estado = 'LIBRE')::int          AS libres,
            count(*) FILTER (WHERE e.estado = 'OCUPADO')::int        AS ocupados,
            count(*) FILTER (WHERE e.estado = 'RESERVADO')::int      AS reservados,
            count(*) FILTER (WHERE e.estado = 'FUERA_DE_SERVICIO')::int AS fuera_de_servicio
       FROM espacio e
       JOIN tipo_vehiculo t ON t.id_tipo = e.id_tipo
      WHERE e.id_parqueadero = $1
      GROUP BY t.id_tipo, t.nombre
      ORDER BY t.id_tipo`,
    [idParqueadero]
  );
  return rows;
}

/**
 * Toma el primer espacio libre del tipo pedido y lo bloquea.
 * SKIP LOCKED hace que dos operadores que registran ingresos al mismo
 * tiempo obtengan espacios distintos en lugar de esperar uno al otro.
 */
export async function tomarPrimerLibre(
  client: PoolClient,
  idParqueadero: number,
  idTipo: number
): Promise<Espacio | null> {
  const { rows } = await client.query(
    `SELECT * FROM espacio
      WHERE id_parqueadero = $1 AND id_tipo = $2 AND estado = 'LIBRE'
      ORDER BY codigo
      LIMIT 1
      FOR UPDATE SKIP LOCKED`,
    [idParqueadero, idTipo]
  );
  return rows[0] ?? null;
}

export async function bloquearParaAsignacion(client: PoolClient, idEspacio: number): Promise<Espacio | null> {
  const { rows } = await client.query(`SELECT * FROM espacio WHERE id_espacio = $1 FOR UPDATE`, [idEspacio]);
  return rows[0] ?? null;
}

export async function actualizarEstado(
  client: PoolClient,
  idEspacio: number,
  nuevoEstado: Espacio["estado"]
): Promise<void> {
  await client.query(`UPDATE espacio SET estado = $2, version = version + 1 WHERE id_espacio = $1`, [
    idEspacio,
    nuevoEstado,
  ]);
}
