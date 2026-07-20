import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Lição da suíte: uma única cópia do React (senão hooks quebram).
  resolve: {
    dedupe: ["react", "react-dom"],
  },

  // Duas páginas: o app (`index.html`) e o terminal do quake mode
  // (`quake.html`, janela `quake`). Sem declarar as DUAS entradas o build só
  // emitiria a index e o quake abriria EM BRANCO no instalador — funcionando
  // o tempo todo em `tauri dev`, que serve o projeto inteiro pelo Vite.
  // Achado pago no LocalTranslate 0.4.0; aqui já nasce certo.
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        quake: "quake.html",
      },
    },
  },

  // Opções do Vite ajustadas pro Tauri (só em `tauri dev`/`tauri build`).
  clearScreen: false,
  server: {
    // Porta única do LocalTerminal na suíte (LocalZip=1460, este=1462). O
    // Tauri não tem fallback de porta — devUrl e esta porta têm que bater.
    port: 1462,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1463,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
