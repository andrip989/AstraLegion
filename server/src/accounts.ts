// Akun pemain di server: penyimpanan (satu file JSON), kata sandi (scrypt bergaram), token sesi,
// pembatas laju, papan peringkat, dan event Socket.IO "acc:*" (protokolnya di shared/src/account.ts).
//
// Yang disimpan per akun hanya: nama, hash kata sandi, hash token sesi (dengan waktu terakhir
// dipakai, untuk membuang sesi lama), dan statistik permainan. Alamat IP hanya dipakai di memori
// untuk membatasi percobaan masuk; tidak ditulis ke file maupun ke log. Kata sandi dan token
// tidak pernah dicatat di log atau dikirim balik.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Socket } from 'socket.io';
import {
  ACC_PROTOCOL,
  BOARD_SIZE,
  PASSWORD_MAX,
  accountLevel,
  applyMatch,
  cleanProfile,
  emptyProfile,
  gameDay,
  nameKey,
  validateName,
  validatePassword,
  type AccBoard,
  type AccFail,
  type AccHello,
  type AccMatch,
  type AccSignedIn,
  type Account,
  type BoardRow,
  type MatchResult,
  type Profile,
} from '../../shared/src';

// ------------------------------------------------------------------- batasan

/** Jumlah akun maksimum (file JSON ditulis utuh tiap kali, jadi ukurannya dijaga). */
const MAX_ACCOUNTS = Math.max(1, Number(process.env.MAX_ACCOUNTS) || 2000);
/** Sesi (token) per akun; yang paling lama tidak dipakai dibuang lebih dulu. */
const MAX_TOKENS = 5;
/** Sesi yang tidak dipakai selama ini dianggap habis. */
const TOKEN_TTL = 90 * 86_400_000;
/** Jeda sebelum perubahan ditulis ke file, supaya beberapa perubahan beruntun jadi satu tulisan. */
const SAVE_DELAY = 1500;
/** Parameter scrypt untuk akun baru (ikut disimpan per akun, jadi bisa dinaikkan kelak). */
const SCRYPT = { n: 16384, r: 8, p: 1 };
const KEY_LEN = 32;
/** Hash kata sandi yang boleh dihitung bersamaan (tiap hitungan memakai ±16 MB dan satu thread). */
const MAX_HASHING = 4;
/** Permintaan yang boleh menunggu giliran hash; lebih dari ini dijawab "server sibuk". */
const MAX_QUEUED = 24;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

interface PwHash {
  algo: 'scrypt';
  n: number;
  r: number;
  p: number;
  salt: string;
  hash: string;
}
interface StoredToken {
  /** SHA-256 (hex) dari token; token aslinya hanya dipegang client. */
  h: string;
  /** Terakhir dipakai (ms sejak epoch). */
  t: number;
}
interface StoredAccount {
  name: string;
  created: number;
  pw: PwHash;
  tokens: StoredToken[];
  profile: Profile;
}

const fail = (error: string, code?: AccFail['code'], retry?: number): AccFail => ({ ok: false, error, ...(code ? { code } : {}), ...(retry ? { retry } : {}) });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const isHex = (v: unknown, bytes: number): v is string => typeof v === 'string' && v.length === bytes * 2 && /^[0-9a-f]+$/.test(v);

