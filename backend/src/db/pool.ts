import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

// Pool de conexiones único para toda la aplicación (capa de Acceso a datos).
// Todas las operaciones de una misma unidad de trabajo deben tomar el
// cliente con `pool.connect()` y reutilizarlo hasta el COMMIT/ROLLBACK,
// en vez de usar `pool.query()` directamente para transacciones.
// En producción (Render, Neon, etc.) basta con DATABASE_URL. Con DB_SSL=true
// la conexión va cifrada, como exigen las bases de datos en la nube.
const comunes = {
  max: Number(process.env.DB_POOL_MAX) || 10,
  // Si no hay conexiones libres en 5 s, la petición falla en lugar de
  // quedar esperando indefinidamente.
  connectionTimeoutMillis: 5000,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
};

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ...comunes })
  : new Pool({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || "parkway",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "postgres",
      ...comunes,
    });

pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Error inesperado en el pool de conexiones de PostgreSQL", err);
});
