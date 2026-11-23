// Koin, hadiah masuk harian, dan toko kosmetik akun online. Logika murni (tanpa DOM maupun API
// Node): tabel dan hitungannya dipakai server (yang memutuskan) dan client (yang menampilkan).
//
// Koin hanya ada di akun online dan hanya diubah server: dari pertandingan online yang ia catat
// sendiri, misi harian, hadiah masuk harian, dan hadiah akhir musim (season.ts). Client tidak
// punya event untuk mengirim koin maupun kepemilikan barang.
import { SKINS, skinItemId } from './skins';
import { EMOTES, FREE_EMOTES } from './types';

// ---------------------------------------------------------------------- koin

/** Koin dari satu pertandingan online yang dicatat: menang / kalah. */
export const COINS_WIN = 30;
export const COINS_LOSS = 12;
/** Mode Kilat lebih singkat, jadi koinnya dikalikan ini (dibulatkan). */
export const COINS_QUICK = 0.6;
/** Koin untuk tiap misi harian yang tercapai. */
export const COINS_MISSION = 15;
/** Batas atas saldo (supaya angkanya selalu aman disimpan dan ditampilkan). */
export const COINS_MAX = 1e9;

/** Koin dari satu pertandingan online yang dicatat penuh (bukan dilewati, keluar, atau diam). */
export function matchCoins(win: boolean, quick: boolean): number {
  return Math.round((win ? COINS_WIN : COINS_LOSS) * (quick ? COINS_QUICK : 1));
}

// ------------------------------------------------------- hadiah masuk harian
//
// Satu klaim per hari permainan (gameDay, berganti pukul 00.00 WIB). Klaim di hari yang
// berurutan menaikkan streak; hadiahnya naik sampai hari ke-7 lalu tetap di situ sampai ada hari
// yang terlewat, dan saat itu kembali ke hari ke-1. Hari dan streak diputuskan server.

/** Hadiah koin untuk hari ke-1 sampai ke-7 dalam satu streak. */
export const LOGIN_REWARDS = [20, 30, 40, 50, 60, 80, 120] as const;

/** Keadaan hadiah harian sebuah akun (Profile.login). */
export interface LoginState {
  /** Hari permainan klaim terakhir (YYYY-MM-DD). */
  day: string;
  /** Jumlah hari berturut-turut sampai klaim terakhir itu. */
  streak: number;
  /** Streak terpanjang yang pernah dicapai (untuk gelar). */
  best: number;
}

/** Hari permainan sebelum `day` (keduanya YYYY-MM-DD). */
export function dayBefore(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, (m || 1) - 1, d || 1) - 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Hadiah untuk klaim yang membuat streak menjadi `streak` hari. */
export function loginReward(streak: number): number {
  return LOGIN_REWARDS[Math.max(1, Math.min(LOGIN_REWARDS.length, Math.floor(streak))) - 1];
}

export interface LoginView {
  /** Hadiah hari ini sudah diklaim. */
  claimed: boolean;
  /** Streak sesudah klaim hari ini (sudah diklaim: streak sekarang; belum: streak yang akan didapat). */
  streak: number;
  /** Hadiah hari ini (yang sudah atau yang akan didapat). */
  coins: number;
  /** Hadiah besok bila streak-nya tidak putus. */
  next: number;
}

/** Keadaan hadiah harian pada hari permainan `today`, untuk ditampilkan. */
export function loginView(state: LoginState | undefined, today: string): LoginView {
  // klaim terakhir bertanggal sesudah hari ini (jam mundur): dianggap sudah diklaim
  const claimed = !!state && state.day >= today;
  const streak = claimed ? state.streak : state && state.day === dayBefore(today) ? state.streak + 1 : 1;
  return { claimed, streak, coins: loginReward(streak), next: loginReward(streak + 1) };
}

/**
 * Klaim hadiah harian untuk hari permainan `today` ke profil `p` (diubah langsung). Klaim kedua
 * di hari yang sama tidak mengubah apa pun (`already`).
 */
export function claimLogin(p: { coins: number; login?: LoginState }, today: string): { coins: number; streak: number; already?: true } {
  const view = loginView(p.login, today);
  if (view.claimed) return { coins: 0, streak: p.login?.streak ?? 0, already: true };
  p.login = { day: today, streak: view.streak, best: Math.max(p.login?.best ?? 0, view.streak) };
  p.coins = Math.min(COINS_MAX, p.coins + view.coins);
  return { coins: view.coins, streak: view.streak };
}

// ---------------------------------------------------------------------- toko

export interface ShopItem {
  /** Yang dicatat di daftar milik akun (Profile.owned). */
  id: string;
  kind: 'skin' | 'emotes';
  name: string;
  desc: string;
  /** Harga dalam koin. */
  price: number;
  /** Untuk kind 'skin': indeks di SKINS. */
  skin?: number;
}

/** Id barang paket emote. */
export const EMOTE_PACK = 'emotes';

/** Semua yang dijual di toko. Gelar dan bingkai tidak dijual (lihat titles.ts dan season.ts). */
export const SHOP_ITEMS: readonly ShopItem[] = [
  ...SKINS.filter((s) => s.price !== undefined).map(
    (s): ShopItem => ({ id: skinItemId(s.id), kind: 'skin', name: `Skin ${s.name}`, desc: 'Skin warna premium. Berlaku untuk semua hero.', price: s.price ?? 0, skin: s.id }),
  ),
  {
    id: EMOTE_PACK,
    kind: 'emotes',
    name: 'Paket emote',
    desc: `${EMOTES.length - FREE_EMOTES} emote tambahan untuk pertandingan online: ${EMOTES.slice(FREE_EMOTES).join(' ')}`,
    price: 250,
  },
];

export function shopItem(id: unknown): ShopItem | undefined {
  return typeof id === 'string' ? SHOP_ITEMS.find((i) => i.id === id) : undefined;
}

/** Jumlah emote yang boleh dipakai akun dengan daftar barang `owned` (awal daftar EMOTES). */
export function emotesOwned(owned: readonly string[]): number {
  return owned.includes(EMOTE_PACK) ? EMOTES.length : FREE_EMOTES;
}
