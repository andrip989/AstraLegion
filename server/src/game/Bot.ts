// AI bot sederhana untuk mengisi slot hero kosong: ikut wave di lane-nya,
// menyerang yang terdekat, memakai skill ke hero musuh, dan mundur saat sekarat.
import { BOT_LEVELS, BUSHES, CORES, FOUNTAINS, ITEMS, ITEM_ACTIVE, ULT_UNLOCK_LEVEL, nextRecommended } from '../../../shared/src';
import type { Game } from './Game';
import { Hero, Minion, Tower, type Unit } from './entities';
import { castSkill, castSpell, orderAttack, orderMove, useItem } from './heroLogic';

export class Bot {
  private thinkAt = 0;
  private retreating = false;

  constructor(
    public hero: Hero,
    public lane: number,
  ) {}

  /** Beli item rekomendasi berikutnya begitu emasnya cukup. */
  private shop(game: Game): void {
    const next = nextRecommended(this.hero.def.id, this.hero.items);
    if (next) game.buyItem(this.hero, next.id);
  }

  update(game: Game): void {
    const h = this.hero;
    this.shop(game);
    if (!h.alive) {
      this.retreating = false;
      return;
    }
    this.useItems(game);
    if (game.time < this.thinkAt) return;
    // suar: bila siap, sesekali ditanam di semak terdekat (tempat lawan biasa menunggu)
    if (h.wardCd <= 0 && Math.random() < 0.02) {
      let best: { x: number; z: number } | null = null;
      let bestD = 14;
      for (const b of BUSHES) {
        const d = Math.hypot(b.x - h.x, b.z - h.z);
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      if (best) game.placeWard(h, best.x, best.z);
    }
    // tingkat kesulitan: seberapa cepat bot bereaksi, kapan ia mundur, dan seberapa rajin memakai skill
    const level = BOT_LEVELS[game.botLevel];
    this.thinkAt = game.time + level.think + Math.random() * 0.1;

    const hpPct = h.hp / h.maxHp;
    const home = FOUNTAINS[h.team];
    if (this.retreating && hpPct > 0.85) this.retreating = false;
    if (!this.retreating && hpPct < level.retreat) this.retreating = true;
    if (this.retreating) {
      // mantra tempur dipakai untuk menyelamatkan diri: ketiganya (pindah, pulih, pacu) membantu kabur
      if (hpPct < 0.3) castSpell(game, h, home.x, home.z);
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

    // Titan Astra: ikut menyerang bila kawan sudah bertarung dengannya atau tim sedang unggul jumlah
    const titan = game.titan;
    if (titan && game.titanRally(h.team)) {
      const dist = Math.hypot(titan.x - h.x, titan.z - h.z);
      if (dist < 12 && h.mana > h.maxMana * 0.35 && Math.random() < 0.35) this.castSlot(game, 0, titan, dist);
      orderAttack(game, h, titan.id);
      return;
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

  /** Pakai item aktif saat keadaannya cocok: perisai saat terdesak, pembersih saat terhambat, petir saat lawan menempel. */
  private useItems(game: Game): void {
    const h = this.hero;
    for (let slot = 0; slot < h.items.length; slot++) {
      const id = h.items[slot];
      const active = ITEMS[id]?.active;
      if (!active || (h.itemCd[id] ?? 0) > 0) continue;
      if (active.kind === 'cleanse') {
        if (h.stunUntil > game.time || h.slowUntil > game.time) useItem(game, h, slot);
        continue;
      }
      const foe = game.nearestEnemy(h, active.kind === 'shock' ? ITEM_ACTIVE.shock.radius - 0.8 : 9, (u) => u instanceof Hero);
      if (!foe) continue;
      if (active.kind === 'shock' || h.hp / h.maxHp < 0.55) useItem(game, h, slot);
    }
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
    if (Math.random() > BOT_LEVELS[game.botLevel].skill) return false; // bot mudah sering melewatkan kesempatan
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
