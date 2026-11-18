// Mantra tempur: satu kemampuan tambahan yang dipilih pemain di lobby, di luar empat skill hero.
// Tanpa biaya mana, tetapi cooldown-nya panjang. Efeknya ada di server/src/game/heroLogic.ts
// (castSpell); ikonnya di client/src/ui/spellIcons.ts.

export interface SpellDef {
  id: string;
  name: string;
  desc: string;
  /** Cooldown dalam detik. */
  cooldown: number;
  /** Jarak pindah (hanya untuk mantra yang berpindah tempat). */
  range?: number;
  /** Warna efeknya di arena. */
  color: number;
}

export const SPELLS: Record<string, SpellDef> = {
  flash: {
    id: 'flash',
    name: 'Kilat',
    desc: 'Berpindah seketika sejauh 6 unit ke arah bidikan. Tidak bisa menembus tebing.',
    cooldown: 90,
    range: 6,
    color: 0xfff3a0,
  },
  heal: {
    id: 'heal',
    name: 'Pulih',
    desc: 'Memulihkan 18% HP maksimum untukmu dan 10% untuk kawan di dekatmu.',
    cooldown: 75,
    color: 0x7dffb0,
  },
  sprint: {
    id: 'sprint',
    name: 'Pacu',
    desc: 'Kecepatan gerak +45% selama 5 detik dan menghapus efek lambat.',
    cooldown: 60,
    color: 0x7fd0ff,
  },
};

export const SPELL_LIST = Object.values(SPELLS);
export const DEFAULT_SPELL = 'flash';
/** Tombol keyboard untuk mantra tempur. */
export const SPELL_KEY = 'F';
