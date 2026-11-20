import type { Hero } from '../entities';
import type { SkillHandler } from './index';

const GALE = 0xb9f56a;

/** Slipstream: radius pusaran angin, lamanya, jeda antar hembusan, dan slow tiap hembusan. */
const GUST_RADIUS = 3;
const GUST_TIME = 2.5;
const GUST_STEP = 0.25;
const GUST_SLOW = 0.55;

/** Squall Stance: lamanya (detik) dan tambahan kecepatan serang (pecahan). */
const STANCE_TIME = 4;
const STANCE_HASTE = 0.6;
/** Jeda pembaruan stance; lebih pendek dari satu tick simulasi supaya jalan di setiap tick. */
const STANCE_STEP = 0.01;
/** Jeda denyut cincin di kaki hero selama stance aktif (penanda bagi kawan dan lawan). */
const STANCE_PULSE = 0.5;
/** Akhir stance yang sedang aktif per hero, supaya stance lama berhenti bila dipakai ulang. */
const stanceUntil = new WeakMap<Hero, number>();

/** Typhoon Volley: lama membidik, jumlah gelombang, dan jeda antar gelombang (detik). */
const VOLLEY_CHARGE = 0.5;
const VOLLEY_WAVES = 3;
const VOLLEY_STEP = 0.2;
/** Setengah tick simulasi: timer dimajukan sebesar ini supaya jatuh tepat di tick yang dituju, bukan satu tick sesudahnya. */
const HALF_TICK = 0.02;

