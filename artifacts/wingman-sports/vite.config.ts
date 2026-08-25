import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const port = Number(process.env.PORT || process.env.WEB_PORT || 5173);
const apiPort = Number(process.env.API_PORT || 8080);
const basePath = process.env.BASE_PATH || '/';

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
      // StackBlitz-safe ESPN fallback path. Keeps scoreboards/team directories usable
      // even when the local API process is restarting or unavailable.
      '/espn': {
        target: 'https://site.api.espn.com',
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/espn/, ''),
      },
    },
  },
  preview: { port, host: '0.0.0.0', allowedHosts: true },
});
