import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { MetodoPago, numeroComprobante } from "../validators/pagoValidator";

/** Repositorio de pagos y comprobantes (RF08, RF09). */

export async function crear(
  client: PoolClient,
  p: { idRegistro: number; idOperador: number; monto: number; metodo: MetodoPago; referencia: string | null; recibido: number | null; cambio: number | null }
): Promise<number> {
  const { rows } = await client.query(
    `INSERT INTO pago (id_registro, id_operador, monto, metodo, referencia_externa, recibido, cambio, estado)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'APROBADO')
     RETURNING id_pago`,
    [p.idRegistro, p.idOperador, p.monto, p.metodo, p.referencia, p.recibido, p.cambio]
  );
  return rows[0].id_pago;
}

/** Emite el comprobante con el siguiente número consecutivo del año. */
export async function emitirComprobante(client: PoolClient, idPago: number, total: number): Promise<string> {
  const { rows } = await client.query(
    `SELECT nextval('seq_comprobante')::int AS n, EXTRACT(YEAR FROM now())::int AS anio`
  );
  const numero = numeroComprobante(rows[0].anio, rows[0].n);
  await client.query(`INSERT INTO comprobante (id_pago, numero, total) VALUES ($1, $2, $3)`, [idPago, numero, total]);
  return numero;
}

export async function bloquear(client: PoolClient, idPago: number) {
  const { rows } = await client.query(
    `SELECT p.*, c.numero AS comprobante, e.id_parqueadero
       FROM pago p
       JOIN registro_estacionamiento r ON r.id_registro = p.id_registro
       JOIN espacio e ON e.id_espacio = r.id_espacio
       LEFT JOIN comprobante c ON c.id_pago = p.id_pago
      WHERE p.id_pago = $1
      FOR UPDATE OF p`,
    [idPago]
  );
  return rows[0] ?? null;
}

export async function anular(client: PoolClient, idPago: number, idAdmin: number, motivo: string) {
  await client.query(
    `UPDATE pago SET estado = 'ANULADO', motivo_anulacion = $3, id_anulado_por = $2, fecha_anulacion = now()
      WHERE id_pago = $1`,
    [idPago, idAdmin, motivo]
  );
}

/** Pago aprobado del registro, si lo tiene. */
export async function aprobadoDe(client: PoolClient, idRegistro: number) {
  const { rows } = await client.query(`SELECT id_pago FROM pago WHERE id_registro = $1 AND estado = 'APROBADO'`, [idRegistro]);
  return rows[0] ?? null;
}

const SELECT_PAGO = `
  SELECT p.id_pago, p.id_registro, p.metodo, p.monto::float AS monto, p.referencia_externa AS referencia,
         p.recibido::float AS recibido, p.cambio::float AS cambio, p.estado, p.fecha_pago,
         p.motivo_anulacion, p.fecha_anulacion, ua.nombre AS anulado_por,
         c.numero AS comprobante,
         r.placa, r.fecha_ingreso, r.fecha_salida, r.minutos, r.valor_calculado::float AS valor_calculado,
         e.codigo AS codigo_espacio, e.id_parqueadero, s.nombre AS sede, tv.nombre AS tipo,
         uo.nombre AS operador,
         NOT EXISTS (SELECT 1 FROM pago p2 WHERE p2.id_registro = p.id_registro AND p2.estado = 'APROBADO') AS sin_pago_vigente
    FROM pago p
    JOIN registro_estacionamiento r ON r.id_registro = p.id_registro
    JOIN espacio e ON e.id_espacio = r.id_espacio
    JOIN parqueadero s ON s.id_parqueadero = e.id_parqueadero
    JOIN vehiculo v ON v.placa = r.placa
    JOIN tipo_vehiculo tv ON tv.id_tipo = v.id_tipo
    JOIN usuario uo ON uo.id_usuario = p.id_operador
    LEFT JOIN usuario ua ON ua.id_usuario = p.id_anulado_por
    LEFT JOIN comprobante c ON c.id_pago = p.id_pago`;

export async function obtener(idPago: number) {
  const { rows } = await pool.query(`${SELECT_PAGO} WHERE p.id_pago = $1`, [idPago]);
  return rows[0] ?? null;
}

export interface FiltrosPagos {
  idParqueadero?: number;
  metodo?: string;
  estado?: string;
  /** Placa, número de comprobante o referencia. */
  q?: string;
  desde: string;
  hasta: string;
}

const WHERE_PAGOS = `
  WHERE p.fecha_pago >= $1::date AND p.fecha_pago < $2::date + 1
    AND ($3::int IS NULL OR e.id_parqueadero = $3)
    AND ($4::text IS NULL OR p.metodo = $4)
    AND ($5::text IS NULL OR p.estado = $5)
    AND ($6::text IS NULL OR r.placa ILIKE $6 OR c.numero ILIKE $6 OR p.referencia_externa ILIKE $6)`;

const paramsPagos = (f: FiltrosPagos) => [
  f.desde, f.hasta, f.idParqueadero ?? null, f.metodo ?? null, f.estado ?? null, f.q ? `%${f.q}%` : null,
];

export async function listar(f: FiltrosPagos, limite = 500) {
  const { rows } = await pool.query(`${SELECT_PAGO} ${WHERE_PAGOS} ORDER BY p.fecha_pago DESC LIMIT ${limite}`, paramsPagos(f));
  return rows;
}

/** Totales por medio de pago (para el cierre de caja), sin contar los anulados. */
export async function totalesPorMetodo(f: FiltrosPagos) {
  const { rows } = await pool.query(
    `SELECT p.metodo, count(*) FILTER (WHERE p.estado = 'APROBADO')::int AS pagos,
            COALESCE(sum(p.monto) FILTER (WHERE p.estado = 'APROBADO'), 0)::float AS total,
            count(*) FILTER (WHERE p.estado = 'ANULADO')::int AS anulados,
            COALESCE(sum(p.monto) FILTER (WHERE p.estado = 'ANULADO'), 0)::float AS total_anulado
       FROM pago p
       JOIN registro_estacionamiento r ON r.id_registro = p.id_registro
       JOIN espacio e ON e.id_espacio = r.id_espacio
       LEFT JOIN comprobante c ON c.id_pago = p.id_pago
      ${WHERE_PAGOS}
      GROUP BY p.metodo`,
    paramsPagos(f)
  );
  return rows as { metodo: MetodoPago; pagos: number; total: number; anulados: number; total_anulado: number }[];
}
