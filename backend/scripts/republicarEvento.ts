/**
 * Vuelve a publicar en RabbitMQ el último evento ya publicado del outbox.
 * Simula una entrega duplicada (por ejemplo, un nodo que se cayó justo
 * después de publicar y antes de marcar el evento). El servicio de eventos
 * debe reconocerlo por su id y no contarlo dos veces.
 *
 *   RABBITMQ_URL=amqp://... DB_HOST=... npx tsx scripts/republicarEvento.ts
 */
import dotenv from "dotenv";
dotenv.config();
process.env.OUTBOX_HABILITADO = "true";

(async () => {
  const { pool } = await import("../src/db/pool");
  const { publicar, cerrarRabbit } = await import("../src/distribuido/rabbitmq");
  const { rows } = await pool.query(
    `SELECT * FROM evento_outbox WHERE fecha_publicacion IS NOT NULL ORDER BY fecha_publicacion DESC LIMIT 1`
  );
  if (!rows[0]) throw new Error("No hay eventos publicados");
  const ev = rows[0];
  await publicar(`${ev.entidad}.${ev.tipo}`.toLowerCase(), {
    id: ev.id_evento,
    tipo: ev.tipo,
    entidad: ev.entidad,
    idEntidad: ev.id_entidad,
    sede: ev.id_parqueadero,
    datos: ev.datos,
    nodoOrigen: ev.nodo_origen,
    fecha: ev.fecha_creacion,
  });
  console.log(`Evento ${ev.id_evento} (${ev.tipo}) publicado de nuevo`);
  await cerrarRabbit();
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
