import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { DatosParqueadero, TarifaSede } from "../validators/parqueaderoValidator";

/** Repositorio de sedes para la administración (crear y editar). */

export const PREFIJO_TIPO: Record<number, string> = { 1: "A", 2: "M", 3: "B" };

/** Sedes con el conteo de espacios por tipo y estado. */
export async function listarConConteo() {
  const { rows } = await pool.query(
    `SELECT p.id_parqueadero, p.nombre, p.direccion, p.ciudad,
            p.latitud::float AS latitud, p.longitud::float AS longitud, p.capacidad_total,
            COALESCE(jsonb_object_agg(c.id_tipo, c.total) FILTER (WHERE c.id_tipo IS NOT NULL), '{}') AS espacios,
            COALESCE(sum(c.fuera)::int, 0) AS fuera_de_servicio,
            COALESCE(sum(c.ocupados)::int, 0) AS ocupados
       FROM parqueadero p
       LEFT JOIN (
            SELECT id_parqueadero, id_tipo, count(*)::int AS total,
                   count(*) FILTER (WHERE estado = 'FUERA_DE_SERVICIO') AS fuera,
                   count(*) FILTER (WHERE estado = 'OCUPADO') AS ocupados
              FROM espacio GROUP BY id_parqueadero, id_tipo
       ) c ON c.id_parqueadero = p.id_parqueadero
      GROUP BY p.id_parqueadero
      ORDER BY p.id_parqueadero`
  );
  return rows;
}

export async function espaciosDe(idParqueadero: number) {
  const { rows } = await pool.query(
    `SELECT e.id_espacio, e.codigo, e.estado, e.id_tipo, t.nombre AS tipo
       FROM espacio e JOIN tipo_vehiculo t ON t.id_tipo = e.id_tipo
      WHERE e.id_parqueadero = $1
      ORDER BY e.id_tipo, e.codigo`,
    [idParqueadero]
  );
  return rows;
}

export async function operadoresDe(idParqueadero: number): Promise<number[]> {
  const { rows } = await pool.query(`SELECT id_usuario FROM operador_parqueadero WHERE id_parqueadero = $1`, [idParqueadero]);
  return rows.map((r) => r.id_usuario);
}

export async function crear(client: PoolClient, d: DatosParqueadero) {
  const total = Object.values(d.espacios).reduce((s, n) => s + n, 0);
  const { rows } = await client.query(
    `INSERT INTO parqueadero (nombre, direccion, ciudad, latitud, longitud, capacidad_total)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_parqueadero`,
    [d.nombre, d.direccion, d.ciudad, d.latitud, d.longitud, total]
  );
  return rows[0].id_parqueadero as number;
}

export async function bloquear(client: PoolClient, id: number) {
  const { rows } = await client.query(`SELECT * FROM parqueadero WHERE id_parqueadero = $1 FOR UPDATE`, [id]);
  return rows[0] ?? null;
}

export async function actualizarDatos(client: PoolClient, id: number, d: DatosParqueadero) {
  await client.query(
    `UPDATE parqueadero SET nombre = $2, direccion = $3, ciudad = $4, latitud = $5, longitud = $6 WHERE id_parqueadero = $1`,
    [id, d.nombre, d.direccion, d.ciudad, d.latitud, d.longitud]
  );
}

export async function recalcularCapacidad(client: PoolClient, id: number) {
  await client.query(
    `UPDATE parqueadero SET capacidad_total = (SELECT count(*) FROM espacio WHERE id_parqueadero = $1) WHERE id_parqueadero = $1`,
    [id]
  );
}

/**
 * Agrega `cantidad` espacios del tipo, numerados después del último código
 * existente (A-31, A-32...). Con más de 99 espacios se usan tres dígitos.
 */
