// Lapisan transport. Dua implementasi dengan antarmuka yang sama:
//   - SocketTransport: terhubung ke server Node (authoritative) lewat Socket.IO.
//   - LocalTransport : menjalankan simulasi yang SAMA di browser (latihan lawan bot),
//     dipakai saat tidak ada server, mis. di hosting statis atau di dalam APK.
import { io, type Socket } from 'socket.io-client';
import { TICK_RATE, type ClientCommand, type JoinRequest, type JoinResult, type Snapshot } from '../../../shared/src';

/**
 * Saluran permintaan-jawaban ke server di luar perintah game (akun, papan peringkat). Tetap
 * berlaku setelah sambungan putus lalu tersambung lagi dengan socket baru.
 */
export interface ServerLink {
  /** Alamat Socket.IO server ini; sesi akun hanya dikirim ke server tempat sesi itu dibuat. */
  readonly endpoint: string;
  /** Kirim event dan tunggu jawabannya; null bila tidak dijawab (server lama, sambungan putus). */
  request<T>(event: string, data?: unknown, timeoutMs?: number): Promise<T | null>;
  /** Dengarkan event dari server. */
  on(event: string, handler: (data: unknown) => void): void;
  /**
   * Dipanggil pada socket baru setelah sambungan putus, SEBELUM bergabung lagi ke pertandingan,
   * supaya server tahu akun siapa yang kembali. `request` mengirim lewat socket baru itu.
   */
  reauth: ((request: ServerLink['request']) => Promise<unknown>) | null;
}

export interface Transport {
  readonly mode: 'online' | 'offline';
  /** Saluran ke server untuk akun; null saat offline. */
  readonly link: ServerLink | null;
  onSnapshot: ((s: Snapshot) => void) | null;
  onDisconnect: (() => void) | null;
  /**
   * Sambungan ke server putus di tengah pertandingan ('lost') lalu tersambung lagi ('back').
   * Bila tidak berhasil sampai batas waktunya, onDisconnect yang dipanggil.
   */
  onLink: ((state: 'lost' | 'back') => void) | null;
  /** Latensi bolak-balik ke server (ms); null saat offline, belum terukur, atau servernya versi lama. */
  readonly latency: number | null;
  /** Jumlah pemain yang sedang bermain di server; null bila tidak diketahui. */
  playersOnline(): Promise<number | null>;
  join(req: JoinRequest): Promise<JoinResult>;
  send(cmd: ClientCommand): void;
  close(): void;
}

/**
 * Snapshot yang tiba sebelum game siap menerimanya (layar memuat masih tampil) ditahan, bukan
 * dibuang: snapshot pertama membawa data statis semua unit yang sudah ada (tower, core, hero) dan
 * server tidak pernah mengirimnya ulang. Tanpa ini, hero sendiri dan tower kadang tidak muncul.
 */
abstract class SnapshotInbox {
  private handler: ((s: Snapshot) => void) | null = null;
  private pending: Snapshot[] = [];

  get onSnapshot(): ((s: Snapshot) => void) | null {
    return this.handler;
  }
  set onSnapshot(fn: ((s: Snapshot) => void) | null) {
    this.handler = fn;
    if (fn) for (const s of this.pending.splice(0)) fn(s);
  }

  protected deliver(s: Snapshot): void {
    if (this.handler) this.handler(s);
    else this.pending.push(s);
  }
}

/** Berapa lama client mencoba menyambung ulang sebelum menyerah (server menahan hero 60 detik). */
const RECONNECT_WINDOW = 50_000;

/** Kirim event dengan acknowledgement lewat `socket`; null bila tidak dijawab tepat waktu. */
function ask<T>(socket: Socket, event: string, data: unknown, timeoutMs: number): Promise<T | null> {
  if (!socket.connected) return Promise.resolve(null);
  return new Promise((resolve) => {
    socket.timeout(timeoutMs).emit(event, data ?? {}, (err: unknown, reply: T) => resolve(err ? null : (reply ?? null)));
  });
}

class SocketTransport extends SnapshotInbox implements Transport, ServerLink {
  readonly mode = 'online';
  readonly link = this;
  onDisconnect: (() => void) | null = null;
  onLink: ((state: 'lost' | 'back') => void) | null = null;
  reauth: ServerLink['reauth'] = null;
  /** Pendengar event tambahan (akun); dipasang lagi pada tiap socket baru. */
  private listeners: [string, (data: unknown) => void][] = [];

