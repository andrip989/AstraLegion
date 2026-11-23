// Tampilan kecil untuk koin, gelar, bingkai, dan penguasaan hero. Semuanya digambar CSS (lihat
// account.css: ".coin", ".title-tag", ".framed", ".mastery"), jadi tidak ada file gambar. Teks yang
// dipakai di sini hanya berasal dari tabel milik client sendiri (TITLES, RANK_TIERS,
// MASTERY_LEVELS) dan angka, jadi aman dipakai sebagai HTML; yang datang dari server hanya id.
import { RANK_TIERS, heroMastery, titleById, type MasteryInfo } from '../../../shared/src';

/** Lambang koin. */
export const COIN = '<i class="coin"></i>';

/** Jumlah koin dengan lambangnya; `sign`: tulis "+" di depan (hadiah). */
export function coinText(n: number, sign = false): string {
  const v = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  return `<span class="coins">${COIN}${sign ? '+' : ''}${v.toLocaleString('id-ID')}</span>`;
}

/** Label gelar untuk id itu; '' bila id-nya tidak ada di tabel gelar (mis. dari server versi lain). */
export function titleTag(id: unknown): string {
  const t = titleById(id);
  return t ? `<span class="title-tag">${t.name}</span>` : '';
}

/** Kelas CSS bingkai untuk id tier itu (cincin berwarna tier); '' bila tanpa bingkai atau id tidak dikenal. */
export function frameClass(id: unknown): string {
  return typeof id === 'string' && RANK_TIERS.some((t) => t.id === id) ? ` framed t-${id}` : '';
}

/** Nama bingkai untuk id tier itu. */
export function frameName(id: string): string {
  const tier = RANK_TIERS.find((t) => t.id === id);
  return tier ? `Bingkai ${tier.name}` : '';
}

/**
 * Lencana penguasaan hero: belah ketupat berangka tingkat, berwarna menurut tingkatnya.
 * `withName`: nama tingkatnya ikut ditulis. Tingkat 0 (belum pernah dimainkan): tanpa lencana.
 */
export function masteryBadge(info: MasteryInfo, withName = true): string {
  if (info.level <= 0) return '';
  const tip = `Penguasaan ${info.name} (tingkat ${info.level} dari 5)${info.next ? ` · ${info.toNext} poin lagi menuju ${info.next.name}` : ''}`;
  return `<span class="mastery m${info.level}" title="${tip}"><i>${info.level}</i>${withName ? info.name : ''}</span>`;
}

/** Lencana penguasaan untuk statistik satu hero di profil. */
export function masteryFor(stats: { games: number; wins: number } | undefined, withName = true): string {
  return masteryBadge(heroMastery(stats), withName);
}
