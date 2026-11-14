import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, proxy: { '/api': 'http://localhost:2600', '/ws': { target: 'ws://localhost:2600', ws: true } } },
  build: { target: 'es2022', chunkSizeWarningLimit: 3000 },
});
