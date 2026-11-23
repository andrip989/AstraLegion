// Gelar: teks pendek di bawah nama pemain (profil, papan peringkat, daftar teman; tidak tampil di
// dalam pertandingan). Tiap gelar terbuka lewat sesuatu yang dicatat server sendiri di profil akun
// online; gelar tidak dijual. Pemain memilih satu dari yang sudah terbuka (event acc:equip), dan
// server memeriksa syaratnya. Yang berpindah lewat jaringan hanya id gelar; teksnya selalu
// diambil dari tabel ini. Logika murni (tanpa DOM maupun API Node).
import { RANK_TIERS, type Profile } from './account';

export interface Title {
  id: string;
  name: string;
  /** Cara membukanya. */
  desc: string;
  goal: number;
  /** Nilai yang dibandingkan dengan `goal`; semuanya angka yang tidak pernah turun. */
  value(p: Profile): number;
}

const tierMin = (id: string): number => RANK_TIERS.find((t) => t.id === id)?.min ?? Infinity;

export const TITLES: readonly Title[] = [
  { id: 'prajurit', name: 'Prajurit Astra', desc: 'Menangkan 5 pertandingan online', goal: 5, value: (p) => p.wins },
  { id: 'veteran', name: 'Veteran', desc: 'Mainkan 25 pertandingan online', goal: 25, value: (p) => p.matches },
  { id: 'penakluk', name: 'Penakluk Arena', desc: 'Menangkan 50 pertandingan online', goal: 50, value: (p) => p.wins },
  { id: 'buas', name: 'Tak Terbendung', desc: 'Raih 8 kill dalam satu pertandingan', goal: 8, value: (p) => p.bestKills ?? 0 },
  { id: 'titan', name: 'Pemburu Titan', desc: 'Tumbangkan Titan Astra 10 kali bersama timmu', goal: 10, value: (p) => p.titans },
  { id: 'rajin', name: 'Si Rajin', desc: 'Klaim hadiah harian 7 hari berturut-turut', goal: 7, value: (p) => p.login?.best ?? 0 },
  { id: 'emas', name: 'Kesatria Emas', desc: 'Capai tier Emas', goal: tierMin('emas'), value: (p) => p.peak },
  { id: 'berlian', name: 'Bintang Berlian', desc: 'Capai tier Berlian', goal: tierMin('berlian'), value: (p) => p.peak },
  { id: 'legenda', name: 'Legenda Hidup', desc: 'Capai tier Legenda', goal: tierMin('legenda'), value: (p) => p.peak },
];

export function titleById(id: unknown): Title | undefined {
  return typeof id === 'string' && id ? TITLES.find((t) => t.id === id) : undefined;
}

/** true bila gelar `id` dikenal dan syaratnya sudah terpenuhi di profil `p`. */
export function titleUnlocked(p: Profile, id: unknown): boolean {
  const t = titleById(id);
  return !!t && t.value(p) >= t.goal;
}

export interface TitleView {
  title: Title;
  value: number;
  done: boolean;
}

/** Semua gelar beserta kemajuannya di profil `p`. */
export function titleView(p: Profile): TitleView[] {
  return TITLES.map((title) => {
    const value = Math.max(0, Math.min(title.goal, title.value(p) || 0));
    return { title, value, done: value >= title.goal };
  });
}

/** Nama gelar untuk id itu ('' bila tidak dikenal): satu-satunya teks gelar yang boleh ditampilkan. */
export function titleName(id: unknown): string {
  return titleById(id)?.name ?? '';
}
