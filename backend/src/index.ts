import dotenv from "dotenv";

dotenv.config();

// Hora del negocio. Debe coincidir con la de los scripts SQL (SET TIME ZONE).
process.env.TZ ||= "America/Bogota";

// eslint-disable-next-line import/first
import { app } from "./app";
// eslint-disable-next-line import/first
import { pool } from "./db/pool";
// eslint-disable-next-line import/first
import { expirarVencidas } from "./repositories/reservaRepository";
// eslint-disable-next-line import/first
import { iniciarTiempoReal } from "./tiempoReal/servidor";
// eslint-disable-next-line import/first
import { logDistribuido, NODO_ID } from "./distribuido/config";
// eslint-disable-next-line import/first
import { iniciarPublicador } from "./distribuido/outbox";
// eslint-disable-next-line import/first
import { cerrarRabbit, conectarRabbit } from "./distribuido/rabbitmq";
// eslint-disable-next-line import/first
import { cerrarRedis, conectarRedis, soyLider } from "./distribuido/redis";
// eslint-disable-next-line import/first
import { aplicarMigraciones } from "./db/migraciones";

// Tablas nuevas de la arquitectura distribuida y de la propuesta en una base
// anterior (por ejemplo, Render): se aplican solas, una vez por versión del script.
aplicarMigraciones().catch((e) => console.error("No se pudieron aplicar las migraciones", e)); // eslint-disable-line no-console

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Parkway backend (nodo ${NODO_ID}) escuchando en el puerto ${PORT}`);
});

// RF12: avisos por WebSocket en /api/tiempo-real cuando cambia un espacio.
const tiempoReal = iniciarTiempoReal(server);

// Libera cada 30 segundos los espacios de reservas cuyo plazo de llegada venció.
// Con varias réplicas, solo el nodo líder (elegido en Redis) ejecuta la tarea.
const expiracion = setInterval(async () => {
  try {
    if (await soyLider("expirar-reservas", 45_000)) await expirarVencidas();
  } catch (e) {
    console.error("Error al expirar reservas", e); // eslint-disable-line no-console
  }
}, 30_000);

// Sistemas distribuidos: conexiones con Redis y RabbitMQ (si están configurados).
conectarRedis();
conectarRabbit();

// Sistemas distribuidos: publica en RabbitMQ los eventos guardados en el outbox.
const publicador = iniciarPublicador();

// Apagado ordenado: al recibir SIGTERM (docker stop, redespliegue) el nodo deja
// de aceptar conexiones, termina las peticiones en curso y cierra sus
// conexiones. El gateway envía el tráfico nuevo a las demás réplicas.
let apagando = false;
async function apagar(senal: string) {
  if (apagando) return;
  apagando = true;
  logDistribuido("apagado", `${senal} recibido, cerrando el nodo`);
  clearInterval(expiracion);
  publicador.detener();
  tiempoReal.cerrar();
  setTimeout(() => process.exit(0), 10_000).unref();
  server.close(async () => {
    await Promise.allSettled([cerrarRedis(), cerrarRabbit()]);
    await pool.end().catch(() => undefined);
    process.exit(0);
  });
}
process.on("SIGTERM", () => apagar("SIGTERM"));
process.on("SIGINT", () => apagar("SIGINT"));
