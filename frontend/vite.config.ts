import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En desarrollo, las peticiones a /api se envían al backend en el puerto 3000.
export default defineConfig({
  plugins: [react()],
  // La escena 3D (Three.js) se carga aparte y pesa cerca de 1,2 MB.
  build: { chunkSizeWarningLimit: 1300 },
  server: {
    port: 5173,
    proxy: { "/api": process.env.VITE_API_PROXY || "http://localhost:3000" },
  },
});
