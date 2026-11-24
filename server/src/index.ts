// Server game: HTTP statis (hasil build client) + Socket.IO. Simulasi authoritative ada di game/.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Server } from 'socket.io';
import { MIN_RECORDED_ACTIONS, actionsNeeded, MIN_RECORDED_SECONDS, TICK_RATE, roomCode, type AccMatch, type ClientCommand, type JoinRequest, type JoinResult } from '../../shared/src';
import { Social, openAccounts, serveAccounts } from './accounts';
import { Game } from './game/Game';

const PORT = Number(process.env.PORT) || 3000;
// Alamat bind. Hosting seperti alwaysdata memberi IP dan PORT lewat variabel lingkungan dan hanya
// meneruskan trafik ke alamat itu. Kosong = semua antarmuka.
const HOST = process.env.IP || undefined;
// Diisi oleh pemuat hosting (server/host/start.cjs): id build yang sedang berjalan, dan fungsi
// yang bernilai true setelah build server yang lebih baru selesai diunggah.
const hostLoader = globalThis as { astraBuild?: string; astraStale?: () => boolean };
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
  if (urlPath === '/health') {
    // Pemeriksaan cepat bahwa server hidup dan build mana yang berjalan (dipakai skrip build).
    const body = { ok: true, name: 'astra-legion', build: hostLoader.astraBuild ?? 'dev', players: totalPlayers(), rooms: rooms.size - 1, uptime: Math.round(process.uptime()), accounts: accountDb.usable };
    res
      .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' })
      .end(JSON.stringify(body));
    return;
  }
  const file =path.normalize(path.join(CLIENT_DIR, urlPath === '/' ? 'index.html' : urlPath));
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

// Pesan dari client selalu kecil (perintah, obrolan, masuk akun), jadi ukurannya dibatasi ketat.
const io = new Server(httpServer, { path: '/socket.io', cors: { origin: '*' }, serveClient: false, maxHttpBufferSize: 32 * 1024 });

/** Akun pemain (lihat accounts.ts). Disimpan di luar folder web dan folder deploy. */
const accountDb = openAccounts();

// Buang prefix BASE dari URL sebelum Socket.IO / handler statis melihatnya, sehingga server
// berfungsi baik saat proxy meneruskan path utuh maupun saat proxy sudah memotong prefix.
function stripBase(req: http.IncomingMessage): void {
  let url = req.url ?? '/';
  // Socket.IO di subfolder mana pun, tanpa konfigurasi: hosting yang hanya meneruskan satu path
  // ke server ini (mis. situs.com/game/RPG/socket.io) mengirim path itu utuh, jadi semua yang
  // ada di depan /socket.io/ dibuang.
  const query = url.indexOf('?');
  const at = (query < 0 ? url : url.slice(0, query)).indexOf('/socket.io/');
  if (at >= 0) {
    url = url.slice(at);
    // .../socket.io/health dijawab handler HTTP biasa, bukan Socket.IO
    req.url = /^\/socket\.io\/health\/?(\?|$)/.test(url) ? '/health' : url;
    return;
  }
  if (!BASE || !url.toLowerCase().startsWith(BASE.toLowerCase())) return;
  const rest = url.slice(BASE.length);
  if (rest === '') (req as { needsSlash?: boolean }).needsSlash = true;
  if (rest === '' || rest[0] === '/' || rest[0] === '?') req.url = rest.startsWith('/') ? rest : '/' + rest;
}
httpServer.prependListener('request', stripBase);
httpServer.prependListener('upgrade', stripBase);

/**
 * Satu pertandingan per room. Kunci '' = room umum (selalu ada); room pribadi dibuat saat pemain
 * pertama masuk dengan kodenya dan dihapus begitu kosong.
 */