function scrypt(password: string, salt: Buffer, pw: { n: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // versi async: dihitung di thread lain, jadi simulasi pertandingan tidak tersendat
    crypto.scrypt(password.normalize('NFKC'), salt, KEY_LEN, { N: pw.n, r: pw.r, p: pw.p, maxmem: 256 * pw.n * pw.r }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

type SignIn = { ok: true; key: string; account: Account; token: string } | AccFail;

// -------------------------------------------------------------- penyimpanan

export class AccountDb {
  /** false bila folder data tidak bisa dipakai: server tetap jalan, client memakai akun di perangkat. */
  readonly usable: boolean;
  readonly file: string;
  private byKey = new Map<string, StoredAccount>();
  /** sha256(token) -> kunci akun. */
  private byToken = new Map<string, string>();
  /** Nama yang sedang didaftarkan (hash-nya masih dihitung). */
  private reserved = new Set<string>();
  private board: { rows: BoardRow[]; rank: Map<string, number> } | null = null;
  private hashing = 0;
  private queue: (() => void)[] = [];
  /** Garam untuk nama yang tidak dikenal, supaya lama jawabannya sama dengan nama yang terdaftar. */
  private dummySalt = crypto.randomBytes(16);

  private dirty = false;
  private writing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;

  constructor(readonly dir: string) {
    this.file = path.join(dir, 'accounts.json');
    this.usable = this.load();
    // process.exit() (mis. saat build server baru diunggah) tetap menulis perubahan terakhir
    if (this.usable) process.once('exit', () => this.flushSync());
  }

  get size(): number {
    return this.byKey.size;
  }

  // ---- muat & simpan

  private load(): boolean {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.accessSync(this.dir, fs.constants.R_OK | fs.constants.W_OK);
      // sisa penulisan yang terputus
      for (const f of fs.readdirSync(this.dir)) if (f.startsWith('accounts.json.tmp')) fs.rmSync(path.join(this.dir, f), { force: true });
    } catch (e) {
      console.error(`[akun] Folder data ${this.dir} tidak bisa dipakai (${(e as Error).message}). Akun online dimatikan.`);
      return false;
    }
    const backup = this.file + '.bak';
    if (fs.existsSync(this.file)) {
      try {
        const skipped = this.adopt(JSON.parse(fs.readFileSync(this.file, 'utf8')));
        // cadangan keadaan saat server mulai: jaring pengaman bila file utama rusak kelak
        try {
          fs.copyFileSync(this.file, backup);
        } catch {
          /* cadangan gagal dibuat: bukan alasan untuk berhenti */
        }
        console.log(`[akun] ${this.byKey.size} akun dimuat dari ${this.file}${skipped ? ` (${skipped} entri tidak sah dilewati)` : ''}`);
        return true;
      } catch (e) {
        // Jangan pernah menimpa file yang tidak terbaca: sisihkan, lalu coba cadangannya.
        const aside = path.join(this.dir, `accounts.rusak-${Date.now()}.json`);
        try {
          fs.renameSync(this.file, aside);
        } catch {
          console.error(`[akun] ${this.file} tidak terbaca dan tidak bisa disisihkan. Akun online dimatikan supaya datanya tidak tertimpa.`);
          return false;
        }
        console.error(`[akun] ${this.file} tidak terbaca (${(e as Error).message}); disisihkan sebagai ${aside}.`);
        this.byKey.clear();
        this.byToken.clear();
      }
    }
    if (fs.existsSync(backup)) {
      try {
        this.adopt(JSON.parse(fs.readFileSync(backup, 'utf8')));
        console.error(`[akun] ${this.byKey.size} akun dipulihkan dari cadangan ${backup}.`);
        this.touch();
        return true;
      } catch {
        this.byKey.clear();
        this.byToken.clear();
      }
    }
    console.log(`[akun] Belum ada data akun; file baru akan dibuat di ${this.file}`);
    return true;
  }

  /** Masukkan isi file ke memori; mengembalikan jumlah entri tidak sah yang dilewati. */
  private adopt(data: unknown): number {
    if (!isObj(data) || data.v !== 1 || !Array.isArray(data.accounts)) throw new Error('bentuk file tidak dikenal');
    const now = Date.now();
    let skipped = 0;
    for (const raw of data.accounts) {
      const pw = isObj(raw) ? raw.pw : null;
      const key = isObj(raw) && typeof raw.name === 'string' && !validateName(raw.name) ? nameKey(raw.name) : '';
      const pwOk =
        isObj(pw) &&
        pw.algo === 'scrypt' &&
        // parameter dibatasi: file yang diedit tangan tidak boleh membuat server memakai memori berlebihan
        [4096, 8192, 16384, 32768, 65536, 131072].includes(pw.n as number) &&
        Number.isInteger(pw.r) &&
        (pw.r as number) >= 1 &&
        (pw.r as number) <= 16 &&
        Number.isInteger(pw.p) &&
        (pw.p as number) >= 1 &&
        (pw.p as number) <= 4 &&
        isHex(pw.salt, 16) &&
        isHex(pw.hash, KEY_LEN);
      if (!isObj(raw) || !isObj(pw) || !key || !pwOk || this.byKey.has(key)) {
        skipped++;
        continue;
      }
      const tokens: StoredToken[] = [];
      if (Array.isArray(raw.tokens)) {
        for (const t of raw.tokens) {
          if (!isObj(t) || !isHex(t.h, 32) || typeof t.t !== 'number' || now - t.t > TOKEN_TTL || this.byToken.has(t.h)) continue;
          if (tokens.length < MAX_TOKENS) tokens.push({ h: t.h, t: t.t });
        }
      }
      const account: StoredAccount = {
        name: raw.name as string,
        created: typeof raw.created === 'number' && Number.isFinite(raw.created) ? raw.created : now,
        pw: { algo: 'scrypt', n: pw.n as number, r: pw.r as number, p: pw.p as number, salt: pw.salt as string, hash: pw.hash as string },
        tokens,
        profile: cleanProfile(raw.profile),
      };
      this.byKey.set(key, account);
      for (const t of tokens) this.byToken.set(t.h, key);
    }
    this.board = null;
    return skipped;
  }

  private serialise(): string {
    return JSON.stringify({ v: 1, saved: Date.now(), accounts: [...this.byKey.values()] });
  }

  /** Tandai ada perubahan; file ditulis sebentar lagi. */
  private touch(): void {
    this.dirty = true;
    if (!this.timer) this.timer = setTimeout(() => void this.write(), SAVE_DELAY);
  }

  /** Tulis ke file sementara lalu ganti nama: file utama tidak pernah berisi tulisan setengah jadi. */
  private async write(): Promise<void> {
    this.timer = null;
    if (this.writing || !this.dirty) return;
    this.writing = true;
    this.dirty = false;
    const tmp = this.file + '.tmp';
    try {
      const fh = await fs.promises.open(tmp, 'w');
      try {
        await fh.writeFile(this.serialise());
        await fh.sync();
      } finally {
        await fh.close();
      }
      await fs.promises.rename(tmp, this.file);
      this.failures = 0;
    } catch (e) {
      this.dirty = true;
      if (this.failures++ % 20 === 0) console.error(`[akun] Gagal menyimpan ${this.file}: ${(e as Error).message}`);
    } finally {
      this.writing = false;
      if (this.dirty && !this.timer) this.timer = setTimeout(() => void this.write(), this.failures ? 10_000 : SAVE_DELAY);
    }
  }

  /** Tulis sekarang juga (saat proses berhenti). */
  flushSync(): void {
    if (!this.usable || (!this.dirty && !this.writing)) return;
    try {
      const tmp = this.file + '.tmp-exit';
      fs.writeFileSync(tmp, this.serialise());
      fs.renameSync(tmp, this.file);
      this.dirty = false;
    } catch (e) {
      console.error(`[akun] Gagal menyimpan ${this.file} saat berhenti: ${(e as Error).message}`);
    }
  }

  // ---- akun

  private publicOf(a: StoredAccount): Account {
    return { name: a.name, created: a.created, profile: a.profile };
  }

  account(key: string): Account | null {
    const a = this.byKey.get(key);
    return a ? this.publicOf(a) : null;
  }

  /** Buat token sesi baru untuk akun ini; yang dikembalikan token aslinya, yang disimpan hash-nya. */
  private issueToken(key: string, a: StoredAccount): string {
    const token = crypto.randomBytes(32).toString('base64url');
    const h = sha256(token);
    a.tokens.push({ h, t: Date.now() });
    this.byToken.set(h, key);
    while (a.tokens.length > MAX_TOKENS) {
      const oldest = a.tokens.reduce((m, t) => (t.t < m.t ? t : m));
      a.tokens.splice(a.tokens.indexOf(oldest), 1);
      this.byToken.delete(oldest.h);
    }
    return token;
  }

  /**
   * Hitung hash kata sandi. Paling banyak MAX_HASHING hitungan berjalan bersamaan; sisanya antre,
   * dan bila antreannya sudah panjang permintaan ditolak (null) supaya memori dan CPU terjaga.
   */
  private async hash(password: string, salt: Buffer, pw: { n: number; r: number; p: number }): Promise<Buffer | null> {
    if (this.hashing < MAX_HASHING) this.hashing++;
    else if (this.queue.length >= MAX_QUEUED) return null;
    else await new Promise<void>((turn) => this.queue.push(turn)); // gilirannya diserahkan langsung oleh yang selesai
    try {
      return await scrypt(password, salt, pw);
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.hashing--;
    }
  }

  async register(rawName: unknown, password: unknown): Promise<SignIn> {
    if (typeof rawName !== 'string' || typeof password !== 'string' || rawName.length > 64 || password.length > PASSWORD_MAX) {
      return fail('Nama atau kata sandi tidak sah.');
    }
    const name = rawName.trim();
    const bad = validateName(name) ?? validatePassword(password);
    if (bad) return fail(bad);
    const key = nameKey(name);
    if (this.byKey.has(key) || this.reserved.has(key)) return fail('Nama itu sudah dipakai. Pilih nama lain, atau masuk bila itu akunmu.');
    if (this.byKey.size + this.reserved.size >= MAX_ACCOUNTS) return fail('Pendaftaran akun baru sedang ditutup: server sudah penuh.');
    this.reserved.add(key);
    try {
      const salt = crypto.randomBytes(16);
      const hash = await this.hash(password, salt, SCRYPT);
      if (!hash) return fail('Server sedang sibuk. Coba lagi sebentar.', 'busy');
      const a: StoredAccount = {
        name,
        created: Date.now(),
        pw: { algo: 'scrypt', ...SCRYPT, salt: salt.toString('hex'), hash: hash.toString('hex') },
        tokens: [],
        profile: emptyProfile(),
      };
      this.byKey.set(key, a);
      const token = this.issueToken(key, a);
      this.board = null;
      this.touch();
      console.log(`[akun] akun baru (total ${this.byKey.size})`);
      return { ok: true, key, account: this.publicOf(a), token };
    } finally {
      this.reserved.delete(key);
    }
  }

  async login(rawName: unknown, password: unknown): Promise<SignIn> {
    // pesan yang sama untuk nama tak dikenal dan sandi salah
    const wrong = fail('Nama atau kata sandi salah.');
    if (typeof rawName !== 'string' || typeof password !== 'string' || rawName.length > 64 || password.length > PASSWORD_MAX) return wrong;
    const key = nameKey(rawName);
    const a = this.byKey.get(key);
    // nama tak dikenal tetap dihitung hash-nya, supaya lama jawaban tidak membocorkan nama mana yang terdaftar
    const got = await this.hash(password, a ? Buffer.from(a.pw.salt, 'hex') : this.dummySalt, a ? a.pw : SCRYPT);
    if (!got) return fail('Server sedang sibuk. Coba lagi sebentar.', 'busy');
    if (!a) return wrong;
    const want = Buffer.from(a.pw.hash, 'hex');
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return wrong;
    const token = this.issueToken(key, a);
    this.touch();
    return { ok: true, key, account: this.publicOf(a), token };
  }

  /** Lanjutkan sesi dari token yang disimpan client. */
  resume(token: unknown): { key: string; account: Account } | null {
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
    const h = sha256(token);
    const key = this.byToken.get(h);
    const a = key ? this.byKey.get(key) : undefined;
    const entry = a?.tokens.find((t) => t.h === h);
    if (!key || !a || !entry) return null;
    const now = Date.now();
    if (now - entry.t > TOKEN_TTL) {
      this.dropToken(a, h);
      return null;
    }
    // waktu pakai cukup diperbarui sekali sehari, supaya tidak menulis file tiap halaman dimuat
    if (now - entry.t > 86_400_000) {
      entry.t = now;
      this.touch();
    }
    return { key, account: this.publicOf(a) };
  }

  private dropToken(a: StoredAccount, h: string): void {
    a.tokens = a.tokens.filter((t) => t.h !== h);
    this.byToken.delete(h);
    this.touch();
  }

  /** Cabut satu token sesi (keluar akun). */
  revoke(token: unknown): void {
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) return;
    const h = sha256(token);
    const key = this.byToken.get(h);
    const a = key ? this.byKey.get(key) : undefined;
    if (a) this.dropToken(a, h);
  }

  // ---- hasil pertandingan & papan peringkat

  /**
   * Catat satu pertandingan ke akun `key`. Hanya dipanggil server sendiri dari data simulasinya
   * (lihat index.ts): tidak ada event jaringan yang sampai ke sini.
   */
  recordMatch(key: string, rec: MatchResult): AccMatch | null {
    const a = this.byKey.get(key);
    if (!a) return null;
    const now = Date.now();
    const r = applyMatch(a.profile, rec, now, gameDay(now));
    this.board = null;
    this.touch();
    return { account: this.publicOf(a), xp: r.xp, missions: r.missions.map((m) => m.id), unlocked: r.unlocked.map((u) => u.id) };
  }

  private ranking(): { rows: BoardRow[]; rank: Map<string, number> } {
    if (!this.board) {
      const list = [...this.byKey.entries()].sort(
        ([, a], [, b]) => b.profile.xp - a.profile.xp || b.profile.wins - a.profile.wins || a.created - b.created || (a.name < b.name ? -1 : 1),
      );
      const rank = new Map<string, number>();
      const rows = list.map(([key, a], i): BoardRow => {
        rank.set(key, i + 1);
        return { rank: i + 1, name: a.name, level: accountLevel(a.profile.xp).level, xp: a.profile.xp, wins: a.profile.wins, matches: a.profile.matches };
      });
      this.board = { rows, rank };
    }
    return this.board;
  }

  /** Peringkat teratas menurut XP akun, ditambah baris akun `key` sendiri bila ada. */
  leaderboard(key: string | null): AccBoard {
    const b = this.ranking();
    const mine = key ? b.rank.get(key) : undefined;
    return { ok: true, top: b.rows.slice(0, BOARD_SIZE), me: mine ? b.rows[mine - 1] : null, total: b.rows.length };
  }
}

/** Buka penyimpanan akun di DATA_DIR (bawaan: <folder kerja>/astra-legion-data). */
export function openAccounts(): AccountDb {
  return new AccountDb(path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'astra-legion-data')));
}

