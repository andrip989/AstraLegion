// Layout map. Sumbu: x ke kanan, z ke bawah layar. Base Biru di kiri-bawah,
// base Merah di kanan-atas. Sisi Merah adalah cermin (transpose x<->z) dari sisi Biru,
// jadi cukup definisikan sisi Biru.
import { MAP_SIZE, type Team } from './constants';

export interface Vec2 {
  x: number;
  z: number;
}
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

const v = (x: number, z: number): Vec2 => ({ x, z });
const transpose = (p: Vec2): Vec2 => ({ x: p.z, z: p.x });

// Diindeks dengan nomor tim (0 = Biru, 1 = Merah).
export const CORES: Vec2[] = [v(16, 104), v(104, 16)];
export const FOUNTAINS: Vec2[] = [v(7, 113), v(113, 7)];

export const LANE_NAMES = ['Top', 'Mid', 'Bottom'] as const;

// Waypoint lane dari sudut pandang Biru (base Biru -> base Merah).
const BLUE_LANES: Vec2[][] = [
  [v(14, 90), v(14, 20), v(20, 14), v(90, 14)],
  [v(27, 93), v(93, 27)],
  [v(30, 106), v(100, 106), v(106, 100), v(106, 30)],
];

/** Rute minion sebuah tim di satu lane, berakhir di core musuh. */
export function laneRoute(team: Team, lane: number): Vec2[] {
  const pts = team === 0 ? BLUE_LANES[lane] : BLUE_LANES[lane].map(transpose);
  return [...pts.map((p) => ({ ...p })), { ...CORES[team === 0 ? 1 : 0] }];
}

/** Garis lane lengkap (core ke core) untuk digambar di ground & minimap. */
export const LANE_PATHS: Vec2[][] = BLUE_LANES.map((l) => [CORES[0], ...l, CORES[1]]);

export interface TowerSpot {
  team: Team;
  lane: number;
  tier: number; // 1 = terluar, 3 = terdekat ke base
  x: number;
  z: number;
}

// Tower digeser sedikit dari garis tengah lane supaya minion tidak menabraknya.
const BLUE_TOWERS: Vec2[][] = [
  [v(10.5, 34), v(10.5, 60), v(10.5, 84)],
  [v(50.5, 64.5), v(39.5, 75.5), v(27.5, 87.5)],
  [v(86, 109.5), v(60, 109.5), v(36, 109.5)],
];

export const TOWERS: TowerSpot[] = [];
BLUE_TOWERS.forEach((list, lane) =>
  list.forEach((p, i) => {
    TOWERS.push({ team: 0, lane, tier: i + 1, x: p.x, z: p.z });
    TOWERS.push({ team: 1, lane, tier: i + 1, x: p.z, z: p.x });
  }),
);

// Dinding jungle. Didefinisikan untuk segitiga kiri-atas lalu dicerminkan.
const rect = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x0, z0, x1, z1 });
const BASE_RECTS: Rect[] = [
  rect(22, 22, 32, 32),
  rect(40, 22, 58, 28),
  rect(64, 22, 80, 27),
  rect(36, 36, 46, 46),
  rect(52, 34, 62, 42),
];
const transposeRect = (r: Rect): Rect => rect(r.z0, r.x0, r.z1, r.x1);
const pointMirrorRect = (r: Rect): Rect =>
  rect(MAP_SIZE - r.x1, MAP_SIZE - r.z1, MAP_SIZE - r.x0, MAP_SIZE - r.z0);

function buildObstacles(): Rect[] {
  const seen = new Set<string>();
  const out: Rect[] = [];
  const half = [...BASE_RECTS, ...BASE_RECTS.map(transposeRect)];
  for (const r of [...half, ...half.map(pointMirrorRect)]) {
    const key = `${r.x0},${r.z0},${r.x1},${r.z1}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
export const OBSTACLES: Rect[] = buildObstacles();

export interface CampSpot {
  x: number;
  z: number;
  big: boolean;
  /** Camp besar ini dihuni Golem Arus (Berkah Arus), bukan Golem Rimba (Berkah Golem). */
  flow?: boolean;
}
export const CAMPS: CampSpot[] = [
  { x: 40, z: 32, big: false },
  { x: 32, z: 40, big: false },
  { x: 49, z: 49, big: true },
  { x: 80, z: 88, big: false },
  { x: 88, z: 80, big: false },
  { x: 71, z: 71, big: true, flow: true },
];

/** Sarang Titan Astra: dua camp golem di sumbu tengah peta (jaraknya sama dari kedua base). */
export interface TitanPit {
  x: number;
  z: number;
  /** Indeks di CAMPS: golem di camp ini menyingkir selagi Titan ada. */
  camp: number;
  name: string;
}
export const TITAN_PITS: TitanPit[] = CAMPS.map((c, camp) => ({ x: c.x, z: c.z, camp, big: c.big }))
  .filter((c) => c.big)
  .map((c, i) => ({ x: c.x, z: c.z, camp: c.camp, name: i === 0 ? 'sarang atas' : 'sarang bawah' }));

/**
 * Semak persembunyian. Hero yang berdiri di dalamnya tidak terlihat (dan tidak bisa dijadikan
 * sasaran serangan biasa) oleh tim lawan, kecuali: ada hero lawan di semak yang sama, ada unit
 * lawan yang sangat dekat, atau ia baru saja menyerang / memakai skill. Skill area tetap mengenainya.
 */
export interface BushSpot {
  x: number;
  z: number;
  r: number;
}

// Separuh peta (sisi kiri-atas garis tengah) lalu dicerminkan terhadap titik pusat; tiap titik juga
// punya pasangan transpose-nya, sehingga kedua tim mendapat semak yang setara.
const BUSH_HALF: BushSpot[] = [
  { x: 53, z: 58, r: 2.8 }, // tepi lane tengah
  { x: 58, z: 53, r: 2.8 },
  { x: 18.8, z: 18.8, r: 2.8 }, // sudut lane atas
  { x: 18.2, z: 46, r: 2.5 }, // sisi dalam lane atas
  { x: 46, z: 18.2, r: 2.5 },
];
export const BUSHES: BushSpot[] = [...BUSH_HALF, ...BUSH_HALF.map((b) => ({ x: MAP_SIZE - b.x, z: MAP_SIZE - b.z, r: b.r }))];

/** Indeks semak yang memuat titik (x, z), atau -1. */
export function bushAt(x: number, z: number): number {
  for (let i = 0; i < BUSHES.length; i++) {
    const b = BUSHES[i];
    const dx = x - b.x;
    const dz = z - b.z;
    if (dx * dx + dz * dz <= b.r * b.r) return i;
  }
  return -1;
}

/** Unit lawan sedekat ini (unit) membongkar persembunyian, dan lamanya hero terlihat setelah menyerang (detik). */
export const BUSH_REVEAL_RANGE = 2.8;
export const BUSH_REVEAL_TIME = 1.5;
