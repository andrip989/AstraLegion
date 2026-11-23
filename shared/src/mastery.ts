// Penguasaan hero: tingkat per hero yang dihitung dari statistik per hero di profil (jumlah main
// dan menang, yang untuk akun online dicatat server). Tidak ada data baru yang disimpan. Logika
// murni, dipakai client untuk lencana di kartu hero dan di profil.

export interface MasteryLevel {
  level: number;
  name: string;
  /** Poin penguasaan minimum untuk tingkat ini. */
  min: number;
}

/** Lima tingkat penguasaan. Poin penguasaan = jumlah main + jumlah menang (menang dihitung dua kali). */
export const MASTERY_LEVELS: readonly MasteryLevel[] = [
  { level: 1, name: 'Pemula', min: 1 },
  { level: 2, name: 'Terlatih', min: 8 },
  { level: 3, name: 'Mahir', min: 20 },
  { level: 4, name: 'Ahli', min: 45 },
  { level: 5, name: 'Master', min: 90 },
];

export interface MasteryInfo {
  /** 0 = hero ini belum pernah dimainkan. */
  level: number;
  /** Nama tingkatnya ('' untuk tingkat 0). */
  name: string;
  points: number;
  /** Tingkat berikutnya; null di tingkat tertinggi. */
  next: MasteryLevel | null;
  /** Poin yang masih kurang untuk naik tingkat (0 di tingkat tertinggi). */
  toNext: number;
  /** Kemajuan di dalam tingkat ini, 0..1 (1 di tingkat tertinggi). */
  progress: number;
}

const whole = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);

/** Penguasaan sebuah hero dari statistiknya di profil (`undefined` = belum pernah dimainkan). */
export function heroMastery(stats: { games: number; wins: number } | undefined): MasteryInfo {
  const games = whole(stats?.games);
  const points = games + Math.min(games, whole(stats?.wins));
  let at = -1;
  for (let i = 0; i < MASTERY_LEVELS.length; i++) if (points >= MASTERY_LEVELS[i].min) at = i;
  const cur = at >= 0 ? MASTERY_LEVELS[at] : null;
  const next = MASTERY_LEVELS[at + 1] ?? null;
  const from = cur?.min ?? 0;
  return {
    level: cur?.level ?? 0,
    name: cur?.name ?? '',
    points,
    next,
    toNext: next ? next.min - points : 0,
    progress: next ? (points - from) / (next.min - from) : 1,
  };
}
