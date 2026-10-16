import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin in production (Fastify serves both); this makes dev behave the
    // same. changeOrigin stays off so the browser's Origin header reaches the API
    // unchanged and matches ALLOWED_ORIGINS.
    proxy: { "/api": { target: "http://localhost:3001" } },
  },
  build: { outDir: "dist", sourcemap: true },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
