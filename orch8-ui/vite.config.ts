import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// The orch8-server origin the proxy forwards to. The SPA ALWAYS talks to its own
// origin (the UI port); this proxy forwards the server paths to orch8-server so
// the browser never issues a cross-origin (CORS) request and the server port is
// never exposed to the client. Override with ORCH8_API_URL.
const API_TARGET = process.env.ORCH8_API_URL ?? 'http://127.0.0.1:8080'

// Shared by BOTH `vite` (dev) and `vite preview` (production-like static serve)
// so a built bundle behaves identically to dev: same-origin, no CORS.
// `ws: true` keeps SSE/streaming endpoints flowing through the proxy.
const apiProxy = {
  '/api': { target: API_TARGET, changeOrigin: true, ws: true },
  '/health': { target: API_TARGET, changeOrigin: true },
  '/info': { target: API_TARGET, changeOrigin: true },
  '/metrics': { target: API_TARGET, changeOrigin: true },
  '/mobile': { target: API_TARGET, changeOrigin: true },
}

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  // `vite preview` serves the production build of dist/. Without this proxy a
  // deployed UI would have to call orch8-server's port directly (cross-origin →
  // CORS). With it, leave the console's Server URL blank for same-origin access.
  preview: {
    port: 4173,
    proxy: apiProxy,
  },
})
