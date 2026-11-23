// Akun pemain. Dua tempat penyimpanan dengan antarmuka yang sama (AccountStore):
//   - ServerAccountStore (serverStore.ts): akun online di server game. Dipakai setiap kali lobby
//     tersambung ke server yang mendukung akun; hasil pertandingan dicatat server itu sendiri.
//   - LocalAccountStore (di bawah): akun yang hanya ada di perangkat ini (localStorage). Cadangan
//     saat tidak ada server yang terjangkau (main offline) atau servernya versi lama.
// Seluruh client hanya memakai `accounts`, yang memilih salah satunya menurut keadaan sambungan.
// Bentuk profil, rumus XP, level, dan aturan nama/kata sandi ada di shared/src/account.ts karena
// server memakai hitungan yang sama.

import { applyMatch, emptyProfile, matchXp, validateName, validatePassword, type Account, type MatchOutcome, type MatchResult, type Profile } from '../../../shared/src';
import type { ServerLink } from '../net/transport';
import type { Friends } from './friends';
import { todayKey } from './progress';
import { ServerAccountStore, type EconomyResult, type Leaderboard } from './serverStore';

export { accountLevel, matchXp, validateName, validatePassword } from '../../../shared/src';
export type { Account, MatchOutcome, MatchRecord, Profile } from '../../../shared/src';
export type { EconomyResult, Leaderboard } from './serverStore';

export type AuthResult = { ok: true; account: Account } | { ok: false; error: string };

export interface AccountStore {
  /** 'server': akun online di server game · 'local': akun yang hanya ada di perangkat ini. */
  readonly kind: 'server' | 'local';
  /** Akun yang sedang masuk, atau null (tamu). */
  current(): Account | null;
  register(name: string, password: string): Promise<AuthResult>;
  login(name: string, password: string): Promise<AuthResult>;
  logout(): Promise<void>;
  /**
   * Pertandingan selesai: mengembalikan akun terbaru dan apa saja yang didapat. Akun di perangkat
   * mencatatnya di sini; akun online menunggu kabar dari server, yang mencatatnya sendiri.
   */
  recordMatch(rec: MatchResult): Promise<MatchOutcome>;
  /** Kunci hari (YYYY-MM-DD) yang berlaku untuk misi harian akun ini. */
  today(): string;
}

// ------------------------------------------------------------------- hashing

/** SHA-256 murni JS: dipakai bila WebCrypto tidak tersedia (halaman http biasa di jaringan lokal). */
type Bytes = Uint8Array<ArrayBuffer>;

function sha256(bytes: Bytes): Bytes {
  const K = new Uint32Array(64);
  const frac = (x: number) => ((x - Math.floor(x)) * 4294967296) | 0;
  let n = 0;
  for (let c = 2; n < 64; c++) {
    let prime = true;
    for (let i = 2; i * i <= c; i++) if (c % i === 0) prime = false;
    if (prime) K[n++] = frac(Math.cbrt(c));
  }
  const H = new Uint32Array(8);
  n = 0;
  for (let c = 2; n < 8; c++) {
    let prime = true;
    for (let i = 2; i * i <= c; i++) if (c % i === 0) prime = false;
    if (prime) H[n++] = frac(Math.sqrt(c));
  }
  const len = bytes.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, len * 8);
  view.setUint32(padded.length - 8, Math.floor(len / 536870912));
  const w = new Uint32Array(64);
  const rotr = (x: number, s: number) => (x >>> s) | (x << (32 - s));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    H[0] += a;
    H[1] += b;
    H[2] += c;
    H[3] += d;
    H[4] += e;
    H[5] += f;
    H[6] += g;
    H[7] += h;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, H[i]);
  return out;
}

const hex = (b: Bytes) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (s: string): Bytes => new Uint8Array((s.match(/../g) ?? []).map((h) => parseInt(h, 16)));

interface HashInfo {
  /** 'pbkdf2' (WebCrypto) atau 'sha256x' (SHA-256 berulang, cadangan). */
  algo: 'pbkdf2' | 'sha256x';
  salt: string;
  iter: number;
  hash: string;
}

async function derive(password: string, salt: Bytes, algo: HashInfo['algo'], iter: number): Promise<string> {
  const pw = new TextEncoder().encode(password);
  if (algo === 'pbkdf2') {
    const key = await crypto.subtle.importKey('raw', pw, 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
    return hex(new Uint8Array(bits));
  }
  let cur: Bytes = new Uint8Array(salt.length + pw.length);
  cur.set(salt);
  cur.set(pw, salt.length);
  for (let i = 0; i < iter; i++) cur = sha256(cur);
  return hex(cur);
}

async function hashPassword(password: string): Promise<HashInfo> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const algo: HashInfo['algo'] = typeof crypto.subtle?.deriveBits === 'function' ? 'pbkdf2' : 'sha256x';
  const iter = algo === 'pbkdf2' ? 120_000 : 3000;
  return { algo, salt: hex(salt), iter, hash: await derive(password, salt, algo, iter) };
}