interface Room {
  game: Game;
  /** Waktu simulasi yang belum dijalankan (detik). */
  acc: number;
  /** Hasil pertandingan yang sedang berjalan sudah dicatat ke akun para pemainnya. */
  settled: boolean;
  /** Nomor urut pertandingan di room ini; naik tiap kali dunia dibangun ulang. */
  matchNo: number;
  /** Waktu pertandingan pada tick terakhir; bila mundur, berarti pertandingan baru dimulai. */
  lastTime: number;
  /** Detik bermain di pertandingan ini milik akun yang kursinya sudah dilepas (mis. halaman dimuat ulang). */
  played: Map<string, number>;
  /** Akun yang keluar dari pertandingan ini sebelum selesai dan sudah dicatat kalah (lihat forfeit). */
  left: Set<string>;
}
const newRoom = (): Room => ({ game: new Game(), acc: 0, settled: false, matchNo: 0, lastTime: 0, played: new Map(), left: new Set() });
/** Pertandingan baru dimulai di room ini (dunianya dibangun ulang): catatan per pertandingan dikosongkan. */
function newMatch(room: Room): void {
  room.matchNo++;
  room.settled = false;
  room.played.clear();
  room.left.clear();
  room.lastTime = room.game.time;
}
const rooms = new Map<string, Room>([['', newRoom()]]);
/** Tiap room yang berisi pemain menjalankan simulasi sendiri, jadi jumlahnya dibatasi. */
const MAX_ROOMS = 12;
const STEP = 1 / TICK_RATE;

function totalPlayers(): number {
  let n = 0;
  for (const r of rooms.values()) n += r.game.players.size;
  return n;
}

/**
 * Sesi pemain. Client mengirim token acak saat bergabung; bila socket-nya putus (sinyal HP hilang,
 * aplikasi ke latar belakang), hero-nya ditahan selama GRACE_MS dan client bisa menyambung lagi
 * dengan token yang sama untuk melanjutkan hero itu. Setelah itu barulah slotnya diambil alih bot.
 */
interface Session {
  room: string;
  /** Id socket yang sekarang memegang sesi ini (= id pemain di Game). */
  socketId: string;
  timer: ReturnType<typeof setTimeout> | null;
  /** Kunci akun yang masuk saat pemain bergabung (null = tamu); ke akun inilah hasil pertandingan dicatat. */
  account: string | null;
  /** Pertandingan (Room.matchNo) dan waktu pertandingan saat pemain bergabung. */
  matchNo: number;
  joinedAt: number;
}
const sessions = new Map<string, Session>();
const GRACE_MS = 60_000;

/** Kehadiran pemain untuk daftar teman: sebuah akun "sedang bermain" selama ia menduduki kursi di pertandingan. */
const social = new Social(accountDb, (key) => {
  for (const s of sessions.values()) if (s.account === key) return true;
  return false;
});

/** Detik pemain ini sudah ikut di pertandingan yang sedang berjalan di room-nya. */
function secondsPlayed(room: Room, s: Session): number {
  return Math.max(0, room.game.time - (s.matchNo === room.matchNo ? s.joinedAt : 0));
}

/**
 * Pertandingan di sebuah room selesai: catat hasilnya ke akun tiap pemain yang masuk akun, dari
 * data simulasi server sendiri (hero, menang/kalah, K/D/A, lama ikut bermain, dan keadaan room
 * yang menentukan poin peringkat). Dipanggil sekali per pertandingan; client tidak punya cara
 * untuk mengirim statistiknya sendiri.
 */
