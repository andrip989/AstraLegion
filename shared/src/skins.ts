// Skin warna hero dan tingkat kesulitan bot (pilihan di lobby).
//
// Skin hanya mengubah warna: model hero yang sama, digeser rona/kejenuhan/kecerahannya saat
// dibangun di client (client/src/render/models.ts). Skin gratis terbuka pada level akun tertentu;
// skin premium dibeli dengan koin di toko (akun online, lihat economy.ts) dan berlaku untuk
// semua hero, seperti skin lainnya.

export interface SkinDef {
  id: number;
  name: string;
  /** Level akun minimum untuk memakainya (skin gratis). Skin premium tidak punya level: lihat `price`. */
  level?: number;
  /** Harga dalam koin (skin premium). Skin berharga hanya bisa dipakai akun online yang sudah membelinya. */
  price?: number;
  /** Geseran rona (putaran penuh = 1), pengali kejenuhan, dan pengali kecerahan. */
  hue: number;
  sat: number;
  lum: number;
}

export const SKINS: SkinDef[] = [
  { id: 0, name: 'Asli', level: 1, hue: 0, sat: 1, lum: 1 },
  { id: 1, name: 'Fajar', level: 3, hue: 0.13, sat: 1.08, lum: 1.06 },
  { id: 2, name: 'Malam', level: 6, hue: -0.07, sat: 0.62, lum: 0.6 },
  { id: 3, name: 'Aurora', price: 300, hue: 0.42, sat: 1.2, lum: 1.06 },
  { id: 4, name: 'Nebula', price: 300, hue: -0.3, sat: 1.3, lum: 0.8 },
];

/** Id barang toko untuk sebuah skin premium (yang dicatat di daftar milik akun). */
export const skinItemId = (id: number): string => `skin${id}`;

/**
 * true bila skin `id` boleh dipakai: skin asli selalu boleh; skin gratis menurut level akun
 * (tamu = level 0); skin premium hanya bila barangnya ada di `owned` (barang toko milik akun).
 */
export function skinUnlocked(id: number, level: number, owned: readonly string[]): boolean {
  const skin = SKINS[id];
  if (!skin || skin.id !== id) return false;
  if (id === 0) return true;
  if (skin.price !== undefined) return owned.includes(skinItemId(id));
  return (skin.level ?? 1) <= level;
}

/** Tingkat kesulitan bot: 0 mudah, 1 normal, 2 sulit. */
export const BOT_LEVELS = [
  { name: 'Mudah', think: 0.62, retreat: 0.2, skill: 0.45, damage: 0.82 },
  { name: 'Normal', think: 0.3, retreat: 0.3, skill: 1, damage: 1 },
  { name: 'Sulit', think: 0.17, retreat: 0.38, skill: 1, damage: 1.12 },
] as const;
