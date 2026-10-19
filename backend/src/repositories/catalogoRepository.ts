import { PoolClient } from "pg";
import { pool } from "../db/pool";

export async function listarParqueaderos() {
  const { rows } = await pool.query(
    `SELECT id_parqueadero, nombre, direccion, capacidad_total FROM parqueadero ORDER BY id_parqueadero`
  );
  return rows;
}

export async function existeParqueadero(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM parqueadero WHERE id_parqueadero = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function listarTiposVehiculo() {
  const { rows } = await pool.query(
    `SELECT tv.id_tipo, tv.nombre,
            t.valor_hora::float AS valor_hora, t.valor_fraccion::float AS valor_fraccion,
            t.valor_dia::float AS valor_dia
       FROM tipo_vehiculo tv
       LEFT JOIN tarifa t ON t.id_tipo = tv.id_tipo AND t.activa
      ORDER BY tv.id_tipo`
  );
  return rows;
}

export async function tarifaActiva(client: PoolClient, idTipo: number) {
  const { rows } = await client.query(`SELECT * FROM tarifa WHERE id_tipo = $1 AND activa = true`, [idTipo]);
  return rows[0] ?? null;
}
