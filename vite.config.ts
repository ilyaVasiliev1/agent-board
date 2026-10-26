import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const API = 'http://localhost:5194';

// Интерфейс живёт в web/, собирается в dist/ (его отдаёт локальный сервер доски и публикует страница на сервере).
export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./web/src', import.meta.url)) } },
  build: { outDir: '../dist', emptyOutDir: true },
  // В разработке запросы к данным идут на запущенный локальный сервер доски.
  server: { proxy: { '/api': API, '/config.json': API, '/mode.json': API } },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], globals: true, css: false },
});
