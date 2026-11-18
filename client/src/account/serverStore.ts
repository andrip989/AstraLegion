// Akun online: disimpan di server game dan dipakai lewat sambungan Socket.IO lobby (ServerLink).
//
// Yang dipegang perangkat ini hanya token sesi (supaya tetap masuk setelah halaman dimuat ulang)
// dan salinan terakhir akunnya (supaya nama, level, dan skin tetap tampil saat offline). Hasil
// pertandingan TIDAK dikirim dari sini: server mencatatnya sendiri lalu mengabari lewat event
// "acc:match". Semua yang datang dari server dibersihkan dulu (cleanAccount, id yang dikenal)
// sebelum dipakai, karena alamat server bisa diisi pemain sendiri.
import {
  ACHIEVEMENTS,
  cleanAccount,
  gameDay,
  matchXp,
  missionById,
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
  type MatchOutcome,
  type MatchResult,
} from '../../../shared/src';
import type { ServerLink } from '../net/transport';
import type { AccountStore, AuthResult } from './accounts';

const SAVED_KEY = 'astra.online.v1';
const NO_REPLY = 'Server tidak merespons. Periksa sambunganmu, lalu coba lagi.';

/** Sesi yang diingat perangkat: server tempat sesi itu dibuat, tokennya, dan salinan akunnya. */
interface Saved {
  server: string;
  token: string;
  account: Account;
}

export interface Leaderboard {
  top: BoardRow[];
  /** Baris akun sendiri (null bila bermain sebagai tamu). */
  me: BoardRow | null;
  total: number;
}

const int = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
const idList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 32) : []);

function loadSaved(): Saved | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) ?? 'null') as Partial<Saved> | null;
    const account = cleanAccount(raw?.account);
    if (raw && typeof raw.server === 'string' && typeof raw.token === 'string' && account) return { server: raw.server, token: raw.token, account };
  } catch {
    /* data rusak / penyimpanan tidak tersedia: dianggap belum masuk */
  }
  return null;
}

export class ServerAccountStore implements AccountStore {
  readonly kind = 'server';
  private link: ServerLink | null = null;
  private saved = loadSaved();
  /** Akun yang sedang masuk di server yang tersambung sekarang. */
  private account: Account | null = null;
  /** Selisih jam server dan jam perangkat (ms), untuk menentukan hari permainan. */
  private skew = 0;
  /** Hasil pertandingan dari server yang belum diambil recordMatch. */
  private pending: AccMatch | null = null;
  private pendingTimer = 0;
  private waiter: ((m: AccMatch | null) => void) | null = null;
  /** Nomor urut attach; attach yang sudah digantikan tidak boleh mengubah apa pun. */
  private turn = 0;

  /** Tersambung ke server yang mendukung akun online. */
  get linked(): boolean {
    return this.link !== null;
  }

  /** Perangkat ini masih mengingat sesi akun online (dipakai untuk tampil saat offline). */
  hasSaved(): boolean {
    return this.saved !== null;
  }

  current(): Account | null {
    return this.link ? this.account : (this.saved?.account ?? null);
  }

  today(): string {
    return gameDay(Date.now() + this.skew);
  }

  private persist(): void {
    try {
      if (this.saved) localStorage.setItem(SAVED_KEY, JSON.stringify(this.saved));
      else localStorage.removeItem(SAVED_KEY);
    } catch {
      /* penyimpanan tidak tersedia: sesi hanya bertahan sampai halaman ditutup */
    }
  }

  private setAccount(account: Account, token?: string): void {
    this.account = account;
    if (!this.link) return;
    if (token) this.saved = { server: this.link.endpoint, token, account };
    else if (this.saved?.server === this.link.endpoint) this.saved.account = account;
    else return;
    this.persist();
  }