  latency: number | null = null;
  private keepAlive = 0;
  private probe = 0;
  private retry = 0;
  private closed = false;
  /** Permintaan join terakhir beserta token sesinya; dipakai lagi saat menyambung ulang. */
  private joined: JoinRequest | null = null;

  constructor(
    private socket: Socket,
    /** Membuka socket baru ke server yang sama. */
    private open: () => Socket,
    private healthUrl: string,
    readonly endpoint: string,
  ) {
    super();
    this.attach(socket);
    const measure = () => {
      if (!this.socket.connected) return;
      const t0 = performance.now();
      this.socket.timeout(2500).emit('lat', 0, (err: unknown) => {
        if (!err) this.latency = Math.round(performance.now() - t0);
      });
    };
    this.probe = window.setInterval(measure, 3000);
    measure();
    // Web hosting mematikan aplikasi yang lama tidak menerima permintaan HTTP, dan lalu lintas
    // WebSocket belum tentu dihitung. Permintaan kecil berkala menjaga server tetap hidup
    // selama masih ada yang bermain.
    this.keepAlive = window.setInterval(() => {
      fetch(healthUrl, { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
    }, 4 * 60_000);
  }

  private attach(socket: Socket): void {
    socket.on('snap', (s: Snapshot) => this.deliver(s));
    socket.on('disconnect', () => {
      if (socket === this.socket && !this.closed) this.lost();
    });
    // server memeriksa apakah tab ini masih hidup sebelum mengizinkan akun yang sama bermain di tempat lain
    socket.on('acc:alive', (ack?: unknown) => {
      if (typeof ack === 'function') ack();
    });
    for (const [event, handler] of this.listeners) socket.on(event, handler);
  }

  request<T>(event: string, data?: unknown, timeoutMs = 6000): Promise<T | null> {
    return ask<T>(this.socket, event, data, timeoutMs);
  }

  on(event: string, handler: (data: unknown) => void): void {
    this.listeners.push([event, handler]);
    this.socket.on(event, handler);
  }

  /** Sambungan putus bukan atas kemauan sendiri: coba lanjutkan sesi yang sama. */
  private lost(): void {
    this.latency = null;
    if (!this.joined) {
      // masih di lobby: tidak ada pertandingan yang perlu dilanjutkan
      this.onDisconnect?.();
      return;
    }
    this.onLink?.('lost');
    const deadline = Date.now() + RECONNECT_WINDOW;
    const attempt = () => {
      if (this.closed) return;
      if (Date.now() > deadline) {
        this.onDisconnect?.();
        return;
      }
      const socket = this.open();
      let settled = false;
      const again = () => {
        if (settled) return;
        settled = true;
        clearTimeout(giveUp);
        socket.removeAllListeners();
        socket.close();
        this.retry = window.setTimeout(attempt, 1500);
      };
      const giveUp = window.setTimeout(again, 7000);
      socket.once('connect_error', again);
      socket.once('connect', async () => {
        // masuk akun dulu di socket baru (bila ada), baru bergabung lagi ke pertandingan
        if (this.reauth) await this.reauth((event, data, ms = 2500) => ask(socket, event, data, ms)).catch(() => null);
        if (settled) return;
        socket.emit('join', this.joined, (r: JoinResult) => {
          if (settled) return;
          settled = true;
          clearTimeout(giveUp);
          socket.off('connect_error', again);
          if (this.closed || !r?.ok) {
            socket.close();
            if (!this.closed) this.onDisconnect?.(); // mis. room sudah penuh
            return;
          }
          this.socket = socket;
          this.attach(socket);
          this.onLink?.('back');
        });
      });
    };
    attempt();
  }

  static connect(serverUrl: string): Promise<SocketTransport> {
    // Alamat server boleh memuat subfolder (mis. https://situs.com/game): Socket.IO dicari di
    // <alamat>/socket.io/. Tanpa alamat eksplisit dipakai alamat halaman ini sendiri, jadi tetap
    // benar saat game dipasang di subfolder hosting.
    const explicit = serverUrl && !/^[a-z][a-z0-9+.-]*:\/\//i.test(serverUrl) ? `${location.protocol}//${serverUrl}` : serverUrl;
    const base = new URL(explicit ? explicit.replace(/\/*$/, '/') : document.baseURI);
    const endpoint = new URL('socket.io/', base);
    // Batas waktunya longgar: di web hosting, server baru dinyalakan saat permintaan pertama datang.
    const open = () => io(endpoint.origin, { path: endpoint.pathname, transports: ['websocket', 'polling'], reconnection: false, timeout: 7000 });
    return new Promise((resolve, reject) => {
      const socket = open();
      const fail = () => {
        socket.close();
        reject(new Error('server tidak terjangkau'));
      };
      const timer = setTimeout(fail, 7500);
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve(new SocketTransport(socket, open, new URL('health', endpoint).href, endpoint.href));
      });
      socket.once('connect_error', () => {
        clearTimeout(timer);
        fail();
      });
    });
  }

  join(req: JoinRequest): Promise<JoinResult> {
    // token acak milik client ini: dengan token yang sama server mengenali sambungan ulang
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const session = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const full = { ...req, session };
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, error: 'Server tidak merespons.' }), 5000);
      this.socket.emit('join', full, (r: JoinResult) => {
        clearTimeout(timer);
        if (r?.ok) this.joined = full;
        resolve(r);
      });
    });
  }

  send(cmd: ClientCommand): void {
    // selama terputus perintah dibuang, bukan ditumpuk untuk dikirim sekaligus nanti
    if (this.socket.connected) this.socket.emit('cmd', cmd);
  }

  playersOnline(): Promise<number | null> {
    return fetch(this.healthUrl, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { players?: unknown }) => (typeof j.players === 'number' ? j.players : null))
      .catch(() => null);
  }

  close(): void {
    this.closed = true;
    clearInterval(this.keepAlive);
    clearInterval(this.probe);
    clearTimeout(this.retry);
    // keluar dengan sengaja: server tidak perlu menahan hero ini untuk sambungan ulang
    if (this.socket.connected) this.socket.emit('leave');
    this.socket.close();
  }
}

class LocalTransport extends SnapshotInbox implements Transport {
  readonly mode = 'offline';
  readonly link = null;
  readonly latency = null;
  onDisconnect: (() => void) | null = null;
  onLink: ((state: 'lost' | 'back') => void) | null = null;

  playersOnline(): Promise<number | null> {
    return Promise.resolve(null);
  }
  private timer = 0;
  private game: import('../../../server/src/game/Game').Game | null = null;

  async join(req: JoinRequest): Promise<JoinResult> {
    const { Game } = await import('../../../server/src/game/Game');
    const game = (this.game = new Game());
    const result = game.addPlayer('local', req.name, req.heroId, req.team, req.spell, req.skin, req.bots);
    if (!result.ok) return result;

    const step = 1 / TICK_RATE;
    let last = performance.now();
    let acc = 0;
    this.timer = window.setInterval(() => {
      const now = performance.now();
      acc += Math.min(0.2, (now - last) / 1000);
      last = now;
      let ticked = false;
      while (acc >= step) {
        game.update(step);
        acc -= step;
        ticked = true;
      }
      if (!ticked) return;
      const p = game.players.get('local');
      if (p) this.deliver(game.snapshotFor(p));
      game.clearEvents();
    }, 1000 / TICK_RATE / 2);
    return result;
  }

  send(cmd: ClientCommand): void {
    this.game?.handleCommand('local', cmd);
  }

  close(): void {
    clearInterval(this.timer);
  }
}

/**
 * Coba server online di tiap alamat secara berurutan ('' = alamat halaman ini sendiri); jika
 * semuanya gagal, jatuh ke mode offline. `server` pada hasilnya adalah alamat yang tersambung.
 */
export async function connect(serverUrls: string[]): Promise<Transport & { server: string }> {
  // Di dalam APK tidak ada server di origin yang sama; alamat kosong dilewati.
  const native = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
  for (const server of serverUrls) {
    if (native && !server) continue;
    try {
      return Object.assign(await SocketTransport.connect(server), { server });
    } catch {
      // coba alamat berikutnya
    }
  }
  return Object.assign(new LocalTransport(), { server: '' });
}
