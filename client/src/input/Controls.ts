// Input pemain. Desktop: klik kanan gerak/serang, Q/W/E/R skill ke arah kursor.
// Layar sentuh: joystick = gerak, tombol serang = serang musuh terdekat, tombol skill = auto-bidik;
// ketuk tanah/musuh, seret (geser kamera), dan cubit (zoom) tetap berlaku. Elemen joystick dan
// tombol serangnya sendiri diurus TouchPad.ts, yang memanggil setStick() dan setAttack() di sini.
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

/** Joystick: jeda antar perintah gerak (ms), dan sejauh apa titik tujuan di depan hero (unit). */
const STICK_INTERVAL = 110;
const STICK_REACH = 3.2;
/** Joystick baru dianggap digerakkan di atas simpangan ini (0..1). */
const STICK_DEADZONE = 0.22;
/** Tombol serang: jarak pencarian musuh dari hero (unit), dan jeda pemilihan ulang target (ms). */
const ATTACK_RANGE = 10;
const ATTACK_RETARGET = 350;

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
  /** Arah joystick di layar (-1..1; y positif = ke bawah), null saat dilepas. */
  private stick: { x: number; y: number } | null = null;
  private stickMoving = false;
  private lastStick = 0;
  private attackHeld = false;
  private attackTarget = 0;
  private lastAttack = 0;

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
    addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === 'tab') this.onUi?.('board', false);
    });
  }

  /**
   * Tombol antarmuka: toko (P), beli rekomendasi (G), papan skor (Tab, ditahan), menu (Esc),
   * obrolan tim (Enter), obrolan semua pemain (Shift+Enter), dan pesan cepat (V).
   */
  /** Alt+klik di arena: pemain ingin menandai titik (x, z); diisi GameClient. */
  onPingAt: ((x: number, z: number) => void) | null = null;

  onUi: ((what: 'shop' | 'quickbuy' | 'board' | 'menu' | 'chat' | 'chatall' | 'ping', down: boolean) => void) | null = null;

  setFollow(on: boolean): void {
    if (this.follow === on) return;
    this.follow = on;
    this.onFollowChange?.(on);
  }

  centerOnSelf(): void {
    const me = this.views.self;
    if (me) this.sm.target.set(me.root.position.x, 0, me.root.position.z);
  }

  // ------------------------------------------------------------ bidik skill

  /** Skill yang sedang dibidik dengan menyeret tombolnya, dan arah seretnya di layar. */
  private aiming: { slot: number; v: { x: number; y: number }; cancel: boolean } | null = null;

  /**
   * Tombol skill sedang diseret: `v` = arah seret di layar (panjang 0..1), `cancel` = jari di
   * atas tombol batal. null = selesai/batal (penanda bidikan disembunyikan).
   */
  aimSkill(slot: number, v: { x: number; y: number } | null, cancel = false): void {
    this.aiming = v ? { slot, v, cancel } : null;
    if (!v) this.fx.aim(null);
    else this.showAim();
  }

  /** Lempar skill ke arah bidikan (dipanggil saat tombol skill yang diseret dilepas). */
  castAimed(slot: number, v: { x: number; y: number }): void {
    const target = this.aimPoint(slot, v);
    this.aimSkill(slot, null);
    if (target) this.send({ t: 'cast', slot, x: target.x, z: target.z });
  }

  /** Titik target untuk arah seret: skill arah selalu sejauh jangkauannya, skill titik mengikuti panjang seretan. */
  private aimPoint(slot: number, v: { x: number; y: number }): (Vec2 & { range: number; radius: number; width: number }) | null {
    const me = this.views.self;
    const def = HEROES[this.heroDef]?.skills[slot];
    if (!me || !def) return null;
    // sama seperti joystick: kanan layar = +x dunia, bawah layar = +z dunia
    const wx = v.x;
    const wz = v.y / 0.82;
    const len = Math.hypot(wx, wz) || 1;
    const pull = Math.min(1, Math.hypot(v.x, v.y));
    const dist = def.target === 'dir' ? def.range : Math.max(1.2, pull * def.range);
    return {
      x: me.x + (wx / len) * dist,
      z: me.z + (wz / len) * dist,
      range: def.range,
      radius: def.radius ?? 1,
      width: def.target === 'dir' ? (def.width ?? 1.2) : 0,
    };
  }

  private showAim(): void {
    const a = this.aiming;
    const me = this.views.self;
    const p = a && this.aimPoint(a.slot, a.v);
    if (!a || !me || !p) return;
    this.fx.aim({ x: me.x, z: me.z, tx: p.x, tz: p.z, range: p.range, radius: p.radius, width: p.width, cancel: a.cancel });
  }

  // ------------------------------------------------- joystick & tombol serang

  /** Joystick layar sentuh: arah di layar (panjang 0..1), atau null saat dilepas. */
  setStick(dir: { x: number; y: number } | null): void {
    this.stick = dir;
    if (!dir && this.stickMoving) {
      this.stickMoving = false;
      this.send({ t: 'stop' });
    }
  }

  /** Tombol serang layar sentuh ditekan / dilepas. Selama ditahan, target dipilih ulang otomatis. */
  setAttack(held: boolean): void {
    this.attackHeld = held;
    if (held) {
      this.attackTarget = 0;
      this.attackNearest();
    }
  }

  /** Serang musuh terdekat (hero diutamakan, bangunan paling akhir). false bila tidak ada target. */
  private attackNearest(): boolean {
    const me = this.views.self;
    if (!me) return false;
    this.lastAttack = performance.now();
    // target lama masih hidup dan masih dekat: biarkan, supaya hero tidak berpindah-pindah sasaran
    const current = this.views.get(this.attackTarget);
    if (current && Math.hypot(current.x - me.x, current.z - me.z) < ATTACK_RANGE + 4) return true;
    const foe = this.views.nearestEnemyTo(me.x, me.z, ATTACK_RANGE, true);
    this.attackTarget = foe?.st.id ?? 0;
    if (!foe) return false;
    this.send({ t: 'attack', id: foe.st.id });
    this.fx.clickMarker(foe.root.position.x, foe.root.position.z, 0xff5050);
    return true;
  }

  private updateTouchPad(now: number): void {
    const s = this.stick;
    const me = this.views.self;
    if (s && me && Math.hypot(s.x, s.y) > STICK_DEADZONE) {
      // Kamera tidak berputar: kanan layar = +x dunia, bawah layar = +z dunia (lihat pan()).
      if (now - this.lastStick > STICK_INTERVAL) {
        this.lastStick = now;
        this.stickMoving = true;
        const len = Math.hypot(s.x, s.y / 0.82);
        this.send({ t: 'move', x: me.x + (s.x / len) * STICK_REACH, z: me.z + (s.y / 0.82 / len) * STICK_REACH });
      }
      this.attackTarget = 0; // bergerak membatalkan serangan; tombol serang yang ditahan memilih lagi nanti
      this.setFollow(true);
    } else if (this.stickMoving && s) {
      // joystick kembali ke tengah tanpa dilepas
      this.stickMoving = false;
      this.send({ t: 'stop' });
    }
    if (this.attackHeld && !this.stickMoving && now - this.lastAttack > ATTACK_RETARGET) this.attackNearest();
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
      // Alt+klik di arena: tandai titik itu untuk tim
      if (e.altKey && (e.button === 0 || e.button === 2)) {
        const at = this.sm.groundPoint(e.clientX, e.clientY);
        if (at) this.onPingAt?.(at.x, at.z);
        this.ptrs.delete(e.pointerId);
        return;
      }
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
    // Ketukan singkat tanpa geser pada musuh = serang musuh itu. Ketukan di tanah tidak
    // menggerakkan hero: di layar sentuh gerak hanya lewat joystick, supaya jari yang meleset
    // dari tombol tidak membuat hero berjalan sendiri.
    if (!p.moved && !this.multiTouch && performance.now() - p.t0 < 450) this.command(p.x, p.y, true, true);
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

  /** Perintah di titik layar: serang musuh di situ, atau (kecuali `attackOnly`) bergerak ke sana. */
  private command(cx: number, cy: number, marker: boolean, attackOnly = false): void {
    const g = this.sm.groundPoint(cx, cy);
    if (!g) return;
    this.lastCmd = performance.now();
    const enemy = this.views.pickEnemy(g.x, g.z, IS_TOUCH ? 2 : 1.2);
    if (enemy) {
      this.send({ t: 'attack', id: enemy.st.id });
      this.attackTarget = enemy.st.id; // tombol serang yang ditahan meneruskan target pilihan ini
      if (marker) this.fx.clickMarker(enemy.root.position.x, enemy.root.position.z, 0xff5050);
    } else if (!attackOnly) {
      this.send({ t: 'move', x: g.x, z: g.z });
      if (marker) this.fx.clickMarker(g.x, g.z, 0x6dff8a);
    }
  }

  // --------------------------------------------------------------- keyboard

  private keydown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'tab' || k.startsWith('arrow')) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(k);
    if (k in KEY_SLOT) this.castSlot(KEY_SLOT[k], false);
    else if (k === 's') this.send({ t: 'stop' });
    else if (k === 'y') this.setFollow(!this.follow);
    else if (k === 'b') this.send({ t: 'recall' });
    else if (k === 'p') this.onUi?.('shop', true);
    else if (k === 'g') this.onUi?.('quickbuy', true);
    else if (k === 'v') this.onUi?.('ping', true);
    else if (k === 'f') this.castSpell(false);
    else if (k === 't') this.placeWard(false);
    // angka 1-6: pakai item aktif di slot itu (selagi menu pesan cepat tertutup; di sana angka memilih pesan)
    else if (k >= '1' && k <= '6' && k.length === 1 && document.getElementById('ping-menu')?.classList.contains('hidden') !== false) this.send({ t: 'use', slot: Number(k) - 1 });
    else if (k === 'tab') this.onUi?.('board', true);
    else if (k === 'escape') this.onUi?.('menu', true);
    else if (k === 'enter') {
      e.preventDefault(); // jangan sampai Enter yang sama langsung mengirim form obrolan
      this.keys.delete(k);
      this.onUi?.(e.shiftKey ? 'chatall' : 'chat', true);
    }
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

  /**
   * Tanam suar penglihatan: di posisi kursor (keyboard), atau beberapa langkah di depan hero
   * (tombol layar, `auto`). Server menjepit jaraknya.
   */
  placeWard(auto: boolean): void {
    const me = this.views.self;
    if (!me) return;
    let aim: Vec2 | null = null;
    if (!auto && this.mouse.inside) aim = this.sm.groundPoint(this.mouse.x, this.mouse.y);
    if (!aim) aim = { x: me.x + Math.sin(me.rot) * 5, z: me.z + Math.cos(me.rot) * 5 };
    this.send({ t: 'ward', x: aim.x, z: aim.z });
  }

  /**
   * Mantra tempur. Dibidik ke kursor (keyboard), atau ke arah joystick / arah hadap hero
   * (tombol layar, `auto`). Hanya arahnya yang penting; jaraknya ditentukan server.
   */
  castSpell(auto: boolean): void {
    const me = this.views.self;
    if (!me) return;
    let aim: Vec2 | null = null;
    if (!auto && this.mouse.inside) aim = this.sm.groundPoint(this.mouse.x, this.mouse.y);
    if (!aim) {
      const s = this.stick;
      const moving = s && Math.hypot(s.x, s.y) > STICK_DEADZONE;
      const dx = moving ? s.x : Math.sin(me.rot);
      const dz = moving ? s.y / 0.82 : Math.cos(me.rot);
      const len = Math.hypot(dx, dz) || 1;
      aim = { x: me.x + (dx / len) * 8, z: me.z + (dz / len) * 8 };
    }
    this.send({ t: 'spell', x: aim.x, z: aim.z });
  }

  // ------------------------------------------------------------------ frame

  update(dt: number): void {
    const now = performance.now();
    // tahan klik kanan = terus bergerak mengikuti kursor
    if (this.rmbHeld && now - this.lastCmd > 140) this.command(this.mouse.x, this.mouse.y, false);
    this.updateTouchPad(now);
    if (this.aiming) this.showAim(); // penanda bidikan mengikuti hero yang sedang bergerak

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
