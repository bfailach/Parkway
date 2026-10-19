import { PoolClient } from "pg";
import { pool } from "../db/pool";

/** Repositorio de reservas (RF10). */

const SELECT_RESERVA = `
  SELECT r.id_reserva, r.placa, r.fecha_inicio, r.fecha_fin, r.estado,
         e.id_espacio, e.codigo AS codigo_espacio, e.id_parqueadero,
         p.nombre AS sede, tv.nombre AS tipo
    FROM reserva r
    JOIN espacio e        ON e.id_espacio = r.id_espacio
    JOIN parqueadero p    ON p.id_parqueadero = e.id_parqueadero
    JOIN vehiculo v       ON v.placa = r.placa
    JOIN tipo_vehiculo tv ON tv.id_tipo = v.id_tipo`;

/**
 * Marca como EXPIRADA toda reserva activa cuyo plazo de llegada venció y
 * libera su espacio. Cada expiración queda en la bitácora a nombre del
 * cliente. Devuelve cuántas reservas expiraron.
 */
export async function expirarVencidas(): Promise<number> {
  const { rows } = await pool.query(
    `WITH vencidas AS (
        UPDATE reserva SET estado = 'EXPIRADA'
         WHERE estado = 'ACTIVA' AND fecha_fin < now()
     RETURNING id_reserva, id_espacio, id_cliente, placa
     ),
     liberados AS (
        UPDATE espacio SET estado = 'LIBRE', version = version + 1
         WHERE id_espacio IN (SELECT id_espacio FROM vencidas) AND estado = 'RESERVADO'
     RETURNING id_espacio
     ),
     bitacora AS (
        INSERT INTO transaccion (id_usuario, tipo_operacion, entidad, id_entidad, estado, fecha_fin, detalle)
        SELECT id_cliente, 'EXPIRACION', 'reserva', id_reserva::text, 'CONFIRMADA', now(), jsonb_build_object('placa', placa)
          FROM vencidas
     RETURNING 1
     )
     SELECT (SELECT count(*) FROM vencidas)::int AS n, (SELECT count(*) FROM liberados) AS l, (SELECT count(*) FROM bitacora) AS b`
  );
  return rows[0]?.n ?? 0;
}

export async function activaPorPlaca(client: PoolClient, placa: string) {
  const { rows } = await client.query(
    `SELECT r.*, e.id_parqueadero FROM reserva r JOIN espacio e ON e.id_espacio = r.id_espacio
      WHERE r.placa = $1 AND r.estado = 'ACTIVA'
      FOR UPDATE OF r`,
    [placa]
  );
  return rows[0] ?? null;
}

export async function crear(
  client: PoolClient,
  r: { idCliente: number; idEspacio: number; placa: string; minutos: number }
) {
  const { rows } = await client.query(
    `INSERT INTO reserva (id_cliente, id_espacio, placa, fecha_inicio, fecha_fin)
     VALUES ($1, $2, $3, now(), now() + make_interval(mins => $4))
     RETURNING *`,
    [r.idCliente, r.idEspacio, r.placa, r.minutos]
  );
  return rows[0];
}

export async function bloquear(client: PoolClient, idReserva: number) {
  const { rows } = await client.query(`SELECT * FROM reserva WHERE id_reserva = $1 FOR UPDATE`, [idReserva]);
  return rows[0] ?? null;
}

export async function cambiarEstado(client: PoolClient, idReserva: number, estado: "CUMPLIDA" | "CANCELADA" | "EXPIRADA") {
  await client.query(`UPDATE reserva SET estado = $2 WHERE id_reserva = $1`, [idReserva, estado]);
}

export async function obtener(idReserva: number) {
  const { rows } = await pool.query(`${SELECT_RESERVA} WHERE r.id_reserva = $1`, [idReserva]);
  return rows[0] ?? null;
}

export async function activasDelCliente(idCliente: number) {
  const { rows } = await pool.query(
    `${SELECT_RESERVA} WHERE r.id_cliente = $1 AND r.estado = 'ACTIVA' ORDER BY r.fecha_inicio DESC`,
    [idCliente]
  );
  return rows;
}

export async function delCliente(idCliente: number, limite = 30) {
  const { rows } = await pool.query(
    `${SELECT_RESERVA} WHERE r.id_cliente = $1 ORDER BY r.fecha_inicio DESC LIMIT $2`,
    [idCliente, limite]
  );
  return rows;
}

/**
 * Reservas de una sede para el personal: las activas y las del día que ya
 * terminaron (cumplidas, canceladas o expiradas), con el contacto del cliente.
 */
export async function deLaSede(idParqueadero: number) {
  const { rows } = await pool.query(
    `SELECT r.id_reserva, r.placa, r.fecha_inicio, r.fecha_fin, r.estado,
            e.id_espacio, e.codigo AS codigo_espacio, tv.id_tipo, tv.nombre AS tipo,
            u.nombre AS cliente, u.telefono, v.marca, v.color
       FROM reserva r
       JOIN espacio e        ON e.id_espacio = r.id_espacio
       JOIN vehiculo v       ON v.placa = r.placa
       JOIN tipo_vehiculo tv ON tv.id_tipo = v.id_tipo
       JOIN usuario u        ON u.id_usuario = r.id_cliente
      WHERE e.id_parqueadero = $1
        AND (r.estado = 'ACTIVA' OR r.fecha_inicio >= CURRENT_DATE)
      ORDER BY (r.estado = 'ACTIVA') DESC, r.fecha_fin ASC, r.fecha_inicio DESC`,
    [idParqueadero]
  );
  return rows;
}
