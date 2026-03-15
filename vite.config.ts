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
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          mui: ["@mui/material"], // XXX Including "@mui/icons-material" significantly slows down the build...
          emotion: ["@emotion/react", "@emotion/styled"],
          //tanstack: ["@tanstack/react-router", "@tanstack/react-query"],
        },
      },
    },
  },
  server: {
    port: 4000, // TODO Move to dotenv files (when time)
    strictPort: true,
    // proxy: {
    //   "/classbot/api": "http://localhost:3000/",
    //   "/classbot/auth": "http://localhost:3000/",
    // },
    allowedHosts: ["classbot.do.clusterhack.net", "classbot-test.do.clusterhack.net"],
  },
});
