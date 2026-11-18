// Misi harian dan pencapaian akun. Logika murni (tanpa DOM maupun API Node): dipakai client untuk
// tampilan dan akun di perangkat, dan dipakai server untuk akun online, jadi hitungannya selalu sama.
//
// Misi harian: tiap hari tiga misi dipilih dari POOL (sama untuk semua pemain, ditentukan oleh
// tanggalnya). Kemajuannya dihitung dari hasil tiap pertandingan dan disimpan di profil; begitu
// sebuah misi tercapai, bonus XP-nya langsung masuk ke akun.
// Pencapaian: tonggak permanen yang dihitung dari total statistik profil, jadi tidak perlu
// disimpan terpisah (dan otomatis berlaku untuk akun lama).
import type { MatchResult, Profile } from './account';

export interface Mission {
  id: string;
  text: string;
  goal: number;
  /** Bonus XP akun saat tercapai. */
  xp: number;
  /** Tambahan kemajuan dari satu pertandingan. */
  gain(rec: MatchResult): number;
}

/** Pertandingan yang ditinggal di awal tidak dihitung untuk misi "mainkan / selesaikan". */
const full = (rec: MatchResult) => rec.dur >= 120;

const POOL: Mission[] = [
  { id: 'play2', text: 'Mainkan 2 pertandingan', goal: 2, xp: 60, gain: (r) => (full(r) ? 1 : 0) },
  { id: 'win1', text: 'Menangkan 1 pertandingan', goal: 1, xp: 80, gain: (r) => (r.win ? 1 : 0) },
  { id: 'kill5', text: 'Kumpulkan 5 kill', goal: 5, xp: 70, gain: (r) => r.k },
  { id: 'kill10', text: 'Kumpulkan 10 kill', goal: 10, xp: 110, gain: (r) => r.k },
  { id: 'assist6', text: 'Kumpulkan 6 assist', goal: 6, xp: 60, gain: (r) => r.a },
  { id: 'tough', text: 'Selesaikan pertandingan dengan mati paling banyak 2 kali', goal: 1, xp: 70, gain: (r) => (full(r) && r.d <= 2 ? 1 : 0) },
  { id: 'online1', text: 'Mainkan 1 pertandingan online', goal: 1, xp: 50, gain: (r) => (full(r) && r.mode === 'online' ? 1 : 0) },
  { id: 'time10', text: 'Bermain selama 10 menit', goal: 600, xp: 60, gain: (r) => Math.round(r.dur) },
];

/** Misi menurut id-nya (server hanya mengirim id; teksnya selalu diambil dari sini). */
export function missionById(id: string): Mission | undefined {
  return POOL.find((m) => m.id === id);
}

/** Kemajuan misi hari `day` (bentuk YYYY-MM-DD). Disimpan di Profile.daily. */
export interface DailyState {
  day: string;
  progress: Record<string, number>;
  /** Id misi yang bonusnya sudah diberikan. */
  claimed: string[];
}

/** Tanggal menurut jam perangkat. Akun online memakai hari server (lihat gameDay di account.ts). */
export function todayKey(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const dayOf = (when: Date | string) => (typeof when === 'string' ? when : todayKey(when));

/** Tiga misi untuk satu hari: pilihan acak yang ditentukan sepenuhnya oleh tanggalnya. */
export function missionsFor(day: string): Mission[] {
  let seed = 0;
  for (const ch of day) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rest = [...POOL];
  const out: Mission[] = [];
  while (out.length < 3 && rest.length) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const pick = rest.splice(seed % rest.length, 1)[0];
    // jangan dua misi kill sekaligus
    if (pick.id.startsWith('kill') && out.some((m) => m.id.startsWith('kill'))) continue;
    out.push(pick);
  }
  return out;
}

export interface MissionView {
  mission: Mission;
  value: number;
  done: boolean;
}

/** Misi hari ini beserta kemajuannya. `when`: tanggal perangkat, atau kunci hari (YYYY-MM-DD). */
export function dailyView(p: Profile, when: Date | string = new Date()): MissionView[] {
  const day = dayOf(when);
  const state = p.daily?.day === day ? p.daily : undefined;
  return missionsFor(day).map((mission) => {
    const value = Math.min(mission.goal, state?.progress[mission.id] ?? 0);
    return { mission, value, done: value >= mission.goal };
  });
}

/**
 * Catat satu pertandingan ke misi hari ini. Mengubah `p` (kemajuan dan XP) dan mengembalikan
 * misi yang baru saja tercapai.
 */
export function applyMatchToDaily(p: Profile, rec: MatchResult, when: Date | string = new Date()): { id: string; text: string; xp: number }[] {
  const day = dayOf(when);
  if (p.daily?.day !== day) p.daily = { day, progress: {}, claimed: [] };
  const state = p.daily;
  const done: { id: string; text: string; xp: number }[] = [];
  for (const m of missionsFor(day)) {
    const value = Math.min(m.goal, (state.progress[m.id] ?? 0) + Math.max(0, m.gain(rec)));
    state.progress[m.id] = value;
    if (value >= m.goal && !state.claimed.includes(m.id)) {
      state.claimed.push(m.id);
      p.xp += m.xp;
      done.push({ id: m.id, text: m.text, xp: m.xp });
    }
  }
  return done;
}

// ------------------------------------------------------------------ pencapaian

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  goal: number;
  value(p: Profile): number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', name: 'Langkah Pertama', desc: 'Selesaikan pertandingan pertamamu', goal: 1, value: (p) => p.matches },
  { id: 'vet', name: 'Veteran', desc: 'Mainkan 25 pertandingan', goal: 25, value: (p) => p.matches },
  { id: 'win1', name: 'Kemenangan Perdana', desc: 'Menangkan 1 pertandingan', goal: 1, value: (p) => p.wins },
  { id: 'win10', name: 'Juara Arena', desc: 'Menangkan 10 pertandingan', goal: 10, value: (p) => p.wins },
  { id: 'kill50', name: 'Pemburu', desc: 'Kumpulkan 50 kill', goal: 50, value: (p) => p.kills },
  { id: 'kill200', name: 'Algojo', desc: 'Kumpulkan 200 kill', goal: 200, value: (p) => p.kills },
  { id: 'assist100', name: 'Kawan Setia', desc: 'Kumpulkan 100 assist', goal: 100, value: (p) => p.assists },
  { id: 'heroes4', name: 'Serba Bisa', desc: 'Mainkan 4 hero yang berbeda', goal: 4, value: (p) => Object.keys(p.heroes).length },
  { id: 'time2h', name: 'Maraton', desc: 'Bermain total 2 jam', goal: 7200, value: (p) => p.playSeconds },
  { id: 'best8', name: 'Tak Terbendung', desc: 'Raih 8 kill dalam satu pertandingan', goal: 8, value: (p) => p.bestKills ?? 0 },
];

export interface AchievementView {
  achievement: Achievement;
  value: number;
  done: boolean;
}

export function achievementView(p: Profile): AchievementView[] {
  return ACHIEVEMENTS.map((achievement) => {
    const value = Math.min(achievement.goal, achievement.value(p));
    return { achievement, value, done: value >= achievement.goal };
  });
}

/** Id pencapaian yang sudah tercapai. */
export function unlockedIds(p: Profile): string[] {
  return achievementView(p)
    .filter((v) => v.done)
    .map((v) => v.achievement.id);
}
