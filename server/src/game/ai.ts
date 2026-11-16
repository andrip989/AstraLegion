// Perilaku unit non-hero: minion, tower, monster jungle.
import type { Game } from './Game';
import { Hero, Minion, type Monster, type Tower, type Unit } from './entities';

const MINION_AGGRO = 9;
const MONSTER_LEASH = 12;

/** Gerak lurus ke arah target dengan "slide" sederhana di sepanjang dinding. */
export function moveToward(game: Game, u: Unit, tx: number, tz: number, dt: number): void {
  const dx = tx - u.x;
  const dz = tz - u.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return;
  const step = Math.min(d, game.speedOf(u) * dt);
  const nx = u.x + (dx / d) * step;
  const nz = u.z + (dz / d) * step;
  u.rot = Math.atan2(dx, dz);
  if (game.nav.isWalkable(nx, nz)) {
    u.x = nx;
    u.z = nz;
  } else if (game.nav.isWalkable(nx, u.z)) {
    u.x = nx;
  } else if (game.nav.isWalkable(u.x, nz)) {
    u.z = nz;
  }
}

function edgeDist(a: Unit, b: Unit): number {
  return Math.hypot(b.x - a.x, b.z - a.z) - b.radius;
}

export function updateMinion(game: Game, m: Minion, dt: number): void {
  m.attackCd = Math.max(0, m.attackCd - dt);
  if (game.isStunned(m)) return;

  let target = m.targetId ? game.byId.get(m.targetId) : undefined;
  if (target && (!game.canTarget(m, target) || edgeDist(m, target) > MINION_AGGRO + 3)) target = undefined;
  if (!target || (game.tick + m.id) % 10 === 0) {
    target = game.nearestEnemy(m, MINION_AGGRO) ?? target;
  }
  m.targetId = target ? target.id : 0;

  if (target) {
    if (edgeDist(m, target) <= m.attackRange) {
      m.rot = Math.atan2(target.x - m.x, target.z - m.z);
      if (m.attackCd <= 0) game.basicAttack(m, target);
    } else {
      moveToward(game, m, target.x, target.z, dt);
    }
    return;
  }
  const wp = m.route[m.wp];
  moveToward(game, m, wp.x, wp.z, dt);
  if (m.wp < m.route.length - 1 && Math.hypot(wp.x - m.x, wp.z - m.z) < 3) m.wp++;
}

export function updateTower(game: Game, t: Tower, dt: number): void {
  t.attackCd = Math.max(0, t.attackCd - dt);
  let target = t.targetId ? game.byId.get(t.targetId) : undefined;
  if (target && (!game.canTarget(t, target) || edgeDist(t, target) > t.attackRange)) target = undefined;
  if (!target) {
    // prioritas ala MOBA: minion dulu, baru hero
    target =
      game.nearestEnemy(t, t.attackRange, (u) => u.kind === 'minion') ??
      game.nearestEnemy(t, t.attackRange, (u) => u.kind === 'hero') ??
      undefined;
  }
  t.targetId = target ? target.id : 0;
  if (target && t.attackCd <= 0) game.basicAttack(t, target);
}

export function updateMonster(game: Game, m: Monster, dt: number): void {
  m.attackCd = Math.max(0, m.attackCd - dt);
  if (game.isStunned(m)) return;
  const homeDist = Math.hypot(m.homeX - m.x, m.homeZ - m.z);
  let target = m.aggroId ? game.byId.get(m.aggroId) : undefined;
  if (
    target &&
    (!(target instanceof Hero) || !game.canTarget(m, target) || homeDist > MONSTER_LEASH || edgeDist(m, target) > 14)
  ) {
    target = undefined;
    m.aggroId = 0;
  }
  if (target) {
    if (edgeDist(m, target) <= m.attackRange) {
      if (m.attackCd <= 0) game.basicAttack(m, target);
    } else {
      moveToward(game, m, target.x, target.z, dt);
    }
    return;
  }
  // pulang ke camp dan pulihkan HP
  if (homeDist > 0.4) moveToward(game, m, m.homeX, m.homeZ, dt);
  if (m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.15 * dt);
}

/** Dorong minion yang saling tumpang-tindih supaya tidak menumpuk di satu titik. */
export function separateMinions(game: Game): void {
  const list = game.units.filter((u): u is Minion => u instanceof Minion && u.alive);
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const min = a.radius + b.radius;
      if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
      const d = Math.hypot(dx, dz);
      if (d >= min) continue;
      const push = (min - d) * 0.5;
      const nx = d > 1e-3 ? dx / d : Math.cos(a.id);
      const nz = d > 1e-3 ? dz / d : Math.sin(a.id);
      if (game.nav.isWalkable(a.x - nx * push, a.z - nz * push)) {
        a.x -= nx * push;
        a.z -= nz * push;
      }
      if (game.nav.isWalkable(b.x + nx * push, b.z + nz * push)) {
        b.x += nx * push;
        b.z += nz * push;
      }
    }
  }
}