// ------------------------------------------------------------ pembatas laju

/** Pembatas jendela-tetap: paling banyak `max` kejadian per `windowMs` untuk tiap kunci. */
class Limiter {
  private slots = new Map<string, { n: number; until: number }>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  /** Detik sampai kunci ini boleh mencoba lagi; 0 = boleh sekarang. */
  wait(key: string, now = Date.now()): number {
    const s = this.slots.get(key);
    if (!s || now >= s.until) return 0;
    return s.n >= this.max ? Math.max(1, Math.ceil((s.until - now) / 1000)) : 0;
  }

  /** Catat satu kejadian untuk kunci ini. */
  hit(key: string, now = Date.now()): void {
    const s = this.slots.get(key);
    if (s && now < s.until) s.n++;
    else {
      this.slots.delete(key);
      this.slots.set(key, { n: 1, until: now + this.windowMs });
      if (this.slots.size > 20_000) this.prune(now);
    }
  }

  clear(key: string): void {
    this.slots.delete(key);
  }

  /** Jaga ukuran memori: buang yang sudah lewat, lalu yang paling lama bila masih terlalu banyak. */
  private prune(now: number): void {
    for (const [k, s] of this.slots) if (now >= s.until) this.slots.delete(k);
    let extra = this.slots.size - 15_000;
    for (const k of this.slots.keys()) {
      if (extra-- <= 0) break;
      this.slots.delete(k);
    }
  }
}

