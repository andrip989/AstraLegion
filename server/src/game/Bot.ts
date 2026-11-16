// AI bot sederhana untuk mengisi slot hero kosong: ikut wave di lane-nya,
// menyerang yang terdekat, memakai skill ke hero musuh, dan mundur saat sekarat.
import { CORES, FOUNTAINS, ULT_UNLOCK_LEVEL } from '../../../shared/src';
import type { Game } from './Game';
import { Hero, Minion, Tower, type Unit } from './entities';
import { castSkill, orderAttack, orderMove } from './heroLogic';

export class Bot {
  private thinkAt = 0;
  private retreating = false;

  constructor(
    public hero: Hero,
    public lane: number,
  ) {}

  update(game: Game): void {
    const h = this.hero;
    if (!h.alive) {
      this.retreating = false;
      return;
    }
    if (game.time < this.thinkAt) return;
    this.thinkAt = game.time + 0.3 + Math.random() * 0.1;

    const hpPct = h.hp / h.maxHp;
    const home = FOUNTAINS[h.team];
    if (this.retreating && hpPct > 0.85) this.retreating = false;
    if (!this.retreating && hpPct < 0.3) this.retreating = true;
    if (this.retreating) {
      this.castByAi(game, 'escape', home.x, home.z);
      orderMove(game, h, home.x, home.z);
      return;
    }

    // hero musuh di dekat sini?
    const foe = game.nearestEnemy(h, 13, (u) => u instanceof Hero) as Hero | null;
    if (foe) {
      const dist = Math.hypot(foe.x - h.x, foe.z - h.z);
      const safe = !game.underEnemyTower(foe.x, foe.z, h.team);
      this.castAt(game, foe, dist, safe);
      if (safe || foe.hp / foe.maxHp < 0.25) {
        orderAttack(game, h, foe.id);
        return;
      }
    }

    // unit/bangunan musuh terdekat
    const target = game.nearestEnemy(h, 11, (u) => u.kind !== 'monster' && u.kind !== 'hero');
    if (target) {
      const structure = target.kind === 'tower' || target.kind === 'core';
      if (!structure || this.hasMinionCover(game, target)) {
        if (!structure && h.mana > h.maxMana * 0.5 && Math.random() < 0.2) {
          const dist = Math.hypot(target.x - h.x, target.z - h.z);
          this.castSlot(game, 0, target, dist);
        }
        orderAttack(game, h, target.id);
        return;
      }
    }

    // ikuti wave: berdiri sedikit di belakang minion terdepan
    const lead = game.leadMinion(h.team, this.lane);
    let dest: { x: number; z: number };
    if (lead) {
      const core = CORES[h.team];
      const dx = core.x - lead.x;
      const dz = core.z - lead.z;
      const d = Math.hypot(dx, dz) || 1;
      dest = { x: lead.x + (dx / d) * 3, z: lead.z + (dz / d) * 3 };
    } else {
      dest = this.holdPoint(game);
    }
    if (Math.hypot(dest.x - h.x, dest.z - h.z) > 2.5) orderMove(game, h, dest.x, dest.z);
  }

  /** Tower kawan terluar di lane ini (atau core) sebagai tempat menunggu wave. */
  private holdPoint(game: Game): { x: number; z: number } {
    let best: Tower | null = null;
    for (const u of game.units) {
      if (u instanceof Tower && u.alive && u.team === this.hero.team && u.lane === this.lane) {
        if (!best || u.tier < best.tier) best = u;
      }
    }
    return best ?? CORES[this.hero.team];
  }

  private hasMinionCover(game: Game, structure: Unit): boolean {
    return game.units.some(
      (u) =>
        u instanceof Minion &&
        u.alive &&
        u.team === this.hero.team &&
        Math.hypot(u.x - structure.x, u.z - structure.z) < 9,
    );
  }

  private ready(slot: number): boolean {
    const h = this.hero;
    const def = h.def.skills[slot];
    return h.cds[slot] <= 0 && h.mana >= def.mana && (slot !== 3 || h.level >= ULT_UNLOCK_LEVEL);
  }

  private castByAi(game: Game, ai: string, x: number, z: number): boolean {
    const h = this.hero;
    for (let slot = 0; slot < 4; slot++) {
      if (h.def.skills[slot].ai === ai && this.ready(slot)) return castSkill(game, h, slot, x, z);
    }
    return false;
  }

  private castSlot(game: Game, slot: number, foe: Unit, dist: number): boolean {
    const h = this.hero;
    const def = h.def.skills[slot];
    if (!this.ready(slot)) return false;
    const reach = def.target === 'self' ? (def.radius ?? 8) : def.range + (def.target === 'point' ? (def.radius ?? 0) * 0.5 : 0);
    if (dist - foe.radius > reach) return false;
    return castSkill(game, h, slot, foe.x, foe.z);
  }

  /** Pakai satu skill ke hero musuh (ultimate dicoba lebih dulu). */
  private castAt(game: Game, foe: Hero, dist: number, safe: boolean): void {
    const h = this.hero;
    for (const slot of [3, 0, 1, 2]) {
      const ai = h.def.skills[slot].ai;
      if (ai === 'escape') continue;
      if (ai === 'gap' && (!safe || h.hp / h.maxHp < 0.5)) continue;
      if (this.castSlot(game, slot, foe, dist)) return;
    }
  }
}
