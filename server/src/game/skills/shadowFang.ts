import { Hero, type Unit } from '../entities';
import type { SkillHandler } from './index';

const PURPLE = 0xd946ef;

export const shadowFangSkills: Record<string, SkillHandler> = {
  // Q: dash yang melukai semua musuh di lintasannya
  sf_dash({ game, hero, def, x, z, lvl }) {
    const dest = game.nav.clampLine(hero.x, hero.z, x, z);
    const x0 = hero.x;
    const z0 = hero.z;
    hero.order = null;
    hero.path = [];
    hero.dash = {
      x: dest.x,
      z: dest.z,
      speed: 34,
      onEnd: () => {
        game.emit({ k: 'trail', x0, z0, x1: hero.x, z1: hero.z, c: PURPLE });
        for (const u of game.enemiesInLine(hero.team, x0, z0, hero.x, hero.z, def.width! / 2)) {
          game.damage(hero, u, 60 + 11 * lvl);
        }
      },
    };
  },

  // W: tak terlihat + lebih cepat; serangan berikutnya diperkuat
  sf_vanish({ game, hero, lvl }) {
    hero.invisUntil = game.time + 3.5;
    hero.hasteUntil = game.time + 3.5;
    hero.haste = 1.35;
    hero.empower = 40 + 10 * lvl;
    game.emit({ k: 'ring', x: hero.x, z: hero.z, r: 2, c: 0x6b21a8 });
  },

  // E: bilah ke segala arah
  sf_fan({ game, hero, def, lvl }) {
    const r = def.radius!;
    game.emit({ k: 'ring', x: hero.x, z: hero.z, r, c: PURPLE });
    for (const u of game.enemiesNear(hero.team, hero.x, hero.z, r)) {
      game.damage(hero, u, 55 + 10 * lvl);
      game.slow(u, 0.6, 1.5);
    }
  },

  // R: muncul di belakang target dekat kursor, damage bertambah sesuai HP target yang hilang
  sf_execute({ game, hero, def, x, z, lvl }) {
    let target: Unit | null = null;
    let best = Infinity;
    for (const u of game.enemiesNear(hero.team, x, z, def.radius!)) {
      if (game.isInvisible(u)) continue;
      // hero diutamakan daripada minion/monster
      const score = Math.hypot(u.x - x, u.z - z) + (u instanceof Hero ? 0 : 100);
      if (score < best) {
        best = score;
        target = u;
      }
    }
    if (!target) return false;

    const dx = target.x - hero.x;
    const dz = target.z - hero.z;
    const d = Math.hypot(dx, dz) || 1;
    const behind = game.nav.clampLine(target.x, target.z, target.x + (dx / d) * 1.6, target.z + (dz / d) * 1.6);
    game.emit({ k: 'trail', x0: hero.x, z0: hero.z, x1: behind.x, z1: behind.z, c: PURPLE });
    hero.x = behind.x;
    hero.z = behind.z;
    hero.path = [];
    hero.order = { type: 'attack', id: target.id };
    game.emit({ k: 'ring', x: target.x, z: target.z, r: 2.5, c: PURPLE });
    game.damage(hero, target, 150 + 30 * lvl + (target.maxHp - target.hp) * 0.25);
  },
};
