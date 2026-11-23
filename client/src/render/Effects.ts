// Efek visual sementara yang dipicu event server: proyektil, tebasan, sinar energi, gelombang
// kejut, petir, jejak dash, percikan, asap, ledakan saat unit tumbang, teks melayang, penanda klik.
import * as THREE from 'three';
import { EMOTES, F_BUFF, F_FLOW, F_RECALL, HEROES, PINGS, type GameEvent } from '../../../shared/src';
import type { EntityViews, View } from './EntityViews';
import { glowColor, TEAM_COLOR } from './palette';
import { Particles } from './particles';
import { GFX, pick } from './quality';
import { OVERLAY_LAYER, type SceneManager } from './SceneManager';
import { Tex } from './textures';

interface Fx {
  obj: THREE.Object3D;
  life: number;
  max: number;
  tick: (t: number, dt: number) => void; // t: 0 (baru) -> 1 (habis)
  /** Tekstur milik efek ini sendiri (mis. teks), dibuang saat efek selesai. */
  ownMap?: THREE.Texture;
}

// warna khas skill (lihat server/src/game/skills)
const VOLT = 0xffd23f;
const SHADOW = 0xd946ef;
const SHADOW_DARK = 0x6b21a8;
const LEVEL_UP = 0xfff3a0;
const MINT = 0x7dffb0;

const FLAT = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
/** Pita mendatar dan pita tegak (panjang sepanjang Z): disilang supaya sinar tampak bervolume. */
const RIBBON_H = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const RIBBON_V = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).rotateZ(Math.PI / 2);
const ARC = new THREE.RingGeometry(0.62, 1.3, 20, 1, -1.0, 2.0).rotateX(-Math.PI / 2);
const PILLAR = new THREE.CylinderGeometry(0.6, 1, 1, 16, 1, true).translate(0, 0.5, 0);
/** Arah pandang kamera (tetap), dipakai untuk menghadapkan pita petir ke layar. */
const VIEW_DIR = new THREE.Vector3(0, 0.82, 0.57).normalize();