export async function agregarEspacios(client: PoolClient, id: number, idTipo: number, cantidad: number) {
  if (cantidad <= 0) return;
  const prefijo = PREFIJO_TIPO[idTipo];
  await client.query(
    `WITH ultimo AS (
        SELECT COALESCE(max(substring(codigo FROM '\\d+$')::int), 0) AS n
          FROM espacio WHERE id_parqueadero = $1 AND id_tipo = $2
     )
     INSERT INTO espacio (id_parqueadero, id_tipo, codigo)
     SELECT $1, $2, $3 || '-' || lpad((u.n + g)::text, GREATEST(2, length((u.n + $4)::text)), '0')
       FROM ultimo u, generate_series(1, $4) AS g`,
    [id, idTipo, prefijo, cantidad]
  );
}

/**
 * Quita `cantidad` espacios del tipo, empezando por los de número más alto.
 * Solo se pueden quitar espacios libres o fuera de servicio que nunca se
 * usaron: los que tienen historial se conservan para no perder registros.
 * Devuelve cuántos se quitaron.
 */
export async function quitarEspacios(client: PoolClient, id: number, idTipo: number, cantidad: number): Promise<number> {
  if (cantidad <= 0) return 0;
  const { rowCount } = await client.query(
    `DELETE FROM espacio WHERE id_espacio IN (
        SELECT e.id_espacio FROM espacio e
         WHERE e.id_parqueadero = $1 AND e.id_tipo = $2
           AND e.estado IN ('LIBRE', 'FUERA_DE_SERVICIO')
           AND NOT EXISTS (SELECT 1 FROM registro_estacionamiento r WHERE r.id_espacio = e.id_espacio)
           AND NOT EXISTS (SELECT 1 FROM reserva rs WHERE rs.id_espacio = e.id_espacio)
         ORDER BY e.codigo DESC
         LIMIT $3
         FOR UPDATE)`,
    [id, idTipo, cantidad]
  );
  return rowCount ?? 0;
}

export async function contarEspacios(client: PoolClient, id: number): Promise<Record<number, number>> {
  const { rows } = await client.query(
    `SELECT id_tipo, count(*)::int AS n FROM espacio WHERE id_parqueadero = $1 GROUP BY id_tipo`,
    [id]
  );
  return Object.fromEntries(rows.map((r) => [r.id_tipo, r.n]));
}

/** Guarda la tarifa si cambió: la anterior queda inactiva con su historial. */
export async function guardarTarifa(client: PoolClient, id: number, t: TarifaSede) {
  const { rows } = await client.query(
    `SELECT id_tarifa, valor_hora::float, valor_fraccion::float, valor_dia::float
       FROM tarifa WHERE id_parqueadero = $1 AND id_tipo = $2 AND activa FOR UPDATE`,
    [id, t.idTipo]
  );
  const actual = rows[0];
  if (actual && actual.valor_hora === t.valor_hora && actual.valor_fraccion === t.valor_fraccion && actual.valor_dia === t.valor_dia) return;
  if (actual) await client.query(`UPDATE tarifa SET activa = false WHERE id_tarifa = $1`, [actual.id_tarifa]);
  await client.query(
    `INSERT INTO tarifa (id_parqueadero, id_tipo, valor_hora, valor_fraccion, valor_dia) VALUES ($1, $2, $3, $4, $5)`,
    [id, t.idTipo, t.valor_hora, t.valor_fraccion, t.valor_dia]
  );
}

export async function asignarOperadores(client: PoolClient, id: number, operadores: number[]) {
  await client.query(`DELETE FROM operador_parqueadero WHERE id_parqueadero = $1`, [id]);
  if (!operadores.length) return;
  await client.query(
    `INSERT INTO operador_parqueadero (id_usuario, id_parqueadero)
     SELECT u.id_usuario, $1 FROM usuario u WHERE u.id_usuario = ANY($2::int[]) AND u.rol = 'OPERADOR'`,
    [id, operadores]
  );
}

export async function cantidadOperadoresValidos(client: PoolClient, operadores: number[]): Promise<number> {
  if (!operadores.length) return 0;
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM usuario WHERE id_usuario = ANY($1::int[]) AND rol = 'OPERADOR'`,
    [operadores]
  );
  return rows[0].n;
}
