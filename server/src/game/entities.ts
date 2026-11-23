// Kelas data entity. Logika perilaku ada di ai.ts / heroLogic.ts / skills/.
import { sumItemStats, xpForLevel, MAX_LEVEL, type EntityKind, type HeroDef, type Team, type Vec2, DEFAULT_SPELL, DEFAULT_TALENT, TALENTS } from '../../../shared/src';

export class Unit {
  id = 0;
  sub = '';
  name = '';
  rot = 0;
  radius = 0.6;
  hp = 1;
  maxHp = 1;
  alive = true;
  invulnerable = false;
  moveSpeed = 0;
  attackDamage = 0;
  attackRange = 0;
  attackInterval = 1;
  attackCd = 0;
  ranged = false;
  targetId = 0;
  stunUntil = 0;
  slowUntil = 0;
  slowFactor = 1;
  bountyGold = 0;
  bountyXp = 0;
  /** Kabut perang: apakah unit ini sedang terlihat oleh tim Biru / tim Merah (dihitung Game tiap tick). */
  seen0 = false;
  seen1 = false;

  constructor(
    public kind: EntityKind,
    public team: Team,
    public x: number,
    public z: number,
  ) {}
}

export class Minion extends Unit {
  lane = 0;
  wp = 0;
  route: Vec2[] = [];
  constructor(team: Team, x: number, z: number) {
    super('minion', team, x, z);
  }
}

export class Tower extends Unit {
  lane = 0;
  tier = 1;
  constructor(team: Team, x: number, z: number) {
    super('tower', team, x, z);
  }
}

export class Core extends Unit {
  constructor(team: Team, x: number, z: number) {
    super('core', team, x, z);
  }
}

/** Suar penglihatan milik seorang hero: diam, tidak bisa diserang, tidak terlihat lawan, padam sendiri. */
export class Ward extends Unit {
  constructor(
    team: Team,
    x: number,
    z: number,
    public ownerId: number,
    public expireAt: number,
  ) {
    super('ward', team, x, z);
    this.sub = 'ward';
    this.name = 'Suar';
    this.radius = 0.4;
    this.invulnerable = true;
  }
}

export class Monster extends Unit {
  camp = 0;
  homeX = 0;
  homeZ = 0;
  aggroId = 0;
  // ---- hanya dipakai Titan Astra
  /** Sedang bertarung sampai waktu ini (diperpanjang tiap kali dilukai hero). */
  combatUntil = 0;
  /** Waktu hantaman berikutnya, dan sampai kapan ia diam mengangkat tinju. */
  slamAt = 0;
  windupUntil = 0;
  /** Tim hero terakhir yang melukainya (-1 = belum ada). */
  lastTeam = -1;
  constructor(x: number, z: number) {
    super('monster', 2, x, z);
    this.homeX = x;
    this.homeZ = z;
  }
}

export type Order = { type: 'move' } | { type: 'attack'; id: number };

export interface Dash {
  x: number;
  z: number;
  speed: number;
  onEnd?: () => void;
}

