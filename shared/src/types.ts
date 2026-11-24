// Protokol jaringan client <-> server.
import type { GameMode, Team } from './constants';

export type EntityKind = 'hero' | 'minion' | 'tower' | 'core' | 'monster' | 'ward';

/** Data entity yang tidak berubah; dikirim sekali saat entity pertama kali terlihat. */
export interface EntityStatic {
  id: number;
  kind: EntityKind;
  team: Team;
  sub: string; // id hero / 'melee' | 'ranged' | 'super' | 'siege' / 'small' | 'big' | 'flow' | 'titan'
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
export const F_FLOW = 256; // membawa Berkah Arus (mana pulih cepat, cooldown lebih pendek)

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
  /** Sisa jeda kemampuan aktif tiap slot item, dalam detik (0 = siap atau bukan item aktif); hanya dikirim bila ada item aktif. */
  itemCds?: number[];
  /**
   * Sisa jeda menanam suar, dalam detik (0 = siap). Adanya angka ini juga tanda server memakai kabut
   * perang; server lama tidak mengirimnya dan client tidak menggelapkan apa pun.
   */
  ward?: number;
  /**
   * Menu admin tersedia (pemain manusia di room hanya satu): bit 1 = boleh dipakai, 2 = HP tak terbatas
   * aktif, 4 = sekali pukul aktif. Tidak dikirim bila tidak tersedia.
   */
  admin?: number;
  /** Hero sedang dikendalikan bot karena pemainnya diam terlalu lama (hilang begitu ia memberi perintah). */
  afk?: 1;
  /** Sisa detik Berkah Golem, Berkah Arus, dan Berkah Titan (tidak dikirim bila tidak aktif). */
  golem?: number;
  flow?: number;
  titan?: number;
  /** Jumlah emote yang boleh dipakai pemain ini (awal daftar EMOTES); server lama: tidak ada (= FREE_EMOTES). */
  emotes?: number;
  /** Talenta yang dibawa (server lama: tidak ada). */
  talent?: string;
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
  // pemungutan suara menyerah tim `team` (hanya dikirim ke tim itu): `yes` setuju dari `need` yang dibutuhkan,
  // `left` detik tersisa, `by` nama pengusul; `done` terisi saat selesai ('pass' = tim menyerah)
  | { k: 'vote'; team: Team; yes: number; need: number; left: number; by: string; done?: 'pass' | 'fail' }
  // Titan Astra: 'soon' = akan bangkit sebentar lagi, 'spawn' = bangkit, 'slain' = ditumbangkan tim `team`.
  // `pit` = indeks TITAN_PITS
  | { k: 'titan'; s: 'soon' | 'spawn' | 'slain'; pit: number; team?: Team }
  // area bahaya di tanah: lingkaran radius `r` yang terisi selama `t` detik sebelum serangannya mendarat
  | { k: 'zone'; x: number; z: number; r: number; t: number; c: number }
  // emote (lihat EMOTES) di atas kepala hero `a`; terlihat semua pemain
  | { k: 'emote'; a: number; kind: number }
  | { k: 'msg'; s: string };

export interface Snapshot {
  t: number; // waktu pertandingan (detik)
  spawn: EntityStatic[];
  ents: EntityDyn[];
  heroes?: HeroInfo[]; // dikirim beberapa kali per detik saja
  /** Mode pertandingan room ini bila bukan klasik (server lama: tidak ada); dikirim bersama `heroes`. */
  mode?: GameMode;
  /** Sisa waktu pertandingan dalam detik, untuk mode yang berbatas waktu; dikirim bersama `heroes`. */
  left?: number;
  /**
   * Hanya setelah pertandingan selesai: emas yang dikumpulkan tiap tim sepanjang pertandingan,
   * satu titik tiap `every` detik (untuk grafik di layar akhir). `gold[0]` = tim Biru.
   */
  chart?: { every: number; gold: [number[], number[]] };
  /** Titan Astra: [detik sampai bangkit (0 = sedang hidup), indeks sarang]; dikirim bersama `heroes`. */
  titan?: [number, number];
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
  | { t: 'buy'; item: string; slot?: number } // slot: item yang dijual sekaligus (mengganti)
  | { t: 'sell'; slot: number }
  | { t: 'recall' }
  // obrolan: ke semua pemain (`all`) atau hanya tim sendiri
  | { t: 'chat'; s: string; all?: boolean }
  // pesan cepat ke tim; `kind` = indeks di PINGS
  | { t: 'ping'; kind: number; x?: number; z?: number } // x/z: titik yang ditandai (tanpa ini posisi hero)
  // mantra tempur, dibidik ke titik (x, z)
  | { t: 'spell'; x: number; z: number }
  // tanam suar penglihatan di (x, z); server menjepitnya ke jarak WARD_RANGE dari hero
  | { t: 'ward'; x: number; z: number }
  // pakai kemampuan aktif item di slot `slot`
  | { t: 'use'; slot: number }
  // menu admin (hanya bila pemain manusia di room cuma satu): 'gold' = emas maksimal, 'god' = HP tak terbatas, 'onehit' = sekali pukul tumbang
  | { t: 'admin'; a: 'gold' | 'god' | 'onehit'; on?: boolean }
  // menyerah: mengajukan pemungutan suara tim, atau memberi suara (vote: false = menolak)
  | { t: 'surrender'; vote?: boolean }
  // emote di atas kepala hero sendiri; `kind` = indeks di EMOTES
  | { t: 'emote'; kind: number };

/** Emote yang bisa ditampilkan di atas kepala hero. */
export const EMOTES = ['👍', '😂', '😎', '😡', '😭', '🙏', '🔥', '💀', '🤝', '😴', '🎯', '👑'] as const;
/** Emote yang dimiliki semua pemain (awal daftar EMOTES); sisanya adalah paket yang dibeli di toko. */
export const FREE_EMOTES = 6;

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

/**
 * Tingkat kemampuan client ini, dikirim saat bergabung. Server tidak mengirim hal yang belum
 * dikenal client lama (2 = mengenal entity 'ward'). Naikkan bila menambah jenis entity baru.
 */
export const CLIENT_CAPS = 2;

export interface JoinRequest {
  name: string;
  heroId: string;
  /** Tingkat kemampuan client (CLIENT_CAPS); client lama tidak mengirimnya. */
  caps?: number;
  /**
   * Jumlah emote yang dimiliki. Hanya dipakai pertandingan OFFLINE (akun di perangkat); server
   * online mengabaikannya dan menetapkannya sendiri dari akun pemain.
   */
  emotes?: number;
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
  /** Talenta pilihan (id di TALENTS); tanpa ini dipakai talenta bawaan. */
  talent?: string;
  /** Jumlah hero per tim (1, 2, atau 3); berlaku bila pemain ini yang pertama masuk room. Tanpa ini 3. */
  size?: number;
  /** Mode pertandingan pilihan pemain; berlaku bila ia pemain pertama di room itu (seperti tingkat bot). */
  mode?: GameMode;
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
