// Pembaruan dari layar utama.
//   - Web : cukup memuat ulang halaman (hosting selalu menyajikan build terbaru).
//   - APK : file build terbaru diunduh dari hosting ke penyimpanan aplikasi, lalu WebView
//           dialihkan ke folder itu dan diingat untuk peluncuran berikutnya. Tidak perlu
//           memasang ulang APK.
// Hosting menyediakan version.json (dibuat saat build): { version, files }.
import { Capacitor, CapacitorHttp, WebView } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';

export const APP_VERSION: string = __APP_VERSION__;
export const isNative = Capacitor.isNativePlatform();

/** Alamat hosting tempat build dipublikasikan (diisi saat build lewat VITE_UPDATE_URL). */
export const UPDATE_URL = ((import.meta.env.VITE_UPDATE_URL as string | undefined) ?? '').replace(/\/+$/, '');
const UPDATE_DIR = 'astra-update';

export interface Manifest {
  version: string;
  files: string[];
}

/** Nomor build = cap waktu di belakang tanda "+", mis. 0.1.0+202611171030. */
const buildNo = (v: string) => Number(v.split('+')[1] ?? 0) || 0;

async function fetchManifest(): Promise<Manifest | null> {
  let data: unknown;
  if (isNative) {
    if (!UPDATE_URL) return null;
    // CapacitorHttp memakai jaringan native, jadi tidak terhalang CORS
    const r = await CapacitorHttp.get({ url: `${UPDATE_URL}/version.json?t=${Date.now()}`, responseType: 'json' });
    if (r.status !== 200) return null;
    data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  } else {
    const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    data = await r.json();
  }
  const m = data as Partial<Manifest> | null;
  if (!m || typeof m.version !== 'string' || !Array.isArray(m.files)) return null;
  return { version: m.version, files: m.files.filter((f) => typeof f === 'string' && !f.includes('..')) };
}

/** Manifest versi yang lebih baru di hosting, atau null jika sudah terbaru / tidak bisa dicek. */
export async function checkForUpdate(): Promise<Manifest | null> {
  const m = await fetchManifest();
  return m && buildNo(m.version) > buildNo(APP_VERSION) ? m : null;
}

export async function applyUpdate(m: Manifest, onProgress: (done: number, total: number) => void): Promise<void> {
  if (!isNative) {
    location.reload();
    return;
  }
  const dir = `${UPDATE_DIR}/${m.version.replace(/[^\w.-]/g, '_')}`;
  const queue = [...m.files];
  let done = 0;
  const worker = async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      const r = await CapacitorHttp.get({ url: `${UPDATE_URL}/${file}`, responseType: 'text' });
      if (r.status !== 200 || typeof r.data !== 'string') throw new Error(`gagal mengunduh ${file} (${r.status})`);
      await Filesystem.writeFile({
        path: `${dir}/${file}`,
        data: r.data,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      onProgress(++done, m.files.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  if (done !== m.files.length || !m.files.includes('index.html')) throw new Error('unduhan tidak lengkap');

  const { uri } = await Filesystem.getUri({ path: dir, directory: Directory.Data });
  // WebView dimuat ulang dari folder baru; versi baru menyimpan pilihan ini saat mulai (confirmUpdate)
  await WebView.setServerBasePath({ path: decodeURIComponent(uri.replace(/^file:\/\//, '')) });
  await WebView.persistServerBasePath();
}

/**
 * Dipanggil saat aplikasi mulai. Jika sedang berjalan dari folder hasil unduhan, simpan pilihan
 * itu secara permanen dan hapus unduhan versi lain yang sudah tidak dipakai.
 */
export async function confirmUpdate(): Promise<void> {
  if (!isNative) return;
  try {
    const { path } = await WebView.getServerBasePath();
    const current = path?.includes(`/${UPDATE_DIR}/`) ? path.split('/').pop() : undefined;
    if (!current) return;
    await WebView.persistServerBasePath();
    const { files } = await Filesystem.readdir({ path: UPDATE_DIR, directory: Directory.Data });
    for (const f of files) {
      if (f.name !== current) {
        await Filesystem.rmdir({ path: `${UPDATE_DIR}/${f.name}`, directory: Directory.Data, recursive: true });
      }
    }
  } catch {
    /* bukan masalah: pembaruan tetap bisa dipakai */
  }
}