export class Hero extends Unit {
  level = 1;
  xp = 0;
  gold = 0;
  mana = 0;
  maxMana = 0;
  hpRegen = 0;
  manaRegen = 0;
  cds = [0, 0, 0, 0];
  /** Statistik pertandingan: damage ke hero lawan, damage diterima, total emas yang didapat. */
  dmgDealt = 0;
  dmgTaken = 0;
  goldEarned = 0;
  kills = 0;
  deaths = 0;
  assists = 0;
  respawnAt = 0;
  order: Order | null = null;
  path: Vec2[] = [];
  pathIdx = 0;
  repathAt = 0;
  dash: Dash | null = null;
  invisUntil = 0;
  shield = 0;
  shieldUntil = 0;
  hasteUntil = 0;
  haste = 1;
  empower = 0; // bonus damage serangan berikutnya
  playerId: string | null = null;
  /** Id item yang dimiliki (maks. MAX_ITEMS). */
  items: string[] = [];
  /** Bonus dari item yang tidak tercakup stat dasar. */
  cdr = 0;
  lifesteal = 0;
  skillPower = 0;
  /** Waktu selesainya recall (0 = tidak sedang recall). */
  recallAt = 0;
  /** Kill hero sejak terakhir tumbang, dan kill beruntun dalam selang pendek. */
  streak = 0;
  multi = 0;
  lastKillAt = -99;
  /** Berkah Golem aktif sampai waktu ini (bonus damage). */
  buffUntil = 0;
  /** Talenta pilihan pemain (id di TALENTS); bonusnya ikut dihitung di recalc. */
  talent = DEFAULT_TALENT;
  /** Sisa jeda menanam suar (detik). */
  wardCd = 0;
  /** Sisa jeda kemampuan aktif per id item (detik). */
  itemCd: Record<string, number> = {};
  /** Berkah Arus aktif sampai waktu ini. */
  flowUntil = 0;
  /** Berapa kali timnya menumbangkan Titan Astra di pertandingan ini selagi hero ini ikut (untuk statistik akun). */
  titans = 0;
  /** Berkah Titan aktif sampai waktu ini. */
  titanUntil = 0;
  /** Jumlah perintah bermain (gerak, serang, skill, mantra) dari pemiliknya; untuk mengenali pemain yang diam saja. */
  actions = 0;
  /** Damage yang baru diterima: [waktu, nama sumber, jumlah] berurutan, untuk rekap saat tumbang. */
  hits: [number, string, number][] = [];
  /** Skin warna (indeks di SKINS); hanya untuk tampilan. */
  skin = 0;
  /** Sampai waktu ini hero terlihat walau berdiri di semak (baru menyerang / memakai skill). */
  revealUntil = 0;
  /** Mantra tempur yang dibawa (id di SPELLS) dan sisa cooldown-nya (detik). */
  spell = DEFAULT_SPELL;
  spellCd = 0;

  constructor(
    public def: HeroDef,
    team: Team,
    x: number,
    z: number,
  ) {
    super('hero', team, x, z);
    this.sub = def.id;
    this.radius = def.radius;
    this.ranged = def.ranged;
    this.attackRange = def.attackRange;
    this.attackInterval = def.attackInterval;
    this.moveSpeed = def.moveSpeed;
    this.hpRegen = def.hpRegen;
    this.manaRegen = def.manaRegen;
    this.recalc();
    this.hp = this.maxHp;
    this.mana = this.maxMana;
  }

  get isBot(): boolean {
    return this.playerId === null;
  }

  /** Hitung ulang stat dari level + item. */
  recalc(): void {
    const n = this.level - 1;
    const it = sumItemStats(this.items, TALENTS[this.talent]?.stats);
    this.maxHp = Math.round(this.def.hp + this.def.hpGrowth * n + it.hp);
    this.maxMana = Math.round(this.def.mana + this.def.manaGrowth * n + it.mana);
    this.attackDamage = this.def.damage + this.def.damageGrowth * n + it.damage;
    this.hpRegen = this.def.hpRegen + it.hpRegen;
    this.manaRegen = this.def.manaRegen + it.manaRegen;
    this.moveSpeed = this.def.moveSpeed + it.moveSpeed;
    this.attackInterval = this.def.attackInterval / (1 + it.attackSpeed);
    this.cdr = it.cdr;
    this.lifesteal = it.lifesteal;
    this.skillPower = it.skillPower;
  }

  /** Terapkan perubahan daftar item; HP/mana ikut naik sebesar tambahan maksimumnya. */
  applyItems(): void {
    const oldHp = this.maxHp;
    const oldMana = this.maxMana;
    this.recalc();
    if (this.alive) {
      this.hp = Math.max(1, Math.min(this.maxHp, this.hp + Math.max(0, this.maxHp - oldHp)));
      this.mana = Math.max(0, Math.min(this.maxMana, this.mana + Math.max(0, this.maxMana - oldMana)));
    }
  }

  /** Tambah XP; mengembalikan true jika naik level. */
  gainXp(amount: number): boolean {
    if (this.level >= MAX_LEVEL) return false;
    this.xp += amount;
    let leveled = false;
    while (this.level < MAX_LEVEL && this.xp >= xpForLevel(this.level)) {
      this.xp -= xpForLevel(this.level);
      this.level++;
      const oldHp = this.maxHp;
      const oldMana = this.maxMana;
      this.recalc();
      this.hp += this.maxHp - oldHp;
      this.mana += this.maxMana - oldMana;
      leveled = true;
    }
    if (this.level >= MAX_LEVEL) this.xp = 0;
    return leveled;
  }
}
