// Input pemain. Desktop: klik kanan gerak/serang, Q/W/E/R skill ke arah kursor.
// Layar sentuh: ketuk = gerak/serang, seret = geser kamera, cubit = zoom, tombol skill = auto-bidik.
import { HEROES, type ClientCommand, type Vec2 } from '../../../shared/src';
import type { Effects } from '../render/Effects';
import type { EntityViews } from '../render/EntityViews';
import { IS_TOUCH, type SceneManager } from '../render/SceneManager';

interface Ptr {
  x: number;
  y: number;
  sx: number;
  sy: number;
  t0: number;
  moved: boolean;
  type: string;
  button: number;
}

const KEY_SLOT: Record<string, number> = { q: 0, w: 1, e: 2, r: 3 };

export class Controls {
  /** Kamera mengikuti hero. Default aktif di layar sentuh. */
  follow = IS_TOUCH;
  heroDef = '';
  onFollowChange: ((on: boolean) => void) | null = null;

  private ptrs = new Map<number, Ptr>();
  private mouse = { x: innerWidth / 2, y: innerHeight / 2, inside: false };
  private keys = new Set<string>();
  private rmbHeld = false;
  private lastCmd = 0;
  private pinch = 0;
  private multiTouch = false;

  constructor(
    private sm: SceneManager,
    private views: EntityViews,
    private fx: Effects,
    private send: (cmd: ClientCommand) => void,
  ) {
    const c = sm.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.move(e));
    c.addEventListener('pointerup', (e) => this.up(e));
    c.addEventListener('pointercancel', (e) => this.ptrs.delete(e.pointerId));
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        sm.zoom *= e.deltaY > 0 ? 1.1 : 0.9;
        sm.clampZoom();
      },
      { passive: false },
    );
    addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.inside = true;
    });
    document.addEventListener('mouseleave', () => (this.mouse.inside = false));
    addEventListener('blur', () => {
      this.keys.clear();
      this.rmbHeld = false;
    });
    addEventListener('keydown', (e) => this.keydown(e));
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }

  setFollow(on: boolean): void {
    if (this.follow === on) return;
    this.follow = on;
    this.onFollowChange?.(on);
  }

  centerOnSelf(): void {
    const me = this.views.self;
    if (me) this.sm.target.set(me.root.position.x, 0, me.root.position.z);
  }

  // ---------------------------------------------------------------- pointer

  private down(e: PointerEvent): void {
    this.sm.canvas.setPointerCapture(e.pointerId);
    this.ptrs.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      t0: performance.now(),
      moved: false,
      type: e.pointerType,
      button: e.button,
    });
    if (e.pointerType === 'mouse') {
      if (e.button === 2) {
        this.rmbHeld = true;
        this.command(e.clientX, e.clientY, true);
      }
    } else if (this.ptrs.size >= 2) {
      this.multiTouch = true;
      this.pinch = this.pinchDist();
    }
  }

  private move(e: PointerEvent): void {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 10) p.moved = true;

    if (p.type === 'mouse') {
      if (p.button === 1) this.pan(dx, dy);
      return;
    }
    if (this.ptrs.size >= 2) {
      const d = this.pinchDist();
      if (this.pinch > 0 && d > 0) {
        this.sm.zoom *= this.pinch / d;
        this.sm.clampZoom();
      }
      this.pinch = d;
    } else if (p.moved) {
      this.pan(dx, dy);
    }
  }

  private up(e: PointerEvent): void {
    const p = this.ptrs.get(e.pointerId);
    this.ptrs.delete(e.pointerId);
    if (!p) return;
    if (p.type === 'mouse') {
      if (p.button === 2) this.rmbHeld = false;
      return;
    }
    // ketukan singkat tanpa geser = perintah gerak/serang
    if (!p.moved && !this.multiTouch && performance.now() - p.t0 < 450) this.command(p.x, p.y, true);
    if (this.ptrs.size === 0) this.multiTouch = false;
    this.pinch = 0;
  }

  private pinchDist(): number {
    const [a, b] = [...this.ptrs.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /** Geser kamera sejauh delta piksel (arah seret berlawanan dengan gerak kamera). */
  private pan(dx: number, dy: number): void {
    const s = this.sm.worldPerPixel();
    this.sm.target.x -= dx * s;
    this.sm.target.z -= (dy * s) / 0.82;
    this.setFollow(false);
  }

  private command(cx: number, cy: number, marker: boolean): void {
    const g = this.sm.groundPoint(cx, cy);
    if (!g) return;
    this.lastCmd = performance.now();
    const enemy = this.views.pickEnemy(g.x, g.z, IS_TOUCH ? 2 : 1.2);
    if (enemy) {
      this.send({ t: 'attack', id: enemy.st.id });
      if (marker) this.fx.clickMarker(enemy.root.position.x, enemy.root.position.z, 0xff5050);
    } else {
      this.send({ t: 'move', x: g.x, z: g.z });
      if (marker) this.fx.clickMarker(g.x, g.z, 0x6dff8a);
    }
  }

  // --------------------------------------------------------------- keyboard

  private keydown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(k);
    if (k in KEY_SLOT) this.castSlot(KEY_SLOT[k], false);
    else if (k === 's') this.send({ t: 'stop' });
    else if (k === 'y') this.setFollow(!this.follow);
  }

  /**
   * Lempar skill. `auto` = bidik otomatis ke musuh terdekat (tombol layar / layar sentuh);
   * selain itu bidik ke posisi kursor.
   */
  castSlot(slot: number, auto: boolean): void {
    const me = this.views.self;
    if (!me) return;
    let aim: Vec2 | null = null;
    if (!auto && this.mouse.inside) aim = this.sm.groundPoint(this.mouse.x, this.mouse.y);
    if (!aim) {
      const def = HEROES[this.heroDef]?.skills[slot];
      const reach = def ? (def.target === 'self' ? (def.radius ?? 6) : def.range + (def.radius ?? 0)) : 10;
      const foe = this.views.nearestEnemyTo(me.x, me.z, reach + 1);
      aim = foe
        ? { x: foe.x, z: foe.z }
        : { x: me.x + Math.sin(me.rot) * (def?.range || 6), z: me.z + Math.cos(me.rot) * (def?.range || 6) };
    }
    this.send({ t: 'cast', slot, x: aim.x, z: aim.z });
  }

  // ------------------------------------------------------------------ frame

  update(dt: number): void {
    const now = performance.now();
    // tahan klik kanan = terus bergerak mengikuti kursor
    if (this.rmbHeld && now - this.lastCmd > 140) this.command(this.mouse.x, this.mouse.y, false);

    const speed = this.sm.zoom * 1.1 * dt;
    let px = 0;
    let pz = 0;
    if (this.keys.has('arrowleft')) px -= 1;
    if (this.keys.has('arrowright')) px += 1;
    if (this.keys.has('arrowup')) pz -= 1;
    if (this.keys.has('arrowdown')) pz += 1;
    // geser kamera saat kursor di tepi layar
    if (!IS_TOUCH && this.mouse.inside && document.hasFocus() && !this.rmbHeld) {
      const m = 14;
      if (this.mouse.x < m) px -= 1;
      else if (this.mouse.x > innerWidth - m) px += 1;
      if (this.mouse.y < m) pz -= 1;
      else if (this.mouse.y > innerHeight - m) pz += 1;
    }
    if (px || pz) {
      this.sm.target.x += px * speed;
      this.sm.target.z += pz * speed;
      this.setFollow(false);
    }
    if (this.follow || this.keys.has(' ')) this.centerOnSelf();
  }
}