/** Percobaan masuk/daftar per alamat IP. */
const authByIp = new Limiter(20, 10 * 60_000);
/** Akun baru per alamat IP (longgar: satu jaringan seluler/kantor bisa berisi banyak pemain). */
const registerByIp = new Limiter(5, 60 * 60_000);
/** Akun baru di seluruh server. */
const registerGlobal = new Limiter(120, 60 * 60_000);
/** Gagal masuk per nama akun, dari alamat mana pun (menebak sandi dari banyak alamat sekaligus). */
const failByName = new Limiter(8, 15 * 60_000);

/** Percobaan masuk/daftar per socket per menit, dan semua event akun per socket per 10 detik. */
const SOCKET_AUTH_MAX = 6;
const SOCKET_EVENT_MAX = 30;

const LOOPBACK_PEER = /^(127\.|::1$|::ffff:127\.)/;
let warnedNoForward = false;

/**
 * Alamat client untuk pembatas laju. Di belakang reverse proxy (web hosting), alamat aslinya ada
 * di entri paling kanan X-Forwarded-For, yaitu yang ditambahkan proxy itu sendiri (entri di
 * sebelah kirinya dikirim client dan bisa dipalsukan), atau di X-Real-IP. Header itu hanya
 * dipercaya bila server memang berada di belakang proxy: hosting memberi variabel IP, atau
 * sambungannya datang dari mesin ini sendiri. TRUST_PROXY=1 / TRUST_PROXY=0 memaksa salah satunya.
 *
 * Mengembalikan '' bila server ada di belakang proxy tetapi proxy itu tidak meneruskan alamat
 * client: semua pemain akan tampak datang dari satu alamat, jadi pembatas per alamat dilewati
 * (pembatas per sambungan, per nama akun, dan pendaftaran seluruh server tetap berlaku).
 */
