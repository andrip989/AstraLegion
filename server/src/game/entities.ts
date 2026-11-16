// Kelas data entity. Logika perilaku ada di ai.ts / heroLogic.ts / skills/.
import { xpForLevel, MAX_LEVEL, type EntityKind, type HeroDef, type Team, type Vec2 } from '../../../shared/src';

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

export class Monster extends Unit {
  camp = 0;
  homeX = 0;
  homeZ = 0;
  aggroId = 0;
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

  recalc(): void {
    const n = this.level - 1;
    this.maxHp = Math.round(this.def.hp + this.def.hpGrowth * n);
    this.maxMana = Math.round(this.def.mana + this.def.manaGrowth * n);
    this.attackDamage = this.def.damage + this.def.damageGrowth * n;
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