function settleMatch(code: string, room: Room): void {
  const game = room.game;
  /** Satu akun hanya dicatat sekali per pertandingan, walau entah bagaimana menduduki dua kursi. */
  const credited = new Set<string>();
  /** Tim yang masih berisi pemain manusia saat pertandingan selesai (bonus poin peringkat untuk lawannya). */
  const humans = [false, false];
  // hanya yang benar-benar bermain: tab kedua yang diam di tim lawan tidak memberi bonus
  for (const p of game.players.values()) if (p.hero.actions >= actionsNeeded(game.time)) humans[p.hero.team] = true;
  let recorded = 0;
  for (const s of sessions.values()) {
    if (s.room !== code || !s.account || credited.has(s.account)) continue;
    const p = game.players.get(s.socketId);
    const account = accountDb.account(s.account);
    if (!p || !account) continue;
    credited.add(s.account);
    const seconds = Math.round((room.played.get(s.account) ?? 0) + secondsPlayed(room, s));
    let result: AccMatch | null;
    if (game.adminUsed) {
      // menu admin dipakai di pertandingan ini: tidak ada yang dicatat
      result = { account, xp: 0, missions: [], unlocked: [], skipped: 'admin' };
    } else if (room.left.has(s.account)) {
      // sempat keluar dari pertandingan ini lalu masuk lagi: sudah dicatat kalah saat keluar, tidak dicatat dua kali
      result = { account, xp: 0, missions: [], unlocked: [], skipped: 'left' };
    } else if (seconds < MIN_RECORDED_SECONDS) {
      // baru bergabung menjelang akhir (mis. menumpang kemenangan orang lain): tidak dihitung
      result = { account, xp: 0, missions: [], unlocked: [], skipped: 'short' };
    } else if (p.hero.actions < actionsNeeded(seconds)) {
      // Nyaris diam sepanjang pertandingan: tidak ada XP atau kemenangan gratis, dan untuk poin
      // peringkat dihitung kalah (seperti keluar), supaya diam bukan cara menghindari kekalahan.
      const h = p.hero;
      const lost = accountDb.recordMatch(
        s.account,
        { hero: h.def.id, win: false, k: h.kills, d: h.deaths, a: h.assists, dur: seconds, mode: 'online', left: true },
        { botLevel: game.botLevel, humanEnemy: false, quick: game.mode === 'kilat' },
      );
      result = { account: lost?.account ?? account, xp: 0, missions: [], unlocked: [], skipped: 'afk', ...(lost ? { rp: lost.rp } : {}) };
    } else {
      const h = p.hero;
      result = accountDb.recordMatch(
        s.account,
        { hero: h.def.id, win: h.team === game.winner, k: h.kills, d: h.deaths, a: h.assists, dur: seconds, mode: 'online', titans: h.titans },
        { botLevel: game.botLevel, humanEnemy: humans[h.team === 0 ? 1 : 0], quick: game.mode === 'kilat' },
      );
      if (result) recorded++;
    }
    if (result) {
      const playing = io.sockets.sockets.get(s.socketId);
      playing?.emit('acc:match', result);
      // sambungan lain milik akun itu (lobby di tab atau perangkat lain) ikut melihat koin dan statistik terbarunya
      if (!result.skipped || result.skipped === 'afk') social.emit(s.account, 'acc:update', { ok: true, account: result.account }, playing);
    }
  }
  if (credited.size) console.log(`[akun] hasil pertandingan room ${code || '(umum)'} dicatat untuk ${recorded} akun${credited.size > recorded ? ` (${credited.size - recorded} dilewati: baru bergabung, tidak ikut bermain, atau sudah keluar)` : ''}`);
}

/**
 * Kursi sebuah akun dilepas selagi pertandingannya masih berjalan (sengaja keluar, masa tunggu
 * sambung-ulang habis, keluar akun, atau akun itu pindah bermain ke tempat lain): dihitung kalah.
 * Bila pemain itu sudah cukup ikut bermain (syarat yang sama dengan pencatatan biasa), kekalahan
 * dicatat saat itu juga dengan K/D/A-nya sampai saat itu, dan akunnya ditandai supaya tidak
 * dicatat lagi untuk pertandingan yang sama bila ia masuk kembali. Tanpa ini, keluar sebelum
 * kalah akan menghindarkan pemain dari kehilangan poin peringkat.
 * Mengembalikan true bila kekalahan dicatat.
 */
