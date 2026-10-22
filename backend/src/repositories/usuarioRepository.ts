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

/** Sedes asignadas a un operador. */
export async function sedesDelOperador(idUsuario: number): Promise<number[]> {
  const { rows } = await pool.query(
    `SELECT id_parqueadero FROM operador_parqueadero WHERE id_usuario = $1 ORDER BY id_parqueadero`,
    [idUsuario]
  );
  return rows.map((r) => r.id_parqueadero);
}

/** Operadores activos con las sedes que tienen asignadas. */
export async function listarOperadores() {
  const { rows } = await pool.query(
    `SELECT u.id_usuario, u.nombre, u.correo, u.turno, u.estado,
            COALESCE(array_agg(op.id_parqueadero ORDER BY op.id_parqueadero) FILTER (WHERE op.id_parqueadero IS NOT NULL), '{}') AS sedes
       FROM usuario u
       LEFT JOIN operador_parqueadero op ON op.id_usuario = u.id_usuario
      WHERE u.rol = 'OPERADOR'
      GROUP BY u.id_usuario
      ORDER BY u.nombre`
  );
  return rows;
}

export async function preferencias(idUsuario: number): Promise<Record<string, unknown>> {
  const { rows } = await pool.query(`SELECT preferencias FROM usuario WHERE id_usuario = $1`, [idUsuario]);
  return rows[0]?.preferencias ?? {};
}

export async function guardarPreferencias(idUsuario: number, clave: string, valor: unknown) {
  await pool.query(
    `UPDATE usuario SET preferencias = preferencias || jsonb_build_object($2::text, $3::jsonb) WHERE id_usuario = $1`,
    [idUsuario, clave, JSON.stringify(valor)]
  );
}
