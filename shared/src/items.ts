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
  /** Pengurangan damage yang diterima, pecahan (dijumlah, paling besar 0,5). */
  armor?: number;
  /** Bagian damage serangan biasa yang dipantulkan ke penyerangnya, pecahan. */
  thorns?: number;
  /** Peluang serangan biasa kritis (damage 1,75 kali), pecahan. */
  crit?: number;
  /** Serangan biasa memperlambat sasaran sebesar ini (pecahan) selama 1 detik. */
  slowHit?: number;
  /** HP maksimum yang pulih tiap menumbangkan creep atau monster (pecahan); tiga kali lipat bila hero. */
  killHeal?: number;
  /** Bagian damage skill yang kembali sebagai HP, pecahan. */
  spellVamp?: number;
}

/** Kelompok item di toko. */
export type ItemCat = 'serang' | 'sihir' | 'tahan' | 'gerak' | 'aktif';
export const ITEM_CATS: { id: ItemCat; name: string }[] = [
  { id: 'serang', name: 'Serang' },
  { id: 'sihir', name: 'Sihir' },
  { id: 'tahan', name: 'Tahan' },
  { id: 'gerak', name: 'Gerak' },
  { id: 'aktif', name: 'Aktif' },
];

/** Kemampuan aktif sebuah item: dipakai lewat tombol, lalu menunggu `cooldown` detik. */
export interface ItemActive {
  kind: 'shield' | 'cleanse' | 'shock';
  cooldown: number;
}

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  stats: ItemStats;
  /** Item aktif: selain bonus pasifnya punya kemampuan yang dipakai pemain (klik slotnya / tombol angka). */
  active?: ItemActive;
  /** Kelompok di toko. */
  cat?: ItemCat;
}

/** Angka kemampuan aktif (dipakai server; teks di `desc` item harus mengikuti angka ini). */
export const ITEM_ACTIVE = {
  /** Perisai: `base + perLevel * level` selama `time` detik. */
  shield: { base: 160, perLevel: 14, time: 3 },
  /** Pembersih: lepas dari perlambatan dan lumpuh, lalu lari `haste` kali lebih cepat selama `time` detik. */
  cleanse: { haste: 1.35, time: 2 },
  /** Gelombang petir: damage `base + perLevel * level` dan perlambatan ke semua lawan dalam `radius`. */
  shock: { radius: 5, base: 80, perLevel: 10, slow: 0.6, slowTime: 2 },
} as const;

export const MAX_ITEMS = 6;
/** Bagian harga yang kembali saat item dijual. */
export const SELL_REFUND = 0.5;
/** Lama menyalurkan recall (detik) sebelum berpindah ke base. */
export const RECALL_TIME = 4;

