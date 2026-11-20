// Talenta: satu bonus kecil yang dipilih pemain di lobby sebelum bertanding, supaya hero yang sama
// bisa dimainkan dengan gaya berbeda. Bonus stat dijumlahkan seperti item (lihat Hero.recalc di
// server); `goldBonus` ditangani Game.addGold. Bot memilih secara acak.
import type { ItemStats } from './items';

export interface TalentDef {
  id: string;
  name: string;
  desc: string;
  /** Bonus stat tetap, berlaku sepanjang pertandingan. */
  stats: ItemStats;
  /** Tambahan emas dari menghabisi minion dan monster, pecahan (0.2 = +20%). */
  goldBonus?: number;
  /** Warna lencananya di lobby. */
  color: number;
}

export const TALENTS: Record<string, TalentDef> = {
  ganas: { id: 'ganas', name: 'Ganas', desc: '+7 damage serangan dan damage skill +6%.', stats: { damage: 7, skillPower: 0.06 }, color: 0xff6b5c },
  tangguh: { id: 'tangguh', name: 'Tangguh', desc: '+130 HP dan +1,5 regenerasi HP.', stats: { hp: 130, hpRegen: 1.5 }, color: 0x7dd3a8 },
  gesit: { id: 'gesit', name: 'Gesit', desc: '+0,45 kecepatan gerak dan +8% kecepatan serang.', stats: { moveSpeed: 0.45, attackSpeed: 0.08 }, color: 0x7cc7ff },
  cerdik: { id: 'cerdik', name: 'Cerdik', desc: 'Cooldown skill 8% lebih singkat dan +2 regenerasi mana.', stats: { cdr: 0.08, manaRegen: 2 }, color: 0xc9a6ff },
  haus: { id: 'haus', name: 'Haus Darah', desc: '7% damage serangan biasa kembali sebagai HP.', stats: { lifesteal: 0.07 }, color: 0xff7aa8 },
  tamak: { id: 'tamak', name: 'Pemburu Harta', desc: 'Emas dari minion dan monster +20%.', stats: {}, goldBonus: 0.2, color: 0xffd23f },
};

export const TALENT_LIST: TalentDef[] = Object.values(TALENTS);
export const DEFAULT_TALENT = 'tangguh';
