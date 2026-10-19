import dotenv from "dotenv";

dotenv.config();

// eslint-disable-next-line import/first
import { app } from "./app";

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Parkway backend escuchando en el puerto ${PORT}`);
});
