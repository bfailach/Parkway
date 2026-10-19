import { pool } from "../db/pool";

/** Consulta de la bitácora de transacciones (RF14, RNF08). */
export async function listar(f: { tipo?: string; estado?: string; desde?: string; hasta?: string; limite: number }) {
  const { rows } = await pool.query(
    `SELECT t.id_transaccion, t.tipo_operacion, t.entidad, t.id_entidad, t.estado,
            t.fecha_inicio, t.fecha_fin, t.detalle, u.nombre AS usuario, u.rol
       FROM transaccion t
       JOIN usuario u ON u.id_usuario = t.id_usuario
      WHERE ($1::text IS NULL OR t.tipo_operacion = $1)
        AND ($2::text IS NULL OR t.estado = $2)
        AND ($3::date IS NULL OR t.fecha_inicio >= $3::date)
        AND ($4::date IS NULL OR t.fecha_inicio <  $4::date + 1)
      ORDER BY t.id_transaccion DESC
      LIMIT $5`,
    [f.tipo || null, f.estado || null, f.desde || null, f.hasta || null, f.limite]
  );
  return rows;
}

export async function tiposDeOperacion(): Promise<string[]> {
  const { rows } = await pool.query(`SELECT DISTINCT tipo_operacion FROM transaccion ORDER BY 1`);
  return rows.map((r) => r.tipo_operacion);
}