function glowMaterial(color: number, lum: number, opacity = 1, map?: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: glowColor(color, lum),
    map,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Effects {
  private list: Fx[] = [];
  private timers: { t: number; fn: () => void }[] = [];
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  /** Percikan & cahaya (additive). */
  private glow: Particles;
  /** Asap & debu (alpha biasa). */
  private smoke: Particles;
  /** Pengali jumlah partikel menurut kualitas grafik. */
  private density = pick(0.5, 1, 1.7);
  /** Sisa umur tiap lampu efek (lihat SceneManager.fxLights) dan intensitas awalnya. */
  private lightLife: { life: number; max: number; power: number }[] = [];
  /** Tekstur angka damage/heal yang sudah pernah dibuat (kunci = warna + teks). */
  private numberTex = new Map<string, THREE.Texture>();
  private auraClock = 0;

  constructor(
    private sm: SceneManager,
    private views: EntityViews,
  ) {
    this.glow = new Particles(pick(600, 1600, 3600), Tex.spark(), true);
    this.smoke = new Particles(pick(160, 420, 800), Tex.smoke(), false);
    sm.scene.add(this.smoke.object, this.glow.object);
    this.lightLife = sm.fxLights.map(() => ({ life: 0, max: 1, power: 0 }));
  }

  /** Kilatan cahaya yang benar-benar menerangi tanah & unit di sekitarnya (kualitas tinggi saja). */
  private light(x: number, y: number, z: number, color: number, power: number, life: number): void {
    const lights = this.sm.fxLights;
    if (!lights.length) return;
    // pakai lampu yang paling hampir padam
    let best = 0;
    for (let i = 1; i < lights.length; i++) if (this.lightLife[i].life < this.lightLife[best].life) best = i;
    const slot = this.lightLife[best];
    if (slot.life > 0 && slot.power * (slot.life / slot.max) > power) return;
    lights[best].color.setHex(color);
    lights[best].position.set(x, y, z);
    lights[best].distance = 8 + power * 0.35;
    slot.life = slot.max = life;
    slot.power = power;
  }

  /** Jejak khas tiap hero: percikan listrik, semburan pendorong, atau kabut bayangan. */
  private auras(dt: number): void {
    if (GFX.low) return;
    this.auraClock += dt;
    if (this.auraClock < 0.07) return;
    this.auraClock = 0;
    for (const v of this.views.views.values()) {
      if (v.st.kind !== 'hero' || v.ghost) continue;
      const p = v.root.position;
      const rot = v.model.rotation.y;
      const moving = v.anim.walk > 0.5;
      if (v.flags & F_FLOW && Math.random() < 0.6) {
        // Berkah Arus: butiran biru muda berputar naik
        const c = glowColor(0x5fd4ff, 1.6);
        const ang = Math.random() * Math.PI * 2;
        this.glow.spawn({ x: p.x + Math.cos(ang) * 0.8, y: 0.1, z: p.z + Math.sin(ang) * 0.8, vy: rand(1.8, 3.4), life: 0.65, size: 0.22, size1: 0.05, r: c.r, g: c.g, b: c.b });
      }
      if (v.flags & F_BUFF && Math.random() < 0.6) {
        // Berkah Golem: butiran emas naik dari kaki hero
        const c = glowColor(0xffc24a, 1.6);
        const ang = Math.random() * Math.PI * 2;
        this.glow.spawn({ x: p.x + Math.cos(ang) * 0.9, y: 0.1, z: p.z + Math.sin(ang) * 0.9, vy: rand(1.5, 3), life: 0.7, size: 0.26, size1: 0.05, r: c.r, g: c.g, b: c.b });
      }
      if (v.flags & F_RECALL) {
        // sedang recall: kilau biru naik mengelilingi hero
        const c = glowColor(0x9fd8ff, 1.6);
        const ang = Math.random() * Math.PI * 2;
        this.glow.spawn({ x: p.x + Math.cos(ang) * 1.1, y: 0.1, z: p.z + Math.sin(ang) * 1.1, vy: rand(3, 5.5), life: 0.8, size: 0.3, size1: 0.06, r: c.r, g: c.g, b: c.b });
      }
      if (v.st.sub === 'volt_titan') {
        if (Math.random() < 0.5) {
          const c = glowColor(0xffd84a, 1.6);
          const side = Math.random() < 0.5 ? -1 : 1;
          this.glow.spawn({ x: p.x + Math.cos(rot) * side * 1.0 + rand(-0.3, 0.3), y: rand(2.2, 3.2), z: p.z - Math.sin(rot) * side * 1.0 + rand(-0.3, 0.3), vx: rand(-1.5, 1.5), vy: rand(-1, 2), vz: rand(-1.5, 1.5), life: 0.22, size: 0.2, size1: 0.04, r: c.r, g: c.g, b: c.b });
        }
      } else if (v.st.sub === 'nova_striker') {
        if (moving) {
          const c = glowColor(0x45dcff, 1.4);
          this.glow.spawn({ x: p.x - Math.sin(rot) * 0.45 + rand(-0.15, 0.15), y: rand(0.5, 1.2), z: p.z - Math.cos(rot) * 0.45 + rand(-0.15, 0.15), vy: rand(-1.6, -0.6), life: 0.3, size: 0.3, size1: 0.05, r: c.r, g: c.g, b: c.b });
        }
      } else if (v.st.sub === 'shadow_fang') {
        if (moving || Math.random() < 0.25) this.smoke.spawn({ x: p.x + rand(-0.3, 0.3), y: rand(0.3, 1.4), z: p.z + rand(-0.3, 0.3), vy: rand(0.2, 0.7), life: 0.7, size: 0.5, size1: 1.0, r: 0.2, g: 0.05, b: 0.32, alpha: 0.32 });
      }
    }
  }

  private add(obj: THREE.Object3D, life: number, tick: Fx['tick'], ownMap?: THREE.Texture): void {
    this.sm.scene.add(obj);
    this.list.push({ obj, life, max: life, tick, ownMap });
    tick(0, 0);
  }

  private after(delay: number, fn: () => void): void {
    this.timers.push({ t: delay, fn });
  }

  private shake(amount: number): void {
    this.sm.shake = Math.max(this.sm.shake, amount);
  }

  // ------------------------------------------------------------- blok penyusun

  /** Percikan bercahaya yang menyembur dari satu titik. */
  private sparks(x: number, y: number, z: number, color: number, count: number, speed: number, size = 0.3, life = 0.5, up = 0.5, gravity = 9): void {
    const c = glowColor(color, 1.7);
    for (let i = 0, n = Math.max(1, Math.round(count * this.density)); i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const s = speed * rand(0.35, 1);
      const el = rand(-0.1, 1) * up;
      this.glow.spawn({
        x,
        y,
        z,
        vx: Math.cos(ang) * s,
        vy: el * speed + rand(0, speed * 0.3),
        vz: Math.sin(ang) * s,
        life: life * rand(0.6, 1.2),
        size: size * rand(0.6, 1.3),
        size1: size * 0.2,
        r: c.r,
        g: c.g,
        b: c.b,
        drag: 2.2,
        gravity,
      });
    }
  }

  /** Kepulan asap/debu yang mengembang dan naik perlahan. */
  private puffs(x: number, y: number, z: number, count: number, spread: number, size: number, tint: [number, number, number], alpha = 0.5, life = 1): void {
    for (let i = 0, n = Math.max(1, Math.round(count * this.density)); i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * spread;
      this.smoke.spawn({
        x: x + Math.cos(ang) * d,
        y: y + rand(0, 0.4),
        z: z + Math.sin(ang) * d,
        vx: Math.cos(ang) * rand(0.2, 1.2),
        vy: rand(0.5, 1.6),
        vz: Math.sin(ang) * rand(0.2, 1.2),
        life: life * rand(0.7, 1.3),
        size: size * rand(0.5, 0.8),
        size1: size * rand(1.4, 2),
        r: tint[0],
        g: tint[1],
        b: tint[2],
        alpha,
        drag: 1.4,
      });
    }
  }

  /** Kilatan cahaya bulat yang membesar lalu padam. */
  private flash(x: number, y: number, z: number, size: number, color: number, lum = 1.6, life = 0.22): void {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: Tex.dot(), color: glowColor(color, lum), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    sp.position.set(x, y, z);
    this.add(sp, life, (t) => {
      sp.scale.setScalar(size * (0.5 + 0.7 * t));
      sp.material.opacity = 1 - t * t;
    });
  }

  /** Gelombang kejut: cincin di tanah yang melebar sampai radius `r`. */
  private shock(x: number, z: number, r: number, color: number, life = 0.5, lum = 1.5): void {
    const ring = new THREE.Mesh(FLAT, glowMaterial(color, lum, 1, Tex.shock()));
    ring.position.set(x, 0.1, z);
    ring.renderOrder = 4;
    this.add(ring, life, (t) => {
      const e = 1 - Math.pow(1 - t, 3);
      ring.scale.setScalar(r * (0.2 + 0.8 * e));
      ring.material.opacity = 1 - t * t;
    });
  }

  /** Cahaya yang menyapu tanah (lingkaran penuh yang cepat memudar). */
  private groundGlow(x: number, z: number, r: number, color: number, lum = 0.7, life = 0.4): void {
    const disc = new THREE.Mesh(FLAT, glowMaterial(color, lum, 1, Tex.pool()));
    disc.position.set(x, 0.08, z);
    disc.scale.setScalar(r * 1.25);
    disc.renderOrder = 3;
    this.add(disc, life, (t) => {
      disc.material.opacity = 1 - t;
    });
  }

  /** Pita cahaya dari a ke b (dua bidang bersilang). */
  private ribbon(a: THREE.Vector3, b: THREE.Vector3, width: number, color: number, lum: number, life: number, opacity = 1, shrink = 0.7): THREE.Group | null {
    const len = a.distanceTo(b);
    if (len < 0.05) return null;
    const mat = glowMaterial(color, lum, opacity, Tex.beam());
    const g = new THREE.Group();
    g.add(new THREE.Mesh(RIBBON_H, mat), new THREE.Mesh(RIBBON_V, mat));
    g.position.copy(a).add(b).multiplyScalar(0.5);
    g.lookAt(b);
    this.add(g, life, (t) => {
      const w = width * (1 - t * shrink);
      g.scale.set(w, w, len);
      mat.opacity = opacity * (1 - t * t);
    });
    return g;
  }

  /** Beberapa sambaran petir bergerigi dari langit ke tanah di sekitar (x, z), dalam satu mesh. */
  private bolts(x: number, z: number, r: number, count: number, color: number): void {
    const pos: number[] = [];
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    const side = new THREE.Vector3();
    const dir = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * r * 0.85;
      const gx = x + Math.cos(ang) * d;
      const gz = z + Math.sin(ang) * d;
      const top = rand(7, 10);
      const segs = 7;
      p.set(gx + rand(-1.2, 1.2), top, gz + rand(-1.2, 1.2));
      for (let s = 1; s <= segs; s++) {
        const k = s / segs;
        const wob = (1 - k) * 0.9;
        q.set(gx + rand(-wob, wob), top * (1 - k), gz + rand(-wob, wob));
        dir.subVectors(q, p).normalize();
        side.crossVectors(dir, VIEW_DIR).normalize().multiplyScalar(0.09 + 0.1 * (1 - k));
        pos.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z, q.x + side.x, q.y + side.y, q.z + side.z);
        pos.push(p.x - side.x, p.y - side.y, p.z - side.z, q.x + side.x, q.y + side.y, q.z + side.z, q.x - side.x, q.y - side.y, q.z - side.z);
        p.copy(q);
      }
      this.sparks(gx, 0.2, gz, color, 5, 6, 0.3, 0.4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mesh = new THREE.Mesh(geo, glowMaterial(color, 2.6));
    mesh.frustumCulled = false;
    this.add(mesh, 0.36, (t) => {
      // berkedip sebelum padam
      mesh.material.opacity = (1 - t * t) * (Math.sin(t * 26) > -0.55 ? 1 : 0.4);
      if (t >= 1) geo.dispose();
    });
  }

  /** Percikan kecil saat serangan mengenai sasaran. */
  private hitSpark(x: number, y: number, z: number, color: number, strong: boolean): void {
    this.sparks(x, y, z, color, strong ? 7 : 3, strong ? 7 : 4.5, strong ? 0.34 : 0.24, 0.32, 0.6);
    if (strong) this.flash(x, y, z, 1.7, color, 1.4, 0.14);
  }

  /** Proyektil bercahaya dari a ke b; meninggalkan jejak dan meledak kecil saat tiba. */
  private projectile(a: THREE.Vector3, b: THREE.Vector3, color: number, size: number, big: boolean): void {
    const from = a.clone();
    const to = b.clone();
    const dist = from.distanceTo(to);
    const life = Math.max(0.08, dist / (big ? 46 : 60));
    const c = glowColor(color, 1.8);
    const core = glowColor(0xffffff, 1.6);
    const mat = glowMaterial(color, 2, 1, Tex.beam());
    const bolt = new THREE.Group();
    bolt.add(new THREE.Mesh(RIBBON_H, mat), new THREE.Mesh(RIBBON_V, mat));
    bolt.scale.set(size * 1.6, size * 1.6, Math.min(dist, big ? 3.2 : 2.2));
    const pos = new THREE.Vector3();
    this.add(bolt, life, (t) => {
      pos.lerpVectors(from, to, t);
      bolt.position.copy(pos);
      bolt.lookAt(to);
      this.glow.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 0.22, size: size * 2.4, size1: size * 0.5, r: c.r, g: c.g, b: c.b, alpha: 0.8 });
      this.glow.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 0.08, size: size * 1.5, r: core.r, g: core.g, b: core.b });
      if (t >= 1) {
        this.hitSpark(to.x, to.y, to.z, color, big);
        if (big) {
          this.shock(to.x, to.z, 1.6, color, 0.3, 1.2);
          this.light(to.x, 1.5, to.z, color, 26, 0.3);
        }
      }
    });
  }

  /** Lengkung tebasan di depan penyerang. */
  private slash(v: View, color: number, reach: number): void {
    const arc = new THREE.Mesh(ARC, glowMaterial(color, 1.5));
    const rot = v.model.rotation.y;
    const p = v.root.position;
    arc.position.set(p.x + Math.sin(rot) * 0.5, Math.min(1.5, v.height * 0.42), p.z + Math.cos(rot) * 0.5);
    arc.scale.setScalar(reach);
    this.add(arc, 0.2, (t) => {
      // menyapu dari kanan ke kiri di depan penyerang
      arc.rotation.set(0.18, rot - Math.PI / 2 + (t - 0.5) * 1.3, 0);
      arc.material.opacity = Math.sin(Math.min(1, t * 1.4) * Math.PI);
    });
  }

  // ------------------------------------------------------------------ publik

  ring(x: number, z: number, r: number, color: number): void {
    if (r >= 2.5) this.light(x, 1.6, z, color, 14 + r * 5, 0.45);
    this.shock(x, z, r, color, r >= 6 ? 0.7 : 0.5);
    this.groundGlow(x, z, r, color, r >= 6 ? 0.9 : 0.6);
    const big = r >= 6;
    if (r >= 3 && color !== MINT && color !== LEVEL_UP) this.puffs(x, 0.2, z, Math.min(6, r), r * 0.7, 1.2 + r * 0.1, [0.62, 0.6, 0.55], 0.2, 1);

    if (color === MINT) {
      // cahaya penyembuh: tiang lembut dan kilau hijau yang naik di seluruh area
      this.pillar(x, z, Math.min(2.2, r * 0.4), 5, MINT, 0.8);
      const c = glowColor(MINT, 1.7);
      for (let i = 0, n = Math.round(r * 7 * this.density); i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * r;
        this.glow.spawn({ x: x + Math.cos(ang) * d, y: rand(0, 0.5), z: z + Math.sin(ang) * d, vy: rand(1.5, 4), life: rand(0.6, 1.1), size: 0.3, size1: 0.06, r: c.r, g: c.g, b: c.b, drag: 0.5 });
      }
    } else if (color === VOLT) {
      // petir menyambar di dalam area + percikan listrik
      this.bolts(x, z, r, big ? 7 : 4, VOLT);
      this.flash(x, 1.2, z, r * 1.6, VOLT, 1.3, 0.25);
      this.sparks(x, 0.4, z, 0xfff4b0, r * 5, r * 2.6, 0.32, 0.55, 0.35, 5);
      if (big) this.after(0.16, () => this.bolts(x, z, r, 5, 0xfff4b0));
    } else if (color === SHADOW || color === SHADOW_DARK) {
      // bayangan: asap ungu gelap dan bilah yang melesat ke segala arah
      this.puffs(x, 0.3, z, r * 2.2, r * 0.5, 1.6, [0.2, 0.06, 0.3], 0.6, 0.9);
      const c = glowColor(SHADOW, 1.8);
      for (let i = 0, n = Math.round(r * 5 * this.density); i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + rand(-0.1, 0.1);
        const s = r * rand(2.6, 3.4);
        this.glow.spawn({ x, y: 0.9, z, vx: Math.cos(ang) * s, vz: Math.sin(ang) * s, life: 0.36, size: 0.42, size1: 0.1, r: c.r, g: c.g, b: c.b, drag: 1.5 });
      }
    } else if (color === LEVEL_UP) {
      // naik level: tiang cahaya dan kilau yang naik
      this.pillar(x, z, 1.1, 5, LEVEL_UP, 0.9);
      const c = glowColor(LEVEL_UP, 1.8);
      for (let i = 0, n = Math.round(26 * this.density); i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const d = rand(0.3, 1.6);
        this.glow.spawn({ x: x + Math.cos(ang) * d, y: rand(0, 0.6), z: z + Math.sin(ang) * d, vy: rand(2.5, 5.5), life: rand(0.6, 1.1), size: 0.3, size1: 0.08, r: c.r, g: c.g, b: c.b, drag: 0.6 });
      }
    } else {
      this.sparks(x, 0.4, z, color, r * 4, r * 2.4, 0.3, 0.5, 0.4, 6);
      if (r >= 2.5) this.flash(x, 1, z, r * 1.3, color, 1.1, 0.2);
    }
    if (big) this.shake(0.9);
  }

  /** Tiang cahaya tegak yang menyempit lalu padam. */
  private pillar(x: number, z: number, radius: number, height: number, color: number, life: number): void {
    const m = new THREE.Mesh(PILLAR, glowMaterial(color, 0.55, 0.5));
    m.position.set(x, 0, z);
    this.add(m, life, (t) => {
      const w = radius * (1 - t * 0.6);
      m.scale.set(w, height * (0.6 + 0.4 * t), w);
      m.material.opacity = 0.5 * (1 - t);
    });
  }

  text(x: number, z: number, s: string, color: number): void {
    const big = s.startsWith('LEVEL');
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 72;
    const ctx = canvas.getContext('2d')!;
    ctx.font = `800 ${big ? 46 : 42}px "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(8,10,18,0.92)';
    ctx.strokeText(s, 160, 37, 310);
    const hex = '#' + color.toString(16).padStart(6, '0');
    const grad = ctx.createLinearGradient(0, 12, 0, 60);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.45, hex);
    grad.addColorStop(1, hex);
    ctx.fillStyle = grad;
    ctx.fillText(s, 160, 37, 310);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
    const w = big ? 6 : 4.6;
    sp.position.set(x, 3.2, z);
    sp.renderOrder = 20;
    sp.layers.set(OVERLAY_LAYER); // tajam, tanpa bloom
    this.add(
      sp,
      big ? 1.5 : 1.1,
      (t, dt) => {
        const pop = 0.7 + 0.3 * Math.min(1, t * 9); // muncul sedikit membesar
        sp.scale.set(w * pop, w * pop * (72 / 320), 1);
        sp.position.y += dt * (2.4 - t * 1.4);
        sp.material.opacity = 1 - t * t * t;
      },
      tex,
    );
  }

  /** Angka kecil yang melompat di atas unit (damage / penyembuhan). Teksturnya dipakai ulang. */
  private number(x: number, z: number, text: string, color: string, scale: number): void {
    const key = color + text;
    let tex = this.numberTex.get(key);
    if (!tex) {
      if (this.numberTex.size > 400) {
        for (const t of this.numberTex.values()) t.dispose();
        this.numberTex.clear();
      }
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 48;
      const ctx = canvas.getContext('2d')!;
      ctx.font = '800 36px "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(8,10,18,0.9)';
      ctx.strokeText(text, 64, 25, 122);
      ctx.fillStyle = color;
      ctx.fillText(text, 64, 25, 122);
      tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.numberTex.set(key, tex);
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
    sp.position.set(x + rand(-0.6, 0.6), 2.3 + rand(0, 0.5), z + rand(-0.3, 0.3));
    sp.renderOrder = 19;
    sp.layers.set(OVERLAY_LAYER);
    const w = 2.3 * scale;
    this.add(sp, 0.8, (t, dt) => {
      const pop = t < 0.14 ? 0.6 + (t / 0.14) * 0.55 : 1.15 - (t - 0.14) * 0.2;
      sp.scale.set(w * pop, w * pop * (48 / 128), 1);
      sp.position.y += dt * (2.4 - t * 1.8);
      sp.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    });
  }

  /** Kepulan debu kecil di kaki hero yang berlari. */
  dust(x: number, z: number): void {
    this.puffs(x, 0.1, z, 2, 0.3, 0.7, [0.5, 0.46, 0.38], 0.3, 0.6);
  }

  /** Emote di atas kepala hero: muncul membal, mengikuti hero, lalu memudar. */
  private emote(heroId: number, emoji: string): void {
    if (!this.views.get(heroId)) return;
    const key = 'emote' + emoji;
    let tex = this.numberTex.get(key);
    if (!tex) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      // gelembung gelap di belakangnya supaya emoji terbaca di atas latar apa pun
      ctx.fillStyle = 'rgba(10,14,30,0.78)';
      ctx.beginPath();
      ctx.arc(64, 64, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(160,190,255,0.7)';
      ctx.stroke();
      ctx.font = '76px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, 64, 70);
      tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.numberTex.set(key, tex);
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
    sp.renderOrder = 20;
    sp.layers.set(OVERLAY_LAYER);
    this.add(sp, 2.6, (t) => {
      const v = this.views.get(heroId);
      if (v) sp.position.set(v.root.position.x, v.height + 2.5 + Math.sin(Math.min(1, t * 6) * Math.PI) * 0.35, v.root.position.z);
      const size = 1.9 * (t < 0.08 ? 0.5 + (t / 0.08) * 0.6 : 1.1 - Math.min(0.1, (t - 0.08) * 0.6));
      sp.scale.set(size, size, 1);
      sp.material.opacity = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
    });
  }

  /** Penanda pesan cepat tim di tanah: tiga cincin yang melebar berurutan. */
  /**
   * Area bahaya di tanah: garis lingkaran seluas serangannya, dan cakram yang membesar sampai
   * penuh tepat saat serangan itu mendarat (setelah `t` detik).
   */
  zone(x: number, z: number, r: number, t: number, color: number): void {
    const edge = new THREE.Mesh(FLAT, glowMaterial(color, 1.1, 1, Tex.unitRing()));
    edge.position.set(x, 0.12, z);
    edge.scale.setScalar(r);
    edge.renderOrder = 4;
    // redup: yang penting bentuk areanya terbaca, hero dan Titan di dalamnya tetap terlihat
    const fill = new THREE.Mesh(FLAT, glowMaterial(color, 0.32, 0.3, Tex.pool()));
    fill.position.set(x, 0.1, z);
    fill.renderOrder = 3;
    const g = new THREE.Group();
    g.add(edge, fill);
    this.add(g, t, (k) => {
      fill.scale.setScalar(Math.max(0.05, r * 1.25 * k));
      fill.material.opacity = 0.22 + 0.33 * k;
      edge.material.opacity = 0.55 + 0.45 * Math.abs(Math.sin(k * Math.PI * 5));
    });
  }

  ping(x: number, z: number, color: number): void {
    for (let i = 0; i < 3; i++) {
      this.after(i * 0.32, () => {
        const ring = new THREE.Mesh(FLAT, glowMaterial(color, 1.4, 1, Tex.unitRing()));
        ring.position.set(x, 0.12, z);
        ring.renderOrder = 4;
        this.add(ring, 0.95, (t) => {
          ring.scale.setScalar(0.7 + t * 3.4);
          ring.material.opacity = 1 - t;
        });
      });
    }
  }

  // ------------------------------------------------------------ bidikan skill

  private aimParts: { range: THREE.Mesh; spot: THREE.Mesh; lane: THREE.Mesh } | null = null;

  /**
   * Penanda bidikan saat tombol skill diseret: cincin jangkauan di sekeliling hero, lalu lingkaran
   * area di titik target (skill titik) atau jalur lurus selebar skill (skill arah). `null`
   * menyembunyikannya. `cancel` mewarnainya merah (jari di atas tombol batal).
   */
  aim(a: { x: number; z: number; tx: number; tz: number; range: number; radius: number; width: number; cancel: boolean } | null): void {
    if (!a) {
      if (this.aimParts) for (const m of Object.values(this.aimParts)) m.visible = false;
      return;
    }
    if (!this.aimParts) {
      const part = (geo: THREE.BufferGeometry, map: THREE.Texture | undefined, opacity: number) => {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
        m.renderOrder = 5;
        this.sm.scene.add(m);
        return m;
      };
      this.aimParts = { range: part(FLAT, Tex.unitRing(), 0.5), spot: part(FLAT, Tex.unitRing(), 0.95), lane: part(RIBBON_H, undefined, 0.3) };
    }
    const { range, spot, lane } = this.aimParts;
    const color = a.cancel ? 0xff5c5c : 0x9fd4ff;
    for (const m of [range, spot, lane]) (m.material as THREE.MeshBasicMaterial).color.setHex(color);
    range.visible = true;
    range.position.set(a.x, 0.1, a.z);
    range.scale.setScalar(a.range);
    const dx = a.tx - a.x;
    const dz = a.tz - a.z;
    const len = Math.hypot(dx, dz);
    // skill arah: jalur dari hero sampai ujung jangkauan
    lane.visible = a.width > 0 && len > 0.01;
    if (lane.visible) {
      lane.position.set(a.x + dx / 2, 0.11, a.z + dz / 2);
      lane.rotation.y = Math.atan2(dx, dz);
      lane.scale.set(a.width, 1, len);
    }
    // skill titik: lingkaran area efek di titik target
    spot.visible = a.width <= 0;
    if (spot.visible) {
      spot.position.set(a.tx, 0.12, a.tz);
      spot.scale.setScalar(Math.max(0.8, a.radius));
    }
  }

  clickMarker(x: number, z: number, color: number): void {
    const ring = new THREE.Mesh(FLAT, glowMaterial(color, 1.3, 1, Tex.unitRing()));
    ring.position.set(x, 0.1, z);
    ring.renderOrder = 4;
    this.add(ring, 0.4, (t) => {
      ring.scale.setScalar(1.5 * (1 - t) + 0.25);
      ring.material.opacity = 1 - t * 0.6;
    });
    const c = glowColor(color, 1.5);
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + 0.8;
      this.glow.spawn({ x: x + Math.cos(ang) * 1.2, y: 0.15, z: z + Math.sin(ang) * 1.2, vx: -Math.cos(ang) * 4, vz: -Math.sin(ang) * 4, life: 0.28, size: 0.3, size1: 0.1, r: c.r, g: c.g, b: c.b });
    }
  }

  /** Efek saat unit tewas / bangunan hancur. */
  death(v: View): void {
    const { x, z } = v.root.position;
    const tc = TEAM_COLOR[v.st.team];
    switch (v.st.kind) {
      case 'minion':
        this.sparks(x, 0.8, z, tc, 6, 4.5, 0.26, 0.45);
        this.puffs(x, 0.3, z, 2, 0.3, 0.9, [0.4, 0.4, 0.42], 0.35, 0.7);
        break;
      case 'monster':
        if (v.st.sub === 'titan') {
          // Titan Astra runtuh: ledakan bara besar dan guncangan
          this.sparks(x, 2.5, z, 0xff5a2a, 46, 11, 0.5, 1.1);
          this.puffs(x, 0.4, z, 14, 2.4, 2.6, [0.3, 0.26, 0.3], 0.6, 1.6);
          this.shock(x, z, 8, 0xff8a3c, 0.8, 1);
          this.light(x, 3, z, 0xff8a3c, 90, 0.8);
          this.shake(1.6);
          break;
        }
        this.sparks(x, 1, z, 0xffb040, 14, 6, 0.32, 0.6);
        this.puffs(x, 0.3, z, 5, 0.8, 1.4, [0.36, 0.33, 0.28], 0.45, 1);
        this.shock(x, z, v.st.sub === 'big' || v.st.sub === 'flow' ? 3 : 2, v.st.sub === 'flow' ? 0x5fd4ff : 0xffb040, 0.4, 1);
        break;
      case 'hero': {
        const accent = HEROES[v.st.sub]?.accent ?? 0xffffff;
        this.pillar(x, z, 1.3, 7, accent, 1);
        this.flash(x, 1.4, z, 5, 0xffffff, 1.3, 0.3);
        this.sparks(x, 1.2, z, accent, 26, 8, 0.34, 0.8, 0.8, 4);
        this.puffs(x, 0.3, z, 5, 0.7, 1.5, [0.3, 0.3, 0.34], 0.45, 1.1);
        break;
      }
      case 'tower':
      case 'core': {
        const core = v.st.kind === 'core';
        const top = core ? 4 : 6.5;
        const boom = (dy: number, spread: number) => {
          const bx = x + rand(-spread, spread);
          const bz = z + rand(-spread, spread);
          this.light(bx, dy + 1, bz, 0xffb060, core ? 90 : 60, 0.5);
          this.flash(bx, dy, bz, core ? 9 : 6, 0xffb060, 1.8, 0.3);
          this.sparks(bx, dy, bz, 0xffc070, 22, 11, 0.4, 0.9, 0.9, 14);
          this.sparks(bx, dy, bz, tc, 12, 8, 0.36, 0.8, 0.9, 8);
          this.puffs(bx, dy * 0.5, bz, 5, 1.2, 2.4, [0.2, 0.19, 0.19], 0.6, 1.8);
        };
        boom(top, 0.3);
        this.after(0.22, () => boom(top * 0.6, 1));
        this.after(0.5, () => boom(1.2, 1.4));
        if (core) for (let i = 0; i < 5; i++) this.after(0.7 + i * 0.22, () => boom(rand(1, 5), 3));
        this.after(0.7, () => this.puffs(x, 0.3, z, 12, 2.4, 2.6, [0.34, 0.32, 0.3], 0.5, 2.2));
        this.pillar(x, z, core ? 2.6 : 1.4, core ? 16 : 11, tc, core ? 1.6 : 0.9);
        this.shake(core ? 2 : 1.1);
        break;
      }
    }
  }

  private attackColor(v: View): number {
    if (v.st.kind === 'hero') return HEROES[v.st.sub]?.accent ?? 0x9af2ff;
    if (v.st.kind === 'monster') return 0xffb040;
    return TEAM_COLOR[v.st.team];
  }

  handle(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.k) {
        case 'atk': {
          const a = this.views.get(e.a);
          const b = this.views.get(e.b);
          if (!a) break;
          a.anim.atk = 1; // memicu animasi ayunan/tembakan pada rig
          const color = this.attackColor(a);
          const hero = a.st.kind === 'hero';
          const tower = a.st.kind === 'tower';
          if (!b) break;
          const ty = Math.min(1.3, b.height * 0.5);
          if (e.r) {
            const rot = a.model.rotation.y;
            const reach = tower ? 0 : hero ? 0.9 : 0.5;
            this.a.set(a.root.position.x + Math.sin(rot) * reach, tower ? 7 : a.height * 0.55, a.root.position.z + Math.cos(rot) * reach);
            this.b.set(b.root.position.x, ty, b.root.position.z);
            if (hero || tower) {
              this.projectile(this.a, this.b, color, tower ? 0.5 : 0.3, tower);
              this.flash(this.a.x, this.a.y, this.a.z, tower ? 2.6 : 1.5, color, 1.2, 0.12);
            } else {
              // minion penembak: cukup satu bola cahaya yang melesat (tanpa mesh tambahan)
              const life = Math.max(0.1, this.a.distanceTo(this.b) / 34);
              const c = glowColor(color, 1.8);
              const d = this.b.clone().sub(this.a).divideScalar(life);
              this.glow.spawn({ x: this.a.x, y: this.a.y, z: this.a.z, vx: d.x, vy: d.y, vz: d.z, life: life * 1.15, size: 0.55, size1: 0.4, r: c.r, g: c.g, b: c.b });
            }
          } else {
            // serangan jarak dekat: tebasan (hero & monster), lalu percikan di sasaran
            const strong = hero || a.st.kind === 'monster';
            if (strong) this.slash(a, color, a.st.kind === 'hero' ? 1.5 : 1.25);
            const tx = b.root.position.x;
            const tz = b.root.position.z;
            this.after(0.16, () => this.hitSpark(tx + rand(-0.2, 0.2), ty, tz + rand(-0.2, 0.2), strong ? color : 0xfff0c8, strong));
          }
          break;
        }
        case 'cast': {
          const caster = this.views.get(e.a);
          if (!caster) break;
          caster.anim.cast = 1;
          const color = this.attackColor(caster);
          const p = caster.root.position;
          this.shock(p.x, p.z, 1.9, color, 0.35, 1.1);
          this.sparks(p.x, 0.3, p.z, color, 8, 3, 0.26, 0.6, 1.4, -3);
          break;
        }
        case 'beam': {
          this.a.set(e.x0, 1.3, e.z0);
          this.b.set(e.x1, 1.3, e.z1);
          if (e.warn) {
            // garis bidik sebelum tembakan besar
            // tanpa bloom (kualitas ringan / HP) garisnya nyaris tak terlihat, jadi dibuat lebih tebal dan pekat di sana
            this.ribbon(this.a, this.b, e.w * (GFX.low || GFX.mobile ? 0.8 : 0.5), e.c, GFX.low || GFX.mobile ? 1.3 : 0.8, 0.5, GFX.low || GFX.mobile ? 0.8 : 0.45, 0.2);
          } else {
            const heavy = e.w > 2.5;
            this.light((e.x0 + e.x1) / 2, 2, (e.z0 + e.z1) / 2, e.c, heavy ? 60 : 32, 0.4);
            this.ribbon(this.a, this.b, e.w * 1.5, e.c, 1.5, 0.45, 0.9);
            this.ribbon(this.a, this.b, e.w * 0.55, 0xffffff, 2.2, 0.32, 1, 0.5);
            this.flash(e.x0, 1.3, e.z0, e.w * 2.6, e.c, 1.6, 0.25);
            this.flash(e.x1, 1.3, e.z1, e.w * 2, e.c, 1.2, 0.3);
            // percikan di sepanjang sinar
            const len = this.a.distanceTo(this.b);
            const c = glowColor(e.c, 1.7);
            for (let i = 0, n = Math.round(len * 1.6 * this.density); i < n; i++) {
              const k = Math.random();
              this.glow.spawn({
                x: e.x0 + (e.x1 - e.x0) * k + rand(-0.3, 0.3) * e.w,
                y: 1.3 + rand(-0.3, 0.3),
                z: e.z0 + (e.z1 - e.z0) * k + rand(-0.3, 0.3) * e.w,
                vx: rand(-2, 2),
                vy: rand(0, 3),
                vz: rand(-2, 2),
                life: rand(0.3, 0.7),
                size: 0.3,
                size1: 0.06,
                r: c.r,
                g: c.g,
                b: c.b,
                drag: 1.5,
              });
            }
            this.shake(heavy ? 1.2 : 0.35);
          }
          break;
        }
        case 'ring':
          this.ring(e.x, e.z, e.r, e.c);
          break;
        case 'zone':
          this.zone(e.x, e.z, e.r, e.t, e.c);
          break;
        case 'trail': {
          // jejak dash: pita cahaya + bayangan partikel di sepanjang lintasan
          this.a.set(e.x0, 0.9, e.z0);
          this.b.set(e.x1, 0.9, e.z1);
          this.ribbon(this.a, this.b, 1.3, e.c, 1.2, 0.4, 0.8);
          this.ribbon(this.a, this.b, 0.4, 0xffffff, 1.6, 0.22, 0.9, 0.4);
          const len = this.a.distanceTo(this.b);
          const c = glowColor(e.c, 1.5);
          for (let i = 0, n = Math.round(len * 2 * this.density); i < n; i++) {
            const k = i / n;
            this.glow.spawn({
              x: e.x0 + (e.x1 - e.x0) * k + rand(-0.3, 0.3),
              y: rand(0.3, 1.6),
              z: e.z0 + (e.z1 - e.z0) * k + rand(-0.3, 0.3),
              vy: rand(0.3, 1.5),
              life: rand(0.3, 0.6) + k * 0.2,
              size: 0.36,
              size1: 0.08,
              r: c.r,
              g: c.g,
              b: c.b,
            });
          }
          this.puffs(e.x0, 0.15, e.z0, 3, 0.4, 1.1, [0.5, 0.46, 0.38], 0.3, 0.6);
          break;
        }
        case 'text':
          this.text(e.x, e.z, e.s, e.c);
          break;
        case 'dmg':
          // makin besar damage, makin besar dan makin jingga angkanya
          this.number(e.x, e.z, String(e.n), e.n >= 150 ? '#ffb347' : e.n >= 70 ? '#ffe58a' : '#ffffff', e.n >= 150 ? 1.35 : 1);
          break;
        case 'heal':
          this.number(e.x, e.z, '+' + e.n, '#7dffb0', 1.15);
          break;
        case 'ping':
          this.ping(e.x, e.z, PINGS[e.kind]?.color ?? 0xffffff);
          break;
        case 'emote':
          if (EMOTES[e.kind]) this.emote(e.a, EMOTES[e.kind]);
          break;
      }
    }
  }

  update(dt: number): void {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        tm.fn();
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const fx = this.list[i];
      fx.life -= dt;
      if (fx.life <= 0) {
        fx.tick(1, dt);
        this.sm.scene.remove(fx.obj);
        fx.ownMap?.dispose();
        const seen = new Set<THREE.Material>();
        fx.obj.traverse((o) => {
          const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (mat && !seen.has(mat)) {
            seen.add(mat);
            mat.dispose();
          }
        });
        this.list.splice(i, 1);
      } else {
        fx.tick(1 - fx.life / fx.max, dt);
      }
    }
    this.auras(dt);
    this.glow.update(dt);
    this.smoke.update(dt);
    // lampu efek meredup sampai padam
    const lights = this.sm.fxLights;
    for (let i = 0; i < lights.length; i++) {
      const slot = this.lightLife[i];
      if (slot.life <= 0) continue;
      slot.life = Math.max(0, slot.life - dt);
      const k = slot.life / slot.max;
      lights[i].intensity = slot.power * k * k;
    }
  }
}
