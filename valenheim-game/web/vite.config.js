import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Im Entwicklungsmodus leitet Vite API- und WebSocket-Aufrufe an den Spielserver weiter.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:2567', '/ws': { target: 'ws://localhost:2567', ws: true } } },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