export function clientIp(socket: Socket): string {
  const peer = String(socket.handshake.address ?? '');
  const trust = process.env.TRUST_PROXY === '1' || (process.env.TRUST_PROXY !== '0' && (!!process.env.IP || LOOPBACK_PEER.test(peer)));
  let ip = peer;
  if (trust) {
    const headers = socket.handshake.headers;
    const last = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(',') : (v ?? '')).split(',').pop()?.trim() ?? '';
    const forwarded = last(headers['x-forwarded-for']) || last(headers['x-real-ip']);
    if (forwarded) ip = forwarded;
    else if (process.env.IP) {
      if (!warnedNoForward) {
        warnedNoForward = true;
        // hanya nama header (tanpa isinya), untuk mencari tahu header mana yang dipakai proxy ini
        console.error(
          `[akun] Proxy hosting tidak meneruskan alamat client (X-Forwarded-For / X-Real-IP): pembatas per alamat IP dilewati. Header yang diterima: ${Object.keys(headers).sort().join(', ')}`,
        );
      }
      return '';
    }
  }
  ip = ip
    .toLowerCase()
    .replace(/^::ffff:/, '')
    .replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, '$1') // sebagian proxy menulis "alamat:port"
    .slice(0, 64);
  if (ip.includes(':')) {
    // IPv6: satu pelanggan biasanya memegang satu blok /64, jadi blok itulah yang dibatasi
    const [head, tail = ''] = ip.split('::');
    const left = head ? head.split(':') : [];
    const right = tail ? tail.split(':') : [];
    const full = ip.includes('::') ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left;
    ip = full.slice(0, 4).join(':') + '::/64';
  }
  return ip || 'tak-dikenal';
}

