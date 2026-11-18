// Protokol jaringan client <-> server.
import type { Team } from './constants';

export type EntityKind = 'hero' | 'minion' | 'tower' | 'core' | 'monster';

/** Data entity yang tidak berubah; dikirim sekali saat entity pertama kali terlihat. */
export interface EntityStatic {
  id: number;
  kind: EntityKind;
  team: Team;
  sub: string; // id hero / 'melee' | 'ranged' / 'small' | 'big'
  name: string;
  radius: number;
  /** Skin warna hero (indeks di SKINS); tidak dikirim untuk skin asli. */
  skin?: number;
}

/** Data dinamis per tick: [id, x, z, rot, hp, maxHp, flags]. */
export type EntityDyn = [number, number, number, number, number, number, number];

export const F_STUN = 1;
export const F_INVIS = 2;
export const F_SHIELD = 4;
export const F_SLOW = 8;
export const F_INVULN = 16;
export const F_RECALL = 32; // sedang menyalurkan recall ke base
export const F_BUFF = 64; // membawa Berkah Golem (bonus damage sementara)
export const F_BUSH = 128; // hero sedang berdiri di dalam semak persembunyian

export interface HeroInfo {
  id: number;
  def: string;
  name: string;
  team: Team;
  bot: boolean;
  level: number;
  mana: number;
  maxMana: number;
  k: number;
  d: number;
  a: number;
  respawn: number; // detik tersisa, 0 jika hidup
  /** Id item yang dimiliki (server lama tidak mengirimnya). */
  items?: string[];
  /** Statistik pertandingan: damage ke hero lawan, damage diterima, emas didapat (server lama: tidak ada). */
  dd?: number;
  dt?: number;
  ge?: number;
}

export interface SelfState {
  id: number;
  def: string;
  team: Team;
  alive: boolean;
  level: number;
  xp: number;
  xpNext: number;
  gold: number;
  mana: number;
  maxMana: number;
  cds: number[]; // sisa cooldown tiap slot (detik)
  respawn: number;
  /** Id item yang dimiliki (server lama tidak mengirimnya). */
  items?: string[];
  /** Sedang di base atau tewas: boleh menjual item. */
  canShop?: boolean;
  /** Server mengizinkan membeli item di mana saja (server lama: hanya di base). */
  buyAnywhere?: boolean;
  /** Pengurangan cooldown dari item, pecahan. */
  cdr?: number;
  /** Mantra tempur yang dibawa dan sisa cooldown-nya dalam detik (server lama: tidak ada). */
  spell?: string;
  spellCd?: number;
}

export type GameEvent =
  | { k: 'atk'; a: number; b: number; r: 0 | 1 }
  | { k: 'cast'; a: number; s: number }
  | { k: 'beam'; x0: number; z0: number; x1: number; z1: number; w: number; c: number; warn?: 1 }
  | { k: 'ring'; x: number; z: number; r: number; c: number }
  | { k: 'trail'; x0: number; z0: number; x1: number; z1: number; c: number }
  | { k: 'text'; x: number; z: number; s: string; c: number; to?: number }
  | { k: 'die'; a: number } // unit `a` tewas/hancur (untuk animasi kematian di client)
  // hero tumbang: pembunuh (0 = bukan hero), kill beruntun cepat (multi), kill tanpa mati (streak)
  // `end` = streak korban yang diakhiri (>= 3: "shut down", pembunuh dapat `bounty` emas tambahan),
  // `ace` = seluruh tim korban sedang tumbang ("wiped out")
  | { k: 'kill'; killer: number; victim: number; multi: number; streak: number; first?: 1; end?: number; bounty?: number; ace?: 1 }
  // angka damage dari hero `to`; hanya dikirim ke pemain pemilik hero itu
  | { k: 'dmg'; x: number; z: number; n: number; to: number }
  // penyembuhan sebesar `n` pada posisi unit yang disembuhkan
  | { k: 'heal'; x: number; z: number; n: number }
  // obrolan dari hero `from`; all = 0 hanya dikirim ke pemain setim dengan pengirim
  | { k: 'chat'; from: number; name: string; team: Team; s: string; all: 0 | 1 }
  // pesan cepat (lihat PINGS) dari hero `from` di posisi (x, z); hanya dikirim ke pemain setim
  | { k: 'ping'; from: number; name: string; team: Team; x: number; z: number; kind: number }
  // bangunan tim `team` sedang diserang di (x, z); hanya dikirim ke tim pemiliknya
  | { k: 'alert'; team: Team; x: number; z: number; core?: 1 }
  // rekap saat hero `to` tumbang: siapa saja yang melukainya 10 detik terakhir (hanya untuk pemiliknya)
  | { k: 'recap'; to: number; list: { name: string; n: number }[] }
  // emote (lihat EMOTES) di atas kepala hero `a`; terlihat semua pemain
  | { k: 'emote'; a: number; kind: number }
  | { k: 'msg'; s: string };

