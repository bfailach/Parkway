import { pool } from "../db/pool";

export async function buscarPorCorreo(correo: string) {
  const { rows } = await pool.query(
    `SELECT id_usuario, nombre, correo, contrasena_hash, rol, turno, estado
       FROM usuario WHERE lower(correo) = lower($1)`,
    [correo]
  );
  return rows[0] ?? null;
}

export async function crearCliente(u: { nombre: string; documento: string; correo: string; telefono?: string; hash: string }) {
  const { rows } = await pool.query(
    `INSERT INTO usuario (nombre, documento, correo, telefono, contrasena_hash, rol)
     VALUES ($1, $2, $3, $4, $5, 'CLIENTE')
     RETURNING id_usuario, nombre, correo, rol, turno, estado`,
    [u.nombre, u.documento, u.correo, u.telefono ?? null, u.hash]
  );
  return rows[0];
}
