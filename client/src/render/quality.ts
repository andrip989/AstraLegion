// Tingkat kualitas grafik:
//   Ringan  : tanpa shadow map & post-processing, objek hiasan dikurangi (untuk HP).
//   Sedang  : bayangan, bloom, peta normal tanah.
//   Tinggi  : semua di atas + ambient occlusion, bayangan 4K, tekstur resolusi tinggi, rumput &
//             tanaman jauh lebih rapat, kolam, kupu-kupu, cahaya dinamis dari efek skill.
//
// Di perangkat sentuh (HP/tablet) GPU-nya jauh lebih lemah, jadi "Tinggi" di sana berarti isi dunia
// tingkat Sedang (bayangan + bloom) dengan resolusi render lebih tajam; ambient occlusion, bayangan
// 4K, dan kerapatan tanaman tingkat Tinggi tidak dipakai. Lihat juga SceneManager (anggaran piksel
// dan pengatur otomatis).
export const IS_TOUCH = matchMedia('(pointer: coarse)').matches;

export type Quality = 'low' | 'medium' | 'high';
export const QUALITIES: Quality[] = ['low', 'medium', 'high'];
export const QUALITY_LABEL: Record<Quality, string> = { low: 'Ringan', medium: 'Sedang', high: 'Tinggi' };

const KEY = 'gfx';
const isQuality = (q: unknown): q is Quality => q === 'low' || q === 'medium' || q === 'high';

function stored(): Quality | null {
  try {
    // ?gfx=low|medium|high di alamat halaman mengalahkan pilihan tersimpan (berguna untuk mencoba)
    const q = new URLSearchParams(location.search).get('gfx') ?? localStorage.getItem(KEY);
    return isQuality(q) ? q : null;
  } catch {
    return null;
  }
}

/** Tebakan awal: HP -> Ringan; GPU terintegrasi / software -> Sedang; selain itu Tinggi. */
function detect(): Quality {
  if (IS_TOUCH) return 'low';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 'low';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    if (/swiftshader|llvmpipe|software|basic render|intel\(r\) (hd|uhd)|mali|adreno|powervr/i.test(name)) return 'medium';
  } catch {
    return 'medium';
  }
  return 'high';
}

/** Tingkat yang benar-benar dipakai untuk isi dunia dan efek: di perangkat sentuh paling tinggi Sedang. */
const effective = (q: Quality): Quality => (IS_TOUCH && q === 'high' ? 'medium' : q);

/** Kunci penyimpanan hasil pengatur otomatis (skala resolusi dan fitur yang dilepas). */
export const AUTO_KEY = 'gfx.auto';

/**
 * Dibaca saat scene dibangun; lobby boleh mengubahnya sebelum pertandingan dimulai.
 * `quality` = pilihan pemain; `low` / `high` = tingkat efektifnya (lihat `effective`).
 */
export const GFX: { quality: Quality; low: boolean; high: boolean; mobile: boolean } = (() => {
  const quality = stored() ?? detect();
  const e = effective(quality);
  return { quality, low: e === 'low', high: e === 'high', mobile: IS_TOUCH };
})();

export function setQuality(q: Quality): void {
  GFX.quality = q;
  const e = effective(q);
  GFX.low = e === 'low';
  GFX.high = e === 'high';
  try {
    localStorage.setItem(KEY, q);
    // pilihan baru dari pemain: lupakan penyesuaian otomatis yang lama
    localStorage.removeItem(AUTO_KEY);
  } catch {
    /* penyimpanan tidak tersedia */
  }
}

/** Pilih nilai menurut kualitas: pick(ringan, sedang, tinggi). */
export function pick<T>(low: T, medium: T, high: T): T {
  return GFX.low ? low : GFX.high ? high : medium;
}
