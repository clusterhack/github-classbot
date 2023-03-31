/* eslint-disable node/no-unpublished-import */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  root: "src-ui",
  base: "/classbot/ui",
  publicDir: false,
  clearScreen: false,
  build: {
    outDir: "../lib-ui",
    emptyOutDir: false,
  },
  server: {
    port: 4000, // TODO Move to dotenv files (when time)
    strictPort: true,
    // proxy: {
    //   "/classbot/api": "http://localhost:3000/",
    //   "/classbot/auth": "http://localhost:3000/",
    // },
  },
});
