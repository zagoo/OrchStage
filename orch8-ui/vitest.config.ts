import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// Kept separate from vite.config.ts: vitest bundles its own Vite, and mixing the
// `test` field into the build config triggers a dual-Vite plugin type clash.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**', 'src/api/**', 'src/stores/**', 'src/composables/**'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/test/**'],
    },
  },
})
