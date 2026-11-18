import fs from "fs";
import path from "path";
import { Client } from "pg";
import { pool } from "../../src/db/pool";
import { cerrarRedis } from "../../src/distribuido/redis";
import type { UsuarioToken } from "../../src/middlewares/auth";

/**
 * Base de datos de las pruebas de integración. Se reconstruye desde
 * schema.sql y seed.sql antes de cada archivo de pruebas, así cada uno
 * empieza con los mismos datos. Por seguridad solo trabaja sobre una base
 * cuyo nombre termine en "_test".
 */
const SQL = path.resolve(__dirname, "../../../database");

function conexion(database: string) {
  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database,
  };
}

export async function reiniciarBase() {
  const nombre = process.env.DB_NAME ?? "";
  if (!/_test$/.test(nombre)) throw new Error(`Las pruebas de integración solo corren sobre una base *_test (recibí "${nombre}")`);
  const admin = new Client(conexion("postgres"));
  await admin.connect();
  const existe = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [nombre]);
  if (!existe.rowCount) await admin.query(`CREATE DATABASE ${nombre}`);
  await admin.end();

  const c = new Client(conexion(nombre));
  await c.connect();
  for (const archivo of ["schema.sql", "seed.sql", "migracion_distribuida.sql", "migracion_propuesta.sql"]) await c.query(fs.readFileSync(path.join(SQL, archivo), "utf8"));
  // Las sedes atienden todo el día, para que las reservas no dependan de la hora en que corren las pruebas.
  await c.query(`UPDATE horario SET abre = '00:00', cierra = '24:00'`);
  await c.end();
}

export async function cerrar() {
  await cerrarRedis(); // en modo distribuido (REDIS_URL) la conexión mantendría vivo el proceso
  await pool.end();
}

/** Consulta directa para verificar el estado de la base. */
export async function uno<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await pool.query(sql, params);
  return rows[0] as T;
}

// Usuarios de seed.sql
export const ADMIN: UsuarioToken = { id_usuario: 1, nombre: "Admin General", rol: "ADMINISTRADOR" };
export const OPERADOR1: UsuarioToken = { id_usuario: 2, nombre: "Carlos Operador", rol: "OPERADOR" };
export const OPERADOR2: UsuarioToken = { id_usuario: 3, nombre: "Laura Operadora", rol: "OPERADOR" };
export const CLIENTE1 = 4;
export const CLIENTE2 = 5;
export const CHAPINERO = 1;
export const ZONA_T = 2;

/** Comprueba que la promesa falle con el código HTTP indicado. */
export async function fallaCon(promesa: Promise<unknown>, status: number, mensaje?: RegExp) {
  try {
    await promesa;
  } catch (e) {
    const err = e as { status?: number; message: string; code?: string };
    const real = err.status ?? (err.code === "23505" ? 409 : 500);
    if (real !== status) throw new Error(`Se esperaba ${status} y llegó ${real}: ${err.message}`);
    if (mensaje && !mensaje.test(err.message)) throw new Error(`Mensaje inesperado: ${err.message}`);
    return err;
  }
  throw new Error(`Se esperaba un error ${status} y la operación funcionó`);
}
