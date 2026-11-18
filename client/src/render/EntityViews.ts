// Representasi visual tiap entity: model + rig animasi, HP bar, label nama, cincin tim, status
// (stun, perisai, invisible), animasi tumbang, dan interpolasi posisi antar snapshot server.
import * as THREE from 'three';
import {
  F_BUFF,
  F_BUSH,
  TOWER_RANGE,
  F_INVIS,
  F_INVULN,
  F_RECALL,
  F_SHIELD,
  F_STUN,
  type EntityStatic,
  type HeroInfo,
  type Snapshot,
  type Team,
} from '../../../shared/src';
import { towerRubble } from './buildings';
import { orbit, union } from './geo';
import { buildModel } from './models';
import { glowColor, TEAM_COLOR } from './palette';
import { animateRig, type AnimState, type Rig } from './rig';
import { OVERLAY_LAYER } from './SceneManager';
import { Tex } from './textures';

export interface View {
  st: EntityStatic;
  root: THREE.Group;
  model: THREE.Group;
  x: number;
  z: number;
  rot: number;
  hp: number;
  maxHp: number;
  /** HP yang ditampilkan sebagai "jejak" putih di belakang bar; menyusul hp pelan-pelan. */
  lagHp: number;
  flags: number;
  seq: number;
  height: number;
  bar: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  barKind: number;
  /** Bar mana tipis di bawah HP bar; hanya dibuat untuk hero sendiri. */
  manaBar?: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  mats: THREE.Material[];
  rig: Rig;
  anim: AnimState;
  /** 1 saat baru terkena damage, turun ke 0 (kilat putih / sentakan). */
  hit: number;
  /** Akumulasi jarak sejak kepulan debu terakhir (hanya hero). */
  dust: number;
  ring?: THREE.Mesh;
  label?: THREE.Sprite;
  labelKey: string;
  stunFx?: THREE.Mesh;
  shieldFx?: THREE.Mesh;
  recallFx?: THREE.Mesh;
  buffFx?: THREE.Mesh;
  ghost: boolean;
  /** Opasitas model saat ini (1 = utuh). */
  ghostAlpha?: number;
  /** Riwayat posisi dari snapshot terakhir, rata: [waktu server, x, z, ...] (paling lama di depan). */
  hist: number[];
}

interface Corpse {
  v: View;
  t: number;
  life: number;
}

// ------------------------------------------------------------------- HP bar

const BAR_COLORS = [0x7dff9a, 0x35c463, 0xff4d4d, 0xf2c744, 0x8791a8].map((c) => new THREE.Color(c));
const [SELF, ALLY, ENEMY, NEUTRAL, LOCKED] = [0, 1, 2, 3, 4];

