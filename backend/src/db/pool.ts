import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

// Pool de conexiones único para toda la aplicación (capa de Acceso a datos).
// Todas las operaciones de una misma unidad de trabajo deben tomar el
// cliente con `pool.connect()` y reutilizarlo hasta el COMMIT/ROLLBACK,
// en vez de usar `pool.query()` directamente para transacciones.
export const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "parkway",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
});

pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Error inesperado en el pool de conexiones de PostgreSQL", err);
});
