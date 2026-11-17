import { Request, Response } from "express";
import { pool } from "../db/pool";
import { distribuido, NODO_ID } from "./config";
import { pendientes } from "./outbox";
import { circuitoRabbit, estadoRabbit } from "./rabbitmq";
import { circuitoRedis, estadoRedis } from "./redis";
import { usaFirmaAsimetrica } from "./llaves";

/**
 * GET /api/salud/distribuida
 * Estado de este nodo y de cada dependencia. El gateway usa /api/health
 * (rápido); este endpoint es para observar el sistema durante las pruebas.
 * Responde 200 mientras la base responda: Redis y RabbitMQ son opcionales.
 */
export async function saludDistribuida(_req: Request, res: Response) {
  const inicio = Date.now();
  let baseDatos = "ok";
  let replicacion: unknown = null;
  try {
    await pool.query("SELECT 1");
    // Réplicas conectadas al primario por replicación en streaming.
    const { rows } = await pool.query(
      `SELECT application_name AS replica, state AS estado,
              COALESCE(EXTRACT(EPOCH FROM replay_lag), 0)::float AS retraso_s
         FROM pg_stat_replication`
    );
    replicacion = rows;
  } catch (e) {
    baseDatos = `sin conexión (${(e as Error).message})`;
  }
  let eventosPendientes: number | null = null;
  if (distribuido.outbox && baseDatos === "ok") eventosPendientes = await pendientes().catch(() => null);

  res.status(baseDatos === "ok" ? 200 : 503).json({
    nodo: NODO_ID,
    pid: process.pid,
    activoDesde: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    dependencias: {
      baseDatos,
      replicacion,
      redis: { estado: await estadoRedis(), circuito: circuitoRedis.estado },
      rabbitmq: { estado: await estadoRabbit(), circuito: circuitoRabbit.estado },
    },
    outbox: { habilitado: distribuido.outbox, eventosPendientes },
    firmaTokens: usaFirmaAsimetrica() ? "ES256 (JWKS)" : "HS256 (secreto)",
    ms: Date.now() - inicio,
  });
}