export const ITEMS: Record<string, ItemDef> = {
  storm_blade: { id: 'storm_blade', name: 'Bilah Badai', desc: '+18 damage serangan.', cost: 350, stats: { damage: 18 }, cat: 'serang' },
  titan_plate: { id: 'titan_plate', name: 'Zirah Titan', desc: '+220 HP dan +2 regenerasi HP.', cost: 400, stats: { hp: 220, hpRegen: 2 }, cat: 'tahan' },
  wind_boots: { id: 'wind_boots', name: 'Sepatu Angin', desc: '+0,9 kecepatan gerak.', cost: 300, stats: { moveSpeed: 0.9 }, cat: 'gerak' },
  mana_core: { id: 'mana_core', name: 'Inti Mana', desc: '+180 mana dan +2 regenerasi mana.', cost: 320, stats: { mana: 180, manaRegen: 2 }, cat: 'sihir' },
  flash_gauntlet: { id: 'flash_gauntlet', name: 'Sarung Kilat', desc: '+25% kecepatan serang.', cost: 380, stats: { attackSpeed: 0.25 }, cat: 'serang' },
  cosmic_clock: { id: 'cosmic_clock', name: 'Jam Kosmik', desc: 'Cooldown skill 15% lebih singkat.', cost: 420, stats: { cdr: 0.15 }, cat: 'sihir' },
  vampire_fang: { id: 'vampire_fang', name: 'Taring Senja', desc: '+8 damage; 12% damage serangan menjadi HP.', cost: 450, stats: { damage: 8, lifesteal: 0.12 }, cat: 'serang' },
  astra_crystal: { id: 'astra_crystal', name: 'Kristal Astra', desc: 'Damage skill +20%.', cost: 500, stats: { skillPower: 0.2 }, cat: 'sihir' },
  nova_greatsword: { id: 'nova_greatsword', name: 'Pedang Nova', desc: '+45 damage serangan.', cost: 850, stats: { damage: 45 }, cat: 'serang' },
  dragon_heart: { id: 'dragon_heart', name: 'Jantung Naga', desc: '+520 HP dan +6 regenerasi HP.', cost: 900, stats: { hp: 520, hpRegen: 6 }, cat: 'tahan' },
  // ---- item aktif
  aegis_plate: {
    id: 'aegis_plate',
    name: 'Perisai Aegis',
    desc: '+240 HP. AKTIF: perisai 160 (+14 per level) selama 3 detik. Jeda 60 detik.',
    cost: 560,
    stats: { hp: 240 },
    active: { kind: 'shield', cooldown: 60 },
    cat: 'aktif',
  },
  pure_charm: {
    id: 'pure_charm',
    name: 'Jimat Murni',
    desc: '+150 mana dan +3 regenerasi HP. AKTIF: lepas dari perlambatan dan lumpuh, lalu lari 35% lebih cepat selama 2 detik. Jeda 50 detik.',
    cost: 460,
    stats: { mana: 150, hpRegen: 3 },
    active: { kind: 'cleanse', cooldown: 50 },
    cat: 'aktif',
  },
  // ---- item baru: efek khusus
  crit_dagger: { id: 'crit_dagger', name: 'Belati Bintang', desc: '+12 damage serangan. 20% peluang serangan kritis (damage 1,75 kali).', cost: 520, stats: { damage: 12, crit: 0.2 }, cat: 'serang' },
  frost_bow: { id: 'frost_bow', name: 'Busur Embun', desc: '+15 damage serangan. Serangan biasa memperlambat sasaran 25% selama 1 detik.', cost: 560, stats: { damage: 15, slowHit: 0.25 }, cat: 'serang' },
  blood_chain: { id: 'blood_chain', name: 'Rantai Penghisap', desc: '+10 damage serangan. Tiap menumbangkan creep atau monster, HP pulih 6% dari maksimum; menumbangkan hero memulihkan 18%.', cost: 480, stats: { damage: 10, killHeal: 0.06 }, cat: 'serang' },
  war_axe: { id: 'war_axe', name: 'Kapak Perang', desc: '+30 damage serangan dan +200 HP.', cost: 900, stats: { damage: 30, hp: 200 }, cat: 'serang' },
  rage_blade: { id: 'rage_blade', name: 'Pedang Amarah', desc: '+10 damage, +25% kecepatan serang, 15% peluang kritis.', cost: 950, stats: { damage: 10, attackSpeed: 0.25, crit: 0.15 }, cat: 'serang' },
  soul_orb: { id: 'soul_orb', name: 'Bola Jiwa', desc: 'Damage skill +12%. 12% damage skill kembali sebagai HP.', cost: 620, stats: { skillPower: 0.12, spellVamp: 0.12 }, cat: 'sihir' },
  arcane_tome: { id: 'arcane_tome', name: 'Kitab Bintang', desc: '+250 mana, damage skill +15%, cooldown skill 10% lebih singkat.', cost: 880, stats: { mana: 250, skillPower: 0.15, cdr: 0.1 }, cat: 'sihir' },
  mana_ring: { id: 'mana_ring', name: 'Cincin Fajar', desc: '+80 mana dan +4 regenerasi mana. Murah, untuk awal permainan.', cost: 260, stats: { mana: 80, manaRegen: 4 }, cat: 'sihir' },
  iron_vest: { id: 'iron_vest', name: 'Rompi Besi', desc: 'Damage yang diterima berkurang 12%.', cost: 420, stats: { armor: 0.12 }, cat: 'tahan' },
  thorn_mail: { id: 'thorn_mail', name: 'Zirah Duri', desc: '+150 HP. 25% damage serangan biasa yang kamu terima dipantulkan ke penyerangnya.', cost: 600, stats: { hp: 150, thorns: 0.25 }, cat: 'tahan' },
  guardian_helm: { id: 'guardian_helm', name: 'Helm Penjaga', desc: '+300 HP dan damage yang diterima berkurang 10%.', cost: 760, stats: { hp: 300, armor: 0.1 }, cat: 'tahan' },
  life_amulet: { id: 'life_amulet', name: 'Kalung Kehidupan', desc: '+5 regenerasi HP. Tiap menumbangkan creep atau monster, HP pulih 4% dari maksimum; hero 12%.', cost: 360, stats: { hpRegen: 5, killHeal: 0.04 }, cat: 'tahan' },
  swift_boots: { id: 'swift_boots', name: 'Sepatu Kilat', desc: '+1,4 kecepatan gerak.', cost: 520, stats: { moveSpeed: 1.4 }, cat: 'gerak' },
  hunter_cloak: { id: 'hunter_cloak', name: 'Jubah Pemburu', desc: '+0,5 kecepatan gerak dan +10% kecepatan serang.', cost: 400, stats: { moveSpeed: 0.5, attackSpeed: 0.1 }, cat: 'gerak' },
  thunder_horn: {
    id: 'thunder_horn',
    name: 'Sangkakala Petir',
    desc: '+22 damage serangan. AKTIF: gelombang petir di sekelilingmu, 80 (+10 per level) damage dan perlambatan 40% selama 2 detik. Jeda 50 detik.',
    cost: 600,
    stats: { damage: 22 },
    active: { kind: 'shock', cooldown: 50 },
    cat: 'aktif',
  },
};

