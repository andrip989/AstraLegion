// Logika hero: regenerasi, perintah gerak/serang, dash, dan casting skill.
import { FOUNTAINS, FOUNTAIN_RADIUS, PASSIVE_GOLD_PER_SEC, ULT_UNLOCK_LEVEL } from '../../../shared/src';
import type { Game } from './Game';
import type { Hero } from './entities';
import { SKILL_HANDLERS } from './skills';

export function orderMove(game: Game, h: Hero, x: number, z: number): void {
  if (!h.alive) return;
  h.path = game.nav.findPath(h.x, h.z, x, z);
  h.pathIdx = 0;
  h.order = h.path.length ? { type: 'move' } : null;
}

export function orderAttack(game: Game, h: Hero, id: number): void {
  if (!h.alive) return;
  const t = game.byId.get(id);
  if (!t || !game.canTarget(h, t)) return;
  h.order = { type: 'attack', id };
  h.path = [];
  h.repathAt = 0;
}

/** Maju di sepanjang jalur; true jika sudah sampai di ujung. */
function followPath(game: Game, h: Hero, dt: number): boolean {
  let remaining = game.speedOf(h) * dt;
  while (remaining > 0 && h.pathIdx < h.path.length) {
    const p = h.path[h.pathIdx];
    const dx = p.x - h.x;
    const dz = p.z - h.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-4) h.rot = Math.atan2(dx, dz);
    if (d <= remaining) {
      h.x = p.x;
      h.z = p.z;
      remaining -= d;
      h.pathIdx++;
    } else {
      h.x += (dx / d) * remaining;
      h.z += (dz / d) * remaining;
      remaining = 0;
    }
  }
  return h.pathIdx >= h.path.length;
}

export function updateHero(game: Game, h: Hero, dt: number): void {
  const now = game.time;
  if (!h.alive) {
    if (now >= h.respawnAt) game.respawnHero(h);
    return;
  }

  let hpRegen = h.hpRegen;
  let manaRegen = h.manaRegen;
  const f = FOUNTAINS[h.team];
  if (Math.hypot(h.x - f.x, h.z - f.z) < FOUNTAIN_RADIUS) {
    hpRegen += h.maxHp * 0.25;
    manaRegen += h.maxMana * 0.25;
  }
  h.hp = Math.min(h.maxHp, h.hp + hpRegen * dt);
  h.mana = Math.min(h.maxMana, h.mana + manaRegen * dt);
  h.gold += PASSIVE_GOLD_PER_SEC * dt;
  for (let i = 0; i < 4; i++) h.cds[i] = Math.max(0, h.cds[i] - dt);
  h.attackCd = Math.max(0, h.attackCd - dt);
  if (h.shield > 0 && now >= h.shieldUntil) h.shield = 0;

  if (h.dash) {
    const d = h.dash;
    const dx = d.x - h.x;
    const dz = d.z - h.z;
    const dist = Math.hypot(dx, dz);
    const step = d.speed * dt;
    if (dist <= step) {
      h.x = d.x;
      h.z = d.z;
      h.dash = null;
      d.onEnd?.();
    } else {
      h.x += (dx / dist) * step;
      h.z += (dz / dist) * step;
    }
    return;
  }
  if (game.isStunned(h)) return;

  const o = h.order;
  if (o?.type === 'attack') {
    const t = game.byId.get(o.id);
    if (!t || !game.canTarget(h, t)) {
      h.order = null;
      h.path = [];
      return;
    }
    const d = Math.hypot(t.x - h.x, t.z - h.z) - t.radius;
    if (d <= h.attackRange) {
      h.rot = Math.atan2(t.x - h.x, t.z - h.z);
      h.path = [];
      if (h.attackCd <= 0) game.basicAttack(h, t);
    } else {
      if (now >= h.repathAt || h.pathIdx >= h.path.length) {
        h.path = game.nav.findPath(h.x, h.z, t.x, t.z);
        h.pathIdx = 0;
        h.repathAt = now + 0.35;
      }
      followPath(game, h, dt);
    }
  } else if (o?.type === 'move') {
    if (followPath(game, h, dt)) h.order = null;
  } else if (h.attackCd <= 0 && !game.isInvisible(h)) {
    // diam: otomatis menyerang musuh yang masuk jangkauan (tanpa mengejar)
    const t = game.nearestEnemy(h, h.attackRange, (u) => u.kind !== 'monster');
    if (t) game.basicAttack(h, t);
  }
}

/**
 * Validasi & eksekusi skill. Semua syarat (hidup, tidak stun, level, cooldown, mana)
 * dicek di server; titik target dijepit ke jangkauan skill.
 */
export function castSkill(game: Game, h: Hero, slot: number, x: number, z: number): boolean {
  if (!h.alive || h.dash || game.isStunned(h)) return false;
  const def = h.def.skills[slot];
  if (!def) return false;
  if (slot === 3 && h.level < ULT_UNLOCK_LEVEL) return false;
  if (h.cds[slot] > 0 || h.mana < def.mana) return false;
  const handler = SKILL_HANDLERS[def.id];
  if (!handler) return false;

  let dx = x - h.x;
  let dz = z - h.z;
  let d = Math.hypot(dx, dz);
  if (d < 1e-3) {
    dx = Math.sin(h.rot);
    dz = Math.cos(h.rot);
    d = 1;
  }
  const dirX = dx / d;
  const dirZ = dz / d;
  const reach = Math.min(d, def.range);
  const ok = handler({
    game,
    hero: h,
    def,
    x: h.x + dirX * reach,
    z: h.z + dirZ * reach,
    dirX,
    dirZ,
    lvl: h.level,
  });
  if (ok === false) return false;

  h.mana -= def.mana;
  h.cds[slot] = def.cooldown;
  game.emit({ k: 'cast', a: h.id, s: slot }); // untuk animasi casting di client
  if (def.target !== 'self') h.rot = Math.atan2(dirX, dirZ);
  if (!def.keepsStealth) h.invisUntil = 0;
  return true;
}