export interface Snapshot {
  t: number; // waktu pertandingan (detik)
  spawn: EntityStatic[];
  ents: EntityDyn[];
  heroes?: HeroInfo[]; // dikirim beberapa kali per detik saja
  you: SelfState;
  events: GameEvent[];
  score: [number, number];
  over: Team | null;
  nextWave: number;
}

export type ClientCommand =
  | { t: 'move'; x: number; z: number }
  | { t: 'attack'; id: number }
  | { t: 'cast'; slot: number; x: number; z: number }
  | { t: 'stop' }
  | { t: 'buy'; item: string }
  | { t: 'sell'; slot: number }
  | { t: 'recall' }
  // obrolan: ke semua pemain (`all`) atau hanya tim sendiri
  | { t: 'chat'; s: string; all?: boolean }
  // pesan cepat ke tim; `kind` = indeks di PINGS
  | { t: 'ping'; kind: number }
  // mantra tempur, dibidik ke titik (x, z)
  | { t: 'spell'; x: number; z: number }
  // emote di atas kepala hero sendiri; `kind` = indeks di EMOTES
  | { t: 'emote'; kind: number };

/** Emote yang bisa ditampilkan di atas kepala hero. */
export const EMOTES = ['👍', '😂', '😎', '😡', '😭', '🙏'] as const;

/** Panjang maksimum satu pesan obrolan. */
export const CHAT_MAX = 120;

/** Pesan cepat untuk tim: teksnya dan warna penandanya di minimap dan di tanah. */
export const PINGS = [
  { text: 'Serang!', color: 0xff5c5c },
  { text: 'Mundur!', color: 0xffd23f },
  { text: 'Butuh bantuan!', color: 0x4f9bff },
  { text: 'Kumpul di sini!', color: 0x7dffb0 },
  { text: 'Awas, musuh hilang!', color: 0xff9a3c },
  { text: 'Kerja bagus!', color: 0xd9a6ff },
] as const;

/** Mulai streak berapa sebuah kill dihitung "shut down", dan emas bonusnya per kill streak korban. */
export const SHUTDOWN_STREAK = 3;
export const SHUTDOWN_GOLD = 60;

export interface JoinRequest {
  name: string;
  heroId: string;
  /** Kode room pribadi (lihat roomCode); kosong = room umum. */
  room?: string;
  /** Tim yang diinginkan. Tanpa ini, atau bila tim itu penuh, server yang memilihkan. */
  team?: Team;
  /** Mantra tempur pilihan (id di SPELLS); tanpa ini dipakai mantra bawaan. */
  spell?: string;
  /** Skin warna hero (indeks di SKINS). */
  skin?: number;
  /** Tingkat kesulitan bot (indeks di BOT_LEVELS); hanya berlaku bila pemain ini yang pertama masuk room. */
  bots?: number;
  /** Token acak milik client. Bergabung lagi dengan token yang sama melanjutkan hero yang masih ditahan server. */
  session?: string;
}

export interface JoinResult {
  ok: boolean;
  error?: string;
  team?: Team;
  /** Room yang dimasuki ('' = room umum) dan jumlah pemain di dalamnya (server lama: tidak ada). */
  room?: string;
  players?: number;
  /** true bila ini melanjutkan sesi yang terputus (hero, level, dan item tetap). */
  resumed?: boolean;
}

/** Bentuk baku kode room: huruf besar dan angka saja, maksimal 10 karakter. */
export function roomCode(raw: unknown): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
}
