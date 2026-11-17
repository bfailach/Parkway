import os from "os";

/**
 * Configuración de la arquitectura distribuida.
 *
 * Todo lo distribuido es opcional y se activa con variables de entorno.
 * Sin ellas el backend se comporta exactamente como el despliegue de un
 * solo nodo (Render): no se conecta a Redis ni a RabbitMQ y no escribe
 * eventos en la tabla de salida.
 *
 *   NODO_ID            Nombre de esta réplica (por defecto, el hostname).
 *   REDIS_URL          redis://redis:6379  → bloqueos, caché y liderazgo.
 *   RABBITMQ_URL       amqp://...          → publicación de eventos.
 *   OUTBOX_HABILITADO  true                → guarda cada evento de dominio
 *                                            en evento_outbox, dentro de la
 *                                            misma transacción del negocio.
 */
export const NODO_ID = process.env.NODO_ID || os.hostname();

export const distribuido = {
  get redisUrl() {
    return process.env.REDIS_URL || "";
  },
  get rabbitUrl() {
    return process.env.RABBITMQ_URL || "";
  },
  get outbox() {
    return process.env.OUTBOX_HABILITADO === "true";
  },
};

/** Nombre del exchange de eventos de dominio en RabbitMQ (tipo topic). */
export const EXCHANGE_EVENTOS = "parkway.eventos";

export const logDistribuido = (modulo: string, ...m: unknown[]) =>
  console.log(`[${NODO_ID}] [${modulo}]`, ...m); // eslint-disable-line no-console
