import os from "os";
import express from "express";
import { iniciarConsumidor, metricas } from "./consumidor";
import { crearEsquema, pool } from "./db";
import { requiereAdministrador } from "./autenticacion";

/**
 * Servicio de Eventos de Parkway (microservicio).
 *
 * Responsabilidad: consumir los eventos de dominio que publica el backend en
 * RabbitMQ y mantener, con base de datos propia, la auditoría de eventos y
 * el resumen operativo por sede y día (ingresos, salidas, reservas,
 * expiraciones y recaudo). Trabaja desacoplado del backend: si este servicio
 * se cae, el backend sigue atendiendo y los eventos esperan en la cola.
 *
 * Rutas (detrás del gateway, bajo /eventos):
 *   GET /eventos/salud                    estado de la réplica (público)
 *   GET /eventos/resumen?sede=1&dias=7    resumen por sede y día (ADMINISTRADOR)
 *   GET /eventos/recientes?limite=20      últimos eventos recibidos (ADMINISTRADOR)
 */
process.env.TZ ||= "America/Bogota";
const INSTANCIA = process.env.INSTANCIA || os.hostname();
const PUERTO = Number(process.env.PORT) || 4000;
const log = (...m: unknown[]) => console.log(`[${INSTANCIA}]`, ...m); // eslint-disable-line no-console

const app = express();
app.use((_req, res, next) => {
  res.setHeader("X-Parkway-Nodo", INSTANCIA);
  next();
});

app.get("/eventos/salud", async (_req, res) => {
  let baseDatos = "ok";
  try {
    await pool.query("SELECT 1");
  } catch (e) {
    baseDatos = `sin conexión (${(e as Error).message})`;
  }
  res.status(baseDatos === "ok" && metricas.conectado ? 200 : 503).json({
    servicio: "eventos",
    instancia: INSTANCIA,
    rabbitmq: metricas.conectado ? "ok" : "sin conexión",
    baseDatos,
    metricas,
  });
});

const admin = requiereAdministrador();

app.get("/eventos/resumen", admin, async (req, res, next) => {
  try {
    const sede = req.query.sede ? Number(req.query.sede) : null;
    const dias = Math.min(Math.max(Number(req.query.dias) || 7, 1), 90);
    if (sede !== null && (!Number.isInteger(sede) || sede <= 0)) return res.status(400).json({ error: "Sede inválida" });
    const { rows } = await pool.query(
      `SELECT id_parqueadero AS sede, to_char(fecha, 'YYYY-MM-DD') AS fecha, ingresos, salidas, reservas,
              cancelaciones, expiraciones, recaudo::float AS recaudo
         FROM resumen_sede_dia
        WHERE fecha > CURRENT_DATE - $1::int AND ($2::int IS NULL OR id_parqueadero = $2)
        ORDER BY fecha DESC, id_parqueadero`,
      [dias, sede]
    );
    return res.json(rows);
  } catch (e) {
    return next(e);
  }
});

app.get("/eventos/recientes", admin, async (req, res, next) => {
  try {
    const limite = Math.min(Math.max(Number(req.query.limite) || 20, 1), 200);
    const { rows } = await pool.query(
      `SELECT id_evento, tipo, entidad, id_entidad, id_parqueadero AS sede, valor::float AS valor, nodo_origen, instancia,
              fecha_evento, fecha_recepcion,
              round(EXTRACT(EPOCH FROM fecha_recepcion - fecha_evento) * 1000)::int AS retraso_ms
         FROM evento_recibido ORDER BY fecha_recepcion DESC LIMIT $1`,
      [limite]
    );
    return res.json(rows);
  } catch (e) {
    return next(e);
  }
});

app.use((_req, res) => res.status(404).json({ error: "Ruta no encontrada" }));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log("error:", err.message);
  res.status(500).json({ error: "Error interno del servicio de eventos" });
});

async function iniciar() {
  // La base puede tardar en estar lista al arrancar el clúster: se reintenta.
  for (let intento = 1; ; intento++) {
    try {
      await crearEsquema();
      break;
    } catch (e) {
      if (intento >= 30) throw e;
      log(`base de datos no disponible (${(e as Error).message}); reintento ${intento}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  const consumidor = iniciarConsumidor(process.env.RABBITMQ_URL || "amqp://localhost", INSTANCIA);
  const server = app.listen(PUERTO, () => log(`servicio de eventos escuchando en el puerto ${PUERTO}`));

  const apagar = () => {
    log("apagando");
    server.close();
    consumidor.detener().finally(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on("SIGTERM", apagar);
  process.on("SIGINT", apagar);
}

iniciar().catch((e) => {
  log("no se pudo iniciar:", e);
  process.exit(1);
});
