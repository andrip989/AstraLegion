// Pemuat server untuk web hosting (mis. alwaysdata):   node start.cjs
//
// "npm run build:host" membundel server menjadi SATU file tanpa node_modules, lalu memecahnya
// menjadi potongan kecil di parts/ (unggahan file besar lewat drive WebDAV macet). File ini
// menyatukan potongan itu di memori lalu menjalankannya. Tidak ada yang perlu dipasang di
// hosting selain Node.js.
//
// Dengan alasan yang sama, file ini juga memasang file besar (mis. APK) yang diunggah berupa
// potongan: files.json mendaftar tujuan + potongannya di files/, lalu hasil gabungannya ditulis
// ke folder tujuan di hosting.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');

const dir = __dirname;
const home = path.resolve(dir, '..'); // folder akun di hosting; tujuan files.json relatif ke sini
// Data akun pemain: di folder akun hosting, di luar folder web (tidak bisa diunduh siapa pun) dan
// di luar folder server ini (yang isinya diganti tiap deploy).
if (!process.env.DATA_DIR) process.env.DATA_DIR = path.join(home, 'astra-legion-data');
const manifestFile = path.join(dir, 'manifest.json');
const filesFile = path.join(dir, 'files.json');
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

function readManifest() {
  const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (!m || typeof m.build !== 'string' || !Array.isArray(m.parts)) throw new Error('manifest.json tidak valid');
  return m;
}

function fail(message) {
  console.error('[astra] ' + message);
  // Jeda dulu sebelum keluar, supaya hosting tidak menyalakan ulang proses ini bertubi-tubi.
  setTimeout(() => process.exit(1), 5000);
}

/** Pasang file besar yang diunggah berupa potongan. Aman dipanggil berulang. */
function installFiles() {
  let list;
  try {
    list = JSON.parse(fs.readFileSync(filesFile, 'utf8')).files;
  } catch {
    return; // belum ada, atau sedang ditulis (dicoba lagi saat file berubah)
  }
  if (!Array.isArray(list)) return;
  for (const f of list) {
    try {
      const target = path.resolve(home, String(f.to));
      if (!target.startsWith(home + path.sep)) throw new Error('tujuan di luar folder akun');
      const parts = f.parts.map((name) => path.join(dir, 'files', path.basename(String(name))));
      const installed = fs.existsSync(target) && fs.statSync(target).size === f.size && sha256(fs.readFileSync(target)) === f.sha256;
      if (!installed) {
        const data = Buffer.concat(parts.map((p) => fs.readFileSync(p)));
        if (sha256(data) !== f.sha256) throw new Error('potongan tidak cocok (unggahan belum selesai?)');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target + '.tmp', data);
        fs.renameSync(target + '.tmp', target);
        console.log(`[astra] terpasang: ${f.to} (${data.length} byte)`);
      }
      // potongan tidak diperlukan lagi; kuota disk hosting terbatas
      for (const p of parts) fs.rmSync(p, { force: true });
    } catch (e) {
      console.error(`[astra] gagal memasang ${f && f.to}: ${e.message}`);
    }
  }
}

function start() {
  installFiles();
  fs.watchFile(filesFile, { interval: 10000 }, installFiles);

  let manifest;
  try {
    manifest = readManifest();
  } catch (e) {
    return fail('Gagal membaca manifest.json: ' + e.message);
  }
  let code;
  try {
    code = Buffer.concat(manifest.parts.map((name) => fs.readFileSync(path.join(dir, 'parts', path.basename(name)))));
  } catch (e) {
    return fail('Potongan server tidak lengkap (unggahan belum selesai?): ' + e.message);
  }
  if (sha256(code) !== manifest.sha256) {
    return fail('Isi potongan server tidak cocok dengan manifest.json (unggahan belum selesai?).');
  }

  // Dibaca server: id build yang berjalan, dan apakah build yang lebih baru sudah diunggah.
  // manifest.json selalu diunggah paling akhir, jadi saat isinya berganti semua potongan sudah ada.
  // Id build mencakup isi file ini, sehingga pemuat yang berubah pun membuat server dimulai ulang.
  let stale = false;
  globalThis.astraBuild = manifest.build;
  globalThis.astraStale = () => stale;
  fs.watchFile(manifestFile, { interval: 15000 }, () => {
    try {
      stale = readManifest().build !== manifest.build;
    } catch {
      // sedang ditulis; dicek lagi pada putaran berikutnya
    }
  });

  console.log(`[astra] menjalankan build ${manifest.build} (${manifest.parts.length} potongan, ${code.length} byte)`);
  const file = path.join(dir, 'server.cjs'); // nama semu untuk jejak galat; tidak ada di disk
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(dir);
  m._compile(code.toString('utf8'), file);
}

start();
