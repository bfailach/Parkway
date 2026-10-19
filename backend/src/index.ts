import dotenv from "dotenv";

dotenv.config();

// eslint-disable-next-line import/first
import { app } from "./app";
// eslint-disable-next-line import/first
import { expirarVencidas } from "./repositories/reservaRepository";

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Parkway backend escuchando en el puerto ${PORT}`);
});

// Libera cada 30 segundos los espacios de reservas cuyo plazo de llegada venció.
setInterval(() => {
  expirarVencidas().catch((e) => console.error("Error al expirar reservas", e)); // eslint-disable-line no-console
}, 30_000);
