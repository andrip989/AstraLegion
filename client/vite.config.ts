import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // path relatif: hasil build bisa ditaruh di subfolder mana pun di hosting, atau di dalam APK
  base: './',
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    host: true,
    fs: { allow: ['..'] },
    proxy: { '/socket.io': { target: 'http://localhost:3000', ws: true } },
  },
});
