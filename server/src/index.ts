// Server game: HTTP statis (hasil build client) + Socket.IO. Simulasi authoritative ada di game/.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Server } from 'socket.io';
import { TICK_RATE, type ClientCommand, type JoinRequest, type JoinResult } from '../../shared/src';
import { Game } from './game/Game';

const PORT = Number(process.env.PORT) || 3000;
// Prefix URL jika server dipasang di belakang reverse proxy, mis. BASE_PATH=/game. Kosong = root.
const BASE = ('/' + (process.env.BASE_PATH ?? '').replace(/^\/+|\/+$/g, '')).replace(/\/$/, '');
const CLIENT_DIR = path.resolve(process.env.CLIENT_DIR ?? 'dist/client');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

const httpServer = http.createServer((req, res) => {
  if ((req as { needsSlash?: boolean }).needsSlash) {
    res.writeHead(301, { Location: BASE + '/' }).end();
    return;
  }
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = path.normalize(path.join(CLIENT_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(CLIENT_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      const hint = fs.existsSync(CLIENT_DIR)
        ? 'Not found'
        : 'Client belum di-build. Jalankan "npm run build", atau pakai "npm run dev" lalu buka http://localhost:5173';
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end(hint);
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' }).end(data);
  });
});

const io = new Server(httpServer, { path: '/socket.io', cors: { origin: '*' } });

// Buang prefix BASE dari URL sebelum Socket.IO / handler statis melihatnya, sehingga server
// berfungsi baik saat proxy meneruskan path utuh maupun saat proxy sudah memotong prefix.
function stripBase(req: http.IncomingMessage): void {
  const url = req.url ?? '/';
  if (!BASE || !url.toLowerCase().startsWith(BASE.toLowerCase())) return;
  const rest = url.slice(BASE.length);
  if (rest === '') (req as { needsSlash?: boolean }).needsSlash = true;
  if (rest === '' || rest[0] === '/' || rest[0] === '?') req.url = rest.startsWith('/') ? rest : '/' + rest;
}
httpServer.prependListener('request', stripBase);
httpServer.prependListener('upgrade', stripBase);

const game = new Game();
const STEP = 1 / TICK_RATE;

io.on('connection', (socket) => {
  let lastCmd = 0;
  let cmdCount = 0;

  socket.on('join', (req: JoinRequest, ack?: (r: JoinResult) => void) => {
    const result = game.addPlayer(socket.id, String(req?.name ?? ''), String(req?.heroId ?? ''));
    if (typeof ack === 'function') ack(result);
    if (result.ok) console.log(`[join] ${socket.id} -> tim ${result.team} (${game.players.size} pemain)`);
  });

  socket.on('cmd', (cmd: ClientCommand) => {
    // rate limit kasar: maksimal 40 perintah per detik per koneksi
    const now = Date.now();
    if (now - lastCmd > 1000) {
      lastCmd = now;
      cmdCount = 0;
    }
    if (++cmdCount > 40) return;
    game.handleCommand(socket.id, cmd);
  });

  socket.on('disconnect', () => {
    game.removePlayer(socket.id);
    // room kosong: reset supaya pemain berikutnya memulai pertandingan baru
    if (game.players.size === 0) game.setupWorld();
  });
});

let last = performance.now();
let acc = 0;
setInterval(() => {
  const now = performance.now();
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  if (game.players.size === 0) {
    acc = 0; // tidak ada pemain: simulasi dijeda
    return;
  }
  let ticked = false;
  while (acc >= STEP) {
    game.update(STEP);
    acc -= STEP;
    ticked = true;
  }
  if (!ticked) return;
  for (const p of game.players.values()) {
    io.sockets.sockets.get(p.id)?.emit('snap', game.snapshotFor(p));
  }
  game.clearEvents();
}, 1000 / TICK_RATE / 2);

httpServer.listen(PORT, () => {
  console.log(`Astra Legion server di http://localhost:${PORT}${BASE ? ` (juga di prefix ${BASE}/)` : ''}`);
});
