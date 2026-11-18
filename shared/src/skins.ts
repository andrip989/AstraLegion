// Skin warna hero dan tingkat kesulitan bot (pilihan di lobby).
//
// Skin hanya mengubah warna: model hero yang sama, digeser rona/kejenuhan/kecerahannya saat
// dibangun di client (client/src/render/models.ts). Tiap skin terbuka pada level akun tertentu.

export interface SkinDef {
  id: number;
  name: string;
  /** Level akun minimum untuk memakainya. */
  level: number;
  /** Geseran rona (putaran penuh = 1), pengali kejenuhan, dan pengali kecerahan. */
  hue: number;
  sat: number;
  lum: number;
}

export const SKINS: SkinDef[] = [
  { id: 0, name: 'Asli', level: 1, hue: 0, sat: 1, lum: 1 },
  { id: 1, name: 'Fajar', level: 3, hue: 0.13, sat: 1.08, lum: 1.06 },
  { id: 2, name: 'Malam', level: 6, hue: -0.07, sat: 0.62, lum: 0.6 },
];

/** Tingkat kesulitan bot: 0 mudah, 1 normal, 2 sulit. */
export const BOT_LEVELS = [
  { name: 'Mudah', think: 0.62, retreat: 0.2, skill: 0.45, damage: 0.82 },
  { name: 'Normal', think: 0.3, retreat: 0.3, skill: 1, damage: 1 },
  { name: 'Sulit', think: 0.17, retreat: 0.38, skill: 1, damage: 1.12 },
] as const;
