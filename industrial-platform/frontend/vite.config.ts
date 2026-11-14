import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Not "localhost": Node resolves it to ::1 first, while uvicorn binds 127.0.0.1 by default.
const api = process.env.IP_API_ORIGIN ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  css: { modules: { localsConvention: "camelCaseOnly" } },
  server: {
    host: "0.0.0.0",
    port: 5180,
    proxy: { "/api": { target: api, changeOrigin: false, ws: true } },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        studio: resolve(import.meta.dirname, "index.html"),
        runtime: resolve(import.meta.dirname, "runtime.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
});
