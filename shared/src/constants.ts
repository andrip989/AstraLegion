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
export const FOUNTAIN_RADIUS = 9;
export const XP_SHARE_RANGE = 16;
export const PASSIVE_GOLD_PER_SEC = 2;

/** XP yang dibutuhkan untuk naik dari `level` ke `level + 1`. */
export function xpForLevel(level: number): number {
  return 100 + level * 60;
}
