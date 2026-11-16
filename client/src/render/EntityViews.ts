// Representasi visual tiap entity: model, HP bar, label nama, dan interpolasi posisi
// antar snapshot server supaya gerakan tetap halus.
import * as THREE from 'three';
import {
  F_INVIS,
  F_INVULN,
  F_SHIELD,
  F_STUN,
  type EntityStatic,
  type HeroInfo,
  type Snapshot,
  type Team,
} from '../../../shared/src';
import { buildModel, TEAM_COLOR } from './models';

export interface View {
  st: EntityStatic;
  root: THREE.Group;
  model: THREE.Group;
  x: number;
  z: number;
  rot: number;
  hp: number;
  maxHp: number;
  flags: number;
  seq: number;
  height: number;
  bar: THREE.Group;
  barFg: THREE.Mesh;
  barW: number;
  mats: THREE.MeshStandardMaterial[];
  spin?: THREE.Object3D;
  lunge: number;
  moving: boolean;
  label?: THREE.Sprite;
  labelKey: string;
  stunFx?: THREE.Mesh;
  shieldFx?: THREE.Mesh;
  ghost: boolean;
}

const BAR_GEO = new THREE.PlaneGeometry(1, 1);
const barMat = (color: number) =>
  new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, toneMapped: false });
const BAR_BG = barMat(0x05070d);
const BAR_SELF = barMat(0x7dff9a);
const BAR_ALLY = barMat(0x35c463);
const BAR_ENEMY = barMat(0xff4d4d);
const BAR_NEUTRAL = barMat(0xf2c744);
const BAR_LOCKED = barMat(0x8791a8);
const RING_GEO = new THREE.RingGeometry(0.82, 1, 28).rotateX(-Math.PI / 2);
const STUN_GEO = new THREE.TorusGeometry(0.45, 0.07, 6, 16).rotateX(Math.PI / 2);
const STUN_MAT = new THREE.MeshBasicMaterial({ color: 0xfff27a });
const SHIELD_GEO = new THREE.SphereGeometry(1, 16, 12);
const SHIELD_MAT = new THREE.MeshBasicMaterial({
  color: 0x8fd3ff,
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
});

