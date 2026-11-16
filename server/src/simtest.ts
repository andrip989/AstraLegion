// Uji asap simulasi: jalankan pertandingan bot-vs-bot tanpa jaringan dan laporkan hasilnya.
// Pakai: npm run sim [menit]
import { TICK_RATE } from '../../shared/src';
import { Game } from './game/Game';

const minutes = Number(process.argv[2]) || 30;
const game = new Game();
const dt = 1 / TICK_RATE;
const t0 = Date.now();
let maxUnits = 0;

for (let i = 0; i < minutes * 60 * TICK_RATE && game.winner === null; i++) {
  game.update(dt);
  game.clearEvents();
  maxUnits = Math.max(maxUnits, game.units.length);
  if (i % (60 * TICK_RATE) === 0 && i > 0) {
    const towers = [0, 1].map((t) => game.units.filter((u) => u.kind === 'tower' && u.team === t).length);
    console.log(
      `menit ${i / 60 / TICK_RATE}: unit=${game.units.length} tower B/M=${towers.join('/')} skor=${game.score.join('-')} lvl=${game.heroes.map((h) => h.level).join(',')}`,
    );
  }
}

const ms = Date.now() - t0;
console.log(
  game.winner === null
    ? `Belum ada pemenang setelah ${minutes} menit.`
    : `Pemenang: tim ${game.winner} pada ${(game.time / 60).toFixed(1)} menit.`,
);
console.log(`unit maksimum=${maxUnits}, waktu CPU=${ms} ms untuk ${(game.time / 60).toFixed(1)} menit simulasi`);
for (const h of game.heroes) {
  console.log(`  [tim ${h.team}] ${h.name}: lvl ${h.level}, ${h.kills}/${h.deaths}/${h.assists}, gold ${Math.floor(h.gold)}`);
}
