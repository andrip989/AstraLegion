// Tampilan tier peringkat: lencana kecil berwarna di samping nama tier. Bentuk dan warnanya
// seluruhnya dari CSS (lihat account.css, ".tier"), jadi tidak ada file gambar. Tabel tier dan
// hitungannya ada di shared/src/account.ts.
import { rankTier, type RankTier } from '../../../shared/src';

/**
 * HTML lencana sebuah tier. `withName: false` hanya lambangnya (nama tier jadi tooltip). Isi
 * teksnya hanya dari tabel tier milik client sendiri, jadi aman dipakai sebagai HTML.
 */
export function tierBadge(tier: RankTier, withName = true): string {
  return withName ? `<span class="tier t-${tier.id}"><i></i>${tier.name}</span>` : `<span class="tier t-${tier.id}" title="Tier ${tier.name}"><i></i></span>`;
}

/** Lencana tier untuk sejumlah poin peringkat. */
export function tierBadgeFor(rp: number, withName = true): string {
  return tierBadge(rankTier(rp).tier, withName);
}
