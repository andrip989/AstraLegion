import type { SkillHandler } from './index';

const MINT = 0x7dffb0;

export const lumenSageSkills: Record<string, SkillHandler> = {
  // Q: bola cahaya yang meledak di titik target, melukai dan memperlambat
  ls_orb({ game, hero, def, x, z, lvl }) {
    const r = def.radius!;
    game.emit({ k: 'trail', x0: hero.x, z0: hero.z, x1: x, z1: z, c: MINT });
    game.after(0.3, () => {
      game.emit({ k: 'ring', x, z, r, c: MINT });
      for (const u of game.enemiesNear(hero.team, x, z, r)) {
        game.damage(hero, u, 60 + 11 * lvl);
        game.slow(u, 0.7, 1.5);
      }
    });
  },

  // W: menyembuhkan diri dan hero kawan di sekitar
  ls_heal({ game, hero, def, lvl }) {
    const r = def.radius!;
    game.emit({ k: 'ring', x: hero.x, z: hero.z, r, c: MINT });
    for (const ally of game.alliesNear(hero.team, hero.x, hero.z, r)) game.heal(ally, 80 + 16 * lvl);
  },

  // E: sinar pengikat lurus yang melukai dan men-stun semua musuh di jalurnya
  ls_bind({ game, hero, def, dirX, dirZ, lvl }) {
    const x1 = hero.x + dirX * def.range;
    const z1 = hero.z + dirZ * def.range;
    game.emit({ k: 'beam', x0: hero.x, z0: hero.z, x1, z1, w: def.width!, c: MINT });
    for (const u of game.enemiesInLine(hero.team, hero.x, hero.z, x1, z1, def.width! / 2)) {
      game.damage(hero, u, 40 + 8 * lvl);
      game.stun(u, 1);
    }
  },

  // R: suaka cahaya di sekeliling: kawan disembuhkan besar, musuh terbakar dan melambat
  ls_sanctuary({ game, hero, def, lvl }) {
    const r = def.radius!;
    game.emit({ k: 'ring', x: hero.x, z: hero.z, r, c: MINT });
    game.emit({ k: 'ring', x: hero.x, z: hero.z, r: r * 0.6, c: 0xffffff });
    for (const ally of game.alliesNear(hero.team, hero.x, hero.z, r)) game.heal(ally, 180 + 35 * lvl);
    for (const u of game.enemiesNear(hero.team, hero.x, hero.z, r)) {
      game.damage(hero, u, 120 + 25 * lvl);
      game.slow(u, 0.6, 2);
    }
  },
};