async function verifyPassword(password: string, info: HashInfo): Promise<boolean> {
  if (info.algo === 'pbkdf2' && typeof crypto.subtle?.deriveBits !== 'function') return false;
  const got = await derive(password, fromHex(info.salt), info.algo, info.iter);
  // bandingkan tanpa keluar lebih awal
  let diff = got.length ^ info.hash.length;
  for (let i = 0; i < Math.min(got.length, info.hash.length); i++) diff |= got.charCodeAt(i) ^ info.hash.charCodeAt(i);
  return diff === 0;
}

// ------------------------------------------------------------ penyimpanan lokal

interface StoredUser extends HashInfo {
  name: string;
  created: number;
  profile: Profile;
}
interface Db {
  users: Record<string, StoredUser>;
  session: string | null;
}

const DB_KEY = 'astra.accounts.v1';

class LocalAccountStore implements AccountStore {
  readonly kind = 'local';
  private db: Db = this.load();

  today(): string {
    return todayKey();
  }

  private load(): Db {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const db = JSON.parse(raw) as Db;
        if (db && typeof db.users === 'object') return { users: db.users, session: db.session ?? null };
      }
    } catch {
      /* data rusak / penyimpanan tidak tersedia: mulai kosong */
    }
    return { users: {}, session: null };
  }

  private save(): boolean {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(this.db));
      return true;
    } catch {
      return false;
    }
  }

  private toAccount(u: StoredUser): Account {
    return { name: u.name, created: u.created, profile: { ...emptyProfile(), ...u.profile } };
  }

  current(): Account | null {
    const u = this.db.session ? this.db.users[this.db.session] : undefined;
    return u ? this.toAccount(u) : null;
  }

  async register(name: string, password: string): Promise<AuthResult> {
    name = name.trim();
    const bad = validateName(name) ?? validatePassword(password);
    if (bad) return { ok: false, error: bad };
    const key = name.toLowerCase();
    if (this.db.users[key]) return { ok: false, error: 'Nama itu sudah terdaftar di perangkat ini.' };
    const user: StoredUser = { name, created: Date.now(), profile: emptyProfile(), ...(await hashPassword(password)) };
    this.db.users[key] = user;
    this.db.session = key;
    if (!this.save()) return { ok: false, error: 'Penyimpanan perangkat tidak tersedia.' };
    return { ok: true, account: this.toAccount(user) };
  }

  async login(name: string, password: string): Promise<AuthResult> {
    const key = name.trim().toLowerCase();
    const user = this.db.users[key];
    // pesan yang sama untuk nama tak dikenal dan sandi salah
    if (!user || !(await verifyPassword(password, user))) return { ok: false, error: 'Nama atau kata sandi salah.' };
    this.db.session = key;
    this.save();
    return { ok: true, account: this.toAccount(user) };
  }

  async logout(): Promise<void> {
    this.db.session = null;
    this.save();
  }

  async recordMatch(rec: MatchResult): Promise<MatchOutcome> {
    const user = this.db.session ? this.db.users[this.db.session] : undefined;
    if (!user) return { account: null, xp: matchXp(rec), missions: [], unlocked: [] };
    const p = (user.profile = { ...emptyProfile(), ...user.profile });
    // tanpa keadaan room dari server: poin peringkat tidak disentuh (akun di perangkat tidak punya tier)
    const r = applyMatch(p, rec, Date.now(), this.today());
    this.save();
    return {
      account: this.toAccount(user),
      xp: r.xp,
      missions: r.missions,
      unlocked: r.unlocked.map((a) => a.name),
      rankNote: 'Akun di perangkat ini tidak punya tier peringkat maupun koin. Keduanya hanya dari pertandingan online dengan akun online.',
    };
  }
}

// --------------------------------------------------------------- pemilih

/** Jenis akun yang berlaku pada kunjungan terakhir: 'server' (online) atau 'local'. */
const LAST_KIND = 'astra.acckind';
function readLastKind(): string {
  try {
    return localStorage.getItem(LAST_KIND) ?? '';
  } catch {
    return '';
  }
}

/**
 * Penyimpanan akun yang dipakai seluruh client. Meneruskan ke akun online selama lobby tersambung
 * ke server yang mendukungnya (atau perangkat masih mengingat sesi online, saat sedang offline),
 * selain itu ke akun di perangkat.
 */
class AccountHub implements AccountStore {
  private local = new LocalAccountStore();
  private server = new ServerAccountStore();
  /**
   * Sebelum sambungan jelas, dipakai tebakan dari kunjungan terakhir (LAST_KIND), supaya lobby
   * tidak sempat menampilkan akun perangkat lalu berganti ke akun online sesaat kemudian.
   */
  private active: AccountStore = this.server.hasSaved() || readLastKind() === 'server' ? this.server : this.local;
  private listeners = new Set<() => void>();

