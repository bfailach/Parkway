import { pool } from "../db/pool";
import type { FiltrosBitacora } from "../validators/bitacoraValidator";

/**
 * Consulta de la bitácora de transacciones (RF14, RNF08): por usuario,
 * tipo de operación, entidad, estado y fecha. Las condiciones sin valor se
 * ignoran. Usa los índices idx_transaccion_usuario e idx_transaccion_entidad.
 */
export async function listar(f: FiltrosBitacora & { limite: number }) {
  const { rows } = await pool.query(
    `SELECT t.id_transaccion, t.tipo_operacion, t.entidad, t.id_entidad, t.estado,
            t.fecha_inicio, t.fecha_fin, t.detalle, t.id_usuario, u.nombre AS usuario, u.rol
       FROM transaccion t
       JOIN usuario u ON u.id_usuario = t.id_usuario
      WHERE ($1::int  IS NULL OR t.id_usuario = $1)
        AND ($2::text IS NULL OR t.tipo_operacion = $2)
        AND ($3::text IS NULL OR t.entidad = $3)
        AND ($4::text IS NULL OR t.id_entidad = $4)
        AND ($5::text IS NULL OR t.estado = $5)
        AND ($6::date IS NULL OR t.fecha_inicio >= $6::date)
        AND ($7::date IS NULL OR t.fecha_inicio <  $7::date + 1)
      ORDER BY t.id_transaccion DESC
      LIMIT $8`,
    [f.idUsuario ?? null, f.tipo ?? null, f.entidad ?? null, f.idEntidad ?? null, f.estado ?? null, f.desde ?? null, f.hasta ?? null, f.limite]
  );
  return rows;
}

/** Valores que existen en la bitácora, para llenar las listas de filtros. */
export async function opciones() {
  const [tipos, entidades, usuarios] = await Promise.all([
    pool.query(`SELECT DISTINCT tipo_operacion FROM transaccion ORDER BY 1`),
    pool.query(`SELECT DISTINCT entidad FROM transaccion ORDER BY 1`),
    pool.query(
      `SELECT u.id_usuario, u.nombre, u.rol
         FROM usuario u
        WHERE EXISTS (SELECT 1 FROM transaccion t WHERE t.id_usuario = u.id_usuario)
        ORDER BY CASE u.rol WHEN 'ADMINISTRADOR' THEN 1 WHEN 'OPERADOR' THEN 2 ELSE 3 END, u.nombre`
    ),
  ]);
  return {
    tipos: tipos.rows.map((r) => r.tipo_operacion as string),
    entidades: entidades.rows.map((r) => r.entidad as string),
    usuarios: usuarios.rows as { id_usuario: number; nombre: string; rol: string }[],
  };
}