  /**
   * Pakai sambungan lobby yang baru. Menanyakan dulu apakah servernya mendukung akun, lalu
   * melanjutkan sesi yang tersimpan (hanya bila sesi itu memang dibuat di server ini).
   *   'in' sudah masuk · 'out' belum masuk · 'expired' sesi tersimpan ditolak · 'unsupported' server lama
   */
  async attach(link: ServerLink): Promise<'in' | 'out' | 'expired' | 'unsupported'> {
    const turn = ++this.turn;
    // Selama perkenalan berlangsung store ini masih "belum tersambung", jadi current() tetap
    // memberi salinan akun yang tersimpan dan tampilan lobby tidak berkedip menjadi tamu.
    this.reset();
    const hello = await link.request<AccHello | AccFail>('acc:hello', {}, 2500);
    if (turn !== this.turn || !hello?.ok) return 'unsupported';
    let state: 'in' | 'out' | 'expired' = 'out';
    let account: Account | null = null;
    const saved = this.saved;
    if (saved?.server === link.endpoint) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await link.request<AccSignedIn | AccFail>('acc:resume', { token: saved.token }, 4000);
        if (turn !== this.turn) return 'unsupported'; // sambungan sudah diganti selagi menunggu
        if (r?.ok) {
          account = cleanAccount(r.account);
          if (account) state = 'in';
          break;
        }
        if (r?.code === 'session') {
          this.saved = null;
          this.persist();
          state = 'expired';
        }
        if (r) break; // 'session', atau ditolak sementara (mis. pembatas laju): sesi tetap disimpan untuk lain kali
      }
    }
    this.link = link;
    this.skew = (Number(hello.now) || Date.now()) - Date.now();
    link.on('acc:match', (data) => this.onMatch(data));
    link.reauth = (request) => {
      const mine = this.link === link && this.account ? this.saved : null;
      return mine?.server === link.endpoint ? request('acc:resume', { token: mine.token }, 2500) : Promise.resolve(null);
    };
    if (account) this.setAccount(account);
    return state;
  }

  /** Sambungan ke server hilang (offline). */
  detach(): void {
    this.turn++;
    this.reset();
  }

  private reset(): void {
    this.link = null;
    this.account = null;
    this.pending = null;
    clearTimeout(this.pendingTimer);
    this.waiter?.(null);
    this.waiter = null;
  }

  private async auth(event: 'acc:register' | 'acc:login', name: string, password: string): Promise<AuthResult> {
    if (!this.link) return { ok: false, error: 'Tidak tersambung ke server. Akun online hanya bisa dipakai saat online.' };
    const r = await this.link.request<AccSignedIn | AccFail>(event, { name, password }, 12_000);
    if (!r) return { ok: false, error: NO_REPLY };
    if (!r.ok) return { ok: false, error: typeof r.error === 'string' && r.error ? r.error.slice(0, 200) : 'Permintaan ditolak server.' };
    const account = cleanAccount(r.account);
    if (!account || typeof r.token !== 'string' || !this.link) return { ok: false, error: 'Jawaban server tidak dikenal.' };
    this.setAccount(account, r.token);
    return { ok: true, account };
  }

  async register(name: string, password: string): Promise<AuthResult> {
    name = name.trim();
    const bad = validateName(name) ?? validatePassword(password);
    if (bad) return { ok: false, error: bad };
    return this.auth('acc:register', name, password);
  }

  login(name: string, password: string): Promise<AuthResult> {
    return this.auth('acc:login', name.trim(), password);
  }

  async logout(): Promise<void> {
    if (this.link) {
      // tersambung: cabut token sesi server ini (bila ada); sesi server lain tidak disentuh
      if (this.saved?.server === this.link.endpoint) {
        await this.link.request('acc:logout', { token: this.saved.token }, 3000);
        this.saved = null;
        this.persist();
      }
    } else if (this.saved) {
      // offline: tokennya cukup dilupakan perangkat ini (server membuangnya sendiri setelah lama tak dipakai)
      this.saved = null;
      this.persist();
    }
    this.account = null;
    this.pending = null;
  }

  // ---- hasil pertandingan

  /** Server mengabari hasil pertandingan yang baru selesai. */
  private onMatch(raw: unknown): void {
    const m = (raw ?? {}) as Partial<AccMatch>;
    const account = cleanAccount(m.account);
    // hanya untuk akun yang sedang masuk di sini
    if (!account || !this.account || nameKey(account.name) !== nameKey(this.account.name)) return;
    const clean: AccMatch = { account, xp: int(m.xp), missions: idList(m.missions), unlocked: idList(m.unlocked), ...(m.skipped === 'short' || m.skipped === 'afk' ? { skipped: m.skipped } : {}) };
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = null;
      waiter(clean);
      return;
    }
    // Akun baru diperbarui saat layar akhir pertandingan mengambilnya (supaya ia bisa membandingkan
    // level sebelum dan sesudah); bila tidak ada yang mengambil, tetap diterapkan sebentar lagi.
    this.pending = clean;
    clearTimeout(this.pendingTimer);
    this.pendingTimer = window.setTimeout(() => {
      if (this.pending) this.setAccount(this.pending.account);
      this.pending = null;
    }, 8000);
  }

  private outcome(m: AccMatch): MatchOutcome {
    this.setAccount(m.account);
    const out: MatchOutcome = { account: m.account, xp: m.xp, missions: [], unlocked: [] };
    if (m.skipped) {
      out.skipped =
        m.skipped === 'afk'
          ? 'Kamu hampir tidak ikut bermain di pertandingan ini, jadi hasilnya tidak dicatat ke akun.'
          : 'Kamu bergabung kurang dari 2 menit sebelum pertandingan selesai, jadi hasilnya tidak dicatat ke akun.';
      return out;
    }
    // server hanya mengirim id; teksnya diambil dari daftar milik client sendiri
    for (const id of m.missions) {
      const mission = missionById(id);
      if (mission) out.missions.push({ text: mission.text, xp: mission.xp });
    }
    for (const id of m.unlocked) {
      const name = ACHIEVEMENTS.find((a) => a.id === id)?.name;
      if (name) out.unlocked.push(name);
    }
    return out;
  }

  /**
   * Pertandingan online dicatat SERVER dari datanya sendiri; di sini client hanya menunggu
   * kabarnya. `rec` (hitungan client) tidak dikirim ke mana pun. Pertandingan offline dengan
   * akun online adalah latihan dan tidak dicatat.
   */
  async recordMatch(rec: MatchResult): Promise<MatchOutcome> {
    const none = { xp: 0, missions: [], unlocked: [] };
    if (rec.mode !== 'online') return { account: this.current(), ...none, skipped: 'Latihan offline: hasil pertandingan ini tidak dicatat ke akun online.' };
    if (!this.link) return { account: this.current(), ...none, skipped: 'Server ini belum mendukung akun online, jadi hasil pertandingan ini tidak dicatat.' };
    if (!this.account) return { account: null, ...none, xp: matchXp(rec) }; // tamu
    let m = this.pending;
    this.pending = null;
    clearTimeout(this.pendingTimer);
    if (!m) {
      m = await new Promise<AccMatch | null>((resolve) => {
        this.waiter = resolve;
        setTimeout(() => {
          if (this.waiter !== resolve) return;
          this.waiter = null;
          resolve(null);
        }, 6000);
      });
    }
    if (!m) return { account: this.account, ...none, skipped: 'Kabar dari server belum diterima. Bila tercatat, hasilnya akan terlihat di profilmu.' };
    return this.outcome(m);
  }

  // ---- papan peringkat

  /** Papan peringkat dari server: 'offline' bila tidak tersambung, 'error' bila server tidak menjawab. */
  async leaderboard(): Promise<Leaderboard | 'offline' | 'error'> {
    if (!this.link) return 'offline';
    const r = await this.link.request<AccBoard | AccFail>('acc:board', {}, 6000);
    if (!r?.ok || !Array.isArray(r.top)) return 'error';
    const row = (x: unknown): BoardRow | null => {
      const b = (x ?? {}) as Partial<BoardRow>;
      if (typeof b.name !== 'string' || validateName(b.name)) return null;
      return { rank: int(b.rank), name: b.name, level: int(b.level), xp: int(b.xp), wins: int(b.wins), matches: int(b.matches) };
    };
    return { top: r.top.slice(0, 50).map(row).filter((b): b is BoardRow => b !== null), me: row(r.me), total: int(r.total) };
  }
}
