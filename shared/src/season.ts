// Musim peringkat dan bingkai profil akun online. Logika murni (tanpa DOM maupun API Node).
//
// Satu musim = satu bulan kalender menurut waktu permainan (WIB, lihat gameDay di account.ts);
// id-nya "YYYY-MM". Penutupan musim (riwayat, hadiah koin, bingkai, poin dibagi dua) dilakukan
// server lewat rollSeason di account.ts. Bingkai adalah hadiah tier akhir musim: id-nya sama
// dengan id tier (perunggu, perak, ...), warnanya digambar CSS, dan tidak dijual.

/** Id musim: "YYYY-MM". */
export const SEASON_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Musim tempat sebuah hari permainan (YYYY-MM-DD) berada. */
export function seasonOf(day: string): string {
  return day.slice(0, 7);
}

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/** Nama musim untuk ditampilkan, mis. "Musim November 2026"; '' bila id-nya tidak sah. */
export function seasonName(id: string): string {
  if (typeof id !== 'string' || !SEASON_RE.test(id)) return '';
  return `Musim ${MONTHS[Number(id.slice(5)) - 1]} ${id.slice(0, 4)}`;
}

/** Hadiah koin akhir musim menurut id tier akhir. */
export const SEASON_REWARDS: Readonly<Record<string, number>> = { perunggu: 0, perak: 60, emas: 120, platina: 200, berlian: 300, legenda: 450 };

/** Jumlah musim terakhir yang disimpan di riwayat profil. */
export const SEASONS_MAX = 12;

/** Satu musim yang sudah ditutup, di riwayat profil (terbaru di depan). */
export interface SeasonRecord {
  /** Id musim ("YYYY-MM"). */
  id: string;
  /** Poin peringkat akhir musim itu (sebelum dibagi dua). */
  rp: number;
  /** Id tier akhir (juga id bingkai yang didapat). */
  tier: string;
  /** Koin hadiah yang dibayarkan. */
  coins: number;
}

/** Poin peringkat di awal musim baru: setengah poin akhir musim sebelumnya, dibulatkan ke bawah. */
export function seasonCarry(rp: number): number {
  return Math.floor(Math.max(0, rp) / 2);
}
