// Perakit sisi client: menerima snapshot dari transport, memperbarui tampilan & HUD,
// dan meneruskan input pemain sebagai perintah ke server.
import type { Snapshot } from '../../../shared/src';
import { Controls } from '../input/Controls';
import type { Transport } from '../net/transport';
import { Effects } from '../render/Effects';
import { EntityViews } from '../render/EntityViews';
import { buildMap } from '../render/MapView';
import { SceneManager } from '../render/SceneManager';
import { Hud } from '../ui/Hud';
import { Minimap } from '../ui/Minimap';

export class GameClient {
  private sm: SceneManager;
  private views: EntityViews;
  private fx: Effects;
  private controls: Controls;
  private hud: Hud;
  private minimap: Minimap;
  private lastFrame = performance.now();
  private time = 0;
  private selfId = 0;
  private wasAlive = true;

  constructor(private transport: Transport) {
    this.sm = new SceneManager(document.getElementById('game') as HTMLCanvasElement);
    buildMap(this.sm.scene);
    this.views = new EntityViews(this.sm.scene);
    this.fx = new Effects(this.sm, this.views);
    this.controls = new Controls(this.sm, this.views, this.fx, (cmd) => transport.send(cmd));
    this.hud = new Hud(transport.mode, (slot) => this.controls.castSlot(slot, true));
    this.minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement, this.sm, this.views, () =>
      this.controls.setFollow(false),
    );

    const followBtn = document.getElementById('follow-btn')!;
    const syncFollow = (on: boolean) => followBtn.classList.toggle('on', on);
    this.controls.onFollowChange = syncFollow;
    syncFollow(this.controls.follow);
    followBtn.addEventListener('click', () => {
      this.controls.setFollow(!this.controls.follow);
      this.controls.centerOnSelf();
    });

    transport.onSnapshot = (s) => this.onSnapshot(s);
    transport.onDisconnect = () => this.hud.showDisconnect();
    // pegangan debug untuk konsol browser & tes otomatis
    (window as unknown as { __astra: unknown }).__astra = { sm: this.sm, views: this.views, controls: this.controls };
    requestAnimationFrame(() => this.frame());
  }

  private onSnapshot(s: Snapshot): void {
    this.views.apply(s);
    this.fx.handle(s.events);
    this.controls.heroDef = s.you.def;
    this.hud.update(s, this.views.self);
    // hero baru (awal match / match di-reset) atau baru bangkit: pusatkan kamera
    const respawned = s.you.alive && !this.wasAlive;
    this.wasAlive = s.you.alive;
    if (s.you.id !== this.selfId || respawned) {
      this.selfId = s.you.id;
      const me = this.views.self;
      if (me) this.sm.target.set(me.x, 0, me.z);
    }
  }

  private frame(): void {
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.time += dt;

    this.views.update(dt, this.sm.camera, this.time);
    this.controls.update(dt);
    this.fx.update(dt);
    this.minimap.update(dt);
    this.sm.render(dt);
  }
}
