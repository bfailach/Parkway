import amqp, { ChannelModel, ConfirmChannel } from "amqplib";
import { CircuitBreaker } from "./circuitBreaker";
import { distribuido, EXCHANGE_EVENTOS, logDistribuido, NODO_ID } from "./config";

/**
 * Conexión con RabbitMQ para publicar eventos de dominio.
 *
 * Usa un canal con confirmaciones (publisher confirms): publicar() solo
 * termina bien cuando el broker confirma que guardó el mensaje. Los
 * mensajes son persistentes y el exchange es durable, así que sobreviven a
 * un reinicio del broker. Si la conexión se pierde, se vuelve a abrir en la
 * siguiente publicación; mientras tanto el circuito evita insistir.
 */
const log = (...m: unknown[]) => logDistribuido("rabbitmq", ...m);

let conexion: ChannelModel | null = null;
let canal: ConfirmChannel | null = null;
let conectando: Promise<ConfirmChannel> | null = null;

export const circuitoRabbit = new CircuitBreaker("rabbitmq", {
  umbral: 2,
  esperaMs: 5000,
  timeoutMs: 3000,
  alCambiar: (e) => log(`circuito ${e}`),
});

export function rabbitActivo() {
  return Boolean(distribuido.rabbitUrl);
}

function olvidar() {
  canal = null;
  conexion = null;
}

async function abrirCanal(): Promise<ConfirmChannel> {
  if (canal) return canal;
  if (!conectando) {
    conectando = (async () => {
      const c = await amqp.connect(distribuido.rabbitUrl, { clientProperties: { connection_name: `parkway-api-${NODO_ID}` } });
      c.on("error", () => undefined);
      c.on("close", () => {
        log("conexión cerrada");
        olvidar();
      });
      const ch = await c.createConfirmChannel();
      ch.on("error", () => undefined);
      ch.on("close", olvidar);
      await ch.assertExchange(EXCHANGE_EVENTOS, "topic", { durable: true });
      conexion = c;
      canal = ch;
      log("conectado");
      return ch;
    })().finally(() => {
      conectando = null;
    });
  }
  return conectando;
}

export async function publicar(routingKey: string, mensaje: { id: string } & Record<string, unknown>) {
  await circuitoRabbit.ejecutar(async () => {
    const ch = await abrirCanal();
    await new Promise<void>((resolver, rechazar) => {
      ch.publish(
        EXCHANGE_EVENTOS,
        routingKey,
        Buffer.from(JSON.stringify(mensaje)),
        { persistent: true, contentType: "application/json", messageId: mensaje.id, appId: "parkway-api" },
        (err) => (err ? rechazar(err) : resolver())
      );
    });
  });
}

export async function estadoRabbit() {
  if (!rabbitActivo()) return "deshabilitado";
  if (!canal && circuitoRabbit.estado !== "ABIERTO") {
    await circuitoRabbit.ejecutar(abrirCanal).catch(() => undefined);
  }
  return canal ? "ok" : `sin conexión (circuito ${circuitoRabbit.estado})`;
}

/** Abre la conexión al arrancar el nodo. */
export function conectarRabbit() {
  if (rabbitActivo()) circuitoRabbit.ejecutar(abrirCanal).catch(() => undefined);
}

export async function cerrarRabbit() {
  await conexion?.close().catch(() => undefined);
  olvidar();
}