  constructor() {
    this.server.onChange = () => this.changed();
  }

  private pick(): void {
    this.active = this.server.linked || this.server.hasSaved() ? this.server : this.local;
  }

  /**
   * Dipanggil tiap kali akun online yang sedang masuk berubah (koin, barang toko, gelar, hasil
   * pertandingan, atau kabar dari sambungan lain); mengembalikan fungsi untuk berhenti mendengarkan.
   */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    for (const fn of [...this.listeners]) fn();
  }

  get kind(): 'server' | 'local' {
    return this.active.kind;
  }

  /** Tersambung ke server yang mendukung akun online (masuk, daftar, dan papan peringkat tersedia). */
  get online(): boolean {
    return this.server.linked;
  }

  /**
   * Akun yang sedang dipakai punya tier peringkat: akun online di server yang mendukungnya (saat
   * offline: salinan terakhirnya). Akun di perangkat tidak pernah punya tier.
   */
  get ranked(): boolean {
    return this.active === this.server && this.server.ranked;
  }

  /**
   * Akun yang sedang dipakai punya koin, hadiah harian, toko, musim, gelar, bingkai, dan
   * penguasaan hero: akun online di server yang mendukungnya (saat offline: salinan terakhirnya,
   * hanya untuk dilihat). Tamu dan akun di perangkat tidak punya satu pun dari itu.
   */
  get economy(): boolean {
    return this.active === this.server && this.server.economy && this.server.current() !== null;
  }

  /** Mengapa fitur akun online (koin, toko, gelar, ...) tidak tersedia sekarang; '' bila tersedia. */
  economyNote(): string {
    if (this.economy) return '';
    if (this.active === this.server && this.server.current()) {
      return this.online ? 'Server ini belum mendukung koin, toko, musim, dan gelar.' : 'Data koin dan toko belum diketahui. Sambungkan ke server akun untuk melihatnya.';
    }
    return this.current() ? 'Hanya untuk akun online. Akun yang sedang dipakai hanya ada di perangkat ini.' : 'Hanya untuk akun online. Masuk atau daftar akun online dulu.';
  }

  /** Id musim peringkat yang sedang berjalan menurut jam server ("YYYY-MM"). */
  season(): string {
    return this.server.season();
  }

  /** Klaim hadiah masuk harian (akun online, saat tersambung). */
  claimDaily(): Promise<EconomyResult<{ coins: number; streak: number; already: boolean }>> {
    return this.server.claimDaily();
  }
  /** Beli barang toko dengan koin. */
  buy(item: string): Promise<EconomyResult<{ already: boolean }>> {
    return this.server.buy(item);
  }
  /** Pasang gelar dan/atau bingkai ('' = lepas). */
  equip(what: { title?: string; frame?: string }): Promise<EconomyResult> {
    return this.server.equip(what);
  }
  /** Ringkasan penutupan musim sudah dilihat pemain. */
  seenSeason(season: string): Promise<void> {
    return this.server.seenSeason(season);
  }

  /** Daftar teman akun online yang sedang masuk (lihat friends.ts); tidak tersedia untuk tamu dan akun di perangkat. */
  get friends(): Friends {
    return this.server.friends;
  }

  /** Nama akun di perangkat ini yang sedang masuk (tetap dipakai saat offline), bila ada. */
  localName(): string | null {
    return this.local.current()?.name ?? null;
  }

  /**
   * Sambungan lobby berubah (`null` = offline). Menentukan penyimpanan mana yang dipakai dan
   * melanjutkan sesi akun online yang tersimpan. 'expired': sesi tersimpan ditolak server.
   */
  async bind(link: ServerLink | null): Promise<'ok' | 'expired'> {
    let state: Awaited<ReturnType<ServerAccountStore['attach']>> = 'unsupported';
    if (link) state = await this.server.attach(link);
    else this.server.detach();
    this.pick();
    try {
      localStorage.setItem(LAST_KIND, this.server.linked ? 'server' : 'local');
    } catch {
      /* penyimpanan tidak tersedia */
    }
    return state === 'expired' ? 'expired' : 'ok';
  }

  current(): Account | null {
    return this.active.current();
  }
  register(name: string, password: string): Promise<AuthResult> {
    return this.active.register(name, password);
  }
  login(name: string, password: string): Promise<AuthResult> {
    return this.active.login(name, password);
  }
  async logout(): Promise<void> {
    await this.active.logout();
    this.pick();
  }
  recordMatch(rec: MatchResult): Promise<MatchOutcome> {
    return this.active.recordMatch(rec);
  }
  today(): string {
    return this.active.today();
  }

  /** Papan peringkat akun online; 'offline' bila tidak tersambung ke server yang mendukungnya. */
  leaderboard(): Promise<Leaderboard | 'offline' | 'error'> {
    return this.server.leaderboard();
  }
}

export const accounts = new AccountHub();
