// Daftar teman akun online, sisi client. Datanya ada di server; di sini hanya salinan terakhir
// yang diterima, permintaan ke server (event "fr:*", lihat shared/src/friends.ts), dan kabar yang
// didorong server: daftar berubah, status teman berubah, undangan ke room.
//
// Semua yang datang dari server dianggap tidak dipercaya (alamat server bisa diisi pemain
// sendiri): dibersihkan dulu dengan cleanFriendList / cleanPresence / cleanInvite, sehingga yang
// sampai ke tampilan hanya nama akun yang sah, angka, dan status yang dikenal.
import {
  cleanFriendList,
  cleanInvite,
  cleanPresence,
  emptyFriendList,
  nameKey,
  roomCode,
  validateName,
  type AccFail,
  type FrInvite,
  type FrReply,
  type FriendList,
} from '../../../shared/src';
import type { ServerLink } from '../net/transport';

export type FriendResult = { ok: true; info?: 'sent' | 'friends' } | { ok: false; error: string };

const NO_REPLY = 'Server tidak merespons. Periksa sambunganmu, lalu coba lagi.';
const NOT_AVAILABLE = 'Daftar teman hanya tersedia saat tersambung dengan akun online.';

export class Friends {
  private link: ServerLink | null = null;
  /** Kunci akun yang sedang masuk ('' = tidak ada). */
  private me = '';
  /** Naik tiap kali akun atau sambungan berganti; jawaban untuk yang lama diabaikan. */
  private turn = 0;
  private listeners = new Set<() => void>();

  /** Salinan terakhir dari server. */
  list: FriendList = emptyFriendList();
  /** Daftar sudah dimuat dari server sejak akun ini masuk. */
  loaded = false;
  /** Seorang teman mengundang ke room-nya. */
  onInvite: ((invite: FrInvite) => void) | null = null;

  /** Masuk akun online di server yang mendukung daftar teman. */
  get available(): boolean {
    return this.link !== null && this.me !== '';
  }

  /** Dipanggil tiap kali daftar berubah; mengembalikan fungsi untuk berhenti mendengarkan. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    for (const fn of [...this.listeners]) fn();
  }

  /** Pasang pendengar kabar server pada sambungan lobby yang baru. */
  listen(link: ServerLink): void {
    link.on('fr:update', (data) => {
      if (this.link === link) this.apply(data);
    });
    link.on('fr:presence', (data) => {
      const p = cleanPresence(data);
      const friend = p && this.link === link ? this.list.friends.find((f) => nameKey(f.name) === nameKey(p.name)) : undefined;
      if (!p || !friend || friend.status === p.status) return;
      friend.status = p.status;
      this.changed();
    });
    link.on('fr:invite', (data) => {
      if (this.link === link) void this.invited(data);
    });
  }

  /** Akun yang masuk berganti. `link` null: keluar akun, offline, atau server belum mendukung daftar teman. */
  bind(link: ServerLink | null, name: string | null): void {
    const me = link && name ? nameKey(name) : '';
    if ((me ? link : null) === this.link && me === this.me) return;
    this.turn++;
    this.link = me ? link : null;
    this.me = me;
    this.list = emptyFriendList();
    this.loaded = false;
    this.changed();
    if (me) void this.refresh();
  }

  private apply(raw: unknown): void {
    const list = cleanFriendList(raw);
    // diri sendiri tidak pernah ada di daftar mana pun
    list.friends = list.friends.filter((f) => nameKey(f.name) !== this.me);
    list.incoming = list.incoming.filter((r) => nameKey(r.name) !== this.me);
    this.list = list;
    this.loaded = true;
    this.changed();
  }

  /** Undangan hanya diteruskan bila pengirimnya memang ada di daftar teman yang dipegang client ini. */
  private async invited(raw: unknown): Promise<void> {
    const invite = cleanInvite(raw);
    if (!invite) return;
    const turn = this.turn;
    if (!this.loaded) await this.refresh();
    if (turn !== this.turn) return;
    const friend = this.list.friends.find((f) => nameKey(f.name) === nameKey(invite.from));
    if (friend) this.onInvite?.({ from: friend.name, room: invite.room });
  }

  private async call(event: string, data: Record<string, unknown>, keepList = false): Promise<FriendResult> {
    const link = this.link;
    const turn = this.turn;
    if (!link) return { ok: false, error: NOT_AVAILABLE };
    const r = await link.request<FrReply | AccFail>(event, data, 6000);
    if (!r) return { ok: false, error: NO_REPLY };
    if (!r.ok) return { ok: false, error: typeof r.error === 'string' && r.error ? r.error.slice(0, 200) : 'Permintaan ditolak server.' };
    if (!keepList && turn === this.turn) this.apply(r.list);
    return { ok: true, ...(r.info === 'friends' || r.info === 'sent' ? { info: r.info } : {}) };
  }

  /** Muat ulang daftar dari server. */
  async refresh(): Promise<boolean> {
    return (await this.call('fr:list', {})).ok;
  }

  /** Kirim permintaan pertemanan ke nama akun itu. Jawabannya sama untuk nama yang ada dan yang tidak. */
  add(name: string): Promise<FriendResult> {
    name = name.trim();
    const bad = validateName(name);
    if (bad) return Promise.resolve({ ok: false, error: bad });
    if (nameKey(name) === this.me) return Promise.resolve({ ok: false, error: 'Itu namamu sendiri.' });
    return this.call('fr:add', { name });
  }

  accept(name: string): Promise<FriendResult> {
    return this.call('fr:accept', { name });
  }
  decline(name: string): Promise<FriendResult> {
    return this.call('fr:decline', { name });
  }
  /** Batalkan permintaan yang dikirim. */
  cancel(name: string): Promise<FriendResult> {
    return this.call('fr:cancel', { name });
  }
  /** Hapus teman (berlaku untuk kedua pihak). */
  remove(name: string): Promise<FriendResult> {
    return this.call('fr:remove', { name });
  }

  /** Undang teman yang sedang di lobby ke room pribadi berkode `room`. */
  invite(name: string, room: string): Promise<FriendResult> {
    const code = roomCode(room);
    if (!code) return Promise.resolve({ ok: false, error: 'Isi kode room dulu sebelum mengundang teman.' });
    return this.call('fr:invite', { name, room: code }, true);
  }
}
