// Daftar teman akun online: batasan, bentuk data, dan protokol "fr:*" client <-> server. Logika
// murni (tanpa DOM maupun API Node), dipakai client dan server.
//
// Tidak ada pesan bebas di fitur ini: yang berpindah hanya nama akun, poin peringkat, id gelar,
// status, dan kode room. Semua yang diterima client dibersihkan dulu dengan cleanFriendList / cleanInvite.
import { ITEM_ID, validateName, nameKey } from './account';
import { roomCode } from './types';

/** Teman paling banyak per akun. */
export const FRIENDS_MAX = 50;
/** Permintaan yang masih menunggu, per akun; yang masuk dan yang terkirim dihitung terpisah. */
export const FRIEND_REQUESTS_MAX = 20;

/** Kehadiran teman: tidak tersambung, tersambung tetapi tidak bertanding, atau sedang di pertandingan. */
export type FriendStatus = 'offline' | 'lobby' | 'playing';
export const FRIEND_STATUS_TEXT: Record<FriendStatus, string> = { offline: 'Offline', lobby: 'Di lobby', playing: 'Sedang bermain' };

export interface FriendRow {
  name: string;
  /** Poin peringkat (untuk lencana tier). */
  rp: number;
  status: FriendStatus;
  /** Gelar yang dipasang teman itu (id di TITLES, lihat titles.ts); tidak ada bila tanpa gelar. */
  title?: string;
}

export interface FriendRequestRow {
  name: string;
  rp: number;
}

export interface FriendList {
  friends: FriendRow[];
  /** Permintaan dari pemain lain yang belum dijawab. */
  incoming: FriendRequestRow[];
  /**
   * Nama yang dikirimi permintaan, persis seperti diketik. Nama yang tidak ada akunnya tetap
   * tercantum di sini, supaya daftar ini tidak membocorkan nama mana yang terdaftar.
   */
  outgoing: string[];
}

export const emptyFriendList = (): FriendList => ({ friends: [], incoming: [], outgoing: [] });

// ---------------------------------------------------------------- protokol
//
// Permintaan client (semuanya dengan acknowledgement, hanya untuk socket yang sudah masuk akun):
//   fr:list    {}              -> FrReply | AccFail   daftar teman, permintaan masuk dan terkirim
//   fr:add     { name }        -> FrReply | AccFail   kirim permintaan pertemanan ke nama akun itu
//   fr:accept  { name }        -> FrReply | AccFail   terima permintaan masuk
//   fr:decline { name }        -> FrReply | AccFail   tolak permintaan masuk (pengirimnya tidak dikabari)
//   fr:cancel  { name }        -> FrReply | AccFail   batalkan permintaan yang dikirim
//   fr:remove  { name }        -> FrReply | AccFail   hapus teman (berlaku untuk kedua pihak)
//   fr:invite  { name, room }  -> { ok: true } | AccFail   undang teman yang sedang di lobby ke room itu
// Kabar dari server (tanpa diminta):
//   fr:update   FriendList     daftar akun ini berubah karena tindakan pemain lain
//   fr:presence FrPresence     status seorang teman berubah
//   fr:invite   FrInvite       seorang teman mengundang ke room-nya
//
// fr:add menjawab sama untuk nama yang terdaftar maupun tidak (info 'sent'), dan namanya masuk
// ke `outgoing` di kedua keadaan itu.

export interface FrReply {
  ok: true;
  list: FriendList;
  /** Hanya dari fr:add. 'sent': permintaan dicatat · 'friends': orang itu sudah lebih dulu meminta, jadi langsung berteman. */
  info?: 'sent' | 'friends';
}

export interface FrPresence {
  name: string;
  status: FriendStatus;
}

export interface FrInvite {
  /** Nama akun teman yang mengundang. */
  from: string;
  /** Kode room pribadi (bentuk baku roomCode). */
  room: string;
}

// ------------------------------------------------------------- pembersihan

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const points = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1e9, Math.floor(v))) : 0);
const goodName = (v: unknown): v is string => typeof v === 'string' && !validateName(v);

export function cleanFriendStatus(v: unknown): FriendStatus {
  return v === 'lobby' || v === 'playing' ? v : 'offline';
}

/**
 * Daftar teman dari data yang tidak dipercaya (jawaban server): hanya nama akun yang sah, angka
 * bulat tak negatif, status yang dikenal, tanpa nama ganda, dan tidak melebihi batas jumlah.
 */
export function cleanFriendList(raw: unknown): FriendList {
  const out = emptyFriendList();
  if (!isObj(raw)) return out;
  const each = (list: unknown, max: number, add: (item: unknown, seen: Set<string>) => void) => {
    if (!Array.isArray(list)) return;
    const seen = new Set<string>();
    for (const item of list.slice(0, max)) add(item, seen);
  };
  const fresh = (name: string, seen: Set<string>) => {
    const key = nameKey(name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
  each(raw.friends, FRIENDS_MAX, (f, seen) => {
    if (!isObj(f) || !goodName(f.name) || !fresh(f.name, seen)) return;
    const row: FriendRow = { name: f.name, rp: points(f.rp), status: cleanFriendStatus(f.status) };
    // gelar: hanya id; teksnya diambil client dari tabel gelarnya sendiri
    if (typeof f.title === 'string' && ITEM_ID.test(f.title)) row.title = f.title;
    out.friends.push(row);
  });
  each(raw.incoming, FRIEND_REQUESTS_MAX, (r, seen) => {
    if (isObj(r) && goodName(r.name) && fresh(r.name, seen)) out.incoming.push({ name: r.name, rp: points(r.rp) });
  });
  each(raw.outgoing, FRIEND_REQUESTS_MAX, (n, seen) => {
    if (goodName(n) && fresh(n, seen)) out.outgoing.push(n);
  });
  return out;
}

/** Undangan dari data yang tidak dipercaya; null bila nama atau kode room-nya tidak sah. */
export function cleanInvite(raw: unknown): FrInvite | null {
  if (!isObj(raw) || !goodName(raw.from) || typeof raw.room !== 'string') return null;
  const room = roomCode(raw.room);
  return room && room === raw.room ? { from: raw.from, room } : null;
}

export function cleanPresence(raw: unknown): FrPresence | null {
  return isObj(raw) && goodName(raw.name) ? { name: raw.name, status: cleanFriendStatus(raw.status) } : null;
}
