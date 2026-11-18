import crypto from "crypto";
import fs from "fs";
import path from "path";
import { pool } from "./pool";

/**
 * Migraciones al arrancar.
 *
 * Las funciones de Sistemas Distribuidos y de la propuesta necesitan tablas
 * nuevas (evento_outbox, tope_tarifario, consentimiento_datos, reclamo...).
 * En un despliegue sobre una base anterior, como Render, se aplican solas al
 * iniciar el servidor: así no hace falta conectarse a la base a mano.
 *
 * - Los scripts son idempotentes (IF NOT EXISTS, ON CONFLICT DO NOTHING).
 * - Cada archivo se aplica una vez por contenido: se guarda su huella SHA-256
 *   en migracion_aplicada y solo se vuelve a correr si el archivo cambia.
 * - Un candado de PostgreSQL (pg_advisory_lock) evita que dos réplicas
 *   apliquen la misma migración a la vez.
 * - Se desactiva con MIGRAR_AL_INICIAR=false.
 */
const ARCHIVOS = ["migracion_distribuida.sql", "migracion_propuesta.sql"];
const CANDADO = 26_2026; // identificador del candado de migraciones

function carpetaSql(): string | null {
  const candidatas = [
    process.env.CARPETA_SQL,
    path.resolve(__dirname, "../../../database"), // backend/dist/db -> repositorio/database
    path.resolve(process.cwd(), "database"),
    path.resolve(process.cwd(), "../database"),
  ].filter(Boolean) as string[];
  return candidatas.find((c) => ARCHIVOS.every((a) => fs.existsSync(path.join(c, a)))) ?? null;
}

export async function aplicarMigraciones(): Promise<void> {
  if (process.env.MIGRAR_AL_INICIAR === "false") return;
  const carpeta = carpetaSql();
  if (!carpeta) {
    console.log("Migraciones: no se encontraron los scripts SQL; se omiten"); // eslint-disable-line no-console
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [CANDADO]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS migracion_aplicada (
         archivo   VARCHAR(100) PRIMARY KEY,
         huella    CHAR(64)     NOT NULL,
         aplicada  TIMESTAMP    NOT NULL DEFAULT now()
       )`
    );
    for (const archivo of ARCHIVOS) {
      const sql = fs.readFileSync(path.join(carpeta, archivo), "utf8");
      const huella = crypto.createHash("sha256").update(sql).digest("hex");
      const { rows } = await client.query("SELECT huella FROM migracion_aplicada WHERE archivo = $1", [archivo]);
      if (rows[0]?.huella === huella) continue;
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO migracion_aplicada (archivo, huella) VALUES ($1, $2)
           ON CONFLICT (archivo) DO UPDATE SET huella = EXCLUDED.huella, aplicada = now()`,
          [archivo, huella]
        );
        await client.query("COMMIT");
        console.log(`Migraciones: ${archivo} aplicada`); // eslint-disable-line no-console
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [CANDADO]).catch(() => undefined);
    client.release();
  }
}
