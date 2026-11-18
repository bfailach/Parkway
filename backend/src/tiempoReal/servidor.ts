import { Server } from "http";
import { PoolClient } from "pg";
import { WebSocket, WebSocketServer } from "ws";
import { pool } from "../db/pool";
import { invalidarSede } from "../distribuido/redis";
import { CANAL_AVISOS, leerAvisoPersonal } from "./canales";

/**
 * Actualización en tiempo real (RF12).
 *
 * 1. El trigger tr_espacio_tiempo_real (schema.sql) avisa por el canal
 *    parkway_espacios cada vez que una transacción confirmada cambia el
 *    estado de un espacio. Las revertidas no avisan.
 * 2. Este módulo escucha ese canal con LISTEN en una conexión propia.
 * 3. Reenvía el aviso a todas las pantallas conectadas por WebSocket en
 *    /api/tiempo-real. Cada pantalla vuelve a pedir sus datos a la API.
 *
 * El aviso solo dice qué sede cambió ({ "tipo": "espacios", "sede": 1 }),
 * igual de público que el plano de la sede, así que el WebSocket no pide
 * sesión: los datos con placas siguen saliendo de la API con su token.
 * Como el aviso viene de PostgreSQL, funciona aunque el servicio corra en
 * varios nodos: todos escuchan la misma base.
 *
 * Por el canal parkway_avisos llegan los avisos de actividad, como
 * { "tipo": "actividad", "sede": 1, "operacion": "INGRESO" }. Tampoco llevan
 * placas ni nombres: cada pantalla consulta el detalle en la API con su sesión.
 */
export const CANAL = "parkway_espacios";
export const RUTA_WS = "/api/tiempo-real";

/** Lee el aviso del trigger. Devuelve el número de la sede o null si no es válido. */
export function leerAviso(payload: string | undefined): number | null {
  try {
    const sede = Number(JSON.parse(payload ?? "").sede);
    return Number.isInteger(sede) && sede > 0 ? sede : null;
  } catch {
    return null;
  }
}

/**
 * Junta los avisos que llegan seguidos (por ejemplo, varios ingresos en el
 * mismo segundo) y entrega cada sede una sola vez por ventana.
 */
export function crearAgrupador(entregar: (sedes: number[]) => void, ventanaMs = 150) {
  let pendientes = new Set<number>();
  let temporizador: NodeJS.Timeout | null = null;
  return (sede: number) => {
    pendientes.add(sede);
    if (temporizador) return;
    temporizador = setTimeout(() => {
      const sedes = [...pendientes].sort((a, b) => a - b);
      pendientes = new Set();
      temporizador = null;
      entregar(sedes);
    }, ventanaMs);
  };
}

const log = (...m: unknown[]) => console.log("[tiempo real]", ...m); // eslint-disable-line no-console

export function iniciarTiempoReal(server: Server) {
  const wss = new WebSocketServer({ server, path: RUTA_WS, maxPayload: 1024 });
  const vivos = new WeakSet<WebSocket>();

  const enviar = (mensaje: object) => {
    const texto = JSON.stringify(mensaje);
    for (const ws of wss.clients) if (ws.readyState === WebSocket.OPEN) ws.send(texto);
  };

  const avisar = crearAgrupador((sedes) => sedes.forEach((sede) => enviar({ tipo: "espacios", sede })));

  wss.on("connection", (ws) => {
    vivos.add(ws);
    ws.on("pong", () => vivos.add(ws));
    ws.on("error", () => ws.terminate());
    // Las pantallas no envían nada; cualquier mensaje se ignora.
    ws.send(JSON.stringify({ tipo: "conectado" }));
  });

  // Cada 30 s se comprueba que cada pantalla siga ahí. Además evita que un
  // proxy cierre la conexión por inactividad.
  const latido = setInterval(() => {
    for (const ws of wss.clients) {
      if (!vivos.has(ws)) {
        ws.terminate();
        continue;
      }
      vivos.delete(ws);
      ws.ping();
    }
  }, 30_000);
  wss.on("close", () => clearInterval(latido));

  // Conexión dedicada a LISTEN. Si se cae, se reintenta con espera creciente.
  let cliente: PoolClient | null = null;
  let espera = 1000;
  let detenido = false;
  let programado = false;
  let primeraVez = true;

  async function escuchar() {
    try {
      cliente = await pool.connect();
      cliente.on("notification", (n) => {
        if (n.channel === CANAL_AVISOS) {
          const aviso = leerAvisoPersonal(n.payload);
          if (aviso) enviar(aviso);
          return;
        }
        const sede = n.channel === CANAL ? leerAviso(n.payload) : null;
        if (sede) {
          // Sistemas distribuidos: borra la caché de la sede en Redis antes
          // de avisar, para que la recarga de las pantallas traiga datos nuevos.
          invalidarSede(sede).finally(() => avisar(sede));
        }
      });
      cliente.on("error", reintentar);
      await cliente.query(`LISTEN ${CANAL}`);
      await cliente.query(`LISTEN ${CANAL_AVISOS}`);
      const { rows } = await cliente.query(`SELECT 1 FROM pg_trigger WHERE tgname = 'tr_espacio_tiempo_real'`);
      if (!rows.length) {
        log("Falta el trigger en la base. Ejecute database/migracion_tiempo_real.sql; mientras tanto las pantallas consultan cada pocos segundos.");
      }
      espera = 1000;
      // Durante la caída pudieron cambiar espacios: las pantallas recargan.
      if (!primeraVez) enviar({ tipo: "reconectado" });
      primeraVez = false;
    } catch (e) {
      reintentar(e as Error);
    }
  }

  function reintentar(error: Error) {
    if (cliente) {
      cliente.removeAllListeners("notification");
      cliente.removeAllListeners("error");
      cliente.release(true);
      cliente = null;
    }
    if (detenido || programado) return;
    programado = true;
    log(`Sin conexión con la base (${error.message}). Reintento en ${espera / 1000} s`);
    setTimeout(() => {
      programado = false;
      escuchar();
    }, espera);
    espera = Math.min(espera * 2, 30_000);
  }

  escuchar();

  return {
    wss,
    cerrar() {
      detenido = true;
      clearInterval(latido);
      wss.close();
      cliente?.release();
    },
  };
}
