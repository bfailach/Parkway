import { PoolClient } from "pg";
import { pool } from "../db/pool";
import type { Rol } from "../middlewares/auth";
import type { DatosUsuario } from "../validators/usuarioValidator";

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

// ---------------------------------------------------------------------
// Gestión de usuarios (RF02)
// ---------------------------------------------------------------------
const SELECT_USUARIO = `
  SELECT u.id_usuario, u.nombre, u.documento, u.correo, u.telefono, u.rol, u.turno, u.estado, u.fecha_creacion,
         COALESCE(array_agg(op.id_parqueadero ORDER BY op.id_parqueadero) FILTER (WHERE op.id_parqueadero IS NOT NULL), '{}') AS sedes
    FROM usuario u
    LEFT JOIN operador_parqueadero op ON op.id_usuario = u.id_usuario`;

export interface FiltrosUsuarios {
  /** Texto en el nombre, el correo o el documento. */
  q?: string;
  rol?: string;
  estado?: string;
}

export async function listar(f: FiltrosUsuarios) {
  const condiciones: string[] = [];
  const valores: unknown[] = [];
  if (f.q) {
    valores.push(`%${f.q}%`);
    condiciones.push(`(u.nombre ILIKE $${valores.length} OR u.correo ILIKE $${valores.length} OR u.documento ILIKE $${valores.length})`);
  }
  if (f.rol) {
    valores.push(f.rol);
    condiciones.push(`u.rol = $${valores.length}`);
  }
  if (f.estado) {
    valores.push(f.estado);
    condiciones.push(`u.estado = $${valores.length}`);
  }
  const { rows } = await pool.query(
    `${SELECT_USUARIO}
     ${condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : ""}
     GROUP BY u.id_usuario
     ORDER BY CASE u.rol WHEN 'ADMINISTRADOR' THEN 1 WHEN 'OPERADOR' THEN 2 ELSE 3 END, u.nombre`,
    valores
  );
  return rows;
}

export async function obtener(id: number) {
  const { rows } = await pool.query(`${SELECT_USUARIO} WHERE u.id_usuario = $1 GROUP BY u.id_usuario`, [id]);
  return rows[0] ?? null;
}

/** Bloquea la fila del usuario para editarlo dentro de una transacción. */
export async function bloquear(client: PoolClient, id: number) {
  const { rows } = await client.query(`SELECT id_usuario, nombre, rol, estado FROM usuario WHERE id_usuario = $1 FOR UPDATE`, [id]);
  return rows[0] ?? null;
}

/**
 * Administradores activos. Bloquea sus filas para que dos cambios
 * simultáneos no dejen el sistema sin administrador.
 */
export async function contarAdministradoresActivos(client: PoolClient): Promise<number> {
  const { rows } = await client.query(
    `SELECT id_usuario FROM usuario WHERE rol = 'ADMINISTRADOR' AND estado = 'ACTIVO' ORDER BY id_usuario FOR UPDATE`
  );
  return rows.length;
}

export async function crear(client: PoolClient, d: DatosUsuario, hash: string): Promise<number> {
  const { rows } = await client.query(
    `INSERT INTO usuario (nombre, documento, correo, telefono, contrasena_hash, rol, turno, estado)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id_usuario`,
    [d.nombre, d.documento, d.correo, d.telefono, hash, d.rol, d.turno, d.estado]
  );
  return rows[0].id_usuario;
}

/** Actualiza los datos. La contraseña solo cambia si llega un hash nuevo. */
export async function actualizar(client: PoolClient, id: number, d: DatosUsuario, hash: string | null) {
  await client.query(
    `UPDATE usuario
        SET nombre = $2, documento = $3, correo = $4, telefono = $5, rol = $6, turno = $7, estado = $8,
            contrasena_hash = COALESCE($9, contrasena_hash)
      WHERE id_usuario = $1`,
    [id, d.nombre, d.documento, d.correo, d.telefono, d.rol, d.turno, d.estado, hash]
  );
}

export async function cambiarEstado(client: PoolClient, id: number, estado: string) {
  await client.query(`UPDATE usuario SET estado = $2 WHERE id_usuario = $1`, [id, estado]);
}

/** Sedes que existen de una lista de ids. */
export async function cantidadSedesExistentes(client: PoolClient, sedes: number[]): Promise<number> {
  if (!sedes.length) return 0;
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM parqueadero WHERE id_parqueadero = ANY($1::int[])`, [sedes]);
  return rows[0].n;
}

/** Reemplaza las sedes de un operador. Con una lista vacía le quita todas. */
export async function asignarSedes(client: PoolClient, id: number, sedes: number[]) {
  await client.query(`DELETE FROM operador_parqueadero WHERE id_usuario = $1`, [id]);
  if (!sedes.length) return;
  await client.query(
    `INSERT INTO operador_parqueadero (id_usuario, id_parqueadero) SELECT $1, unnest($2::int[])`,
    [id, sedes]
  );
}

/**
 * Cancela las reservas activas de un cliente y libera sus espacios. Se usa
 * al desactivar la cuenta para que el espacio no quede apartado.
 */
export async function cancelarReservasActivas(client: PoolClient, idCliente: number): Promise<number> {
  const { rows } = await client.query(
    `UPDATE reserva SET estado = 'CANCELADA'
      WHERE id_cliente = $1 AND estado = 'ACTIVA'
      RETURNING id_espacio`,
    [idCliente]
  );
  if (rows.length) {
    await client.query(
      `UPDATE espacio SET estado = 'LIBRE', version = version + 1
        WHERE id_espacio = ANY($1::int[]) AND estado = 'RESERVADO'`,
      [rows.map((r) => r.id_espacio)]
    );
  }
  return rows.length;
}

/** Rol y estado actuales, para validar cada sesión contra la base de datos. */
export async function estadoSesion(id: number): Promise<{ nombre: string; rol: Rol; estado: string } | null> {
  const { rows } = await pool.query(`SELECT nombre, rol, estado FROM usuario WHERE id_usuario = $1`, [id]);
  return rows[0] ?? null;
}
