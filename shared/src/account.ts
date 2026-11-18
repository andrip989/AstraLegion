// Akun pemain: bentuk profil, rumus XP dan level akun, aturan nama & kata sandi, penerapan satu
// hasil pertandingan ke profil, dan protokol akun client <-> server. Logika murni (tanpa DOM
// maupun API Node), dipakai bersama oleh client (akun di perangkat) dan server (akun online)
// supaya keduanya menghitung dengan cara yang persis sama.
import { ACHIEVEMENTS, applyMatchToDaily, missionById, unlockedIds, type Achievement, type DailyState } from './progress';

export interface MatchRecord {
  /** Waktu selesai (ms sejak epoch). */
  t: number;
  hero: string;
  win: boolean;
  k: number;
  d: number;
  a: number;
  /** Lama pertandingan (detik). */
  dur: number;
  mode: 'online' | 'offline';
  /** XP akun yang didapat dari pertandingan ini. */
  xp: number;
}

/** Hasil satu pertandingan sebelum dicatat (waktu dan XP-nya diisi saat dicatat). */
export type MatchResult = Omit<MatchRecord, 'xp' | 't'>;

export interface Profile {
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  /** Total XP akun sepanjang waktu. */
  xp: number;
  playSeconds: number;
  heroes: Record<string, { games: number; wins: number }>;
  /** Pertandingan terakhir (terbaru di depan). */
  history: MatchRecord[];
  /** Kill terbanyak dalam satu pertandingan (akun lama: belum ada). */
  bestKills?: number;
  /** Kemajuan misi harian (lihat progress.ts). */
  daily?: DailyState;
}

export interface Account {
  name: string;
  created: number;
  profile: Profile;
}

/** Hasil mencatat satu pertandingan. */
export interface MatchOutcome {
  /** Akun terbaru, atau null bila bermain sebagai tamu. */
  account: Account | null;
  /** XP dari pertandingannya sendiri (belum termasuk bonus misi). */
  xp: number;
  /** Misi harian yang baru saja tercapai, dengan bonus XP-nya. */
  missions: { text: string; xp: number }[];
  /** Nama pencapaian yang baru terbuka. */
  unlocked: string[];
  /** Terisi bila hasilnya TIDAK dicatat ke akun (mis. latihan offline dengan akun online): alasannya. */
  skipped?: string;
}

/** Jumlah pertandingan terakhir yang disimpan di riwayat. */
export const HISTORY_MAX = 20;

export const emptyProfile = (): Profile => ({ matches: 0, wins: 0, kills: 0, deaths: 0, assists: 0, xp: 0, playSeconds: 0, heroes: {}, history: [] });

/** XP akun dari satu pertandingan. */
export function matchXp(rec: { win: boolean; k: number; a: number; dur: number }): number {
  const base = 40 + (rec.win ? 60 : 0) + Math.min(100, rec.k * 10 + rec.a * 5);
  // pertandingan yang sangat singkat (keluar di awal) hanya memberi sebagian
  return Math.round(base * Math.min(1, rec.dur / 180));
}

/** Level akun dari total XP: tiap level butuh 100 XP lebih banyak dari level sebelumnya. */
export function accountLevel(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let need = 200;
  let rest = Math.max(0, xp);
  while (rest >= need) {
    rest -= need;
    level++;
    need = 200 + (level - 1) * 100;
  }
  return { level, into: rest, need };
}

// ------------------------------------------------------------ nama & kata sandi

export const NAME_MAX = 16;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 64;
const NAME_RE = /^[A-Za-z0-9_](?:[A-Za-z0-9_ ]{1,14}[A-Za-z0-9_])$/;

export function validateName(name: string): string | null {
  if (typeof name !== 'string' || !NAME_RE.test(name)) return 'Nama 3–16 karakter: huruf, angka, spasi, atau garis bawah.';
  return null;
}
export function validatePassword(password: string): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return `Kata sandi minimal ${PASSWORD_MIN} karakter.`;
  if (password.length > PASSWORD_MAX) return `Kata sandi maksimal ${PASSWORD_MAX} karakter.`;
  return null;
}

