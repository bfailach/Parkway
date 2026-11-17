import { Pool } from "pg";

/**
 * Base de datos propia del servicio (patrón "una base por servicio").
 * El servicio de eventos no lee las tablas del backend: construye su propia
 * vista a partir de los eventos que recibe (proyección o modelo de lectura).
 *
 * Por minimización de datos (Ley 1581 de 2012) no guarda placas, nombres ni
 * correos: solo el tipo de evento, la sede, el valor cobrado y su origen.
 */
export const pool = new Pool({
  connectionString: process.env.EVENTOS_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/parkway_eventos",
  max: 5,
  connectionTimeoutMillis: 5000,
});
pool.on("error", () => undefined);

// Zona horaria del negocio: el día de cada evento se cuenta en hora de Bogotá.
const ZONA = (process.env.TZ || "America/Bogota").replace(/[^A-Za-z0-9/_+-]/g, "");

export async function crearEsquema() {
  // Las réplicas arrancan a la vez: un candado de la base evita que dos
  // creen las tablas al mismo tiempo.
  await pool.query(`
    BEGIN;
    SELECT pg_advisory_xact_lock(4242);
    CREATE TABLE IF NOT EXISTS evento_recibido (
      id_evento         UUID         PRIMARY KEY,           -- idempotencia: un evento se procesa una sola vez
      tipo              VARCHAR(40)  NOT NULL,
      entidad           VARCHAR(50)  NOT NULL,
      id_entidad        VARCHAR(50),
      id_parqueadero    INTEGER,
      valor             NUMERIC(12,2),
      nodo_origen       VARCHAR(80),                         -- réplica del backend que confirmó la transacción
      instancia         VARCHAR(80)  NOT NULL,               -- réplica de este servicio que lo procesó
      fecha_evento      TIMESTAMP    NOT NULL,
      fecha_recepcion   TIMESTAMP    NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_evento_recibido_fecha ON evento_recibido (fecha_evento DESC);

    CREATE TABLE IF NOT EXISTS resumen_sede_dia (
      id_parqueadero    INTEGER      NOT NULL,
      fecha             DATE         NOT NULL,
      ingresos          INTEGER      NOT NULL DEFAULT 0,
      salidas           INTEGER      NOT NULL DEFAULT 0,
      reservas          INTEGER      NOT NULL DEFAULT 0,
      cancelaciones     INTEGER      NOT NULL DEFAULT 0,
      expiraciones      INTEGER      NOT NULL DEFAULT 0,
      recaudo           NUMERIC(14,2) NOT NULL DEFAULT 0,
      PRIMARY KEY (id_parqueadero, fecha)
    );
    COMMIT;
  `);
}

export interface Evento {
  id: string;
  tipo: string;
  entidad: string;
  idEntidad?: string | null;
  sede: number | null;
  datos: Record<string, unknown> | null;
  nodoOrigen: string;
  fecha: string;
}

const COLUMNA: Record<string, string> = {
  INGRESO: "ingresos",
  SALIDA: "salidas",
  RESERVA: "reservas",
  CANCELAR_RESERVA: "cancelaciones",
  EXPIRACION: "expiraciones",
};

/**
 * Registra el evento y actualiza la proyección en una sola transacción.
 * Devuelve false si el evento ya se había procesado (duplicado).
 */
export async function procesar(e: Evento, instancia: string): Promise<boolean> {
  const valor = e.tipo === "SALIDA" && e.datos && Number.isFinite(Number(e.datos.valor)) ? Number(e.datos.valor) : null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `INSERT INTO evento_recibido (id_evento, tipo, entidad, id_entidad, id_parqueadero, valor, nodo_origen, instancia, fecha_evento)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ($9::timestamptz AT TIME ZONE '${ZONA}'))
       ON CONFLICT (id_evento) DO NOTHING`,
      [e.id, e.tipo, e.entidad, e.idEntidad ?? null, e.sede, valor, e.nodoOrigen, instancia, e.fecha]
    );
    if (!rowCount) {
      await client.query("ROLLBACK");
      return false;
    }
    const columna = COLUMNA[e.tipo];
    if (columna && e.sede) {
      await client.query(
        `INSERT INTO resumen_sede_dia (id_parqueadero, fecha, ${columna}, recaudo)
         VALUES ($1, ($2::timestamptz AT TIME ZONE '${ZONA}')::date, 1, COALESCE($3, 0))
         ON CONFLICT (id_parqueadero, fecha)
         DO UPDATE SET ${columna} = resumen_sede_dia.${columna} + 1,
                       recaudo = resumen_sede_dia.recaudo + COALESCE($3, 0)`,
        [e.sede, e.fecha, valor]
      );
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
