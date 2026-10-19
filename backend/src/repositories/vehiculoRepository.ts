import { PoolClient } from "pg";

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
  v: { placa: string; idTipo: number; marca?: string; color?: string }
): Promise<Vehiculo> {
  const { rows } = await client.query(
    `INSERT INTO vehiculo (placa, id_tipo, marca, color) VALUES ($1, $2, $3, $4) RETURNING *`,
    [v.placa, v.idTipo, v.marca ?? null, v.color ?? null]
  );
  return rows[0];
}

/** Completa marca y color si el vehículo no los tenía registrados. */
export async function completarDatos(client: PoolClient, placa: string, marca?: string, color?: string) {
  if (!marca && !color) return;
  await client.query(
    `UPDATE vehiculo SET marca = COALESCE(marca, $2), color = COALESCE(color, $3) WHERE placa = $1`,
    [placa, marca ?? null, color ?? null]
  );
}
