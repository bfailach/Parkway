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
  r: { placa: string; idEspacio: number; idTarifa: number; idOperador: number; idReserva?: number }
) {
  const { rows } = await client.query(
    `INSERT INTO registro_estacionamiento (placa, id_espacio, id_tarifa, id_operador_ingreso, id_reserva)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [r.placa, r.idEspacio, r.idTarifa, r.idOperador, r.idReserva ?? null]
  );
  return rows[0];
}

/** Bloquea el registro y trae la tarifa y el espacio asociados. */
export async function bloquearConTarifa(client: PoolClient, idRegistro: number) {
  const { rows } = await client.query(
    `SELECT r.*, e.codigo AS codigo_espacio, e.id_parqueadero, v.id_tipo,
            t.valor_hora, t.valor_fraccion, t.valor_dia, now() AS ahora
       FROM registro_estacionamiento r
       JOIN espacio e ON e.id_espacio = r.id_espacio
       JOIN vehiculo v ON v.placa = r.placa
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
         -- Entrada con QR: el cliente registró su propio ingreso.
         CASE WHEN oi.rol = 'CLIENTE' THEN 'Autoservicio (QR)' ELSE oi.nombre END AS operador_ingreso, os.nombre AS operador_salida,
         -- Ingreso con QR y si el operador ya lo verificó (to_jsonb: sirve sin la migración)
         (oi.rol = 'CLIENTE') AS por_qr, (to_jsonb(r)->>'verificado_por') IS NOT NULL AS qr_verificado,
         uc.nombre AS cliente,
         t.valor_hora::float AS valor_hora, t.valor_fraccion::float AS valor_fraccion,
         t.valor_dia::float AS valor_dia,
         r.id_reserva, p.nombre AS sede,
         pg.id_pago, pg.comprobante, pg.metodo AS metodo_pago, pg.estado AS estado_pago,
         pg.recibido, pg.cambio, pg.referencia
    FROM registro_estacionamiento r
    JOIN espacio e        ON e.id_espacio = r.id_espacio
    JOIN parqueadero p    ON p.id_parqueadero = e.id_parqueadero
    JOIN vehiculo v       ON v.placa = r.placa
    JOIN tipo_vehiculo tv ON tv.id_tipo = v.id_tipo
    JOIN usuario oi       ON oi.id_usuario = r.id_operador_ingreso
    LEFT JOIN usuario uc  ON uc.id_usuario = v.id_cliente
    LEFT JOIN usuario os  ON os.id_usuario = r.id_operador_salida
    LEFT JOIN tarifa t    ON t.id_tarifa = r.id_tarifa
    -- RF08: el pago vigente del registro (el aprobado o, si no hay, el último).
    LEFT JOIN LATERAL (
        SELECT x.id_pago, c.numero AS comprobante, x.metodo, x.estado,
               x.recibido::float AS recibido, x.cambio::float AS cambio, x.referencia_externa AS referencia
          FROM pago x LEFT JOIN comprobante c ON c.id_pago = x.id_pago
         WHERE x.id_registro = r.id_registro
         ORDER BY (x.estado = 'APROBADO') DESC, x.fecha_pago DESC
         LIMIT 1
    ) pg ON true`;

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

export interface FiltrosHistorial {
  idParqueadero: number;
  placa?: string;
  idTipo?: number;
  marca?: string;
  color?: string;
  desde?: string;
  hasta?: string;
  /** Permanencia mínima y máxima en minutos. */
  minutosMin?: number;
  minutosMax?: number;
  /** Valor pagado mínimo y máximo. */
  valorMin?: number;
  valorMax?: number;
  orden?: "fecha" | "valor" | "tiempo";
  limite: number;
}

/**
 * Condiciones comunes del historial. Los valores van como parámetros ($n),
 * nunca concatenados al SQL.
 */
function condiciones(f: FiltrosHistorial, params: unknown[]) {
  const where = [`r.estado = 'CERRADO'`, `e.id_parqueadero = $${params.push(f.idParqueadero)}`];
  if (f.placa) where.push(`r.placa LIKE '%' || $${params.push(f.placa)} || '%'`);
  if (f.idTipo) where.push(`v.id_tipo = $${params.push(f.idTipo)}`);
  if (f.marca) where.push(`v.marca ILIKE '%' || $${params.push(f.marca)} || '%'`);
  if (f.color) where.push(`v.color ILIKE '%' || $${params.push(f.color)} || '%'`);
  if (f.desde) where.push(`r.fecha_salida >= $${params.push(f.desde)}::date`);
  if (f.hasta) where.push(`r.fecha_salida < $${params.push(f.hasta)}::date + 1`);
  return where;
}

/** Rangos de tiempo y valor sobre una expresión (por visita o por total). */
function rangos(f: FiltrosHistorial, params: unknown[], minutos: string, valor: string) {
  const c: string[] = [];
  if (f.minutosMin != null) c.push(`${minutos} >= $${params.push(f.minutosMin)}`);
  if (f.minutosMax != null) c.push(`${minutos} <= $${params.push(f.minutosMax)}`);
  if (f.valorMin != null) c.push(`${valor} >= $${params.push(f.valorMin)}`);
  if (f.valorMax != null) c.push(`${valor} <= $${params.push(f.valorMax)}`);
  return c;
}

const ORDEN_VISITA = { fecha: "r.fecha_salida DESC", valor: "r.valor_calculado DESC, r.fecha_salida DESC", tiempo: "r.minutos DESC, r.fecha_salida DESC" };
const ORDEN_VEHICULO = { fecha: "ultima_salida DESC", valor: "valor_total DESC", tiempo: "minutos_total DESC" };

/** Salidas registradas, una fila por visita. */
export async function listarHistorial(f: FiltrosHistorial) {
  const params: unknown[] = [];
  const where = [...condiciones(f, params), ...rangos(f, params, "r.minutos", "r.valor_calculado")];
  const { rows } = await pool.query(
    `${SELECT_DETALLE}
      WHERE ${where.join(" AND ")}
      ORDER BY ${ORDEN_VISITA[f.orden ?? "fecha"]}
      LIMIT $${params.push(f.limite)}`,
    params
  );
  return rows;
}

/**
 * Historial agrupado por vehículo: visitas, tiempo total y dinero gastado
 * en la sede. Los rangos de tiempo y valor se aplican a los totales.
 */
export async function historialPorVehiculo(f: FiltrosHistorial) {
  const params: unknown[] = [];
  const where = condiciones(f, params);
  const having = rangos(f, params, "sum(r.minutos)", "sum(r.valor_calculado)");
  const { rows } = await pool.query(
    `SELECT r.placa, tv.id_tipo, tv.nombre AS tipo, v.marca, v.color, u.nombre AS cliente,
            count(*)::int AS visitas, sum(r.minutos)::int AS minutos_total,
            sum(r.valor_calculado)::float AS valor_total, max(r.fecha_salida) AS ultima_salida
       FROM registro_estacionamiento r
       JOIN espacio e        ON e.id_espacio = r.id_espacio
       JOIN vehiculo v       ON v.placa = r.placa
       JOIN tipo_vehiculo tv ON tv.id_tipo = v.id_tipo
       LEFT JOIN usuario u   ON u.id_usuario = v.id_cliente
      WHERE ${where.join(" AND ")}
      GROUP BY r.placa, tv.id_tipo, tv.nombre, v.marca, v.color, u.nombre
      ${having.length ? `HAVING ${having.join(" AND ")}` : ""}
      ORDER BY ${ORDEN_VEHICULO[f.orden ?? "fecha"]}
      LIMIT $${params.push(f.limite)}`,
    params
  );
  return rows;
}

export async function obtenerDetalle(idRegistro: number) {
  const { rows } = await pool.query(`${SELECT_DETALLE} WHERE r.id_registro = $1`, [idRegistro]);
  return rows[0] ?? null;
}

/** Totales del día para el panel: ingresos, salidas y lo recaudado en pagos aprobados. */
export async function totalesDelDia(idParqueadero: number) {
  const { rows } = await pool.query(
    `SELECT
        count(*) FILTER (WHERE r.fecha_ingreso::date = CURRENT_DATE)::int AS ingresos_hoy,
        count(*) FILTER (WHERE r.fecha_salida::date  = CURRENT_DATE)::int AS salidas_hoy,
        -- RF08: lo recaudado son los pagos aprobados de hoy, no los valores calculados.
        (SELECT COALESCE(sum(pg.monto), 0)::float
           FROM pago pg
           JOIN registro_estacionamiento rp ON rp.id_registro = pg.id_registro
           JOIN espacio ep ON ep.id_espacio = rp.id_espacio
          WHERE ep.id_parqueadero = $1 AND pg.estado = 'APROBADO' AND pg.fecha_pago::date = CURRENT_DATE) AS recaudo_hoy
       FROM registro_estacionamiento r
       JOIN espacio e ON e.id_espacio = r.id_espacio
      WHERE e.id_parqueadero = $1`,
    [idParqueadero]
  );
  return rows[0];
}

/** Registros de los vehículos de un cliente (abiertos o cerrados). */
export async function delCliente(idCliente: number, estado: "ABIERTO" | "CERRADO", limite = 100) {
  const { rows } = await pool.query(
    `${SELECT_DETALLE}
      WHERE r.estado = $2 AND v.id_cliente = $1
      ORDER BY COALESCE(r.fecha_salida, r.fecha_ingreso) DESC
      LIMIT $3`,
    [idCliente, estado, limite]
  );
  return rows;
}

/**
 * Entradas y salidas de una sede en orden de hora (más reciente primero).
 * Cada visita aporta su entrada y, si ya terminó, su salida. Usa los mismos
 * filtros de placa, tipo, marca, color y fechas del historial.
 */
export async function listarMovimientos(f: FiltrosHistorial) {
  const params: unknown[] = [];
  const base = (fecha: string) => {
    const w = [`e.id_parqueadero = $${params.push(f.idParqueadero)}`];
    if (f.placa) w.push(`r.placa LIKE '%' || $${params.push(f.placa)} || '%'`);
    if (f.idTipo) w.push(`v.id_tipo = $${params.push(f.idTipo)}`);
    if (f.marca) w.push(`v.marca ILIKE '%' || $${params.push(f.marca)} || '%'`);
    if (f.color) w.push(`v.color ILIKE '%' || $${params.push(f.color)} || '%'`);
    if (f.desde) w.push(`${fecha} >= $${params.push(f.desde)}::date`);
    if (f.hasta) w.push(`${fecha} < $${params.push(f.hasta)}::date + 1`);
    return w.join(" AND ");
  };
  const unir = `
      FROM registro_estacionamiento r
      JOIN espacio e        ON e.id_espacio = r.id_espacio
      JOIN vehiculo v       ON v.placa = r.placa
      JOIN tipo_vehiculo tv ON tv.id_tipo = v.id_tipo`;
  const entradas = base("r.fecha_ingreso");
  const salidas = base("r.fecha_salida");
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT r.id_registro, 'ENTRADA' AS movimiento, r.fecha_ingreso AS fecha, r.placa, e.codigo AS codigo_espacio,
              tv.nombre AS tipo, v.marca, v.color,
              CASE WHEN oi.rol = 'CLIENTE' THEN 'Autoservicio (QR)' ELSE oi.nombre END AS registrado_por,
              NULL::float AS valor, NULL::int AS minutos, r.estado
         ${unir}
         JOIN usuario oi ON oi.id_usuario = r.id_operador_ingreso
        WHERE ${entradas}
       UNION ALL
       SELECT r.id_registro, 'SALIDA', r.fecha_salida, r.placa, e.codigo, tv.nombre, v.marca, v.color,
              os.nombre, r.valor_calculado::float, r.minutos, r.estado
         ${unir}
         LEFT JOIN usuario os ON os.id_usuario = r.id_operador_salida
        WHERE r.estado = 'CERRADO' AND ${salidas}
     ) m
     ORDER BY fecha DESC, movimiento
     LIMIT $${params.push(f.limite ?? 300)}`,
    params
  );
  return rows;
}
