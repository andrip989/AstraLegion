import type { SkillHandler } from './index';

const CYAN = 0x2ee6ff;

export const novaStrikerSkills: Record<string, SkillHandler> = {
  // Q: energy beam lurus yang menembus
  ns_beam({ game, hero, def, dirX, dirZ, lvl }) {
    const x1 = hero.x + dirX * def.range;
    const z1 = hero.z + dirZ * def.range;
    game.emit({ k: 'beam', x0: hero.x, z0: hero.z, x1, z1, w: def.width!, c: CYAN });
    for (const u of game.enemiesInLine(hero.team, hero.x, hero.z, x1, z1, def.width! / 2)) {
      game.damage(hero, u, 85 + 14 * lvl);
    }
  },

  // W: granat pulsa, meledak sesaat setelah dilempar
  ns_grenade({ game, hero, def, x, z, lvl }) {
    const r = def.radius!;
    game.emit({ k: 'trail', x0: hero.x, z0: hero.z, x1: x, z1: z, c: CYAN });
    game.after(0.35, () => {
      game.emit({ k: 'ring', x, z, r, c: CYAN });
      for (const u of game.enemiesNear(hero.team, x, z, r)) {
        game.damage(hero, u, 60 + 11 * lvl);
        game.slow(u, 0.55, 2);
      }
    });
  },

  // E: blink jarak pendek
  ns_blink({ game, hero, x, z }) {
    const dest = game.nav.clampLine(hero.x, hero.z, x, z);
    game.emit({ k: 'ring', x: hero.x, z: hero.z, r: 1.5, c: CYAN });
    game.emit({ k: 'trail', x0: hero.x, z0: hero.z, x1: dest.x, z1: dest.z, c: CYAN });
    hero.x = dest.x;
    hero.z = dest.z;
    hero.order = null;
    hero.path = [];
    game.emit({ k: 'ring', x: dest.x, z: dest.z, r: 1.5, c: CYAN });
  },

  // R: beam raksasa setelah jeda isi daya (garis peringatan terlihat lebih dulu)
  ns_lance({ game, hero, def, dirX, dirZ, lvl }) {
    const x0 = hero.x;
    const z0 = hero.z;
    const x1 = x0 + dirX * def.range;
    const z1 = z0 + dirZ * def.range;
    game.emit({ k: 'beam', x0, z0, x1, z1, w: def.width!, c: CYAN, warn: 1 });
    game.stun(hero, 0.5); // hero diam selama mengisi daya
    game.after(0.5, () => {
      if (!hero.alive) return;
      game.emit({ k: 'beam', x0, z0, x1, z1, w: def.width!, c: 0xffffff });
      game.emit({ k: 'beam', x0, z0, x1, z1, w: def.width! * 1.6, c: CYAN });
      for (const u of game.enemiesInLine(hero.team, x0, z0, x1, z1, def.width! / 2)) {
        game.damage(hero, u, 220 + 40 * lvl);
      }
    });
  },
};
