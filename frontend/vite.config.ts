import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// En desarrollo, `npm run dev` levanta Vite en :5173 y proxya /api a la API
// que corras en local (uvicorn en :8000). En producción sirve el build estático
// y Vercel enruta /api a las funciones Python.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
