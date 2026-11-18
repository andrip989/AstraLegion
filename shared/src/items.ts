// Definisi item toko. Efeknya dihitung di server (Hero.recalc dan Game.damage); client hanya
// menampilkan. Untuk menambah item: tambahkan entri di ITEMS (dan ikon di client/src/ui/icons.ts).

export interface ItemStats {
  /** Damage serangan biasa. */
  damage?: number;
  hp?: number;
  mana?: number;
  hpRegen?: number;
  manaRegen?: number;
  moveSpeed?: number;
  /** Kecepatan serang, pecahan (0.25 = +25%). */
  attackSpeed?: number;
  /** Pengurangan cooldown skill, pecahan (0.15 = -15%). */
  cdr?: number;
  /** Bagian damage serangan biasa yang kembali sebagai HP, pecahan. */
  lifesteal?: number;
  /** Tambahan damage skill, pecahan. */
  skillPower?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  stats: ItemStats;
}

export const MAX_ITEMS = 6;
/** Bagian harga yang kembali saat item dijual. */
export const SELL_REFUND = 0.5;
/** Lama menyalurkan recall (detik) sebelum berpindah ke base. */
export const RECALL_TIME = 4;

export const ITEMS: Record<string, ItemDef> = {
  storm_blade: { id: 'storm_blade', name: 'Bilah Badai', desc: '+18 damage serangan.', cost: 350, stats: { damage: 18 } },
  titan_plate: { id: 'titan_plate', name: 'Zirah Titan', desc: '+220 HP dan +2 regenerasi HP.', cost: 400, stats: { hp: 220, hpRegen: 2 } },
  wind_boots: { id: 'wind_boots', name: 'Sepatu Angin', desc: '+0,9 kecepatan gerak.', cost: 300, stats: { moveSpeed: 0.9 } },
  mana_core: { id: 'mana_core', name: 'Inti Mana', desc: '+180 mana dan +2 regenerasi mana.', cost: 320, stats: { mana: 180, manaRegen: 2 } },
  flash_gauntlet: { id: 'flash_gauntlet', name: 'Sarung Kilat', desc: '+25% kecepatan serang.', cost: 380, stats: { attackSpeed: 0.25 } },
  cosmic_clock: { id: 'cosmic_clock', name: 'Jam Kosmik', desc: 'Cooldown skill 15% lebih singkat.', cost: 420, stats: { cdr: 0.15 } },
  vampire_fang: { id: 'vampire_fang', name: 'Taring Senja', desc: '+8 damage; 12% damage serangan menjadi HP.', cost: 450, stats: { damage: 8, lifesteal: 0.12 } },
  astra_crystal: { id: 'astra_crystal', name: 'Kristal Astra', desc: 'Damage skill +20%.', cost: 500, stats: { skillPower: 0.2 } },
  nova_greatsword: { id: 'nova_greatsword', name: 'Pedang Nova', desc: '+45 damage serangan.', cost: 850, stats: { damage: 45 } },
  dragon_heart: { id: 'dragon_heart', name: 'Jantung Naga', desc: '+520 HP dan +6 regenerasi HP.', cost: 900, stats: { hp: 520, hpRegen: 6 } },
};

export const ITEM_LIST: ItemDef[] = Object.values(ITEMS);

/** Urutan belanja yang direkomendasikan per hero (dipakai tombol beli-cepat dan bot). */
export const BUILDS: Record<string, string[]> = {
  volt_titan: ['titan_plate', 'wind_boots', 'cosmic_clock', 'dragon_heart', 'storm_blade', 'vampire_fang'],
  nova_striker: ['storm_blade', 'wind_boots', 'flash_gauntlet', 'nova_greatsword', 'astra_crystal', 'mana_core'],
  shadow_fang: ['storm_blade', 'wind_boots', 'vampire_fang', 'nova_greatsword', 'cosmic_clock', 'flash_gauntlet'],
  lumen_sage: ['mana_core', 'wind_boots', 'cosmic_clock', 'astra_crystal', 'titan_plate', 'dragon_heart'],
  ember_lancer: ['storm_blade', 'titan_plate', 'wind_boots', 'vampire_fang', 'dragon_heart', 'nova_greatsword'],
};
export const DEFAULT_BUILD = ['storm_blade', 'wind_boots', 'titan_plate', 'cosmic_clock', 'nova_greatsword', 'dragon_heart'];

/** Item berikutnya yang disarankan untuk hero ini (yang belum dimiliki), atau null bila tas penuh/selesai. */
export function nextRecommended(heroId: string, owned: string[]): ItemDef | null {
  if (owned.length >= MAX_ITEMS) return null;
  const left = [...owned];
  for (const id of BUILDS[heroId] ?? DEFAULT_BUILD) {
    const i = left.indexOf(id);
    if (i >= 0) left.splice(i, 1);
    else return ITEMS[id] ?? null;
  }
  return null;
}

/** Jumlah seluruh bonus dari daftar item. */
export function sumItemStats(items: string[]): Required<ItemStats> {
  const total: Required<ItemStats> = { damage: 0, hp: 0, mana: 0, hpRegen: 0, manaRegen: 0, moveSpeed: 0, attackSpeed: 0, cdr: 0, lifesteal: 0, skillPower: 0 };
  for (const id of items) {
    const stats = ITEMS[id]?.stats;
    if (!stats) continue;
    for (const k of Object.keys(stats) as (keyof ItemStats)[]) total[k] += stats[k] ?? 0;
  }
  // pengurangan cooldown dibatasi supaya skill tidak bisa dipakai terus-menerus
  total.cdr = Math.min(0.4, total.cdr);
  return total;
}