/** Kunci akun: nama tanpa membedakan huruf besar/kecil ("Budi" dan "budi" adalah akun yang sama). */
export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

// ------------------------------------------------------------- hari permainan

/**
 * Akun online memakai satu "hari permainan" yang sama untuk semua pemain, ditentukan jam server
 * dengan zona tetap (WIB, UTC+7), supaya misi harian berganti pada saat yang sama di server dan
 * di layar pemain di mana pun server-nya berada. Akun di perangkat tetap memakai tanggal perangkat.
 */
export const GAME_DAY_UTC_OFFSET = 7;

/** Kunci hari permainan (YYYY-MM-DD) untuk waktu `ms` (ms sejak epoch). */
export function gameDay(ms: number): string {
  const d = new Date(ms + GAME_DAY_UTC_OFFSET * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// ----------------------------------------------------- mencatat pertandingan

/**
 * Terapkan satu hasil pertandingan ke profil `p` (diubah langsung): statistik, XP, riwayat, misi
 * hari `day`, dan pencapaian. Inilah satu-satunya tempat hitungan itu dilakukan.
 */
export function applyMatch(
  p: Profile,
  rec: MatchResult,
  now: number,
  day: string,
): { xp: number; missions: { id: string; text: string; xp: number }[]; unlocked: Achievement[] } {
  const xp = matchXp(rec);
  const before = new Set(unlockedIds(p));
  p.matches++;
  if (rec.win) p.wins++;
  p.kills += rec.k;
  p.deaths += rec.d;
  p.assists += rec.a;
  p.xp += xp;
  p.playSeconds += Math.round(rec.dur);
  const h = (p.heroes[rec.hero] ??= { games: 0, wins: 0 });
  h.games++;
  if (rec.win) h.wins++;
  p.history = [{ ...rec, xp, t: now }, ...p.history].slice(0, HISTORY_MAX);
  p.bestKills = Math.max(p.bestKills ?? 0, rec.k);
  const missions = applyMatchToDaily(p, rec, day);
  const unlocked = ACHIEVEMENTS.filter((a) => !before.has(a.id) && a.value(p) >= a.goal);
  return { xp, missions, unlocked };
}

// --------------------------------------------------------- pembersihan data

const int = (v: unknown, max = 1e12): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
const HERO_ID = /^[A-Za-z0-9_-]{1,32}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Bentuk profil yang pasti benar dari data yang tidak dipercaya (file data yang diedit tangan,
 * atau jawaban server): angka dijadikan bilangan bulat tak negatif, teks hanya id yang dikenal.
 * Dengan begitu isinya aman ditampilkan apa adanya.
 */
export function cleanProfile(raw: unknown): Profile {
  const p = emptyProfile();
  if (!isObj(raw)) return p;
  p.matches = int(raw.matches);
  p.wins = int(raw.wins);
  p.kills = int(raw.kills);
  p.deaths = int(raw.deaths);
  p.assists = int(raw.assists);
  p.xp = int(raw.xp);
  p.playSeconds = int(raw.playSeconds);
  if (isObj(raw.heroes)) {
    for (const [id, h] of Object.entries(raw.heroes).slice(0, 64)) {
      if (HERO_ID.test(id) && isObj(h)) p.heroes[id] = { games: int(h.games), wins: int(h.wins) };
    }
  }
  if (Array.isArray(raw.history)) {
    for (const m of raw.history.slice(0, HISTORY_MAX)) {
      if (!isObj(m) || typeof m.hero !== 'string' || !HERO_ID.test(m.hero)) continue;
      p.history.push({
        t: int(m.t, 1e14),
        hero: m.hero,
        win: m.win === true,
        k: int(m.k),
        d: int(m.d),
        a: int(m.a),
        dur: int(m.dur),
        mode: m.mode === 'offline' ? 'offline' : 'online',
        xp: int(m.xp),
      });
    }
  }
  if (raw.bestKills !== undefined) p.bestKills = int(raw.bestKills);
  const daily = raw.daily;
  if (isObj(daily) && typeof daily.day === 'string' && DAY_RE.test(daily.day)) {
    const state: DailyState = { day: daily.day, progress: {}, claimed: [] };
    if (isObj(daily.progress)) {
      for (const [id, v] of Object.entries(daily.progress).slice(0, 32)) if (missionById(id)) state.progress[id] = int(v);
    }
    if (Array.isArray(daily.claimed)) {
      for (const id of daily.claimed.slice(0, 32)) if (typeof id === 'string' && missionById(id) && !state.claimed.includes(id)) state.claimed.push(id);
    }
    p.daily = state;
  }
  return p;
}

/** Akun dari data yang tidak dipercaya; null bila namanya tidak sah. */
export function cleanAccount(raw: unknown): Account | null {
  if (!isObj(raw) || typeof raw.name !== 'string' || validateName(raw.name)) return null;
  return { name: raw.name, created: int(raw.created, 1e14), profile: cleanProfile(raw.profile) };
}

// ------------------------------------------------------------- protokol akun
//
// Event Socket.IO berawalan "acc:", semuanya permintaan client dengan acknowledgement:
//   acc:hello    {}                  -> AccHello                (server mendukung akun?)
//   acc:register { name, password }  -> AccSignedIn | AccFail   (token sesi ikut dikirim)
//   acc:login    { name, password }  -> AccSignedIn | AccFail   (token sesi ikut dikirim)
//   acc:resume   { token }           -> AccSignedIn | AccFail   (tetap masuk setelah halaman dimuat ulang)
//   acc:logout   { token }           -> { ok: true }            (token itu dicabut)
//   acc:board    {}                  -> AccBoard | AccFail      (papan peringkat)
// dan satu event dari server: acc:match (AccMatch) saat pertandingan online pemain itu selesai.
// Client tidak punya event untuk mengirim statistik: hasil pertandingan dicatat server sendiri.

export const ACC_PROTOCOL = 1;

export interface AccFail {
  ok: false;
  error: string;
  /** 'session': token sesi tidak berlaku lagi · 'rate': terlalu sering mencoba · 'busy': server sibuk. */
  code?: 'session' | 'rate' | 'busy';
  /** Detik sampai boleh mencoba lagi (untuk 'rate'). */
  retry?: number;
}

export interface AccHello {
  ok: true;
  v: number;
  /** Jam server (ms sejak epoch); dipakai client untuk menentukan hari permainan. */
  now: number;
}

export interface AccSignedIn {
  ok: true;
  account: Account;
  /** Token sesi baru (hanya dari register dan login). Disimpan client, dikirim lagi lewat acc:resume. */
  token?: string;
  now: number;
}

export interface BoardRow {
  rank: number;
  name: string;
  level: number;
  xp: number;
  wins: number;
  matches: number;
}

export interface AccBoard {
  ok: true;
  /** Peringkat teratas menurut XP akun. */
  top: BoardRow[];
  /** Baris pemanggil bila ia masuk akun (bisa di luar `top`). */
  me: BoardRow | null;
  /** Jumlah seluruh akun. */
  total: number;
}

/** Jumlah baris teratas di papan peringkat. */
export const BOARD_SIZE = 20;

/** Pertandingan online selesai: akun terbaru dan apa saja yang didapat (id misi dan pencapaian). */
export interface AccMatch {
  account: Account;
  xp: number;
  missions: string[];
  unlocked: string[];
  /**
   * Terisi bila hasilnya tidak dicatat. 'short': pemain baru bergabung menjelang akhir pertandingan;
   * 'afk': pemain nyaris tidak memberi perintah apa pun sepanjang pertandingan.
   */
  skipped?: 'short' | 'afk';
}

/** Minimal sekian detik ikut bermain supaya hasil pertandingan online dicatat ke akun. */
export const MIN_RECORDED_SECONDS = 120;
/** Minimal sekian perintah bermain (gerak, serang, skill) supaya hasilnya dicatat; di bawah itu dianggap diam saja. */
export const MIN_RECORDED_ACTIONS = 25;
