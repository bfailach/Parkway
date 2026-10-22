import { PoolClient } from "pg";
import { pool } from "../db/pool";

export async function listarParqueaderos() {
  const { rows } = await pool.query(
    `SELECT id_parqueadero, nombre, direccion, ciudad, latitud::float AS latitud, longitud::float AS longitud, capacidad_total
       FROM parqueadero ORDER BY id_parqueadero`
  );
  return rows;
}

export async function existeParqueadero(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM parqueadero WHERE id_parqueadero = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

/**
 * Tipos de vehículo con la tarifa vigente de una sede. Sin sede, se usa la
 * primera (por ejemplo, para la calculadora de la portada).
 */
export async function listarTiposVehiculo(idParqueadero?: number) {
  const { rows } = await pool.query(
    `SELECT tv.id_tipo, tv.nombre,
            t.valor_hora::float AS valor_hora, t.valor_fraccion::float AS valor_fraccion,
            t.valor_dia::float AS valor_dia
       FROM tipo_vehiculo tv
       LEFT JOIN tarifa t ON t.id_tipo = tv.id_tipo AND t.activa
            AND t.id_parqueadero = COALESCE($1, (SELECT min(id_parqueadero) FROM parqueadero))
      ORDER BY tv.id_tipo`,
    [idParqueadero ?? null]
  );
  return rows;
}

/** Tarifas vigentes de todas las sedes. */
export async function tarifasVigentes() {
  const { rows } = await pool.query(
    `SELECT id_parqueadero, id_tipo, valor_hora::float AS valor_hora,
            valor_fraccion::float AS valor_fraccion, valor_dia::float AS valor_dia
       FROM tarifa WHERE activa ORDER BY id_parqueadero, id_tipo`
  );
  return rows;
}

export async function tarifaActiva(client: PoolClient, idParqueadero: number, idTipo: number) {
  const { rows } = await client.query(
    `SELECT * FROM tarifa WHERE id_parqueadero = $1 AND id_tipo = $2 AND activa = true`,
    [idParqueadero, idTipo]
  );
  return rows[0] ?? null;
}
