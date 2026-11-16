import type { SkillHandler } from './index';

const YELLOW = 0xffd23f;

export const voltTitanSkills: Record<string, SkillHandler> = {
  // Q: stun area di titik target
  vt_slam({ game, hero, def, x, z, lvl }) {
    const r = def.radius!;
    game.emit({ k: 'ring', x, z, r, c: YELLOW });
    for (const u of game.enemiesNear(hero.team, x, z, r)) {
      game.damage(hero, u, 70 + 12 * lvl);
      game.stun(u, 1.2);
    }
  },

  // W: perisai penyerap damage
  vt_shield({ game, hero, lvl }) {
    hero.shield = 100 + 25 * lvl;
    hero.shieldUntil = game.time + 4;
    game.emit({ k: 'ring', x: hero.x, z: hero.z, r: 2, c: 0x9fd8ff });
  },

  // E: terjang, damage + slow di titik tiba
  vt_charge({ game, hero, def, x, z, lvl }) {
    const dest = game.nav.clampLine(hero.x, hero.z, x, z);
    const x0 = hero.x;
    const z0 = hero.z;
    hero.order = null;
    hero.path = [];
    hero.dash = {
      x: dest.x,
      z: dest.z,
      speed: 30,
      onEnd: () => {
        game.emit({ k: 'trail', x0, z0, x1: hero.x, z1: hero.z, c: YELLOW });
        game.emit({ k: 'ring', x: hero.x, z: hero.z, r: def.radius!, c: YELLOW });
        for (const u of game.enemiesNear(hero.team, hero.x, hero.z, def.radius!)) {
          game.damage(hero, u, 50 + 10 * lvl);
          game.slow(u, 0.6, 2);
        }
      },
    };
  },

  // R: badai di sekeliling, damage besar + stun
  vt_tempest({ game, hero, def, lvl }) {
    const r = def.radius!;
    game.emit({ k: 'ring', x: hero.x, z: hero.z, r, c: YELLOW });
    game.emit({ k: 'ring', x: hero.x, z: hero.z, r: r * 0.6, c: 0xffffff });
    for (const u of game.enemiesNear(hero.team, hero.x, hero.z, r)) {
      game.damage(hero, u, 160 + 30 * lvl);
      game.stun(u, 1.8);
    }
  },
};
