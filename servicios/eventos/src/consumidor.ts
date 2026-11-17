import amqp, { Channel, ChannelModel, ConsumeMessage } from "amqplib";
import { Evento, procesar } from "./db";

/**
 * Consumidor de eventos de dominio.
 *
 * Topología en RabbitMQ (la declara este servicio, es idempotente):
 *
 *   parkway.eventos (topic) ──#──► eventos.proyeccion ──(rechazo)──► parkway.eventos.dlx ──► eventos.proyeccion.dlq
 *
 * - Varias réplicas consumen la misma cola (consumidores en competencia):
 *   RabbitMQ reparte los mensajes y cada uno lo procesa una sola réplica.
 * - Confirmación manual (ack) solo después de guardar en la base. Si la
 *   réplica muere antes, RabbitMQ entrega el mensaje a otra.
 * - Idempotencia: un evento repetido (entrega "al menos una vez") se
 *   reconoce por su id y no se cuenta dos veces.
 * - Mensajes inválidos van a la cola de mensajes muertos (DLQ) para revisión.
 * - Si la base del servicio falla, el mensaje vuelve a la cola y se reintenta.
 */
export const EXCHANGE = "parkway.eventos";
export const DLX = "parkway.eventos.dlx";
export const COLA = "eventos.proyeccion";
export const DLQ = "eventos.proyeccion.dlq";

export const metricas = { procesados: 0, duplicados: 0, rechazados: 0, reintentos: 0, conectado: false };

const log = (instancia: string, ...m: unknown[]) => console.log(`[${instancia}] [consumidor]`, ...m); // eslint-disable-line no-console

function leer(msg: ConsumeMessage): Evento | null {
  try {
    const e = JSON.parse(msg.content.toString("utf8"));
    if (typeof e.id !== "string" || typeof e.tipo !== "string" || typeof e.entidad !== "string" || !e.fecha) return null;
    return e as Evento;
  } catch {
    return null;
  }
}

export function iniciarConsumidor(url: string, instancia: string) {
  let conexion: ChannelModel | null = null;
  let espera = 1000;
  let detenido = false;

  async function conectar() {
    try {
      conexion = await amqp.connect(url, { clientProperties: { connection_name: `parkway-eventos-${instancia}` } });
      conexion.on("error", () => undefined);
      conexion.on("close", () => {
        metricas.conectado = false;
        if (!detenido) {
          log(instancia, `conexión perdida; reintento en ${espera / 1000} s`);
          setTimeout(conectar, espera);
          espera = Math.min(espera * 2, 30_000);
        }
      });
      const ch: Channel = await conexion.createChannel();
      ch.on("error", () => undefined);
      await ch.assertExchange(EXCHANGE, "topic", { durable: true });
      await ch.assertExchange(DLX, "fanout", { durable: true });
      await ch.assertQueue(DLQ, { durable: true });
      await ch.bindQueue(DLQ, DLX, "");
      await ch.assertQueue(COLA, { durable: true, arguments: { "x-dead-letter-exchange": DLX } });
      await ch.bindQueue(COLA, EXCHANGE, "#");
      await ch.prefetch(10);

      await ch.consume(COLA, async (msg) => {
        if (!msg) return;
        const evento = leer(msg);
        if (!evento) {
          metricas.rechazados += 1;
          ch.nack(msg, false, false); // a la DLQ
          return;
        }
        try {
          const nuevo = await procesar(evento, instancia);
          if (nuevo) metricas.procesados += 1;
          else metricas.duplicados += 1;
          ch.ack(msg);
        } catch (error) {
          // Falla transitoria (por ejemplo, la base del servicio): se espera y
          // el mensaje vuelve a la cola para otro intento.
          metricas.reintentos += 1;
          log(instancia, `no se pudo procesar ${evento.id}: ${(error as Error).message}`);
          setTimeout(() => {
            try {
              ch.nack(msg, false, true);
            } catch {
              /* el canal ya se cerró: RabbitMQ lo reentrega solo */
            }
          }, 2000);
        }
      });
      metricas.conectado = true;
      espera = 1000;
      log(instancia, `escuchando la cola ${COLA}`);
    } catch (error) {
      metricas.conectado = false;
      log(instancia, `RabbitMQ no disponible (${(error as Error).message}); reintento en ${espera / 1000} s`);
      if (!detenido) setTimeout(conectar, espera);
      espera = Math.min(espera * 2, 30_000);
    }
  }

  conectar();
  return {
    async detener() {
      detenido = true;
      await conexion?.close().catch(() => undefined);
    },
  };
}
