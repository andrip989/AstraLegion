// Siapkan server untuk web hosting:   npm run build:host   ->   dist/host/
//
//   start.cjs       pemuat (salinan server/host/start.cjs); inilah yang dijalankan hosting
//   manifest.json   id build, daftar potongan, dan sha256 gabungannya
//   parts/*.part    server + semua dependensinya dalam satu bundel, dipecah per PART_SIZE byte
//
// Bundelnya mandiri (tanpa node_modules), jadi di hosting tidak perlu "npm install". Dipecah
// kecil-kecil karena unggahan file besar lewat drive WebDAV sering macet.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PART_SIZE = 40_000;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'host');

const result = await build({
  absWorkingDir: root,
  entryPoints: ['server/src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  minify: true,
  legalComments: 'none',
  write: false,
  // akselerator native opsional milik "ws"; tanpa keduanya dipakai implementasi JavaScript
  external: ['bufferutil', 'utf-8-validate'],
  logLevel: 'warning',
});

const code = Buffer.from(result.outputFiles[0].contents);
const loaderFile = join(root, 'server', 'host', 'start.cjs');
const sha256 = createHash('sha256').update(code).digest('hex');
// Potongan dinamai menurut isi bundel (yang sudah ada di hosting tidak diunggah ulang). Id build
// mencakup pemuat juga: server yang berjalan berhenti dan dimulai ulang saat salah satunya berubah.
const codeId = sha256.slice(0, 12);
const id = createHash('sha256').update(code).update(readFileSync(loaderFile)).digest('hex').slice(0, 12);

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'parts'), { recursive: true });
const parts = [];
for (let at = 0, i = 0; at < code.length; at += PART_SIZE, i++) {
  const name = `${codeId}-${String(i).padStart(2, '0')}.part`;
  writeFileSync(join(out, 'parts', name), code.subarray(at, at + PART_SIZE));
  parts.push(name);
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ build: id, size: code.length, sha256, parts }, null, 1));
copyFileSync(loaderFile, join(out, 'start.cjs'));

console.log(`Server hosting: build ${id}, ${(code.length / 1024).toFixed(0)} KB dalam ${parts.length} potongan -> dist/host`);