function forfeit(room: Room, s: Session): boolean {
  const key = s.account;
  if (!key || room.settled || room.game.winner !== null || room.left.has(key) || room.game.adminUsed) return false;
  const p = room.game.players.get(s.socketId);
  if (!p) return false;
  const seconds = Math.round((room.played.get(key) ?? 0) + secondsPlayed(room, s));
  if (seconds < MIN_RECORDED_SECONDS || p.hero.actions < MIN_RECORDED_ACTIONS) return false; // baru sebentar ikut: tidak ada yang dicatat
  const h = p.hero;
  const result = accountDb.recordMatch(
    key,
    { hero: h.def.id, win: false, k: h.kills, d: h.deaths, a: h.assists, dur: seconds, mode: 'online', left: true },
    { botLevel: room.game.botLevel, humanEnemy: false, quick: room.game.mode === 'kilat' },
  );
  if (!result) return false;
  room.left.add(key);
  room.played.delete(key);
  console.log(`[akun] keluar sebelum pertandingan selesai di room ${s.room || '(umum)'}: dicatat kalah`);
  return true;
}

/**
 * Keluarkan pemain dari room-nya untuk seterusnya. `why`: 'leave' = pemainnya yang pergi (dihitung
 * kalah bila pertandingan masih berjalan, lihat forfeit); 'server' = server sendiri yang melepas
 * kursinya (server dimatikan, room dibubarkan), jadi pemainnya tidak dihukum.
 */
function dropSession(token: string, why: 'leave' | 'server' = 'leave'): void {
  const s = sessions.get(token);
  if (!s) return;
  sessions.delete(token);
  if (s.timer) clearTimeout(s.timer);
  const room = rooms.get(s.room);
  if (room) {
    const lost = why === 'leave' && forfeit(room, s);
    // waktu bermainnya tetap dihitung bila akun itu masuk lagi ke pertandingan yang sama
    if (s.account && !lost && !room.settled && !room.left.has(s.account)) room.played.set(s.account, (room.played.get(s.account) ?? 0) + secondsPlayed(room, s));
    room.game.removePlayer(s.socketId);
    if (room.game.players.size === 0) {
      // kosong: room pribadi dihapus, room umum di-reset supaya pemain berikutnya mulai dari awal
      if (s.room) rooms.delete(s.room);
      else {
        room.game.setupWorld();
        newMatch(room);
      }
    }
  }
  if (s.account) social.touch(s.account);
}

let anonymous = 0;

