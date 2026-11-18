// Uji keseimbangan hero: banyak pertandingan bot-vs-bot, lalu tabel menang/KDA/damage per hero.
//   npm run balance -- 60 20     (60 pertandingan, masing-masing paling lama 20 menit)
import { Game } from '../server/src/game/Game';
import { TICK_RATE } from '../shared/src';

const matches = Number(process.argv[2]) || 20;
const minutes = Number(process.argv[3]) || 20;
const dt = 1 / TICK_RATE;

interface Row {
  games: number;
  wins: number;
  decided: number;
  k: number;
  d: number;
  a: number;
  dd: number;
  dt: number;
  lvl: number;
}
const rows = new Map<string, Row>();
let finished = 0;
let totalTime = 0;

for (let m = 0; m < matches; m++) {
  const game = new Game();
  let snap = game.heroes.map((h) => h);
  let winner: number | null = null;
  for (let i = 0; i < minutes * 60 * TICK_RATE; i++) {
    game.update(dt);
    game.clearEvents();
    if (game.winner !== null) {
      winner = game.winner;
      break;
    }
    snap = game.heroes;
  }
  if (winner !== null) finished++;
  totalTime += game.time;
  for (const h of snap) {
    const r = rows.get(h.def.id) ?? { games: 0, wins: 0, decided: 0, k: 0, d: 0, a: 0, dd: 0, dt: 0, lvl: 0 };
    r.games++;
    if (winner !== null) {
      r.decided++;
      if (h.team === winner) r.wins++;
    }
    r.k += h.kills;
    r.d += h.deaths;
    r.a += h.assists;
    r.dd += h.dmgDealt;
    r.dt += h.dmgTaken;
    r.lvl += h.level;
    rows.set(h.def.id, r);
  }
  console.log(`match ${m + 1}: ${winner === null ? 'belum selesai' : 'tim ' + winner} @${(game.time / 60).toFixed(1)}m  ${snap.map((h) => `${h.team}:${h.def.id.split('_')[0]} ${h.kills}/${h.deaths}/${h.assists}`).join('  ')}`);
}

console.log(`\n${finished}/${matches} selesai, rata-rata ${(totalTime / matches / 60).toFixed(1)} menit`);
console.log('hero            games  win%   K     D     A     dmg    taken  lvl');
for (const [id, r] of rows) {
  const g = r.games;
  console.log(
    `${id.padEnd(15)} ${String(g).padStart(4)}  ${(r.decided ? (r.wins / r.decided) * 100 : 0).toFixed(0).padStart(4)}  ${(r.k / g).toFixed(1).padStart(5)} ${(r.d / g).toFixed(1).padStart(5)} ${(r.a / g).toFixed(1).padStart(5)} ${(r.dd / g).toFixed(0).padStart(6)} ${(r.dt / g).toFixed(0).padStart(6)} ${(r.lvl / g).toFixed(1).padStart(5)}`,
  );
}
