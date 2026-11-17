import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Batas ukuran sumber (sebelum minify) per chunk. Hasil build dipecah menjadi banyak file kecil
// karena sebagian hosting (mis. unggah lewat WebDAV) gagal menerima file besar.
const CHUNK_SOURCE_LIMIT = 48_000;

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // path relatif: hasil build bisa ditaruh di subfolder mana pun di hosting, atau di dalam APK
  base: './',
  resolve: {
    // Pakai modul sumber three.js (ratusan file kecil), bukan bundle tunggalnya, supaya bisa dipecah.
    alias: [{ find: /^three$/, replacement: 'three/src/Three.js' }],
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    target: 'es2020',
    rolldownOptions: {
      output: {
        // Modul three.js saling impor melingkar; tanpa ini, chunk bisa jalan sebelum dependensinya siap.
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/, maxSize: CHUNK_SOURCE_LIMIT, priority: 3 },
            { name: 'vendor', test: /node_modules/, maxSize: CHUNK_SOURCE_LIMIT, priority: 2 },
            { name: 'sim', test: /[\\/]server[\\/]src[\\/]/, maxSize: CHUNK_SOURCE_LIMIT, priority: 1 },
            { name: 'app', test: /[\\/](client|shared)[\\/]src[\\/]/, maxSize: CHUNK_SOURCE_LIMIT, priority: 1 },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    fs: { allow: ['..'] },
    proxy: { '/socket.io': { target: 'http://localhost:3000', ws: true } },
  },
});
