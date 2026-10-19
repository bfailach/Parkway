import { PoolClient } from "pg";
import { pool } from "../db/pool";

export interface Vehiculo {
  placa: string;
  id_tipo: number;
  id_cliente: number | null;
  marca: string | null;
  color: string | null;
}

export async function buscarParaActualizar(client: PoolClient, placa: string): Promise<Vehiculo | null> {
  const { rows } = await client.query(`SELECT * FROM vehiculo WHERE placa = $1 FOR UPDATE`, [placa]);
  return rows[0] ?? null;
}

export async function crear(
  client: PoolClient,
  v: { placa: string; idTipo: number; marca?: string; color?: string; idCliente?: number }
): Promise<Vehiculo> {
  const { rows } = await client.query(
    `INSERT INTO vehiculo (placa, id_tipo, marca, color, id_cliente) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [v.placa, v.idTipo, v.marca ?? null, v.color ?? null, v.idCliente ?? null]
  );
  return rows[0];
}

/** Asocia un vehículo sin dueño (registrado antes como visitante) a un cliente. */
export async function asociarCliente(
  client: PoolClient,
  v: { placa: string; idCliente: number; marca?: string; color?: string }
) {
  await client.query(
    `UPDATE vehiculo SET id_cliente = $2, marca = COALESCE($3, marca), color = COALESCE($4, color) WHERE placa = $1`,
    [v.placa, v.idCliente, v.marca ?? null, v.color ?? null]
  );
}

/**
 * Quita el vehículo de la cuenta del cliente. No se borra la fila porque
 * el historial de ingresos y reservas la referencia.
 */
export async function desasociarCliente(client: PoolClient, placa: string) {
  await client.query(`UPDATE vehiculo SET id_cliente = NULL WHERE placa = $1`, [placa]);
}

export async function listarDelCliente(idCliente: number) {
  const { rows } = await pool.query(
    `SELECT v.placa, v.id_tipo, t.nombre AS tipo, v.marca, v.color,
            EXISTS (SELECT 1 FROM registro_estacionamiento r WHERE r.placa = v.placa AND r.estado = 'ABIERTO') AS dentro,
            EXISTS (SELECT 1 FROM reserva r WHERE r.placa = v.placa AND r.estado = 'ACTIVA') AS con_reserva
       FROM vehiculo v JOIN tipo_vehiculo t ON t.id_tipo = v.id_tipo
      WHERE v.id_cliente = $1
      ORDER BY v.placa`,
    [idCliente]
  );
  return rows;
}

/** Completa marca y color si el vehículo no los tenía registrados. */
export async function completarDatos(client: PoolClient, placa: string, marca?: string, color?: string) {
  if (!marca && !color) return;
  await client.query(
    `UPDATE vehiculo SET marca = COALESCE(marca, $2), color = COALESCE(color, $3) WHERE placa = $1`,
    [placa, marca ?? null, color ?? null]
  );
}