// ---------------------------------------------------------- event Socket.IO

/** Akun yang sedang masuk di satu socket. */
export interface Seat {
  /** Kunci akun, atau null (tamu). */
  key(): string | null;
  /** Nama akun seperti saat didaftarkan, atau null (tamu). */
  name(): string | null;
}

/**
 * Pasang event akun pada satu socket. `onSignOut` dipanggil saat pemain keluar dari akunnya,
 * supaya pertandingan yang sedang ia mainkan tidak lagi dicatat ke akun itu.
 */
export function serveAccounts(socket: Socket, db: AccountDb, onSignOut: () => void): Seat {
  let key: string | null = null;
  const ip = clientIp(socket);
  let eventsStart = 0;
  let events = 0;
  let authStart = 0;
  let auths = 0;
  let busy = false;

  const rate = (seconds: number, what = 'Terlalu banyak percobaan.') => {
    const when = seconds >= 90 ? `${Math.ceil(seconds / 60)} menit` : `${seconds} detik`;
    return fail(`${what} Coba lagi dalam ${when}.`, 'rate', seconds);
  };

  /** Semua event akun memakai acknowledgement; tanpa itu permintaannya diabaikan. */
  const on = (event: string, handler: (data: Record<string, unknown>) => unknown) => {
    socket.on(event, async (...args: unknown[]) => {
      const ack = args[args.length - 1];
      if (typeof ack !== 'function') return;
      const now = Date.now();
      if (now - eventsStart > 10_000) {
        eventsStart = now;
        events = 0;
      }
      let out: unknown;
      if (++events > SOCKET_EVENT_MAX) out = rate(Math.ceil((eventsStart + 10_000 - now) / 1000), 'Terlalu banyak permintaan.');
      else if (!db.usable) out = fail('Akun online tidak tersedia di server ini.');
      else {
        try {
          out = await handler(isObj(args[0]) ? args[0] : {});
        } catch (e) {
          // hanya pesan galatnya; isi permintaan (yang bisa memuat kata sandi) tidak pernah dicatat
          console.error(`[akun] galat pada ${event}: ${e instanceof Error ? e.message : 'tidak dikenal'}`);
          out = fail('Terjadi kesalahan di server. Coba lagi.');
        }
      }
      ack(out);
    });
  };

  /** Pembatas percobaan masuk/daftar: per socket dan per alamat IP. Mengembalikan detik tunggu, 0 = boleh. */
  const authGate = (): number => {
    const now = Date.now();
    if (now - authStart > 60_000) {
      authStart = now;
      auths = 0;
    }
    if (++auths > SOCKET_AUTH_MAX) return Math.max(1, Math.ceil((authStart + 60_000 - now) / 1000));
    if (!ip) return 0; // alamat client tidak diketahui: lihat clientIp
    const wait = authByIp.wait(ip, now);
    if (!wait) authByIp.hit(ip, now);
    return wait;
  };

  const signedIn = (r: { key: string; account: Account; token?: string }): AccSignedIn => {
    key = r.key;
    return { ok: true, account: r.account, ...(r.token ? { token: r.token } : {}), now: Date.now() };
  };

  on('acc:hello', (): AccHello => ({ ok: true, v: ACC_PROTOCOL, now: Date.now() }));

  on('acc:register', async (d) => {
    if (busy) return fail('Permintaan sebelumnya masih diproses.', 'busy');
    const wait = authGate() || (ip ? registerByIp.wait(ip) : 0) || registerGlobal.wait('*');
    if (wait) return rate(wait);
    busy = true;
    try {
      const r = await db.register(d.name, d.password);
      if (!r.ok) return r;
      if (ip) registerByIp.hit(ip);
      registerGlobal.hit('*');
      return signedIn(r);
    } finally {
      busy = false;
    }
  });

  on('acc:login', async (d) => {
    if (busy) return fail('Permintaan sebelumnya masih diproses.', 'busy');
    const wait = authGate();
    if (wait) return rate(wait);
    const name = typeof d.name === 'string' ? nameKey(d.name.slice(0, 64)) : '';
    const locked = failByName.wait(name);
    if (locked) return rate(locked, 'Terlalu banyak percobaan masuk yang gagal untuk nama ini.');
    busy = true;
    try {
      const r = await db.login(d.name, d.password);
      if (r.ok) {
        failByName.clear(name);
        return signedIn(r);
      }
      if (!r.code) failByName.hit(name);
      return r;
    } finally {
      busy = false;
    }
  });

  on('acc:resume', (d) => {
    const r = db.resume(d.token);
    return r ? signedIn(r) : fail('Sesi berakhir. Silakan masuk lagi.', 'session');
  });

  on('acc:logout', (d) => {
    db.revoke(d.token);
    if (key) {
      key = null;
      onSignOut();
    }
    return { ok: true };
  });

  on('acc:board', () => db.leaderboard(key));

  return {
    key: () => key,
    name: () => (key ? (db.account(key)?.name ?? null) : null),
  };
}