function angleLerp(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class EntityViews {
  readonly views = new Map<number, View>();
  selfId = 0;
  myTeam: Team = 0;
  private seq = 0;
  private infos = new Map<number, HeroInfo>();

  constructor(private scene: THREE.Scene) {}

  get(id: number): View | undefined {
    return this.views.get(id);
  }

  get self(): View | undefined {
    return this.views.get(this.selfId);
  }

  apply(s: Snapshot): void {
    this.selfId = s.you.id;
    this.myTeam = s.you.team;
    this.seq++;
    for (const st of s.spawn) {
      this.remove(st.id);
      this.create(st);
    }
    for (const e of s.ents) {
      const v = this.views.get(e[0]);
      if (!v) continue;
      const first = v.seq === 0;
      const jump = Math.hypot(e[1] - v.x, e[2] - v.z);
      v.moving = jump > 0.02;
      v.x = e[1];
      v.z = e[2];
      v.rot = e[3];
      v.hp = e[4];
      v.maxHp = e[5];
      v.flags = e[6];
      v.seq = this.seq;
      // muncul pertama kali atau teleport (blink/respawn): langsung pindah tanpa interpolasi
      if (first || jump > 7) {
        v.root.position.set(v.x, 0, v.z);
        v.model.rotation.y = v.rot;
      }
    }
    for (const [id, v] of this.views) if (v.seq !== this.seq) this.remove(id);
    if (s.heroes) {
      this.infos.clear();
      for (const h of s.heroes) {
        this.infos.set(h.id, h);
        const v = this.views.get(h.id);
        if (v) this.setLabel(v, h);
      }
    }
  }

  private create(st: EntityStatic): void {
    const built = buildModel(st);
    const root = new THREE.Group();
    root.add(built.model);

    const isSelf = st.id === this.selfId;
    const ally = st.team === this.myTeam;

    // cincin warna tim di kaki unit
    if (st.kind === 'hero' || st.kind === 'minion') {
      const ring = new THREE.Mesh(
        RING_GEO,
        new THREE.MeshBasicMaterial({
          color: isSelf ? 0xffffff : TEAM_COLOR[st.team],
          transparent: true,
          opacity: isSelf ? 0.95 : 0.7,
          depthWrite: false,
        }),
      );
      const r = st.radius * (st.kind === 'hero' ? 1.6 : 1.3);
      ring.scale.setScalar(r);
      ring.position.y = 0.06;
      root.add(ring);
    }

    // HP bar
    const barW = st.kind === 'hero' ? 2.2 : st.kind === 'tower' ? 2.8 : st.kind === 'core' ? 4.5 : st.sub === 'big' ? 2 : 1.1;
    const barH = st.kind === 'minion' ? 0.14 : 0.26;
    const bar = new THREE.Group();
    const bg = new THREE.Mesh(BAR_GEO, BAR_BG);
    bg.scale.set(barW + 0.12, barH + 0.1, 1);
    bg.renderOrder = 10;
    const fgMat = st.team === 2 ? BAR_NEUTRAL : isSelf ? BAR_SELF : ally ? BAR_ALLY : BAR_ENEMY;
    const fg = new THREE.Mesh(BAR_GEO, fgMat);
    fg.scale.set(barW, barH, 1);
    fg.renderOrder = 11;
    bar.add(bg, fg);
    bar.position.y = built.height + 0.4;
    root.add(bar);

    const v: View = {
      st,
      root,
      model: built.model,
      x: 0,
      z: 0,
      rot: 0,
      hp: 1,
      maxHp: 1,
      flags: 0,
      seq: 0,
      height: built.height,
      bar,
      barFg: fg,
      barW,
      mats: built.mats,
      spin: built.spin,
      lunge: 0,
      moving: false,
      labelKey: '',
      ghost: false,
    };
    this.views.set(st.id, v);
    this.scene.add(root);
    const info = this.infos.get(st.id);
    if (st.kind === 'hero') this.setLabel(v, info);
  }

  private setLabel(v: View, info?: HeroInfo): void {
    const level = info?.level ?? 1;
    const key = `${v.st.name}|${level}`;
    if (key === v.labelKey) return;
    v.labelKey = key;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 48;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 26px Segoe UI, Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    const text = `${level} · ${v.st.name}`;
    ctx.strokeText(text, 128, 24, 250);
    ctx.fillStyle = v.st.id === this.selfId ? '#ffffff' : v.st.team === this.myTeam ? '#9fd0ff' : '#ffb0b0';
    ctx.fillText(text, 128, 24, 250);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (!v.label) {
      v.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      v.label.scale.set(4, 0.75, 1);
      v.label.position.y = v.height + 1.05;
      v.label.renderOrder = 12;
      v.root.add(v.label);
    } else {
      v.label.material.map?.dispose();
      v.label.material.map = tex;
    }
  }

  private remove(id: number): void {
    const v = this.views.get(id);
    if (!v) return;
    this.scene.remove(v.root);
    for (const m of v.mats) m.dispose();
    if (v.label) {
      v.label.material.map?.dispose();
      v.label.material.dispose();
    }
    this.views.delete(id);
  }

  update(dt: number, camera: THREE.Camera, time: number): void {
    const k = 1 - Math.exp(-dt * 16);
    const kr = 1 - Math.exp(-dt * 14);
    for (const v of this.views.values()) {
      const p = v.root.position;
      p.x += (v.x - p.x) * k;
      p.z += (v.z - p.z) * k;
      v.model.rotation.y = angleLerp(v.model.rotation.y, v.rot, kr);

      // animasi sederhana: langkah saat bergerak, sentakan saat menyerang
      const mobile = v.st.kind !== 'tower' && v.st.kind !== 'core';
      if (mobile) {
        v.model.position.y = v.moving ? Math.abs(Math.sin(time * 11 + v.st.id)) * 0.12 : 0;
        if (v.lunge > 0) {
          v.lunge = Math.max(0, v.lunge - dt * 5);
          const f = Math.sin(v.lunge * Math.PI) * 0.45;
          v.model.position.x = Math.sin(v.model.rotation.y) * f;
          v.model.position.z = Math.cos(v.model.rotation.y) * f;
        } else {
          v.model.position.x = v.model.position.z = 0;
        }
      }
      if (v.spin) {
        v.spin.rotation.y += dt * 1.2;
        v.spin.position.y += Math.sin(time * 2 + v.st.id) * 0.002;
      }

      // HP bar selalu menghadap kamera
      const frac = Math.max(0, Math.min(1, v.hp / v.maxHp));
      v.barFg.scale.x = Math.max(0.0001, v.barW * frac);
      v.barFg.position.x = -(v.barW * (1 - frac)) / 2;
      v.bar.quaternion.copy(camera.quaternion);
      if (v.st.kind === 'tower' || v.st.kind === 'core') {
        const locked = (v.flags & F_INVULN) !== 0;
        const want = locked ? BAR_LOCKED : v.st.team === this.myTeam ? BAR_ALLY : BAR_ENEMY;
        if (v.barFg.material !== want) v.barFg.material = want;
      }

      // status: stun, shield, invisible (hanya terlihat oleh tim sendiri -> transparan)
      const stunned = (v.flags & F_STUN) !== 0;
      if (stunned && !v.stunFx) {
        v.stunFx = new THREE.Mesh(STUN_GEO, STUN_MAT);
        v.stunFx.position.y = v.height + 0.05;
        v.root.add(v.stunFx);
      }
      if (v.stunFx) {
        v.stunFx.visible = stunned;
        v.stunFx.rotation.y += dt * 9;
      }
      const shielded = (v.flags & F_SHIELD) !== 0;
      if (shielded && !v.shieldFx) {
        v.shieldFx = new THREE.Mesh(SHIELD_GEO, SHIELD_MAT);
        v.shieldFx.scale.setScalar(v.height * 0.62);
        v.shieldFx.position.y = v.height * 0.48;
        v.root.add(v.shieldFx);
      }
      if (v.shieldFx) v.shieldFx.visible = shielded;
      const ghost = (v.flags & F_INVIS) !== 0;
      if (ghost !== v.ghost) {
        v.ghost = ghost;
        for (const m of v.mats) {
          m.transparent = ghost;
          m.opacity = ghost ? 0.32 : 1;
          m.needsUpdate = true;
        }
      }
    }
  }

  /** Musuh (atau monster netral) yang paling dekat dengan titik klik, jika cukup dekat. */
  pickEnemy(x: number, z: number, slack = 1.2): View | null {
    let best: View | null = null;
    let bestD = Infinity;
    for (const v of this.views.values()) {
      if (v.st.team === this.myTeam) continue;
      const d = Math.hypot(v.root.position.x - x, v.root.position.z - z) - v.st.radius;
      if (d < slack && d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  /** Musuh terdekat dari hero sendiri dalam jarak tertentu (hero diutamakan); untuk auto-aim. */
  nearestEnemyTo(x: number, z: number, range: number): View | null {
    let best: View | null = null;
    let bestScore = Infinity;
    for (const v of this.views.values()) {
      if (v.st.team === this.myTeam || v.st.kind === 'tower' || v.st.kind === 'core') continue;
      const d = Math.hypot(v.x - x, v.z - z) - v.st.radius;
      if (d > range) continue;
      const score = d + (v.st.kind === 'hero' ? 0 : 50) + (v.st.kind === 'monster' ? 50 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = v;
      }
    }
    return best;
  }
}