export const ITEM_LIST: ItemDef[] = Object.values(ITEMS);

/** Urutan belanja yang direkomendasikan per hero (dipakai tombol beli-cepat dan bot). */
export const BUILDS: Record<string, string[]> = {
  volt_titan: ['titan_plate', 'wind_boots', 'thorn_mail', 'aegis_plate', 'guardian_helm', 'dragon_heart'],
  nova_striker: ['storm_blade', 'wind_boots', 'flash_gauntlet', 'nova_greatsword', 'astra_crystal', 'mana_core'],
  shadow_fang: ['blood_chain', 'wind_boots', 'crit_dagger', 'nova_greatsword', 'rage_blade', 'vampire_fang'],
  lumen_sage: ['mana_ring', 'wind_boots', 'cosmic_clock', 'soul_orb', 'pure_charm', 'arcane_tome'],
  ember_lancer: ['blood_chain', 'titan_plate', 'wind_boots', 'thunder_horn', 'thorn_mail', 'war_axe'],
  gale_archer: ['storm_blade', 'flash_gauntlet', 'wind_boots', 'nova_greatsword', 'vampire_fang', 'titan_plate'],
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

/** Jumlah seluruh bonus dari daftar item, ditambah bonus lain (`extra`, mis. talenta). */
export function sumItemStats(items: string[], extra?: ItemStats): Required<ItemStats> {
  const total: Required<ItemStats> = { damage: 0, hp: 0, mana: 0, hpRegen: 0, manaRegen: 0, moveSpeed: 0, attackSpeed: 0, cdr: 0, lifesteal: 0, skillPower: 0, armor: 0, thorns: 0, crit: 0, slowHit: 0, killHeal: 0, spellVamp: 0 };
  const add = (stats: ItemStats | undefined) => {
    if (!stats) return;
    for (const k of Object.keys(stats) as (keyof ItemStats)[]) total[k] += stats[k] ?? 0;
  };
  for (const id of items) add(ITEMS[id]?.stats);
  add(extra);
  // pengurangan cooldown dibatasi supaya skill tidak bisa dipakai terus-menerus
  total.cdr = Math.min(0.4, total.cdr);
  // batas lain supaya tidak ada yang kebal atau selalu kritis
  total.armor = Math.min(0.5, total.armor);
  total.crit = Math.min(0.6, total.crit);
  total.slowHit = Math.min(0.5, total.slowHit);
  return total;
}
