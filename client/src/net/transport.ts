// Lapisan transport. Dua implementasi dengan antarmuka yang sama:
//   - SocketTransport: terhubung ke server Node (authoritative) lewat Socket.IO.
//   - LocalTransport : menjalankan simulasi yang SAMA di browser (latihan lawan bot),
//     dipakai saat tidak ada server, mis. di hosting statis atau di dalam APK.
import { io, type Socket } from 'socket.io-client';
import { TICK_RATE, type ClientCommand, type JoinRequest, type JoinResult, type Snapshot } from '../../../shared/src';

export interface Transport {
  readonly mode: 'online' | 'offline';
  onSnapshot: ((s: Snapshot) => void) | null;
  onDisconnect: (() => void) | null;
  join(req: JoinRequest): Promise<JoinResult>;
  send(cmd: ClientCommand): void;
  close(): void;
}

class SocketTransport implements Transport {
  readonly mode = 'online';
  onSnapshot: ((s: Snapshot) => void) | null = null;
  onDisconnect: (() => void) | null = null;

  constructor(private socket: Socket) {
    socket.on('snap', (s: Snapshot) => this.onSnapshot?.(s));
    socket.on('disconnect', () => this.onDisconnect?.());
  }

  static connect(serverUrl: string): Promise<SocketTransport> {
    // Tanpa alamat eksplisit: server yang sama dengan halaman, path relatif terhadap halaman
    // (jadi tetap benar saat game dipasang di subfolder hosting).
    const path = serverUrl ? '/socket.io/' : new URL('socket.io/', document.baseURI).pathname;
    return new Promise((resolve, reject) => {
      const socket = io(serverUrl || location.origin, {
        path,
        transports: ['websocket', 'polling'],
        reconnection: false,
        timeout: 3500,
      });
      const fail = () => {
        socket.close();
        reject(new Error('server tidak terjangkau'));
      };
      const timer = setTimeout(fail, 4000);
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve(new SocketTransport(socket));
      });
      socket.once('connect_error', () => {
        clearTimeout(timer);
        fail();
      });
    });
  }

  join(req: JoinRequest): Promise<JoinResult> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, error: 'Server tidak merespons.' }), 5000);
      this.socket.emit('join', req, (r: JoinResult) => {
        clearTimeout(timer);
        resolve(r);
      });
    });
  }

  send(cmd: ClientCommand): void {
    this.socket.emit('cmd', cmd);
  }

  close(): void {
    this.socket.close();
  }
}

class LocalTransport implements Transport {
  readonly mode = 'offline';
  onSnapshot: ((s: Snapshot) => void) | null = null;
  onDisconnect: (() => void) | null = null;
  private timer = 0;
  private game: import('../../../server/src/game/Game').Game | null = null;

  async join(req: JoinRequest): Promise<JoinResult> {
    const { Game } = await import('../../../server/src/game/Game');
    const game = (this.game = new Game());
    const result = game.addPlayer('local', req.name, req.heroId);
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
      if (p) this.onSnapshot?.(game.snapshotFor(p));
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

/** Coba server online dulu; jika gagal, jatuh ke mode offline. */
export async function connect(serverUrl: string): Promise<Transport> {
  // Di dalam APK tidak ada server di origin yang sama; tanpa alamat server langsung offline.
  const native = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
  if (native && !serverUrl) return new LocalTransport();
  try {
    return await SocketTransport.connect(serverUrl);
  } catch {
    return new LocalTransport();
  }
}
