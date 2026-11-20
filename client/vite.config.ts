import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, '../package.json'), 'utf8')) as { version: string };
// Versi cangkang APK (ikon, layar pembuka, plugin native) yang dilaporkan APK lewat user agent
// WebView; diambil dari capacitor.config.json supaya angkanya hanya ditulis di satu tempat.
const cap = JSON.parse(readFileSync(join(root, '../capacitor.config.json'), 'utf8')) as { android?: { appendUserAgent?: string } };
const SHELL_LATEST = Number(/AstraShell\/(\d+)/.exec(cap.android?.appendUserAgent ?? '')?.[1] ?? 1);
// Versi build = versi package + cap waktu UTC yang selalu naik, mis. 0.1.0+202611171030.
// Client membandingkan angka di belakang "+" dengan version.json di hosting untuk menawarkan update.
const APP_VERSION = `${pkg.version}+${new Date().toISOString().replace(/\D/g, '').slice(0, 12)}`;

/** Tulis version.json (versi + daftar semua file build) ke folder hasil build. */
function versionManifest(): Plugin {
  let outDir = '';
  return {
    name: 'astra-version-manifest',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(outDir, p).replace(/\\/g, '/'));
        }
      };
      walk(outDir);
      // Daftar ini dipakai pembaruan di dalam APK, yang mengunduh tiap file sebagai TEKS. Gambar dan
      // manifest "pasang dari browser" bukan teks dan tidak dibutuhkan di dalam APK, jadi tidak didaftarkan.
      const list = files.filter((f) => f !== 'version.json' && f !== 'manifest.json' && !/\.(png|jpe?g|webp|gif|ico)$/i.test(f)).sort();
      writeFileSync(join(outDir, 'version.json'), JSON.stringify({ version: APP_VERSION, files: list }, null, 1));
    },
  };
}

// Batas ukuran sumber (sebelum minify) per chunk. Hasil build dipecah menjadi banyak file kecil
// karena sebagian hosting (mis. unggah lewat WebDAV) gagal menerima file besar.
const CHUNK_SOURCE_LIMIT = 48_000;

export default defineConfig({
  root,
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION), __SHELL_LATEST__: String(SHELL_LATEST) },
  plugins: [versionManifest()],
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
            // klip suara announcer: chunk sendiri supaya baru diunduh saat dibutuhkan
            { name: 'voice', test: /[\\/]audio[\\/]voice[\\/]/, maxSize: CHUNK_SOURCE_LIMIT, priority: 4 },
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
