// Akun pemain: bentuk profil, rumus XP dan level akun, aturan nama & kata sandi, penerapan satu
// hasil pertandingan ke profil, penutupan musim peringkat, dan protokol akun client <-> server.
// Logika murni (tanpa DOM maupun API Node), dipakai bersama oleh client (akun di perangkat) dan
// server (akun online) supaya keduanya menghitung dengan cara yang persis sama. Tabel koin dan
// toko ada di economy.ts, musim dan bingkai di season.ts, gelar di titles.ts.
import { COINS_MAX, COINS_MISSION, matchCoins, shopItem, type LoginState } from './economy';
import { ACHIEVEMENTS, applyMatchToDaily, missionById, unlockedIds, type Achievement, type DailyState } from './progress';
import { SEASONS_MAX, SEASON_RE, SEASON_REWARDS, seasonCarry, seasonOf, type SeasonRecord } from './season';

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
  /** Perubahan poin peringkat dari pertandingan ini (bisa negatif). Hanya ada di akun online. */
  rp?: number;
  /** Pemain keluar sebelum pertandingan selesai: dicatat kalah pada saat itu. */
  left?: boolean;
}

/**
 * Hasil satu pertandingan sebelum dicatat (waktu, XP, dan poin peringkatnya diisi saat dicatat).
 * `titans`: berapa kali tim pemain ini menumbangkan Titan Astra di pertandingan itu; hanya diisi
 * server dari simulasinya, dan hanya masuk ke total di profil (tidak ke riwayat).
 */
export type MatchResult = Omit<MatchRecord, 'xp' | 't' | 'rp'> & { titans?: number };

export interface Profile {
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  /** Total XP akun sepanjang waktu. */
  xp: number;
  /** Poin peringkat (lihat RANK_TIERS). Hanya berubah di akun online; akun di perangkat selalu 0. */
  rp: number;
  playSeconds: number;
  heroes: Record<string, { games: number; wins: number }>;
  /** Pertandingan terakhir (terbaru di depan). */
  history: MatchRecord[];
  /** Kill terbanyak dalam satu pertandingan (akun lama: belum ada). */
  bestKills?: number;
  /** Kemajuan misi harian (lihat progress.ts). */
  daily?: DailyState;
  // ---- Yang di bawah ini hanya berarti di akun online, dan hanya diubah server (koin, toko,
  // musim, gelar; lihat economy.ts, season.ts, titles.ts). Akun lama dan akun di perangkat:
  // nilai awalnya (0, kosong).
  /** Koin. */
  coins: number;
  /** Barang toko yang dimiliki (id di SHOP_ITEMS). */
  owned: string[];
  /** Gelar yang dipasang (id di TITLES); '' = tanpa gelar. */
  title: string;
  /** Bingkai yang dimiliki (id tier; hadiah tier akhir musim) dan yang dipasang ('' = tanpa bingkai). */
  frames: string[];
  frame: string;
  /** Berapa kali tim pemain ini menumbangkan Titan Astra, sepanjang waktu. */
  titans: number;
  /** Poin peringkat tertinggi yang pernah dicapai (akun lama: mulai dari poinnya saat itu). */
  peak: number;
  /** Hadiah masuk harian: klaim terakhir dan streak-nya. */
  login?: LoginState;
  /** Musim ("YYYY-MM") tempat poin peringkat sekarang berada; belum ada sampai server menyentuh akun ini. */
  season?: string;
  /** Musim yang sudah ditutup (terbaru di depan). */
  seasons: SeasonRecord[];
  /** Id musim (= seasons[0].id) yang ringkasan penutupannya belum dilihat pemain. */
  seasonNote?: string;
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
  /** Perubahan poin peringkat dari pertandingan ini (hanya pertandingan online dengan akun online). */
  rank?: RankOutcome;
  /** Terisi bila pertandingan ini dicatat tetapi tidak punya poin peringkat (mis. akun di perangkat): alasannya. */
  rankNote?: string;
  /** Koin dari pertandingan ini dan dari misi harian yang tercapai (hanya pertandingan online dengan akun online). */
  coins?: number;
  coinsBonus?: number;
}

