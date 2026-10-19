import { pool } from "../db/pool";

export async function buscarPorCorreo(correo: string) {
  const { rows } = await pool.query(
    `SELECT id_usuario, nombre, correo, contrasena_hash, rol, turno, estado
       FROM usuario WHERE lower(correo) = lower($1)`,
    [correo]
  );
  return rows[0] ?? null;
}