io.on('connection', (socket) => {
  let lastCmd = 0;
  let cmdCount = 0;
  /** Token sesi yang dipegang socket ini; null = belum bergabung (masih di lobby). */
  let token: string | null = null;
  /** Client lama tidak mengirim token: sesinya tidak bisa dilanjutkan, jadi langsung dilepas saat putus. */
  let resumable = false;
  /**
   * Akun yang masuk di socket ini. Keluar akun di tengah pertandingan melepas kursinya dari akun
   * itu, dan dihitung sama dengan meninggalkan pertandingan (lihat forfeit): kalau tidak, keluar
   * akun menjelang kalah akan menghindarkan pemain dari kehilangan poin peringkat.
   */
  const seat = serveAccounts(socket, accountDb, social, () => {
    const s = token ? sessions.get(token) : undefined;
    if (!s || s.socketId !== socket.id || !s.account) return;
    const account = s.account;
    const room = rooms.get(s.room);
    if (room) forfeit(room, s);
    s.account = null;
    room?.game.setEmotes(socket.id, undefined); // paket emote milik akun itu ikut dilepas
    social.touch(account);
  });

  socket.on('join', (req: JoinRequest, ack?: (r: JoinResult) => void) => {
    const reply = (r: JoinResult) => typeof ack === 'function' && ack(r);
    const want = typeof req?.session === 'string' ? req.session.slice(0, 64) : '';

    // melanjutkan sesi yang masih ditahan (atau yang socket lamanya belum dinyatakan putus)
    const held = want ? sessions.get(want) : undefined;
    const heldRoom = held ? rooms.get(held.room) : undefined;
    if (held && heldRoom?.game.players.has(held.socketId)) {
      if (token && token !== want) dropSession(token);
      if (held.timer) clearTimeout(held.timer);
      held.timer = null;
      if (held.socketId !== socket.id) {
        const previous = io.sockets.sockets.get(held.socketId);
        heldRoom.game.rebindPlayer(held.socketId, socket.id);
        held.socketId = socket.id;
        previous?.disconnect(true);
      }
      token = want;
      resumable = true;
      const p = heldRoom.game.players.get(socket.id)!;
      console.log(`[resume] ${socket.id} -> room ${held.room || '(umum)'}, tim ${p.hero.team}`);
      return reply({ ok: true, team: p.hero.team, room: held.room, players: heldRoom.game.players.size, resumed: true });
    }

    if (token) dropSession(token);
    token = null;
    // Satu akun, satu kursi: hasil pertandingan dicatat ke akun, jadi akun yang sama tidak boleh
    // bermain di dua tempat sekaligus. Kursi lama yang socket-nya sudah putus (mis. halaman dimuat
    // ulang) langsung dilepas; bila masih tersambung, permintaan ini ditolak.
    const account = seat.key();
    if (account) {
      for (const [other, s] of sessions) {
        if (s.account !== account) continue;
        const holder = io.sockets.sockets.get(s.socketId);
        if (!holder?.connected) {
          dropSession(other);
          continue;
        }
        // Socket yang mati mendadak baru ketahuan setelah puluhan detik: tanyai dulu, dan lepas
        // kursinya bila tidak menjawab, supaya percobaan berikutnya berhasil.
        holder.timeout(2000).emit('acc:alive', (err: Error | null) => {
          if (err && sessions.get(other) === s && s.socketId === holder.id) dropSession(other);
        });
        return reply({ ok: false, error: 'Akun ini sedang bermain di tab atau perangkat lain. Tutup yang itu dulu, lalu coba lagi.' });
      }
    }
    const code = roomCode(req?.room);
    let room = rooms.get(code);
    if (!room) {
      if (rooms.size >= MAX_ROOMS) return reply({ ok: false, error: 'Server sedang penuh. Coba room umum, atau beberapa saat lagi.' });
      room = newRoom();
      rooms.set(code, room);
    }
    const team = req?.team === 0 || req?.team === 1 ? req.team : undefined;
    const spell = typeof req?.spell === 'string' ? req.spell : undefined;
    // pemain yang masuk akun selalu tampil dengan nama akunnya
    const mode = typeof req?.mode === 'string' ? req.mode : undefined;
    const talent = typeof req?.talent === 'string' ? req.talent : undefined;
    const size = typeof req?.size === 'number' ? req.size : undefined;
    // skin diperiksa server: akun hanya memakai skin yang ia punya (level cukup, atau sudah dibeli); selain itu skin asli
    const skin = accountDb.joinSkin(account, req?.skin);
    const result = room.game.addPlayer(socket.id, seat.name() ?? String(req?.name ?? ''), String(req?.heroId ?? ''), team, spell, skin, req?.bots, mode, talent, size);
    if (result.ok) {
      room.game.setCaps(socket.id, req?.caps);
      // jumlah emote ditetapkan dari akun (paket emote dari toko), bukan dari permintaan client
      room.game.setEmotes(socket.id, accountDb.emotes(account));
      resumable = !!want && !sessions.has(want);
      token = resumable ? want : `anon-${++anonymous}-${socket.id}`;
      sessions.set(token, { room: code, socketId: socket.id, timer: null, account, matchNo: room.matchNo, joinedAt: room.game.time });
      if (account) social.touch(account); // teman-temannya melihat "sedang bermain"
      result.room = code;
      result.players = room.game.players.size;
      console.log(`[join] ${socket.id} -> room ${code || '(umum)'}, tim ${result.team} (${room.game.players.size} pemain, ${rooms.size} room)`);
    } else if (code && room.game.players.size === 0) {
      rooms.delete(code);
    }
    reply(result);
  });

  socket.on('cmd', (cmd: ClientCommand) => {
    // rate limit kasar: maksimal 40 perintah per detik per koneksi
    const now = Date.now();
    if (now - lastCmd > 1000) {
      lastCmd = now;
      cmdCount = 0;
    }
    const s = token ? sessions.get(token) : undefined;
    if (++cmdCount > 40 || !s || s.socketId !== socket.id) return;
    rooms.get(s.room)?.game.handleCommand(socket.id, cmd);
  });

  // pengukur latensi: client mengirim, server langsung membalas
  socket.on('lat', (_t: unknown, ack?: () => void) => {
    if (typeof ack === 'function') ack();
  });

  // pemain sengaja keluar (kembali ke lobby, keluar akun): tidak perlu ditahan
  socket.on('leave', () => {
    if (token && sessions.get(token)?.socketId === socket.id) dropSession(token);
    token = null;
  });

  socket.on('disconnect', (reason) => {
    const s = token ? sessions.get(token) : undefined;
    if (!token || !s || s.socketId !== socket.id) return; // sudah keluar, atau sesi sudah pindah ke socket baru
    // server sendiri yang menutup semua sambungan (sedang dimatikan): pemainnya tidak dihitung keluar
    if (reason === 'server shutting down') return dropSession(token, 'server');
    if (!resumable) return dropSession(token);
    // hero pulang ke base selagi pemiliknya menyambung ulang, supaya tidak jadi sasaran empuk
    rooms.get(s.room)?.game.handleCommand(socket.id, { t: 'recall' });
    const held = token;
    s.timer = setTimeout(() => dropSession(held), GRACE_MS);
  });
});