/** Jumlah pertandingan terakhir yang disimpan di riwayat. */
export const HISTORY_MAX = 20;

export const emptyProfile = (): Profile => ({
  matches: 0,
  wins: 0,
  kills: 0,
  deaths: 0,
  assists: 0,
  xp: 0,
  rp: 0,
  playSeconds: 0,
  heroes: {},
  history: [],
  coins: 0,
  owned: [],
  title: '',
  frames: [],
  frame: '',
  titans: 0,
  peak: 0,
  seasons: [],
});

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

// ------------------------------------------------------------- tier peringkat
//
// Hanya akun online yang punya poin peringkat, dan poin itu hanya diubah server saat ia mencatat
// pertandingan online (lihat applyMatch): menang menambah, kalah atau keluar di tengah
// pertandingan mengurangi. Tier ditentukan dari jumlah poinnya.

export interface RankTier {
  /** Dipakai sebagai nama kelas CSS lencananya (t-perunggu, t-perak, ...). */
  id: string;
  name: string;
  /** Poin peringkat minimum untuk tier ini. */
  min: number;
}

export const RANK_TIERS: readonly RankTier[] = [
  { id: 'perunggu', name: 'Perunggu', min: 0 },
  { id: 'perak', name: 'Perak', min: 100 },
  { id: 'emas', name: 'Emas', min: 250 },
  { id: 'platina', name: 'Platina', min: 450 },
  { id: 'berlian', name: 'Berlian', min: 700 },
  { id: 'legenda', name: 'Legenda', min: 1000 },
];

/** Poin untuk menang menurut tingkat kesulitan bot di room (indeks BOT_LEVELS: Mudah, Normal, Sulit). */
export const RANK_WIN = [14, 20, 28] as const;
/** Tambahan poin menang bila tim lawan berisi setidaknya satu pemain manusia saat pertandingan selesai. */
export const RANK_HUMAN_BONUS = 6;
/** Poin yang hilang saat kalah, atau saat keluar sebelum pertandingan selesai. */
export const RANK_LOSS = 12;
/** Mode Kilat lebih singkat, jadi poin menang dan kalahnya dikalikan ini (dibulatkan). */
export const RANK_QUICK = 0.6;

/** Keadaan room yang menentukan besar poin peringkat; hanya server yang mengisinya. */
export interface RankContext {
  /** Tingkat kesulitan bot (indeks BOT_LEVELS). */
  botLevel: number;
  /** Tim lawan berisi pemain manusia yang benar-benar ikut bermain saat pertandingan selesai. */
  humanEnemy: boolean;
  /** Pertandingan mode Kilat (poinnya lebih kecil). */
  quick?: boolean;
}

/** Perubahan poin peringkat untuk satu pertandingan, sebelum dibatasi supaya tidak di bawah 0. */
export function rankChange(win: boolean, ctx: RankContext): number {
  const k = ctx.quick ? RANK_QUICK : 1;
  if (!win) return -Math.round(RANK_LOSS * k);
  return Math.round(((RANK_WIN[ctx.botLevel] ?? RANK_WIN[1]) + (ctx.humanEnemy ? RANK_HUMAN_BONUS : 0)) * k);
}

export interface RankInfo {
  /** Indeks tier di RANK_TIERS. */
  index: number;
  tier: RankTier;
  /** Tier berikutnya; null bila sudah di tier tertinggi. */
  next: RankTier | null;
  /** Poin yang sudah terkumpul di dalam tier ini, dan lebar tier ini (0 di tier tertinggi). */
  into: number;
  span: number;
  /** Poin yang masih kurang untuk naik tier (0 di tier tertinggi). */
  toNext: number;
}

/** Tier untuk sejumlah poin peringkat, beserta kemajuan menuju tier berikutnya. */
export function rankTier(rp: number): RankInfo {
  const points = Number.isFinite(rp) ? Math.max(0, Math.floor(rp)) : 0;
  let index = 0;
  for (let i = 1; i < RANK_TIERS.length; i++) if (points >= RANK_TIERS[i].min) index = i;
  const tier = RANK_TIERS[index];
  const next = RANK_TIERS[index + 1] ?? null;
  return { index, tier, next, into: points - tier.min, span: next ? next.min - tier.min : 0, toNext: next ? next.min - points : 0 };
}