const BAR_GEO = new THREE.PlaneGeometry(1, 1);
/** Satu quad per unit: bingkai, isi bergradasi, jejak damage, dan garis tiap 100 HP. */
const BAR_MAT = new THREE.ShaderMaterial({
  uniforms: {
    uFrac: { value: 1 },
    uLag: { value: 1 },
    uColor: { value: new THREE.Color() },
    uSize: { value: new THREE.Vector2(1, 1) },
    uTicks: { value: 0 },
  },
  transparent: true,
  depthTest: false,
  depthWrite: false,
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uFrac;
    uniform float uLag;
    uniform vec3 uColor;
    uniform vec2 uSize;
    uniform float uTicks;
    varying vec2 vUv;
    void main() {
      vec2 b = vec2(0.045) / uSize;
      vec2 q = (vUv - b) / (1.0 - 2.0 * b);
      vec3 col = vec3(0.012, 0.016, 0.03);
      if (q.x >= 0.0 && q.x <= 1.0 && q.y >= 0.0 && q.y <= 1.0) {
        if (q.x <= uFrac) {
          col = uColor * (0.5 + 0.55 * q.y) + vec3(0.3) * smoothstep(0.6, 0.95, q.y);
          float d = abs(fract(q.x * uTicks + 0.5) - 0.5) / max(uTicks, 0.001);
          if (uTicks > 0.5 && d < 0.014 / uSize.x && q.y < 0.62) col *= 0.35;
        } else if (q.x <= uLag) {
          col = vec3(1.0, 0.93, 0.78);
        } else {
          col = vec3(0.045, 0.055, 0.085);
        }
      }
      gl_FragColor = vec4(col, 0.92);
      #include <colorspace_fragment>
    }`,
});

// ---------------------------------------------------------- bahan & geometri bersama

const FLAT = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
const groundMat = (map: THREE.Texture, color: THREE.ColorRepresentation, opacity: number) =>
  new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });

interface Shared {
  ringTeam: THREE.MeshBasicMaterial[];
  ringMinion: THREE.MeshBasicMaterial[];
  ringSelf: THREE.MeshBasicMaterial;
  blob: THREE.MeshBasicMaterial;
  stunGeo: THREE.BufferGeometry;
  stunMat: THREE.MeshBasicMaterial;
  shieldGeo: THREE.BufferGeometry;
  shieldMat: THREE.ShaderMaterial;
  recallGeo: THREE.BufferGeometry;
  recallMat: THREE.MeshBasicMaterial;
  buffMat: THREE.MeshBasicMaterial;
}
let shared: Shared | null = null;

function assets(): Shared {
  if (shared) return shared;
  const bright = (hex: number) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.25);
  const selfTex = Tex.selfRing();
  selfTex.center.set(0.5, 0.5); // supaya bisa diputar di tempat
  shared = {
    ringTeam: TEAM_COLOR.map((c) => groundMat(Tex.unitRing(), bright(c), 0.95)),
    ringMinion: TEAM_COLOR.map((c) => groundMat(Tex.unitRing(), bright(c), 0.6)),
    ringSelf: groundMat(selfTex, 0xfff6d8, 1),
    blob: groundMat(Tex.blob(), 0x000000, 1),
    // tiga bintang kecil yang berputar di atas kepala
    stunGeo: union(orbit(3, 0.42, () => new THREE.OctahedronGeometry(0.15).scale(1, 0.55, 1))),
    stunMat: new THREE.MeshBasicMaterial({ color: glowColor(0xffe766, 1.3) }),
    shieldGeo: new THREE.SphereGeometry(1, 24, 16),
    // cincin emas berputar di kaki hero yang membawa Berkah Golem
    buffMat: new THREE.MeshBasicMaterial({
      color: glowColor(0xffc24a, 1.1),
      map: Tex.selfRing(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    // tiang cahaya saat menyalurkan recall
    recallGeo: new THREE.CylinderGeometry(0.75, 1, 1, 20, 1, true).translate(0, 0.5, 0),
    recallMat: new THREE.MeshBasicMaterial({
      color: glowColor(0x9fd8ff, 0.5),
      map: Tex.beam(),
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    // gelembung energi: terang di tepi (fresnel) dengan gelombang yang naik
    shieldMat: new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: glowColor(0x8fd3ff, 0.55) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vV;
        varying float vY;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          vY = position.y;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        varying vec3 vN;
        varying vec3 vV;
        varying float vY;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
          float wave = 0.5 + 0.5 * sin(vY * 11.0 - uTime * 4.0);
          gl_FragColor = vec4(uColor * (0.05 + f * (1.2 + 0.7 * wave)), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  };
  return shared;
}

function angleLerp(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const structureKey = (x: number, z: number) => `${Math.round(x)}:${Math.round(z)}`;
const isBuilding = (st: EntityStatic) => st.kind === 'tower' || st.kind === 'core';

/** Jumlah snapshot yang disimpan per unit, dan seberapa jauh di belakang waktu server posisi ditampilkan (detik). */
const HIST_SAMPLES = 5;
const INTERP_DELAY = 0.1;
/** Batas ekstrapolasi saat snapshot berikutnya terlambat (detik). */
const EXTRAPOLATE = 0.06;
const sampled = { x: 0, z: 0 };

/** Posisi unit pada waktu server `t` menurut riwayat snapshot-nya; hasilnya ditaruh di `sampled`. */
function samplePosition(v: View, t: number): void {
  const h = v.hist;
  const n = h.length;
  if (n < 6) {
    sampled.x = v.x;
    sampled.z = v.z;
    return;
  }
  let i = n - 3;
  while (i > 0 && h[i] > t) i -= 3;
  if (i === n - 3) {
    // lebih baru dari snapshot terakhir: teruskan sebentar dengan kecepatan terakhir, lalu diam
    const span = h[i] - h[i - 3];
    const ahead = Math.min(t - h[i], EXTRAPOLATE);
    const f = span > 1e-4 && ahead > 0 ? ahead / span : 0;
    sampled.x = h[i + 1] + (h[i + 1] - h[i - 2]) * f;
    sampled.z = h[i + 2] + (h[i + 2] - h[i - 1]) * f;
    return;
  }
  const span = h[i + 3] - h[i];
  const f = span > 1e-4 ? Math.min(1, Math.max(0, (t - h[i]) / span)) : 1;
  sampled.x = h[i + 1] + (h[i + 4] - h[i + 1]) * f;
  sampled.z = h[i + 2] + (h[i + 5] - h[i + 2]) * f;
}

export class EntityViews {
  readonly views = new Map<number, View>();
  selfId = 0;
  myTeam: Team = 0;
  /** Lingkaran jangkauan tower musuh terdekat; muncul saat hero sendiri mendekat. */
  private towerRing: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null = null;
  /** Sisa mana hero sendiri (0..1), untuk bar mana di atas kepalanya. */
  private selfMana = 1;
  /**
   * Perkiraan waktu server saat ini. Maju mengikuti jam lokal dan dikoreksi pelan-pelan tiap
   * snapshot, sehingga snapshot yang datang tidak merata (jaringan seluler) tidak ikut membuat
   * gerakan tersendat.
   */
  private clock = 0;
  private clockSet = false;
  /** Dipanggil saat hero yang berlari menjejak tanah (untuk efek debu). */
  onFootstep: ((x: number, z: number) => void) | null = null;
  /** Dipanggil saat unit tewas/hancur (untuk efek ledakan, asap, dsb.). */
  onDeath: ((v: View) => void) | null = null;
  private seq = 0;
  private infos = new Map<number, HeroInfo>();
  private dying = new Set<number>();
  private corpses: Corpse[] = [];
  private rubble = new Map<string, THREE.Mesh>();
  private blobs: THREE.InstancedMesh | null = null;
  private tmp = new THREE.Object3D();

  /** `blobShadows`: bayangan bulat murah di kaki unit, dipakai saat shadow map dimatikan. */
  constructor(
    private scene: THREE.Scene,
    blobShadows: boolean,
  ) {
    if (blobShadows) {
      // satu InstancedMesh untuk semua bayangan bulat (posisinya diperbarui tiap frame)
      this.blobs = new THREE.InstancedMesh(FLAT, assets().blob, 200);
      this.blobs.count = 0;
      this.blobs.frustumCulled = false;
      this.blobs.renderOrder = 1;
      scene.add(this.blobs);
    }
  }

  get(id: number): View | undefined {
    return this.views.get(id);
  }

  get self(): View | undefined {
    return this.views.get(this.selfId);
  }

  apply(s: Snapshot): void {
    this.selfId = s.you.id;
    this.myTeam = s.you.team;
    this.selfMana = s.you.maxMana > 0 ? Math.max(0, Math.min(1, s.you.mana / s.you.maxMana)) : 0;
    this.seq++;
    const drift = s.t - this.clock;
    if (!this.clockSet || Math.abs(drift) > 0.4) {
      this.clock = s.t; // awal pertandingan, atau tab sempat tertidur
      this.clockSet = true;
    } else {
      this.clock += drift * 0.1;
    }
    for (const e of s.events) if (e.k === 'die') this.dying.add(e.a);
    for (const st of s.spawn) {
      this.remove(st.id);
      this.create(st);
    }
    for (const e of s.ents) {
      const v = this.views.get(e[0]);
      if (!v) continue;
      const first = v.seq === 0;
      const jump = Math.hypot(e[1] - v.x, e[2] - v.z);
      v.x = e[1];
      v.z = e[2];
      v.rot = e[3];
      if (!first && e[4] < v.hp) v.hit = 1;
      v.hp = e[4];
      v.maxHp = e[5];
      v.flags = e[6];
      v.seq = this.seq;
      // muncul pertama kali atau teleport (blink/respawn): langsung pindah tanpa interpolasi
      const hist = v.hist;
      if (first || jump > 4) {
        v.root.position.set(v.x, 0, v.z);
        v.model.rotation.y = v.rot;
        hist.length = 0;
      }
      if (hist.length >= HIST_SAMPLES * 3) hist.splice(0, 3);
      hist.push(s.t, v.x, v.z);
      if (first) {
        v.lagHp = v.hp;
        // tower baru di lokasi ini (pertandingan baru): bersihkan puing lama
        if (v.st.kind === 'tower') this.clearRubble(structureKey(v.x, v.z));
      }
    }
    for (const [id, v] of this.views) if (v.seq !== this.seq) this.remove(id);
    this.dying.clear();
    if (s.heroes) {
      this.infos.clear();
      for (const h of s.heroes) {
        this.infos.set(h.id, h);
        const v = this.views.get(h.id);
        if (v) this.setLabel(v, h);
      }
    }
  }

  private barKindOf(st: EntityStatic, locked: boolean): number {
    if (locked) return LOCKED;
    if (st.team === 2) return NEUTRAL;
    if (st.id === this.selfId) return SELF;
    return st.team === this.myTeam ? ALLY : ENEMY;
  }

  private create(st: EntityStatic): void {
    const built = buildModel(st);
    const root = new THREE.Group();
    root.add(built.model);
    const a = assets();

    const isSelf = st.id === this.selfId;
    let ring: THREE.Mesh | undefined;
    // cincin warna tim di kaki unit
    if (st.kind === 'hero' || st.kind === 'minion') {
      const mat = isSelf ? a.ringSelf : st.kind === 'hero' ? a.ringTeam[st.team] : a.ringMinion[st.team];
      ring = new THREE.Mesh(FLAT, mat);
      ring.scale.setScalar(st.radius * (st.kind === 'hero' ? 1.75 : 1.4));
      ring.position.y = 0.05;
      ring.renderOrder = 2;
      root.add(ring);
    }

    // HP bar
    const barW = st.kind === 'hero' ? 2.3 : st.kind === 'tower' ? 2.9 : st.kind === 'core' ? 4.6 : st.sub === 'big' ? 2.1 : st.sub === 'super' ? 1.8 : 1.15;
    const barH = st.sub === 'super' ? 0.24 : st.kind === 'minion' ? 0.17 : st.kind === 'hero' ? 0.34 : 0.3;
    const mat = BAR_MAT.clone();
    const barKind = this.barKindOf(st, false);
    mat.uniforms.uSize.value.set(barW, barH);
    mat.uniforms.uColor.value.copy(BAR_COLORS[barKind]);
    const bar = new THREE.Mesh(BAR_GEO, mat);
    bar.scale.set(barW, barH, 1);
    bar.position.y = built.height + 0.4;
    bar.renderOrder = 10;
    bar.layers.set(OVERLAY_LAYER);
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
      lagHp: 1,
      flags: 0,
      seq: 0,
      height: built.height,
      bar,
      barKind,
      mats: built.mats,
      rig: built.rig,
      anim: { phase: st.id * 1.7, walk: 0, atk: 0, cast: 0, seed: st.id * 0.73 },
      hit: 0,
      dust: 0,
      ring,
      labelKey: '',
      ghost: false,
      hist: [],
    };
    this.views.set(st.id, v);
    this.scene.add(root);
    if (st.kind === 'hero') this.setLabel(v, this.infos.get(st.id));
  }

  /** Label di atas hero: lencana level + nama, digambar ke canvas. */
  private setLabel(v: View, info?: HeroInfo): void {
    const level = info?.level ?? 1;
    const key = `${v.st.name}|${level}`;
    if (key === v.labelKey) return;
    v.labelKey = key;
    const W = 320;
    const H = 56;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.font = '700 27px "Segoe UI", Roboto, sans-serif';
    ctx.textBaseline = 'middle';
    const name = v.st.name;
    const nameW = Math.min(W - 64, ctx.measureText(name).width);
    const badge = 34;
    const x0 = (W - (badge + 8 + nameW)) / 2;
    const isSelf = v.st.id === this.selfId;
    const team = isSelf ? '#f2c744' : v.st.team === this.myTeam ? '#3f8cff' : '#f0504a';
    // lencana level (sudut membulat bila didukung browser)
    const pill = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
      else ctx.rect(x, y, w, h);
      ctx.fill();
    };
    ctx.fillStyle = 'rgba(8,11,20,0.85)';
    pill(x0 - 3, H / 2 - badge / 2 - 3, badge + 6, badge + 6, 10);
    ctx.fillStyle = team;
    pill(x0, H / 2 - badge / 2, badge, badge, 8);
    ctx.fillStyle = isSelf ? '#1a1406' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = '800 24px "Segoe UI", Roboto, sans-serif';
    ctx.fillText(String(level), x0 + badge / 2, H / 2 + 1, badge - 4);
    // nama
    ctx.font = '700 27px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(5,8,16,0.9)';
    ctx.strokeText(name, x0 + badge + 8, H / 2 + 1, W - 64);
    ctx.fillStyle = isSelf ? '#fff6d8' : v.st.team === this.myTeam ? '#cfe4ff' : '#ffd0cc';
    ctx.fillText(name, x0 + badge + 8, H / 2 + 1, W - 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (!v.label) {
      v.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
      v.label.scale.set(4.6, 4.6 * (H / W), 1);
      v.label.position.y = v.height + 1.05;
      v.label.renderOrder = 12;
      v.label.layers.set(OVERLAY_LAYER);
      v.root.add(v.label);
    } else {
      v.label.material.map?.dispose();
      v.label.material.map = tex;
    }
  }

  private dispose(v: View): void {
    this.scene.remove(v.root);
    for (const m of v.mats) m.dispose();
    v.bar.material.dispose();
    v.manaBar?.material.dispose();
    if (v.label) {
      v.label.material.map?.dispose();
      v.label.material.dispose();
    }
  }

  private remove(id: number): void {
    const v = this.views.get(id);
    if (!v) return;
    this.views.delete(id);
    if (!this.dying.has(id)) {
      this.dispose(v);
      return;
    }
    // tewas: sembunyikan penanda, biarkan modelnya tumbang dulu
    v.bar.visible = false;
    if (v.manaBar) v.manaBar.visible = false;
    if (v.label) v.label.visible = false;
    if (v.ring) v.ring.visible = false;
    if (v.stunFx) v.stunFx.visible = false;
    if (v.shieldFx) v.shieldFx.visible = false;
    if (v.recallFx) v.recallFx.visible = false;
    if (v.buffFx) v.buffFx.visible = false;
    this.corpses.push({ v, t: 0, life: isBuilding(v.st) ? 1.1 : 1.5 });
    for (const m of v.mats) {
      m.transparent = true; // supaya bisa memudar saat tenggelam
      m.needsUpdate = true;
    }
    this.onDeath?.(v);
    if (v.st.kind === 'tower') {
      const key = structureKey(v.x, v.z);
      this.clearRubble(key);
      const mesh = towerRubble();
      mesh.position.set(v.x, 0, v.z);
      mesh.rotation.y = v.st.id * 1.3;
      mesh.visible = false; // muncul saat menara selesai runtuh
      this.scene.add(mesh);
      this.rubble.set(key, mesh);
    }
  }

  private clearRubble(key: string): void {
    const old = this.rubble.get(key);
    if (!old) return;
    this.scene.remove(old);
    this.rubble.delete(key);
  }

  private updateCorpses(dt: number): void {
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.t += dt;
      const k = Math.min(1, c.t / c.life);
      const m = c.v.model;
      if (isBuilding(c.v.st)) {
        // runtuh: memendek, tenggelam, dan bergetar
        const e = k * k;
        m.scale.set(1 + e * 0.12, Math.max(0.05, 1 - e), 1 + e * 0.12);
        m.position.set((Math.random() - 0.5) * 0.16 * (1 - k), -e * 0.6, (Math.random() - 0.5) * 0.16 * (1 - k));
        const rub = this.rubble.get(structureKey(c.v.x, c.v.z));
        if (rub && k > 0.7) rub.visible = true;
      } else {
        // rebah ke belakang, lalu tenggelam ke tanah sambil memudar
        const fall = Math.min(1, c.t / 0.38);
        m.rotation.x = -(fall * fall) * 1.45;
        m.position.y = Math.sin(fall * Math.PI) * 0.25;
        const sink = Math.max(0, (c.t - 0.7) / (c.life - 0.7));
        m.position.y -= sink * 1.1;
        for (const mat of c.v.mats) mat.opacity = 1 - sink;
      }
      if (k >= 1) {
        this.dispose(c.v);
        this.corpses.splice(i, 1);
      }
    }
  }

  update(dt: number, camera: THREE.Camera, time: number): void {
    const a = assets();
    a.shieldMat.uniforms.uTime.value = time;
    a.ringSelf.map!.rotation = time * 0.6;
    // Posisi ditampilkan sedikit di masa lalu (INTERP_DELAY) dan diinterpolasi lurus di antara dua
    // snapshot yang mengapitnya: kecepatan di layar jadi rata, tidak berdenyut 20x per detik.
    this.clock += dt;
    const renderTime = this.clock - INTERP_DELAY;
    const k = 1 - Math.exp(-dt * 40);
    const kr = 1 - Math.exp(-dt * 14);
    let blobCount = 0;
    for (const v of this.views.values()) {
      const p = v.root.position;
      const ox = p.x;
      const oz = p.z;
      samplePosition(v, renderTime);
      p.x += (sampled.x - p.x) * k;
      p.z += (sampled.z - p.z) * k;
      v.model.rotation.y = angleLerp(v.model.rotation.y, v.rot, kr);

      // animasi: fase langkah mengikuti jarak yang benar-benar ditempuh di layar
      const an = v.anim;
      const moved = Math.min(1, Math.hypot(p.x - ox, p.z - oz));
      const speed = dt > 0 ? moved / dt : 0;
      const stunned = (v.flags & F_STUN) !== 0;
      an.phase += moved * v.rig.stride;
      an.walk += ((speed > 0.8 && !stunned ? 1 : 0) - an.walk) * Math.min(1, dt * 10);
      if (an.atk > 0) an.atk = Math.max(0, an.atk - dt / 0.42);
      if (an.cast > 0) an.cast = Math.max(0, an.cast - dt / 0.5);
      animateRig(v.rig, an, time, dt);
      if (v.rig.lunge > 0) {
        const f = an.atk > 0 ? Math.sin((1 - an.atk) * Math.PI) * v.rig.lunge : 0;
        v.model.position.x = Math.sin(v.model.rotation.y) * f;
        v.model.position.z = Math.cos(v.model.rotation.y) * f;
      }
      if (v.st.kind === 'hero' && this.onFootstep && an.walk > 0.6) {
        v.dust += moved;
        if (v.dust > 2.2) {
          v.dust = 0;
          this.onFootstep(p.x, p.z);
        }
      }

      // terkena damage: hero berkilat putih, unit lain tersentak sedikit
      if (v.hit > 0) {
        v.hit = Math.max(0, v.hit - dt * 5);
        const body = v.mats[0] as THREE.MeshStandardMaterial | undefined;
        if (body?.emissive) body.emissive.setScalar(v.hit * 0.55);
        else if (!isBuilding(v.st)) v.model.scale.setScalar(1 + v.hit * 0.07);
      }

      // HP bar selalu menghadap kamera; jejak putih menyusul pelan-pelan
      const frac = Math.max(0, Math.min(1, v.hp / v.maxHp));
      if (v.lagHp < v.hp) v.lagHp = v.hp;
      else v.lagHp += (v.hp - v.lagHp) * Math.min(1, dt * 3.2);
      const u = v.bar.material.uniforms;
      u.uFrac.value = frac;
      u.uLag.value = Math.max(frac, Math.min(1, v.lagHp / v.maxHp));
      u.uTicks.value = v.st.kind === 'hero' ? v.maxHp / 100 : 0;
      v.bar.quaternion.copy(camera.quaternion);
      // Hero sendiri: bar mana tipis tepat di bawah HP bar, supaya di layar sentuh panel status
      // di pojok tidak diperlukan lagi.
      if (v.st.id === this.selfId) {
        if (!v.manaBar) {
          const mat = BAR_MAT.clone();
          const w = v.bar.scale.x;
          const h = 0.17;
          mat.uniforms.uSize.value.set(w, h);
          mat.uniforms.uColor.value.set(0x4f9bff);
          v.manaBar = new THREE.Mesh(BAR_GEO, mat);
          v.manaBar.scale.set(w, h, 1);
          v.manaBar.position.y = v.bar.position.y - 0.245;
          v.manaBar.renderOrder = 10;
          v.manaBar.layers.set(OVERLAY_LAYER);
          v.root.add(v.manaBar);
        }
        const m = v.manaBar.material.uniforms;
        m.uFrac.value = this.selfMana;
        m.uLag.value = this.selfMana;
        v.manaBar.quaternion.copy(camera.quaternion);
        v.manaBar.visible = v.bar.visible;
      }
      const kind = this.barKindOf(v.st, (v.flags & F_INVULN) !== 0 && isBuilding(v.st));
      if (kind !== v.barKind) {
        v.barKind = kind;
        u.uColor.value.copy(BAR_COLORS[kind]);
      }

      // status: stun, shield, invisible (hanya terlihat oleh tim sendiri -> transparan)
      if (stunned && !v.stunFx) {
        v.stunFx = new THREE.Mesh(a.stunGeo, a.stunMat);
        v.stunFx.position.y = v.height + 0.15;
        v.root.add(v.stunFx);
      }
      if (v.stunFx) {
        v.stunFx.visible = stunned;
        v.stunFx.rotation.y += dt * 7;
      }
      const shielded = (v.flags & F_SHIELD) !== 0;
      if (shielded && !v.shieldFx) {
        v.shieldFx = new THREE.Mesh(a.shieldGeo, a.shieldMat);
        v.shieldFx.scale.setScalar(v.height * 0.62);
        v.shieldFx.position.y = v.height * 0.48;
        v.root.add(v.shieldFx);
      }
      if (v.shieldFx) v.shieldFx.visible = shielded;
      const buffed = (v.flags & F_BUFF) !== 0;
      if (buffed && !v.buffFx) {
        v.buffFx = new THREE.Mesh(FLAT, a.buffMat);
        v.buffFx.position.y = 0.07;
        v.buffFx.renderOrder = 3;
        v.root.add(v.buffFx);
      }
      if (v.buffFx) {
        v.buffFx.visible = buffed;
        v.buffFx.scale.setScalar(v.st.radius * (2.5 + Math.sin(time * 3) * 0.15));
        v.buffFx.rotation.y = -time * 1.2;
      }
      const recalling = (v.flags & F_RECALL) !== 0;
      if (recalling && !v.recallFx) {
        v.recallFx = new THREE.Mesh(a.recallGeo, a.recallMat);
        v.root.add(v.recallFx);
      }
      if (v.recallFx) {
        v.recallFx.visible = recalling;
        const pulse = 1 + Math.sin(time * 9) * 0.06;
        v.recallFx.scale.set(v.st.radius * 1.5 * pulse, v.height * 1.7, v.st.radius * 1.5 * pulse);
        v.recallFx.rotation.y = time * 2;
      }
      // Tembus pandang: 0.32 saat tak terlihat (skill), 0.6 saat hero tim sendiri berdiri di semak
      // (tanda bahwa lawan di luar semak tidak melihatnya). Musuh di semak yang terlihat tetap utuh.
      const hiding = (v.flags & F_BUSH) !== 0 && v.st.team === this.myTeam;
      const ghost = (v.flags & F_INVIS) !== 0 ? 0.32 : hiding ? 0.6 : 1;
      if (ghost !== v.ghostAlpha) {
        v.ghostAlpha = ghost;
        v.ghost = ghost < 1;
        for (const m of v.mats) {
          m.transparent = ghost < 1;
          m.opacity = ghost;
          m.needsUpdate = true;
        }
      }

      if (this.blobs && blobCount < 200) {
        // digeser searah jatuhnya bayangan (cahaya datang dari kiri-depan)
        const r = v.st.radius * (isBuilding(v.st) ? 2.1 : 1.9);
        this.tmp.position.set(p.x + r * 0.28, 0.035, p.z - r * 0.2);
        this.tmp.scale.setScalar(r);
        this.tmp.updateMatrix();
        this.blobs.setMatrixAt(blobCount++, this.tmp.matrix);
      }
    }
    this.updateTowerRing();
    if (this.blobs) {
      this.blobs.count = blobCount;
      this.blobs.instanceMatrix.needsUpdate = true;
    }
    this.updateCorpses(dt);
  }

  /**
   * Tunjukkan jangkauan tembak tower musuh terdekat begitu hero sendiri mendekat: kuning saat
   * masih di luar, merah saat sudah di dalam jangkauan.
   */
  private updateTowerRing(): void {
    const me = this.self;
    let near: View | null = null;
    let best = TOWER_RANGE + 7;
    if (me) {
      for (const v of this.views.values()) {
        if (v.st.kind !== 'tower' || v.st.team === this.myTeam) continue;
        const d = Math.hypot(v.x - me.x, v.z - me.z);
        if (d < best) {
          best = d;
          near = v;
        }
      }
    }
    if (!near) {
      if (this.towerRing) this.towerRing.visible = false;
      return;
    }
    if (!this.towerRing) {
      const geo = new THREE.RingGeometry(0.975, 1, 96).rotateX(-Math.PI / 2);
      this.towerRing = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      this.towerRing.renderOrder = 3;
      this.towerRing.scale.setScalar(TOWER_RANGE);
      this.scene.add(this.towerRing);
    }
    const ring = this.towerRing;
    const inside = best <= TOWER_RANGE + (me?.st.radius ?? 0);
    ring.visible = true;
    ring.position.set(near.x, 0.08, near.z);
    ring.material.color.setHex(inside ? 0xff4040 : 0xffc84a);
    // makin dekat makin jelas
    ring.material.opacity = inside ? 0.85 : 0.25 + 0.45 * (1 - (best - TOWER_RANGE) / 7);
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

  /**
   * Musuh terdekat dari hero sendiri dalam jarak tertentu (hero diutamakan); untuk auto-aim.
   * `buildings`: tower dan core ikut dipertimbangkan sebagai pilihan terakhir (tombol serang).
   */
  nearestEnemyTo(x: number, z: number, range: number, buildings = false): View | null {
    let best: View | null = null;
    let bestScore = Infinity;
    for (const v of this.views.values()) {
      const building = v.st.kind === 'tower' || v.st.kind === 'core';
      if (v.st.team === this.myTeam || (building && !buildings)) continue;
      if (building && v.flags & F_INVULN) continue; // masih dilindungi tower di depannya
      const d = Math.hypot(v.x - x, v.z - z) - v.st.radius;
      if (d > range) continue;
      const score = d + (v.st.kind === 'hero' ? 0 : 50) + (v.st.kind === 'monster' ? 50 : 0) + (building ? 150 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = v;
      }
    }
    return best;
  }
}
