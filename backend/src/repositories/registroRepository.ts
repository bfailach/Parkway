import { PoolClient } from "pg";
import { pool } from "../db/pool";

/** Repositorio de registro_estacionamiento (ingresos y salidas). */

export async function buscarAbiertoPorPlaca(client: PoolClient, placa: string) {
  const { rows } = await client.query(
    `SELECT id_registro FROM registro_estacionamiento WHERE placa = $1 AND estado = 'ABIERTO'`,
    [placa]
  );
  return rows[0] ?? null;
}

export async function crearIngreso(
  client: PoolClient,
  r: { placa: string; idEspacio: number; idTarifa: number; idOperador: number }
) {
  const { rows } = await client.query(
    `INSERT INTO registro_estacionamiento (placa, id_espacio, id_tarifa, id_operador_ingreso)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [r.placa, r.idEspacio, r.idTarifa, r.idOperador]
  );
  return rows[0];
}

/** Bloquea el registro y trae la tarifa y el espacio asociados. */
export async function bloquearConTarifa(client: PoolClient, idRegistro: number) {
  const { rows } = await client.query(
    `SELECT r.*, e.codigo AS codigo_espacio, e.id_parqueadero,
            t.valor_hora, t.valor_fraccion, t.valor_dia, now() AS ahora
       FROM registro_estacionamiento r
       JOIN espacio e ON e.id_espacio = r.id_espacio
       LEFT JOIN tarifa t ON t.id_tarifa = r.id_tarifa
      WHERE r.id_registro = $1
      FOR UPDATE OF r`,
    [idRegistro]
  );
  return rows[0] ?? null;
}

export async function cerrar(
  client: PoolClient,
  c: { idRegistro: number; idOperador: number; fechaSalida: Date; minutos: number; valor: number }
) {
  const { rows } = await client.query(
    `UPDATE registro_estacionamiento
        SET estado = 'CERRADO', fecha_salida = $2, minutos = $3,
            valor_calculado = $4, id_operador_salida = $5
      WHERE id_registro = $1
      RETURNING *`,
    [c.idRegistro, c.fechaSalida, c.minutos, c.valor, c.idOperador]
  );
  return rows[0];
}

const SELECT_DETALLE = `
  SELECT r.id_registro, r.placa, r.fecha_ingreso, r.fecha_salida, r.minutos,
         r.valor_calculado::float AS valor_calculado, r.estado,
         e.codigo AS codigo_espacio, e.id_parqueadero,
         tv.id_tipo, tv.nombre AS tipo, v.marca, v.color,
         oi.nombre AS operador_ingreso, os.nombre AS operador_salida,
         t.valor_hora::float AS valor_hora, t.valor_fraccion::float AS valor_fraccion,
         t.valor_dia::float AS valor_dia
    FROM registro_estacionamiento r
    JOIN espacio e        ON e.id_espacio = r.id_espacio
    JOIN vehiculo v       ON v.placa = r.placa
    JOIN tipo_vehiculo tv ON tv.id_tipo = v.id_tipo
    JOIN usuario oi       ON oi.id_usuario = r.id_operador_ingreso
    LEFT JOIN usuario os  ON os.id_usuario = r.id_operador_salida
    LEFT JOIN tarifa t    ON t.id_tarifa = r.id_tarifa`;

export async function listarActivos(idParqueadero: number, placa?: string) {
  const { rows } = await pool.query(
    `${SELECT_DETALLE}
      WHERE r.estado = 'ABIERTO' AND e.id_parqueadero = $1
        AND ($2::text IS NULL OR r.placa LIKE '%' || $2 || '%')
      ORDER BY r.fecha_ingreso DESC`,
    [idParqueadero, placa || null]
  );
  return rows;
}

export async function listarHistorial(f: {
  idParqueadero: number;
  placa?: string;
  desde?: string;
  hasta?: string;
  limite: number;
}) {
  const { rows } = await pool.query(
    `${SELECT_DETALLE}
      WHERE r.estado = 'CERRADO' AND e.id_parqueadero = $1
        AND ($2::text IS NULL OR r.placa LIKE '%' || $2 || '%')
        AND ($3::date IS NULL OR r.fecha_salida >= $3::date)
        AND ($4::date IS NULL OR r.fecha_salida <  $4::date + 1)
      ORDER BY r.fecha_salida DESC
      LIMIT $5`,
    [f.idParqueadero, f.placa || null, f.desde || null, f.hasta || null, f.limite]
  );
  return rows;
}

export async function obtenerDetalle(idRegistro: number) {
  const { rows } = await pool.query(`${SELECT_DETALLE} WHERE r.id_registro = $1`, [idRegistro]);
  return rows[0] ?? null;
}

/** Totales del día para el panel: ingresos, salidas y recaudo calculado. */
export async function totalesDelDia(idParqueadero: number) {
  const { rows } = await pool.query(
    `SELECT
        count(*) FILTER (WHERE r.fecha_ingreso::date = CURRENT_DATE)::int AS ingresos_hoy,
        count(*) FILTER (WHERE r.fecha_salida::date  = CURRENT_DATE)::int AS salidas_hoy,
        COALESCE(sum(r.valor_calculado) FILTER (WHERE r.fecha_salida::date = CURRENT_DATE), 0)::float AS recaudo_hoy
       FROM registro_estacionamiento r
       JOIN espacio e ON e.id_espacio = r.id_espacio
      WHERE e.id_parqueadero = $1`,
    [idParqueadero]
  );
  return rows[0];
}
