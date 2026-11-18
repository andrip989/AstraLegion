import type { SkillHandler } from './index';

const EMBER = 0xff7a3c;
const FLARE = 0xffc46b;

/** Inferno Cyclone: jumlah denyut dan jeda antar denyut (detik). */
const CYCLONE_TICKS = 6;
const CYCLONE_STEP = 0.5;

export const emberLancerSkills: Record<string, SkillHandler> = {
  // Q: tusukan tombak berapi lurus ke depan, melukai dan memperlambat semua musuh di jalurnya
  el_thrust({ game, hero, def, dirX, dirZ, lvl }) {
    const x1 = hero.x + dirX * def.range;
    const z1 = hero.z + dirZ * def.range;
    game.emit({ k: 'beam', x0: hero.x, z0: hero.z, x1, z1, w: def.width!, c: EMBER });
    for (const u of game.enemiesInLine(hero.team, hero.x, hero.z, x1, z1, def.width! / 2)) {
      game.damage(hero, u, 65 + 11 * lvl);
      game.slow(u, 0.65, 1.5);
    }
  },

  // W: perisai penyerap damage + semburan api ke musuh yang menempel
  el_guard({ game, hero, def, lvl }) {
    const r = def.radius!;
    hero.shield = 90 + 22 * lvl;
    hero.shieldUntil = game.time + 3.5;
    game.emit({ k: 'ring', x: hero.x, z: hero.z, r, c: EMBER });
    for (const u of game.enemiesNear(hero.team, hero.x, hero.z, r)) game.damage(hero, u, 35 + 7 * lvl);
  },

  // E: melompat ke titik target, damage + slow di titik mendarat
  el_leap({ game, hero, def, x, z, lvl }) {
    const dest = game.nav.clampLine(hero.x, hero.z, x, z);
    const x0 = hero.x;
    const z0 = hero.z;
    hero.order = null;
    hero.path = [];
    hero.dash = {
      x: dest.x,
      z: dest.z,
      speed: 28,
      onEnd: () => {
        const r = def.radius!;
        game.emit({ k: 'trail', x0, z0, x1: hero.x, z1: hero.z, c: EMBER });
        game.emit({ k: 'ring', x: hero.x, z: hero.z, r, c: EMBER });
        for (const u of game.enemiesNear(hero.team, hero.x, hero.z, r)) {
          game.damage(hero, u, 55 + 10 * lvl);
          game.slow(u, 0.6, 1.5);
        }
      },
    };
  },

  // R: pusaran api yang mengikuti hero; tiap denyut membakar musuh di sekitar posisinya SAAT ITU
  el_cyclone({ game, hero, def, lvl }) {
    const r = def.radius!;
    const pulse = (i: number) => {
      if (!hero.alive) return;
      // sapuan tombak: garis api melintang yang berputar dari denyut ke denyut
      const a = i * 1.1;
      const sx = Math.sin(a) * r;
      const sz = Math.cos(a) * r;
      game.emit({ k: 'trail', x0: hero.x - sx, z0: hero.z - sz, x1: hero.x + sx, z1: hero.z + sz, c: FLARE });
      game.emit({ k: 'ring', x: hero.x, z: hero.z, r, c: EMBER });
      for (const u of game.enemiesNear(hero.team, hero.x, hero.z, r)) game.damage(hero, u, 32 + 6 * lvl);
    };
    pulse(0);
    for (let i = 1; i < CYCLONE_TICKS; i++) game.after(i * CYCLONE_STEP, () => pulse(i));
  },
};
