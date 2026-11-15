import dotenv from "dotenv";

dotenv.config();

// Hora del negocio. Debe coincidir con la de los scripts SQL (SET TIME ZONE).
process.env.TZ ||= "America/Bogota";

// eslint-disable-next-line import/first
import { app } from "./app";
// eslint-disable-next-line import/first
import { expirarVencidas } from "./repositories/reservaRepository";
// eslint-disable-next-line import/first
import { iniciarTiempoReal } from "./tiempoReal/servidor";

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Parkway backend escuchando en el puerto ${PORT}`);
});

// RF12: avisos por WebSocket en /api/tiempo-real cuando cambia un espacio.
iniciarTiempoReal(server);

// Libera cada 30 segundos los espacios de reservas cuyo plazo de llegada venció.
setInterval(() => {
  expirarVencidas().catch((e) => console.error("Error al expirar reservas", e)); // eslint-disable-line no-console
}, 30_000);