let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  let busy = false;
  for (const [code, room] of rooms) {
    const game = room.game;
    if (game.players.size === 0) {
      room.acc = 0; // tidak ada pemain: simulasi room ini dijeda
      continue;
    }
    busy = true;
    room.acc += dt;
    let ticked = false;
    while (room.acc >= STEP) {
      game.update(STEP);
      room.acc -= STEP;
      ticked = true;
      if (game.time < room.lastTime) newMatch(room); // dunia dibangun ulang: pertandingan baru
      room.lastTime = game.time;
      if (game.winner !== null && !room.settled) {
        room.settled = true;
        settleMatch(code, room);
      }
    }
    if (!ticked) continue;
    for (const p of game.players.values()) {
      // pemain yang sedang menyambung ulang dilewati; data lengkap dikirim lagi saat ia kembali
      const sock = io.sockets.sockets.get(p.id);
      if (sock) sock.emit('snap', game.snapshotFor(p));
    }
    game.clearEvents();
  }
  if (!busy && hostLoader.astraStale?.()) {
    // Hosting menyalakan proses ini lagi pada permintaan berikutnya, dengan build yang baru.
    console.log('Build server baru sudah diunggah; berhenti supaya versi baru yang dijalankan.');
    process.exit(0);
  }
}, 1000 / TICK_RATE / 2);

// Dihentikan hosting atau dari terminal: keluar lewat process.exit supaya data akun yang belum
// tertulis ikut disimpan (lihat AccountDb.flushSync).
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => process.exit(0));

httpServer.listen(PORT, HOST, () => {
  const where = HOST ? (HOST.includes(':') ? `[${HOST}]` : HOST) : 'localhost';
  console.log(`Astra Legion server di http://${where}:${PORT}${BASE ? ` (juga di prefix ${BASE}/)` : ''}`);
});
