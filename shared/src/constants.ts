// Konstanta gameplay yang dipakai bersama oleh client & server.

export type Team = 0 | 1 | 2;
export const TEAM_BLUE: Team = 0;
export const TEAM_RED: Team = 1;
export const TEAM_NEUTRAL: Team = 2;
export const TEAM_NAMES = ['Biru', 'Merah', 'Netral'] as const;

export const TICK_RATE = 20; // tick simulasi per detik
export const MAP_SIZE = 120; // map persegi 120 x 120 unit
export const MAP_MARGIN = 1.5;

export const TEAM_SIZE = 3; // hero per tim (slot kosong diisi bot)
export const MAX_LEVEL = 15;
export const ULT_UNLOCK_LEVEL = 4; // skill R terbuka di level ini

export const WAVE_INTERVAL = 30; // detik antar gelombang minion
export const FIRST_WAVE_DELAY = 5;
export const MONSTER_RESPAWN = 60;

export const TOWER_RANGE = 12;

/** Siklus siang-malam mengikuti waktu pertandingan: satu putaran penuh dalam detik. */
export const DAY_CYCLE = 480;
export type DayPhase = 'siang' | 'senja' | 'malam' | 'fajar';
/** Fase hari pada waktu pertandingan `t` (detik). */
export function dayPhase(t: number): DayPhase {
  const p = ((t % DAY_CYCLE) + DAY_CYCLE) % DAY_CYCLE;
  return p < 225 ? 'siang' : p < 285 ? 'senja' : p < 435 ? 'malam' : 'fajar';
}
/**
 * Mode pertandingan. 'klasik' = tiga lane seperti biasa. 'kilat' = pertandingan cepat di peta yang
 * sama: hanya lane tengah yang punya tower dan minion, semuanya dipercepat (sasaran ±5-6 menit).
 */
export type GameMode = 'klasik' | 'kilat';
export const GAME_MODES: Record<GameMode, { name: string; desc: string }> = {
  klasik: { name: 'Klasik', desc: 'Tiga lane, pertandingan penuh (±10-15 menit).' },
  kilat: { name: 'Kilat', desc: 'Hanya lane tengah, semuanya dipercepat (±5 menit).' },
};
/** Angka mode Kilat. */
export const KILAT = {
  /** Lane yang aktif (indeks LANE_NAMES). */
  lane: 1,
  startLevel: 3,
  startGold: 400,
  waveInterval: 20,
  /** Pengali emas pasif, XP, dan waktu bangkit. */
  gold: 1.5,
  xp: 1.35,
  respawn: 0.6,
  coreHp: 2000,
  /** Tower lebih ringkih (pengali HP) dan minion menguat sedikit lebih cepat per gelombang. */
  towerHp: 0.7,
  minionGrowth: 0.06,
  minionCap: 2.5,
  /**
   * Bangunan makin rapuh: sejak detik `decayFrom`, damage ke tower dan core bertambah `decayPerMin`
   * (pecahan) tiap menit, supaya pertandingan tidak buntu di tengah.
   */
  decayFrom: 150,
  decayPerMin: 0.6,
  /** Batas waktu (detik): setelah itu pemenang ditentukan dari tower yang tersisa, lalu kill, lalu HP Core. */
  timeLimit: 420,
  /** Titan Astra bangkit lebih awal dan lebih sering. */
  titanFirst: 120,
  titanRespawn: 150,
} as const;

/**
 * Kabut perang: jarak pandang tiap unit. Sebuah tim hanya melihat unit lawan (dan monster) yang
 * berada di dalam jarak pandang salah satu unitnya sendiri; tower dan core selalu terlihat.
 */
export const VISION = { hero: 15, minion: 9, siege: 10, tower: 13.5, core: 15, ward: 11 } as const;
/** Saat malam jarak pandang hero menyusut (pengali). */
export const NIGHT_VISION = 0.78;
/** Jarak pandang sebuah unit (0 = bukan sumber penglihatan). `night` = sedang fase malam. */
export function visionRadius(kind: string, sub: string, night: boolean): number {
  if (kind === 'hero') return VISION.hero * (night ? NIGHT_VISION : 1);
  if (kind === 'minion') return sub === 'siege' ? VISION.siege : VISION.minion;
  if (kind === 'tower') return VISION.tower;
  if (kind === 'core') return VISION.core;
  if (kind === 'ward') return VISION.ward;
  return 0;
}
/** Suar penglihatan: lama menyala, jeda sebelum bisa menanam lagi, dan jarak tanam maksimum dari hero. */
export const WARD_TIME = 75;
export const WARD_COOLDOWN = 50;
export const WARD_RANGE = 8;

/** Menyerah: baru bisa diajukan setelah sekian detik; lama pemungutan suara; jeda sebelum tim yang sama boleh mengajukan lagi. */
export const SURRENDER_AFTER = 300;
export const SURRENDER_WINDOW = 30;
export const SURRENDER_COOLDOWN = 90;
/** Pemain yang hero-nya hidup tetapi tidak memberi perintah selama ini digantikan bot sampai ia bermain lagi. */
export const AFK_AFTER = 60;

/** Berkah Arus (dari Golem Arus): lamanya, pengali pemulihan mana, dan percepatan cooldown skill (pecahan). */
export const FLOW_BUFF_TIME = 75;
export const FLOW_MANA = 3;
export const FLOW_COOLDOWN = 0.25;

/**
 * Titan Astra: boss netral yang bangkit bergantian di dua sarang golem di sumbu tengah peta
 * (lihat TITAN_PITS di map.ts). Tim yang menumbangkannya mendapat Berkah Titan untuk semua
 * hero-nya dan satu Raksasa Astra yang mendorong lane.
 */
export const TITAN_FIRST = 240; // detik sampai kemunculan pertama
export const TITAN_RESPAWN = 240; // detik sejak tumbang sampai bangkit lagi
export const TITAN_WARN = 30; // pengumuman sekian detik sebelum bangkit
export const TITAN_LEASH = 9; // sejauh ini Titan mau mengejar dari sarangnya
export const TITAN_ARENA = 12.5; // hero di luar jarak ini dari sarang tidak bisa melukainya
export const TITAN_SLAM_EVERY = 7; // jeda antar hantaman
export const TITAN_SLAM_DELAY = 1.1; // lama peringatan sebelum hantaman mendarat
export const TITAN_SLAM_RADIUS = 5.5;
export const TITAN_BUFF = 0.15; // Berkah Titan: bonus damage (pecahan)
export const TITAN_BUFF_STRUCTURE = 0.15; // tambahan damage ke tower dan core
export const TITAN_BUFF_TIME = 75;
export const TITAN_GOLD = 150; // emas untuk tiap hero tim penakluk
export const TITAN_XP = 220;

/** Saat malam, monster hutan memberi emas lebih banyak (pengali). */
export const NIGHT_JUNGLE_GOLD = 1.3;
export const FOUNTAIN_RADIUS = 9;
export const XP_SHARE_RANGE = 16;
export const PASSIVE_GOLD_PER_SEC = 2;

/** XP yang dibutuhkan untuk naik dari `level` ke `level + 1`. */
export function xpForLevel(level: number): number {
  return 100 + level * 60;
}