export const galeArcherSkills: Record<string, SkillHandler> = {
  // Q: panah angin lurus yang menembus; ikut membesar bersama damage serangan biasa
  ga_piercer({ game, hero, def, dirX, dirZ, lvl }) {
    const x1 = hero.x + dirX * def.range;
    const z1 = hero.z + dirZ * def.range;
    game.emit({ k: 'beam', x0: hero.x, z0: hero.z, x1, z1, w: def.width!, c: GALE });
    const dmg = 30 + 7 * lvl + hero.attackDamage * 0.5;
    for (const u of game.enemiesInLine(hero.team, hero.x, hero.z, x1, z1, def.width! / 2)) game.damage(hero, u, dmg);
  },

  // W: melesat ke titik target; pusaran angin tertinggal di tempat semula dan memperlambat musuh di dalamnya
  ga_slip({ game, hero, x, z }) {
    const dest = game.nav.clampLine(hero.x, hero.z, x, z);
    const x0 = hero.x;
    const z0 = hero.z;
    const team = hero.team;
    hero.order = null;
    hero.path = [];
    hero.dash = {
      x: dest.x,
      z: dest.z,
      speed: 30,
      onEnd: () => game.emit({ k: 'trail', x0, z0, x1: hero.x, z1: hero.z, c: GALE }),
    };
    // pusaran tetap ada sampai waktunya habis, walau hero-nya tumbang
    game.emit({ k: 'zone', x: x0, z: z0, r: GUST_RADIUS, t: GUST_TIME, c: GALE });
    const blow = (i: number) => {
      // hembusan yang terlihat tiap satu detik, supaya pusarannya tampak hidup sampai habis
      if (i % 4 === 0) game.emit({ k: 'ring', x: x0, z: z0, r: GUST_RADIUS, c: GALE });
      // slow diperbarui tiap hembusan dan habis sesaat setelah musuh keluar dari pusaran
      for (const u of game.enemiesNear(team, x0, z0, GUST_RADIUS)) game.slow(u, GUST_SLOW, GUST_STEP * 2);
    };
    blow(0);
    for (let i = 1; i * GUST_STEP < GUST_TIME; i++) game.after(i * GUST_STEP - HALF_TICK, () => blow(i));
  },

  // E: beberapa detik menyerang lebih cepat, dan tiap panah diberi damage tambahan
  ga_stance({ game, hero, lvl }) {
    const bonus = 5 + 2 * lvl;
    const until = game.time + STANCE_TIME;
    stanceUntil.set(hero, until);
    game.emit({ k: 'ring', x: hero.x, z: hero.z, r: 2.4, c: GALE });
    let last = game.time;
    let pulseAt = game.time + STANCE_PULSE;
    const tick = () => {
      if (stanceUntil.get(hero) !== until) return; // sudah digantikan stance yang lebih baru
      const now = game.time;
      if (!hero.alive || now >= until) {
        stanceUntil.delete(hero);
        hero.empower = 0;
        return;
      }
      // jeda serangan dipercepat: selain berkurang oleh waktu, ia dipotong lagi sebesar pecahan STANCE_HASTE
      hero.attackCd = Math.max(0, hero.attackCd - (now - last) * STANCE_HASTE);
      last = now;
      // `empower` habis dipakai tiap serangan, jadi diisi lagi selama stance berjalan
      if (hero.empower < bonus) hero.empower = bonus;
      if (now >= pulseAt) {
        pulseAt += STANCE_PULSE;
        game.emit({ k: 'ring', x: hero.x, z: hero.z, r: 1.8, c: GALE });
      }
      game.after(STANCE_STEP, tick);
    };
    tick();
  },

  // R: membidik sejenak (garis peringatan terlihat), lalu beberapa gelombang panah di jalur yang sama
  ga_volley({ game, hero, def, dirX, dirZ, lvl }) {
    const x0 = hero.x;
    const z0 = hero.z;
    const x1 = x0 + dirX * def.range;
    const z1 = z0 + dirZ * def.range;
    const w = def.width!;
    // geseran ke samping untuk dua jejak panah tiap gelombang (tegak lurus arah tembak)
    const sx = -dirZ * w * 0.3;
    const sz = dirX * w * 0.3;
    // Garis peringatan. Client menggambar garis bidik selebar setengah `w`, jadi dikirim dua kali
    // lebar jalur supaya yang terlihat di tanah sama lebarnya dengan area yang akan kena.
    const warn = () => game.emit({ k: 'beam', x0, z0, x1, z1, w: w * 2, c: GALE, warn: 1 });
    warn();
    // Garis bidik itu tipis sekali di HP (tanpa bloom), jadi jalurnya juga ditandai deretan lingkaran
    // bahaya selebar jalur, yang terisi penuh tepat saat gelombang terakhir mendarat.
    const total = VOLLEY_CHARGE + (VOLLEY_WAVES - 1) * VOLLEY_STEP;
    for (let d = w / 2; d < def.range; d += w) game.emit({ k: 'zone', x: x0 + dirX * d, z: z0 + dirZ * d, r: w / 2, t: total, c: GALE });
    // hero diam sampai gelombang terakhir lepas
    game.stun(hero, total + HALF_TICK);
    for (let i = 0; i < VOLLEY_WAVES; i++) {
      game.after(VOLLEY_CHARGE + i * VOLLEY_STEP - HALF_TICK, () => {
        if (!hero.alive) return;
        const final = i === VOLLEY_WAVES - 1;
        // jalur tetap ditandai selama masih ada gelombang berikutnya
        if (!final) warn();
        // dua jejak panah sejajar per gelombang; gelombang penutup berupa satu hembusan di tengah jalur
        if (final) game.emit({ k: 'beam', x0, z0, x1, z1, w: w * 0.6, c: GALE });
        else for (const s of [-1, 1]) game.emit({ k: 'trail', x0: x0 + sx * s, z0: z0 + sz * s, x1: x1 + sx * s, z1: z1 + sz * s, c: GALE });
        const dmg = 45 + 9 * lvl + hero.attackDamage * 0.4;
        for (const u of game.enemiesInLine(hero.team, x0, z0, x1, z1, w / 2)) {
          game.damage(hero, u, dmg);
          game.slow(u, 0.7, 1);
        }
      });
    }
  },
};
