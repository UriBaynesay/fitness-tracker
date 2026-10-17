import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react(),
    // Installable app + offline app shell. The service worker precaches the whole
    // build (hashed files never change, so cache-first is safe) and answers page
    // navigations with index.html. /api is never cached here: the app keeps its own
    // copies of the data it needs in IndexedDB (session/data.ts).
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Fitness Tracker",
        short_name: "Fitness",
        description: "Plan workouts, log sets at the gym, track progress.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#101216",
        theme_color: "#101216",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,png,svg}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
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