/** Yang ditampilkan di layar akhir pertandingan: perubahan poin dan tier sebelum/sesudahnya. */
export interface RankOutcome {
  /** Perubahan poin yang benar-benar diterapkan (poin tidak pernah di bawah 0). */
  delta: number;
  /** Poin sesudahnya. */
  rp: number;
  tier: RankTier;
  /** Tier sebelumnya, hanya bila berbeda (naik atau turun tier). */
  was?: RankTier;
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

/** Id musim peringkat ("YYYY-MM") untuk waktu `ms`: satu bulan kalender menurut waktu permainan. */
export function gameSeason(ms: number): string {
  return seasonOf(gameDay(ms));
}

// ---------------------------------------------------------- musim peringkat

/**
 * Poin peringkat akun ini di musim `season`. Akun yang musimnya belum ditutup (belum disentuh
 * server sejak musim berganti) ditampilkan dengan poin yang akan ia punya begitu ditutup, supaya
 * papan peringkat dan daftar teman tidak mencampur poin musim lalu dengan poin musim ini.
 */
export function seasonPoints(p: Profile, season: string): number {
  return p.season && p.season < season ? seasonCarry(p.rp) : p.rp;
}

/**
 * Pastikan profil `p` berada di musim yang berlaku pada waktu `now` (profil diubah langsung).
 * Akun yang belum punya musim (akun baru, atau akun dari sebelum musim ada) langsung ikut musim
 * ini tanpa ada yang ditutup. Bila musimnya sudah berganti, musim terakhir yang diikuti akun ini
 * ditutup, tepat satu kali: tier dan poin akhirnya masuk riwayat, hadiah koin menurut tier
 * dibayarkan, bingkai tier itu diberikan, dan poin peringkat dibagi dua (dibulatkan ke bawah).
 * Mengembalikan catatan musim yang ditutup, atau null bila tidak ada yang ditutup.
 *
 * Hanya dipanggil server (akun di perangkat tidak punya musim). Akun yang melewatkan beberapa
 * musim sekaligus tetap ditutup satu kali saja: yang ditutup adalah musim terakhir yang ia ikuti.
 */
export function rollSeason(p: Profile, now: number): SeasonRecord | null {
  const current = gameSeason(now);
  if (!p.season) {
    p.season = current;
    return null;
  }
  // p.season > current hanya terjadi bila jam server mundur: tidak ada yang ditutup
  if (p.season >= current) return null;
  const tier = rankTier(p.rp).tier;
  const closed: SeasonRecord = { id: p.season, rp: Math.max(0, Math.floor(p.rp || 0)), tier: tier.id, coins: SEASON_REWARDS[tier.id] ?? 0 };
  p.seasons = [closed, ...p.seasons.filter((s) => s.id !== closed.id)].slice(0, SEASONS_MAX);
  p.coins = Math.min(COINS_MAX, p.coins + closed.coins);
  if (!p.frames.includes(tier.id)) p.frames.push(tier.id);
  // bingkai pertama langsung terpasang; sesudah itu pilihan pemain tidak diubah
  if (!p.frame) p.frame = tier.id;
  p.rp = seasonCarry(closed.rp);
  p.season = current;
  p.seasonNote = closed.id;
  return closed;
}

// ----------------------------------------------------- mencatat pertandingan

/**
 * Terapkan satu hasil pertandingan ke profil `p` (diubah langsung): statistik, XP, riwayat, misi
 * hari `day`, dan pencapaian. Inilah satu-satunya tempat hitungan itu dilakukan.
 *
 * `rank` hanya diisi server untuk pertandingan online akun online: poin peringkat ikut berubah,
 * dan koin diberikan (menang/kalah, mode Kilat lebih kecil, ditambah COINS_MISSION per misi
 * harian yang tercapai). Tanpa `rank` (akun di perangkat) poin peringkat dan koin tidak disentuh.
 * Pertandingan yang ditinggalkan (`rec.left`) dicatat sebagai kalah tanpa XP, tanpa koin, dan
 * tanpa kemajuan misi, supaya keluar-masuk pertandingan tidak bisa dipakai mengumpulkan XP.
 */
export function applyMatch(
  p: Profile,
  rec: MatchResult,
  now: number,
  day: string,
  rank?: RankContext,
): { xp: number; missions: { id: string; text: string; xp: number }[]; unlocked: Achievement[]; rp: number; coins: number; coinsBonus: number } {
  const left = rec.left === true;
  const win = rec.win && !left;
  const xp = left ? 0 : matchXp(rec);
  const before = new Set(unlockedIds(p));
  p.matches++;
  if (win) p.wins++;
  p.kills += rec.k;
  p.deaths += rec.d;
  p.assists += rec.a;
  p.xp += xp;
  p.playSeconds += Math.round(rec.dur);
  const h = (p.heroes[rec.hero] ??= { games: 0, wins: 0 });
  h.games++;
  if (win) h.wins++;
  // poin peringkat tidak pernah di bawah 0, jadi perubahan yang dicatat adalah yang benar-benar terjadi
  let rp = 0;
  if (rank) {
    const had = Math.max(0, p.rp || 0);
    p.rp = Math.max(0, had + rankChange(win, rank));
    rp = p.rp - had;
    p.peak = Math.max(p.peak || 0, p.rp);
  }
  const entry: MatchRecord = { hero: rec.hero, win, k: rec.k, d: rec.d, a: rec.a, dur: rec.dur, mode: rec.mode, xp, t: now };
  if (rank) entry.rp = rp;
  if (left) entry.left = true;
  p.history = [entry, ...p.history].slice(0, HISTORY_MAX);
  p.bestKills = Math.max(p.bestKills ?? 0, rec.k);
  const missions = left ? [] : applyMatchToDaily(p, rec, day);
  // koin dan hitungan Titan: hanya pertandingan online yang dicatat penuh oleh server
  let coins = 0;
  let coinsBonus = 0;
  if (rank && !left) {
    coins = matchCoins(win, rank.quick === true);
    coinsBonus = missions.length * COINS_MISSION;
    p.coins = Math.min(COINS_MAX, (p.coins || 0) + coins + coinsBonus);
    p.titans = (p.titans || 0) + int(rec.titans, 99);
  }
  const unlocked = ACHIEVEMENTS.filter((a) => !before.has(a.id) && a.value(p) >= a.goal);
  return { xp, missions, unlocked, rp, coins, coinsBonus };
}

// --------------------------------------------------------- pembersihan data

const int = (v: unknown, max = 1e12): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
const HERO_ID = /^[A-Za-z0-9_-]{1,32}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Bentuk id gelar (dan id pendek lain yang berasal dari tabel milik game). */
export const ITEM_ID = /^[a-z0-9_]{1,24}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isTierId = (v: unknown): v is string => typeof v === 'string' && RANK_TIERS.some((t) => t.id === v);

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
  p.rp = int(raw.rp, 1e9); // akun lama belum punya poin peringkat: mulai dari 0
  p.playSeconds = int(raw.playSeconds);
  if (isObj(raw.heroes)) {
    for (const [id, h] of Object.entries(raw.heroes).slice(0, 64)) {
      if (HERO_ID.test(id) && isObj(h)) p.heroes[id] = { games: int(h.games), wins: int(h.wins) };
    }
  }
  if (Array.isArray(raw.history)) {
    for (const m of raw.history.slice(0, HISTORY_MAX)) {
      if (!isObj(m) || typeof m.hero !== 'string' || !HERO_ID.test(m.hero)) continue;
      const entry: MatchRecord = {
        t: int(m.t, 1e14),
        hero: m.hero,
        win: m.win === true,
        k: int(m.k),
        d: int(m.d),
        a: int(m.a),
        dur: int(m.dur),
        mode: m.mode === 'offline' ? 'offline' : 'online',
        xp: int(m.xp),
      };
      // perubahan poin peringkat boleh negatif; besarnya dibatasi supaya aman ditampilkan
      if (typeof m.rp === 'number' && Number.isFinite(m.rp)) entry.rp = Math.max(-999, Math.min(999, Math.trunc(m.rp)));
      if (m.left === true) entry.left = true;
      p.history.push(entry);
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
  // ---- koin, toko, gelar, bingkai, musim (akun lama belum punya: nilai awal dari emptyProfile)
  p.coins = int(raw.coins, COINS_MAX);
  if (Array.isArray(raw.owned)) {
    for (const id of raw.owned.slice(0, 64)) if (shopItem(id) && !p.owned.includes(id as string)) p.owned.push(id as string);
  }
  // gelar: di sini hanya dipastikan berbentuk id; apakah gelarnya dikenal dan sudah terbuka
  // diperiksa pemakainya (server saat memuat dan memasang, client saat menampilkan; lihat titles.ts)
  if (typeof raw.title === 'string' && ITEM_ID.test(raw.title)) p.title = raw.title;
  if (Array.isArray(raw.frames)) {
    for (const id of raw.frames.slice(0, 32)) if (isTierId(id) && !p.frames.includes(id)) p.frames.push(id);
  }
  if (typeof raw.frame === 'string' && p.frames.includes(raw.frame)) p.frame = raw.frame;
  p.titans = int(raw.titans);
  p.peak = Math.max(int(raw.peak, 1e9), p.rp); // akun lama: poin tertingginya mulai dari poin sekarang
  const login = raw.login;
  if (isObj(login) && typeof login.day === 'string' && DAY_RE.test(login.day)) {
    const streak = Math.max(1, int(login.streak, 1e6));
    p.login = { day: login.day, streak, best: Math.max(streak, int(login.best, 1e6)) };
  }
  if (typeof raw.season === 'string' && SEASON_RE.test(raw.season)) p.season = raw.season;
  if (Array.isArray(raw.seasons)) {
    for (const s of raw.seasons.slice(0, SEASONS_MAX)) {
      if (!isObj(s) || typeof s.id !== 'string' || !SEASON_RE.test(s.id) || p.seasons.some((x) => x.id === s.id)) continue;
      const rp = int(s.rp, 1e9);
      p.seasons.push({ id: s.id, rp, tier: isTierId(s.tier) ? s.tier : rankTier(rp).tier.id, coins: int(s.coins, 1e6) });
    }
  }
  if (typeof raw.seasonNote === 'string' && p.seasons[0]?.id === raw.seasonNote) p.seasonNote = raw.seasonNote;
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
// Koin, toko, gelar, dan musim (protokol versi 3; hanya untuk socket yang sudah masuk akun):
//   acc:daily    {}                  -> AccDaily | AccFail      (klaim hadiah masuk harian)
//   acc:buy      { item }            -> AccBought | AccFail     (beli barang toko dengan koin)
//   acc:equip    { title?, frame? }  -> AccUpdated | AccFail    (pasang gelar / bingkai; '' = lepas)
//   acc:seen     { season }          -> AccUpdated | AccFail    (ringkasan "Musim baru" sudah dilihat)
// Event dari server:
//   acc:match  (AccMatch)   pertandingan online pemain itu selesai
//   acc:update (AccUpdated) akun berubah lewat sambungan lain milik akun yang sama (tab/perangkat lain)
// Client tidak punya event untuk mengirim statistik, koin, atau kepemilikan: hasil pertandingan
// dicatat server sendiri, dan harga, saldo, serta syarat tiap barang dan gelar diperiksa server.
// Event daftar teman ("fr:*") ada di friends.ts.
//
// Versi protokol (AccHello.v): 1 = akun dan papan peringkat; 2 = ditambah tier peringkat (poin
// `rp` di profil, papan, dan acc:match) dan daftar teman; 3 = ditambah koin, hadiah harian, toko,
// musim, gelar, dan bingkai. Client menyembunyikan yang belum ada di server versi lama.

export const ACC_PROTOCOL = 3;
/** Versi protokol pertama yang punya tier peringkat dan daftar teman. */
export const ACC_PROTOCOL_SOCIAL = 2;
/** Versi protokol pertama yang punya koin, hadiah harian, toko, musim, gelar, dan bingkai. */
export const ACC_PROTOCOL_ECONOMY = 3;

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
  /** Poin peringkat; tier-nya dihitung client dengan rankTier. */
  rp: number;
  level: number;
  xp: number;
  wins: number;
  matches: number;
  /** Gelar yang dipasang (id di TITLES); tidak ada bila tanpa gelar atau server versi lama. */
  title?: string;
}

export interface AccBoard {
  ok: true;
  /** Peringkat teratas menurut poin peringkat, lalu XP akun. */
  top: BoardRow[];
  /** Baris pemanggil bila ia masuk akun (bisa di luar `top`). */
  me: BoardRow | null;
  /** Jumlah seluruh akun. */
  total: number;
  /** Id musim yang sedang berjalan ("YYYY-MM"); server versi lama: tidak ada. */
  season?: string;
}

/** Akun sesudah sebuah perubahan (pasang gelar/bingkai, ringkasan musim dilihat, atau kabar acc:update). */
export interface AccUpdated {
  ok: true;
  account: Account;
}

/** Jawaban acc:daily. */
export interface AccDaily extends AccUpdated {
  /** Koin yang didapat dari klaim ini (0 bila hari ini sudah diklaim). */
  coins: number;
  /** Streak sesudah klaim. */
  streak: number;
  /** true bila hadiah hari ini sudah diklaim sebelumnya (tidak ada yang berubah). */
  already?: true;
}

/** Jawaban acc:buy. */
export interface AccBought extends AccUpdated {
  /** Id barang yang diminta. */
  item: string;
  /** true bila barang itu sudah dimiliki (tidak ada koin yang dipotong). */
  already?: true;
}

/** Jumlah baris teratas di papan peringkat. */
export const BOARD_SIZE = 20;

/** Pertandingan online selesai: akun terbaru dan apa saja yang didapat (id misi dan pencapaian). */
export interface AccMatch {
  account: Account;
  xp: number;
  missions: string[];
  unlocked: string[];
  /** Perubahan poin peringkat yang diterapkan (bisa negatif); tidak ada bila hasilnya tidak dicatat. */
  rp?: number;
  /** Koin dari pertandingan ini, dan dari misi harian yang tercapai; tidak ada di server versi lama. */
  coins?: number;
  coinsBonus?: number;
  /**
   * Terisi bila hasilnya tidak dicatat. 'short': pemain baru bergabung menjelang akhir pertandingan;
   * 'afk': pemain nyaris tidak memberi perintah apa pun sepanjang pertandingan; 'left': akun ini
   * sudah keluar dari pertandingan yang sama sebelumnya dan saat itu sudah dicatat kalah.
   */
  skipped?: 'short' | 'afk' | 'left';
}

/** Minimal sekian detik ikut bermain supaya hasil pertandingan online dicatat ke akun. */
export const MIN_RECORDED_SECONDS = 120;
/** Minimal sekian perintah bermain (gerak, serang, skill) supaya hasilnya dicatat; di bawah itu dianggap diam saja. */
export const MIN_RECORDED_ACTIONS = 25;
/**
 * Syarat "ikut bermain" sebanding dengan lamanya ikut: selain minimum di atas, rata-rata sekian
 * perintah per menit. Tanpa ini pemain bisa diam sampai hasilnya jelas lalu mengirim 25 perintah.
 */
export const MIN_ACTIONS_PER_MINUTE = 8;
/** Jumlah perintah yang dibutuhkan pemain yang ikut selama `seconds` detik supaya dianggap ikut bermain. */
export function actionsNeeded(seconds: number): number {
  return Math.max(MIN_RECORDED_ACTIONS, Math.floor((seconds / 60) * MIN_ACTIONS_PER_MINUTE));
}
