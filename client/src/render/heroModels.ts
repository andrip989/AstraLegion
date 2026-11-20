// Model hero dari bentuk primitif, lengkap dengan sendi (rig) untuk animasi berjalan, menyerang,
// dan casting. Tiap sendi berisi satu mesh badan (warna & gradasi per-vertex) dan satu mesh bagian
// yang menyala, jadi hero yang rumit pun hanya butuh sedikit draw call. Semua model menghadap +Z.
// Tambah hero baru: daftarkan `look` + fungsi builder di HERO_MODELS dengan key = id hero.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { build, cached, orbit, union, type Part } from './geo';
import { joint, newRig, type Arm, type Leg, type Rig } from './rig';

type V3 = [number, number, number];

/** Sifat bahan hero; materialnya dibuat per hero supaya bisa dibuat transparan saat invisible. */
export interface HeroLook {
  metal: number;
  rough: number;
  /** Warna bagian yang menyala. */
  glow: number;
  /** Terang nyala (luminans; > 1 ikut ber-bloom). */
  glowLum: number;
}

export interface HeroMats {
  body: THREE.Material;
  glow: THREE.Material;
}

export interface HeroModel {
  group: THREE.Group;
  rig: Rig;
  height: number;
}

const rbox = (w: number, h: number, d: number, r = 0.07) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r: number, ws = 12, hs = 9) => new THREE.SphereGeometry(r, ws, hs);
const cone = (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, seg);
const torus = (r: number, t: number, seg = 20) => new THREE.TorusGeometry(r, t, 8, seg);
const HALF = Math.PI / 2;

const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
/** Geometri bagian menyala di posisi/rotasi/skala tertentu. */
function G(g: THREE.BufferGeometry, p: V3 = [0, 0, 0], r?: V3, s?: V3): THREE.BufferGeometry {
  if (s) g.scale(s[0], s[1], s[2]);
  if (r) g.applyMatrix4(_m.makeRotationFromEuler(_e.set(r[0], r[1], r[2])));
  return g.translate(p[0], p[1], p[2]);
}

/** Pembangun satu hero: mengisi sendi dengan mesh badan + mesh nyala (geometri di-cache per hero). */
class Kit {
  private n = 0;
  constructor(
    private id: string,
    private mats: HeroMats,
  ) {}

  fill(node: THREE.Object3D, parts: Part[], glow: THREE.BufferGeometry[] = []): void {
    const key = `${this.id}:${this.n++}`;
    if (parts.length) {
      const mesh = new THREE.Mesh(
        cached(key, () => build(parts)),
        this.mats.body,
      );
      mesh.castShadow = true;
      node.add(mesh);
    }
    if (glow.length) {
      node.add(
        new THREE.Mesh(
          cached(`${key}g`, () => union(glow)),
          this.mats.glow,
        ),
      );
    }
  }

  /** Kaki dua ruas: pinggul -> lutut. */
  leg(root: THREE.Object3D, x: number, hipY: number, kneeDrop: number, phase: number, thigh: Part[], shin: Part[], shinGlow: THREE.BufferGeometry[] = []): Leg {
    const hip = joint(root, x, hipY, 0);
    this.fill(hip, thigh);
    const knee = joint(hip, 0, -kneeDrop, 0);
    this.fill(knee, shin, shinGlow);
    return { hip, knee, phase };
  }

  /** Lengan dua ruas: bahu -> siku. */
  arm(
    body: THREE.Object3D,
    x: number,
    y: number,
    opts: { phase: number; rest: number; swing: number; elbowDrop: number; bend?: number },
    upper: Part[],
    lower: Part[],
    lowerGlow: THREE.BufferGeometry[] = [],
    upperGlow: THREE.BufferGeometry[] = [],
  ): Arm {
    const shoulder = joint(body, x, y, 0);
    this.fill(shoulder, upper, upperGlow);
    const elbow = joint(shoulder, 0, -opts.elbowDrop, 0);
    this.fill(elbow, lower, lowerGlow);
    shoulder.rotation.x = opts.rest;
    return { shoulder, elbow, bend: opts.bend ?? 0.25, phase: opts.phase, rest: opts.rest, swing: opts.swing };
  }
}

function bodyJoint(root: THREE.Object3D, y: number): THREE.Group {
  const b = joint(root, 0, y, 0);
  b.userData.baseY = y;
  return b;
}

// ------------------------------------------------------------------ Volt Titan

function voltTitan(mats: HeroMats): HeroModel {
  const g = new THREE.Group();
  const k = new Kit('volt', mats);
  const STEEL = 0x6f8ccf;
  const STEEL_LO = 0x3d5390;
  const DARK = 0x28324c;
  const DARK_LO = 0x1a2136;
  const GOLD = 0xe6b63e;
  const GOLD_LO = 0xa9801f;
  const HIP = 1.1;

  const legs = [-1, 1].map((s) =>
    k.leg(
      g,
      s * 0.4,
      HIP,
      0.55,
      s < 0 ? 0 : Math.PI,
      [
        { g: rbox(0.44, 0.62, 0.48), c: DARK_LO, c2: DARK, p: [0, -0.27, 0] },
        { g: rbox(0.2, 0.44, 0.54), c: STEEL_LO, c2: STEEL, p: [s * 0.2, -0.16, 0] },
      ],
      [
        { g: rbox(0.52, 0.54, 0.58, 0.1), c: STEEL_LO, c2: STEEL, p: [0, -0.2, 0.02] },
        { g: sph(0.2), c: GOLD, s: [1.05, 1.05, 0.8], p: [0, 0.03, 0.27] },
        { g: rbox(0.6, 0.26, 0.88, 0.09), c: DARK_LO, c2: DARK, p: [0, -0.45, 0.12] },
        { g: rbox(0.52, 0.16, 0.32), c: GOLD_LO, c2: GOLD, p: [0, -0.47, 0.47] },
        { g: box(0.3, 0.08, 0.2), c: STEEL, p: [0, -0.3, -0.34], r: [0.5, 0, 0] },
      ],
      [G(box(0.11, 0.34, 0.06), [0, -0.2, 0.32]), G(box(0.4, 0.05, 0.06), [0, -0.4, 0.32])],
    ),
  );

  const body = bodyJoint(g, HIP);
  const torso: Part[] = [
    { g: rbox(1.0, 0.34, 0.72), c: DARK_LO, c2: DARK, p: [0, 0.06, 0] },
    { g: rbox(1.12, 0.14, 0.82, 0.05), c: GOLD_LO, c2: GOLD, p: [0, 0.25, 0] },
    { g: rbox(0.9, 0.38, 0.66), c: DARK_LO, c2: DARK, p: [0, 0.46, 0] },
    { g: box(0.5, 0.09, 0.06), c: STEEL, p: [0, 0.4, 0.35] },
    { g: box(0.56, 0.09, 0.06), c: STEEL, p: [0, 0.54, 0.35] },
    // dada, pelat dada, dan rumah reaktor
    { g: rbox(1.52, 0.92, 1.0, 0.18), c: STEEL_LO, c2: STEEL, p: [0, 1.04, 0] },
    { g: rbox(0.64, 0.44, 0.18, 0.08), c: STEEL, p: [0.37, 1.18, 0.48], r: [-0.12, 0.12, 0] },
    { g: rbox(0.64, 0.44, 0.18, 0.08), c: STEEL, p: [-0.37, 1.18, 0.48], r: [-0.12, -0.12, 0] },
    { g: cyl(0.31, 0.31, 0.16, 16), c: DARK, r: [HALF, 0, 0], p: [0, 0.96, 0.5] },
    { g: torus(0.31, 0.045), c: GOLD, p: [0, 0.96, 0.585] },
    { g: torus(0.42, 0.1, 16), c: STEEL_LO, c2: STEEL, r: [HALF, 0, 0], p: [0, 1.52, 0] },
    // ransel generator + dua kumparan petir
    { g: rbox(0.94, 0.72, 0.32), c: DARK_LO, c2: DARK, p: [0, 1.0, -0.6] },
  ];
  const torsoGlow: THREE.BufferGeometry[] = [
    G(sph(0.21), [0, 0.96, 0.56], undefined, [1, 1, 0.5]),
    G(cyl(0.16, 0.16, 0.08, 8), [0, 0.25, 0.42], [HALF, 0, 0]),
    G(box(0.42, 0.07, 0.06), [0.44, 0.76, 0.5], [0, 0, -0.5]),
    G(box(0.42, 0.07, 0.06), [-0.44, 0.76, 0.5], [0, 0, 0.5]),
    G(box(0.5, 0.08, 0.05), [0, 1.22, -0.77]),
  ];
  for (const s of [-1, 1]) {
    torso.push({ g: cyl(0.14, 0.17, 0.9), c: DARK_LO, c2: DARK, p: [s * 0.36, 1.38, -0.64] });
    for (const y of [1.12, 1.38, 1.64]) torso.push({ g: torus(0.19, 0.035, 14), c: GOLD, r: [HALF, 0, 0], p: [s * 0.36, y, -0.64] });
    torsoGlow.push(G(sph(0.17), [s * 0.36, 1.94, -0.64]));
    // bahu raksasa bertepi emas, dengan tiga duri petir
    torso.push({ g: sph(0.56, 14, 10), c: STEEL_LO, c2: STEEL, s: [1.1, 0.86, 1.06], p: [s * 1.02, 1.38, 0] });
    torso.push({ g: torus(0.52, 0.06), c: GOLD, r: [HALF, 0, 0], s: [1.1, 1, 1.06], p: [s * 1.02, 1.2, 0] });
    torsoGlow.push(G(cone(0.1, 0.46, 6), [s * 1.3, 1.82, 0], [0, 0, -s * 0.6]));
    torsoGlow.push(G(cone(0.085, 0.36, 6), [s * 1.06, 1.88, 0.3], [0.5, 0, -s * 0.25]));
    torsoGlow.push(G(cone(0.085, 0.36, 6), [s * 1.06, 1.88, -0.3], [-0.5, 0, -s * 0.25]));
  }
  k.fill(body, torso, torsoGlow);

  const head = joint(body, 0, 1.76, 0);
  k.fill(
    head,
    [
      { g: rbox(0.6, 0.56, 0.62, 0.13), c: STEEL_LO, c2: STEEL, p: [0, 0, 0] },
      { g: rbox(0.46, 0.32, 0.14), c: DARK, p: [0, -0.08, 0.28] },
      { g: rbox(0.12, 0.42, 0.58, 0.05), c: GOLD_LO, c2: GOLD, p: [0, 0.3, -0.02] },
      { g: cyl(0.12, 0.12, 0.1, 10), c: GOLD, r: [0, 0, HALF], p: [0.33, -0.02, 0] },
      { g: cyl(0.12, 0.12, 0.1, 10), c: GOLD, r: [0, 0, HALF], p: [-0.33, -0.02, 0] },
    ],
    [
      G(box(0.44, 0.1, 0.08), [0, 0.04, 0.34]),
      G(box(0.09, 0.2, 0.08), [0, -0.1, 0.345]),
      G(cone(0.08, 0.5, 6), [0.36, 0.38, 0], [0, 0, -0.5]),
      G(cone(0.08, 0.5, 6), [-0.36, 0.38, 0], [0, 0, 0.5]),
    ],
  );

  const arms = [-1, 1].map((s) =>
    k.arm(
      body,
      s * 1.08,
      1.26,
      { phase: s < 0 ? Math.PI : 0, rest: 0.1, swing: 0.6, elbowDrop: 0.72, bend: 0.3 },
      [
        { g: rbox(0.4, 0.6, 0.42), c: DARK_LO, c2: DARK, p: [0, -0.36, 0] },
        { g: rbox(0.47, 0.11, 0.49, 0.04), c: GOLD_LO, c2: GOLD, p: [0, -0.62, 0] },
      ],
      [
        { g: sph(0.21), c: STEEL, p: [0, 0, -0.06] },
        { g: rbox(0.62, 0.64, 0.64, 0.12), c: STEEL_LO, c2: STEEL, p: [0, -0.36, 0.04] },
        { g: rbox(0.56, 0.36, 0.58, 0.1), c: DARK_LO, c2: DARK, p: [0, -0.82, 0.06] },
        ...[-0.17, 0, 0.17].map((x): Part => ({ g: cone(0.06, 0.18, 5), c: GOLD, r: [HALF, 0, 0], p: [x, -0.9, 0.4] })),
      ],
      [G(box(0.08, 0.42, 0.06), [0.17, -0.36, 0.37]), G(box(0.08, 0.42, 0.06), [-0.17, -0.36, 0.37]), G(box(0.5, 0.06, 0.06), [0, -0.66, 0.36])],
    ),
  );

  return {
    group: g,
    height: 3.5,
    rig: newRig({ body, head, legs, arms, strikeArm: arms[1], stride: 1.5, legSwing: 0.6, kneeBend: 0.9, lean: 0.08 }),
  };
}

// ---------------------------------------------------------------- Nova Striker

function novaStriker(mats: HeroMats): HeroModel {
  const g = new THREE.Group();
  const k = new Kit('nova', mats);
  const WHITE = 0xf2f4fa;
  const WHITE_LO = 0xb9c0d2;
  const GREY = 0x4b5670;
  const GREY_LO = 0x2f3850;
  const ORANGE = 0xff8a3d;
  const ORANGE_LO = 0xc85c1e;
  const HIP = 0.95;

  const legs = [-1, 1].map((s) =>
    k.leg(
      g,
      s * 0.2,
      HIP,
      0.48,
      s < 0 ? 0 : Math.PI,
      [
        { g: new THREE.CapsuleGeometry(0.15, 0.26, 3, 10), c: WHITE_LO, c2: WHITE, p: [0, -0.24, 0] },
        { g: cyl(0.12, 0.12, 0.1), c: ORANGE, r: [0, 0, HALF], p: [s * 0.13, -0.05, 0] },
      ],
      [
        { g: sph(0.13), c: GREY, p: [0, 0, 0.03] },
        { g: cyl(0.14, 0.1, 0.44), c: WHITE_LO, c2: WHITE, p: [0, -0.24, 0] },
        { g: box(0.07, 0.3, 0.05), c: ORANGE, p: [0, -0.22, 0.115] },
        { g: rbox(0.25, 0.17, 0.46, 0.05), c: GREY_LO, c2: GREY, p: [0, -0.42, 0.07] },
        { g: rbox(0.22, 0.11, 0.18, 0.04), c: ORANGE, p: [0, -0.44, 0.26] },
        { g: cyl(0.07, 0.09, 0.12), c: GREY, p: [0, -0.38, -0.2] },
      ],
      [G(sph(0.06, 8, 6), [0, -0.45, -0.2])],
    ),
  );

  const body = bodyJoint(g, HIP);
  const torso: Part[] = [
    { g: rbox(0.6, 0.2, 0.4), c: GREY_LO, c2: GREY, p: [0, 0.04, 0] },
    { g: box(0.64, 0.07, 0.44), c: ORANGE, p: [0, 0.16, 0] },
    { g: new THREE.CapsuleGeometry(0.36, 0.46, 4, 14), c: WHITE_LO, c2: WHITE, p: [0, 0.58, 0] },
    { g: rbox(0.62, 0.34, 0.26, 0.1), c: WHITE, p: [0, 0.76, 0.2] },
    { g: torus(0.13, 0.028, 14), c: GREY, p: [0, 0.76, 0.34] },
    { g: box(0.22, 0.05, 0.05), c: ORANGE, p: [0.2, 0.62, 0.33], r: [0, 0, 0.45] },
    { g: box(0.22, 0.05, 0.05), c: ORANGE, p: [-0.2, 0.62, 0.33], r: [0, 0, -0.45] },
    { g: rbox(0.34, 0.22, 0.1, 0.04), c: GREY, p: [0, 0.4, 0.3] },
    // jetpack bersirip
    { g: rbox(0.56, 0.66, 0.28, 0.08), c: GREY_LO, c2: GREY, p: [0, 0.62, -0.42] },
  ];
  const torsoGlow: THREE.BufferGeometry[] = [G(cyl(0.105, 0.105, 0.08, 12), [0, 0.76, 0.345], [HALF, 0, 0]), G(box(0.34, 0.1, 0.06), [0, 0.86, -0.57])];
  for (const s of [-1, 1]) {
    torso.push({ g: sph(0.22), c: ORANGE_LO, c2: ORANGE, p: [s * 0.5, 0.9, 0] });
    torso.push({ g: rbox(0.26, 0.12, 0.34, 0.05), c: WHITE, p: [s * 0.53, 1.02, 0] });
    torso.push({ g: rbox(0.1, 0.95, 0.46, 0.04), c: WHITE_LO, c2: WHITE, p: [s * 0.52, 0.98, -0.62], r: [-0.25, 0, -s * 0.5] });
    torso.push({ g: box(0.11, 0.2, 0.47), c: ORANGE, p: [s * 0.72, 1.32, -0.7], r: [-0.25, 0, -s * 0.5] });
    torso.push({ g: cyl(0.1, 0.14, 0.26), c: GREY, p: [s * 0.16, 0.24, -0.44] });
    torsoGlow.push(G(sph(0.09, 8, 6), [s * 0.16, 0.1, -0.44]));
  }
  k.fill(body, torso, torsoGlow);

  // cincin energi berputar di punggung
  const halo = joint(body, 0, 0.82, -0.68);
  k.fill(halo, [], [G(torus(0.52, 0.04, 28)), G(torus(0.34, 0.03, 22), [0, 0, 0], [0, HALF, 0])]);

  const head = joint(body, 0, 1.24, 0);
  k.fill(
    head,
    [
      { g: sph(0.31, 14, 10), c: WHITE_LO, c2: WHITE },
      { g: rbox(0.14, 0.1, 0.52, 0.04), c: ORANGE, p: [0, 0.27, -0.02] },
      { g: cyl(0.09, 0.09, 0.1), c: GREY, r: [0, 0, HALF], p: [0.3, 0, 0] },
      { g: cyl(0.09, 0.09, 0.1), c: GREY, r: [0, 0, HALF], p: [-0.3, 0, 0] },
      { g: rbox(0.28, 0.12, 0.2, 0.04), c: GREY, p: [0, -0.2, 0.14] },
      { g: cyl(0.016, 0.016, 0.34, 6), c: GREY, p: [0.24, 0.36, -0.05] },
    ],
    [G(rbox(0.47, 0.17, 0.3, 0.07), [0, 0.03, 0.17]), G(sph(0.045, 8, 6), [0.24, 0.54, -0.05])],
  );

  // lengan kanan = meriam plasma, selalu terangkat membidik
  const cannon = joint(body, 0.5, 0.86, 0);
  k.fill(
    cannon,
    [
      { g: cyl(0.11, 0.1, 0.36), c: WHITE_LO, c2: WHITE, p: [0, -0.2, 0] },
      { g: cyl(0.19, 0.22, 0.74, 12), c: GREY, c2: GREY_LO, p: [0, -0.68, 0] },
      { g: rbox(0.36, 0.42, 0.36, 0.08), c: WHITE_LO, c2: WHITE, p: [0, -0.5, 0] },
      { g: box(0.06, 0.42, 0.2), c: ORANGE, p: [0.21, -0.68, 0] },
      { g: box(0.06, 0.42, 0.2), c: ORANGE, p: [-0.21, -0.68, 0] },
      { g: cyl(0.16, 0.2, 0.14, 12), c: GREY_LO, p: [0, -1.08, 0] },
    ],
    [G(torus(0.215, 0.03), [0, -0.78, 0], [HALF, 0, 0]), G(torus(0.225, 0.03), [0, -0.94, 0], [HALF, 0, 0]), G(sph(0.14), [0, -1.13, 0]), G(cyl(0.05, 0.05, 0.3, 8), [0, -0.5, -0.2])],
  );
  cannon.rotation.x = -1.35;
  const cannonArm: Arm = { shoulder: cannon, phase: 0, rest: -1.35, swing: 0.12 };

  const armL = k.arm(
    body,
    -0.5,
    0.86,
    { phase: Math.PI, rest: 0.1, swing: 1, elbowDrop: 0.42 },
    [{ g: cyl(0.1, 0.09, 0.4), c: WHITE_LO, c2: WHITE, p: [0, -0.2, 0] }],
    [
      { g: sph(0.1), c: GREY },
      { g: cyl(0.09, 0.08, 0.34), c: GREY_LO, c2: GREY, p: [0, -0.18, 0] },
      { g: cyl(0.1, 0.1, 0.07), c: ORANGE, p: [0, -0.3, 0] },
      { g: sph(0.1), c: ORANGE_LO, c2: ORANGE, p: [0, -0.4, 0] },
    ],
    [G(box(0.05, 0.14, 0.05), [-0.09, -0.18, 0])],
  );

  return {
    group: g,
    height: 2.85,
    rig: newRig({ body, head, legs, arms: [armL, cannonArm], aimArm: cannonArm, spin: [halo], stride: 1.7, lean: 0.12 }),
  };
}

// ----------------------------------------------------------------- Shadow Fang

function shadowFang(mats: HeroMats): HeroModel {
  const g = new THREE.Group();
  const k = new Kit('fang', mats);
  const CLOTH = 0x7a58cc;
  const CLOTH_LO = 0x45308a;
  const BLACK = 0x2a2140;
  const BLACK_LO = 0x15101f;
  const STEEL = 0xb9bfd6;
  const HIP = 0.95;

  const legs = [-1, 1].map((s) =>
    k.leg(
      g,
      s * 0.18,
      HIP,
      0.48,
      s < 0 ? 0 : Math.PI,
      [
        { g: cyl(0.14, 0.11, 0.5), c: BLACK_LO, c2: BLACK, p: [0, -0.25, 0] },
        { g: cyl(0.15, 0.145, 0.1), c: CLOTH, p: [0, -0.14, 0] },
        { g: box(0.05, 0.22, 0.09), c: STEEL, p: [s * 0.14, -0.22, 0.02] },
      ],
      [
        { g: rbox(0.18, 0.14, 0.12, 0.04), c: CLOTH, p: [0, 0, 0.08] },
        { g: cyl(0.11, 0.08, 0.45), c: CLOTH_LO, c2: CLOTH, p: [0, -0.22, 0] },
        { g: cyl(0.1, 0.1, 0.05), c: BLACK, p: [0, -0.14, 0] },
        { g: cyl(0.09, 0.09, 0.05), c: BLACK, p: [0, -0.28, 0] },
        { g: rbox(0.18, 0.1, 0.4, 0.04), c: BLACK_LO, c2: BLACK, p: [0, -0.43, 0.07] },
      ],
      [G(box(0.2, 0.05, 0.2), [0, -0.37, 0])],
    ),
  );

  const body = bodyJoint(g, HIP);
  const torso: Part[] = [
    { g: cyl(0.26, 0.24, 0.26), c: BLACK_LO, c2: BLACK, p: [0, 0.1, 0] },
    { g: cyl(0.38, 0.26, 0.76), c: CLOTH_LO, c2: CLOTH, p: [0, 0.64, 0] },
    { g: rbox(0.62, 0.3, 0.42, 0.1), c: BLACK, p: [0, 0.84, 0.02] },
    { g: box(0.07, 0.86, 0.06), c: BLACK_LO, p: [0, 0.62, 0.33], r: [0, 0, 0.55] },
    { g: box(0.07, 0.86, 0.06), c: BLACK_LO, p: [0, 0.62, 0.33], r: [0, 0, -0.55] },
    { g: torus(0.24, 0.07, 14), c: CLOTH_LO, c2: CLOTH, r: [HALF, 0, 0], p: [0, 1.04, 0] },
    // dua belati bersilang di punggung
    { g: box(0.05, 0.8, 0.08), c: STEEL, p: [0.1, 0.72, -0.36], r: [0, 0, 0.5] },
    { g: box(0.05, 0.8, 0.08), c: STEEL, p: [-0.1, 0.72, -0.36], r: [0, 0, -0.5] },
  ];
  const torsoGlow: THREE.BufferGeometry[] = [
    G(rbox(0.54, 0.11, 0.46, 0.04), [0, 0.23, 0]),
    G(new THREE.OctahedronGeometry(0.09), [0, 0.64, 0.37]),
    G(box(0.06, 0.16, 0.06), [0.34, 1.08, -0.36], [0, 0, 0.5]),
    G(box(0.06, 0.16, 0.06), [-0.34, 1.08, -0.36], [0, 0, -0.5]),
  ];
  for (const s of [-1, 1]) {
    torso.push({ g: rbox(0.3, 0.16, 0.34, 0.06), c: BLACK, p: [s * 0.42, 0.98, 0] });
    torso.push({ g: cone(0.11, 0.46, 5), c: CLOTH_LO, c2: CLOTH, p: [s * 0.6, 1.08, 0], r: [0, 0, -s * 1.2] });
    torso.push({ g: cone(0.08, 0.3, 5), c: CLOTH, p: [s * 0.52, 1.12, -0.16], r: [-0.5, 0, -s * 0.9] });
  }
  k.fill(body, torso, torsoGlow);

  const head = joint(body, 0, 1.22, 0);
  k.fill(
    head,
    [
      { g: sph(0.26), c: BLACK_LO, c2: BLACK },
      { g: rbox(0.36, 0.18, 0.2, 0.06), c: CLOTH_LO, c2: CLOTH, p: [0, -0.08, 0.17] },
      // tudung runcing yang condong ke belakang; wajah & mata tetap terlihat di bawah tepinya
      { g: cone(0.4, 0.7, 10), c: CLOTH_LO, c2: CLOTH, p: [0, 0.44, -0.12], r: [-0.42, 0, 0] },
      { g: torus(0.28, 0.055, 14), c: CLOTH, r: [HALF - 0.42, 0, 0], p: [0, 0.14, -0.02] },
      { g: cone(0.08, 0.36, 5), c: CLOTH, p: [0.27, 0.4, -0.06], r: [0, 0, -0.5] },
      { g: cone(0.08, 0.36, 5), c: CLOTH, p: [-0.27, 0.4, -0.06], r: [0, 0, 0.5] },
    ],
    [G(box(0.15, 0.05, 0.05), [0.1, 0.04, 0.235], [0, 0, 0.3]), G(box(0.15, 0.05, 0.05), [-0.1, 0.04, 0.235], [0, 0, -0.3])],
  );

  // syal dua ruas yang melambai di belakang, dan ujung selempang di pinggang
  const sway: THREE.Object3D[] = [];
  const strip = (parent: THREE.Object3D, x: number, y: number, z: number, base: number, w: number, len: number, lift: number, glow: boolean) => {
    const j = joint(parent, x, y, z);
    j.userData.baseX = base;
    j.userData.lift = lift;
    j.rotation.x = base;
    const geo = box(w, 0.045, len).translate(0, 0, -len / 2);
    if (glow) k.fill(j, [], [geo]);
    else k.fill(j, [{ g: geo, c: CLOTH_LO, c2: CLOTH }]);
    sway.push(j);
    return j;
  };
  for (const sc of [
    { x: -0.07, len: 0.56, w: 0.19, base: -0.7 },
    { x: 0.11, len: 0.42, w: 0.14, base: -0.95 },
  ]) {
    const first = strip(body, sc.x, 1.02, -0.28, sc.base, sc.w, sc.len, 0.5, true);
    strip(first, 0, 0, -sc.len, 0.25, sc.w * 0.8, sc.len * 0.9, 0.1, true);
  }
  strip(body, -0.2, 0.2, -0.22, -1.1, 0.13, 0.55, 0.35, false);

  const arms = [-1, 1].map((s) =>
    k.arm(
      body,
      s * 0.44,
      0.92,
      { phase: s < 0 ? Math.PI : 0, rest: 0.45, swing: 0.4, elbowDrop: 0.42, bend: 0.35 },
      [{ g: cyl(0.09, 0.08, 0.4), c: CLOTH_LO, c2: CLOTH, p: [0, -0.2, 0] }],
      [
        { g: cyl(0.08, 0.07, 0.36), c: BLACK_LO, c2: BLACK, p: [0, -0.16, 0] },
        { g: rbox(0.17, 0.22, 0.17, 0.04), c: CLOTH, p: [0, -0.16, 0] },
        { g: sph(0.08), c: BLACK, p: [0, -0.38, 0] },
        { g: box(0.2, 0.06, 0.1), c: BLACK_LO, p: [0, -0.34, 0.08] },
        { g: box(0.02, 0.05, 0.9), c: STEEL, p: [0, -0.28, 0.56] },
      ],
      [
        G(box(0.045, 0.14, 0.92), [0, -0.36, 0.56]),
        G(cone(0.07, 0.2, 4), [0, -0.36, 1.12], [HALF, Math.PI / 4, 0], [0.33, 1, 1]),
      ],
      [G(box(0.19, 0.05, 0.19), [0, -0.3, 0])],
    ),
  );

  return {
    group: g,
    height: 2.85,
    rig: newRig({ body, head, legs, arms, strikeArm: arms[1], sway, stride: 1.9, legSwing: 0.95, kneeBend: 1.2, lean: 0.28 }),
  };
}

// ------------------------------------------------------------------ Lumen Sage

function lumenSage(mats: HeroMats): HeroModel {
  const g = new THREE.Group();
  const k = new Kit('lumen', mats);
  const ROBE = 0xf4f0e2;
  const ROBE_LO = 0xb4ad98;
  const TEAL = 0x2f8a76;
  const TEAL_LO = 0x1b5347;
  const GOLD = 0xe6bc4c;
  const GOLD_LO = 0xa07c22;
  const WOOD = 0x7a5634;
  const SHADE = 0x161c2a;
  const HIP = 0.95;

  // kaki kecil di balik jubah (hanya ujung sepatunya yang terlihat saat melangkah)
  const legs = [-1, 1].map((s) =>
    k.leg(
      g,
      s * 0.16,
      HIP,
      0.45,
      s < 0 ? 0 : Math.PI,
      [{ g: cyl(0.11, 0.1, 0.45), c: TEAL_LO, c2: TEAL, p: [0, -0.22, 0] }],
      [
        { g: cyl(0.1, 0.08, 0.42), c: TEAL_LO, c2: TEAL, p: [0, -0.2, 0] },
        { g: rbox(0.18, 0.11, 0.38, 0.04), c: GOLD_LO, c2: GOLD, p: [0, -0.44, 0.07] },
      ],
    ),
  );

  const body = bodyJoint(g, HIP);
  const torso: Part[] = [
    // jubah panjang melebar ke bawah, dengan pinggiran emas
    { g: cyl(0.3, 0.62, 0.98, 14), c: ROBE_LO, c2: ROBE, p: [0, -0.35, 0] },
    { g: torus(0.61, 0.045, 24), c: GOLD, r: [HALF, 0, 0], p: [0, -0.82, 0] },
    { g: cyl(0.31, 0.27, 0.72, 12), c: ROBE_LO, c2: ROBE, p: [0, 0.5, 0] },
    { g: cyl(0.315, 0.315, 0.1, 12), c: GOLD_LO, c2: GOLD, p: [0, 0.17, 0] },
    // kain depan berwarna hijau toska dengan garis emas
    { g: box(0.3, 1.12, 0.05), c: TEAL_LO, c2: TEAL, p: [0, -0.12, 0.33], r: [-0.3, 0, 0] },
    { g: box(0.05, 1.1, 0.06), c: GOLD, p: [0, -0.12, 0.35], r: [-0.3, 0, 0] },
    // mantel bahu, kerah, dan bantalan bahu
    { g: cone(0.58, 0.4, 14), c: ROBE_LO, c2: ROBE, p: [0, 0.94, 0] },
    { g: torus(0.23, 0.06, 16), c: GOLD_LO, c2: GOLD, r: [HALF, 0, 0], p: [0, 1.06, 0] },
    { g: box(0.34, 0.5, 0.06), c: TEAL_LO, c2: TEAL, p: [0, 0.5, -0.3] },
  ];
  for (const s of [-1, 1]) {
    torso.push({ g: sph(0.2), c: GOLD_LO, c2: GOLD, s: [1.1, 0.7, 1.1], p: [s * 0.46, 0.92, 0] });
    torso.push({ g: cone(0.07, 0.24, 5), c: GOLD, p: [s * 0.56, 1.02, 0], r: [0, 0, -s * 0.9] });
  }
  k.fill(body, torso, [G(new THREE.OctahedronGeometry(0.11), [0, 0.64, 0.31]), G(box(0.36, 0.05, 0.05), [0, 0.17, 0.3])]);

  // lingkaran cahaya yang berputar di atas kepala, dengan empat permata kecil
  const halo = joint(body, 0, 1.82, -0.02);
  k.fill(
    halo,
    [],
    [
      G(torus(0.4, 0.03, 28), [0, 0, 0], [HALF, 0, 0]),
      ...[0, 1, 2, 3].map((i) => G(new THREE.OctahedronGeometry(0.07), [Math.cos((i * Math.PI) / 2) * 0.4, 0, Math.sin((i * Math.PI) / 2) * 0.4], undefined, [1, 1.6, 1])),
    ],
  );

  const head = joint(body, 0, 1.24, 0);
  k.fill(
    head,
    [
      { g: sph(0.3, 14, 10), c: ROBE_LO, c2: ROBE, s: [1, 1.05, 1.06] },
      { g: sph(0.21), c: SHADE, p: [0, -0.02, 0.13] },
      { g: cone(0.17, 0.42, 8), c: ROBE_LO, c2: ROBE, p: [0, 0.16, -0.3], r: [-1.15, 0, 0] },
      { g: torus(0.275, 0.03, 20), c: GOLD, r: [HALF + 0.25, 0, 0], p: [0, 0.1, 0.02] },
    ],
    [G(sph(0.045, 8, 6), [0.08, 0, 0.31]), G(sph(0.045, 8, 6), [-0.08, 0, 0.31]), G(new THREE.OctahedronGeometry(0.07), [0, 0.19, 0.28], undefined, [1, 1.5, 0.7])],
  );

  // lengan kanan memegang tongkat cahaya, selalu terarah ke depan
  const staff = joint(body, 0.46, 0.86, 0);
  k.fill(
    staff,
    [
      { g: cyl(0.1, 0.17, 0.52), c: ROBE_LO, c2: ROBE, p: [0, -0.26, 0] },
      { g: sph(0.085), c: 0xe9c9a4, p: [0, -0.56, 0] },
      { g: cyl(0.03, 0.036, 1.9, 6), c: WOOD, p: [0, -0.86, 0.06] },
      { g: torus(0.17, 0.03, 16), c: GOLD, p: [0, -1.86, 0.06], r: [HALF, 0, 0] },
      { g: cone(0.05, 0.22, 5), c: GOLD, p: [0.17, -1.78, 0.06], r: [Math.PI, 0, 0] },
      { g: cone(0.05, 0.22, 5), c: GOLD, p: [-0.17, -1.78, 0.06], r: [Math.PI, 0, 0] },
      { g: cyl(0.05, 0.05, 0.1, 6), c: GOLD_LO, p: [0, 0.08, 0.06] },
    ],
    [G(new THREE.OctahedronGeometry(0.13), [0, -1.9, 0.06], undefined, [1, 1.8, 1]), G(torus(0.24, 0.02, 20), [0, -1.9, 0.06], [HALF, 0, 0])],
  );
  staff.rotation.x = -1.15;
  const staffArm: Arm = { shoulder: staff, phase: 0, rest: -1.15, swing: 0.12 };

  // lengan kiri: telapak terbuka dengan bola cahaya melayang
  const armL = k.arm(
    body,
    -0.46,
    0.86,
    { phase: Math.PI, rest: -0.35, swing: 0.5, elbowDrop: 0.4, bend: 0.7 },
    [{ g: cyl(0.1, 0.15, 0.44), c: ROBE_LO, c2: ROBE, p: [0, -0.22, 0] }],
    [
      { g: cyl(0.13, 0.19, 0.4), c: ROBE_LO, c2: ROBE, p: [0, -0.18, 0] },
      { g: torus(0.19, 0.025, 14), c: GOLD, r: [HALF, 0, 0], p: [0, -0.37, 0] },
      { g: sph(0.085), c: 0xe9c9a4, p: [0, -0.44, 0] },
    ],
    [G(sph(0.11), [0, -0.66, 0.02])],
  );

  return {
    group: g,
    height: 3.0,
    rig: newRig({ body, head, legs, arms: [armL, staffArm], aimArm: staffArm, spin: [halo], stride: 1.7, legSwing: 0.5, kneeBend: 0.7, lean: 0.07 }),
  };
}

// ---------------------------------------------------------------- Ember Lancer

function emberLancer(mats: HeroMats): HeroModel {
  const g = new THREE.Group();
  const k = new Kit('ember', mats);
  const RED = 0xc8432c;
  const RED_LO = 0x6e1c16;
  const IRON = 0x3f3844;
  const IRON_LO = 0x1e1a22;
  const BRASS = 0xe2ac4a;
  const BRASS_LO = 0x8c6020;
  const FLAME = 0xff8f3c;
  const FLAME_LO = 0xb02c18;
  const FLAME_HI = 0xffc45a;
  const CAPE = 0xa82c1a;
  const CAPE_LO = 0x5e1812;
  const CAPE_HI = 0xe25a1a;
  const STEEL = 0xd6d9e4;
  const WOOD = 0x6b3f2a;
  const HIP = 1.02;

  const legs = [-1, 1].map((s) =>
    k.leg(
      g,
      s * 0.24,
      HIP,
      0.5,
      s < 0 ? 0 : Math.PI,
      [
        { g: cyl(0.17, 0.13, 0.5), c: IRON_LO, c2: IRON, p: [0, -0.25, 0] },
        // pelat paha di sisi luar
        { g: rbox(0.12, 0.38, 0.32, 0.04), c: RED_LO, c2: RED, p: [s * 0.15, -0.17, 0.01] },
      ],
      [
        { g: sph(0.13), c: BRASS_LO, c2: BRASS, s: [1, 1, 0.9], p: [0, 0, 0.07] },
        { g: cyl(0.15, 0.11, 0.42), c: RED_LO, c2: RED, p: [0, -0.22, 0] },
        { g: rbox(0.25, 0.14, 0.46, 0.05), c: IRON_LO, c2: IRON, p: [0, -0.44, 0.08] },
        { g: rbox(0.21, 0.1, 0.16, 0.04), c: BRASS_LO, c2: BRASS, p: [0, -0.45, 0.27] },
      ],
      [G(box(0.05, 0.2, 0.04), [0, -0.2, 0.135])],
    ),
  );

  const body = bodyJoint(g, HIP);
  const torso: Part[] = [
    { g: rbox(0.66, 0.24, 0.44, 0.08), c: IRON_LO, c2: IRON, p: [0, 0.04, 0] },
    { g: rbox(0.7, 0.1, 0.48, 0.04), c: BRASS_LO, c2: BRASS, p: [0, 0.18, 0] },
    { g: cyl(0.34, 0.3, 0.34, 12), c: IRON_LO, c2: IRON, p: [0, 0.39, 0] },
    { g: rbox(0.4, 0.3, 0.14, 0.05), c: RED_LO, c2: RED, p: [0, 0.4, 0.27] },
    // pelat dada berlapis, dengan rusuk tengah
    { g: rbox(0.92, 0.58, 0.58, 0.17), c: RED_LO, c2: RED, p: [0, 0.82, 0.01] },
    { g: rbox(0.42, 0.42, 0.14, 0.06), c: RED, p: [0, 0.86, 0.27], r: [-0.1, 0, 0] },
    { g: torus(0.25, 0.07, 14), c: BRASS_LO, c2: BRASS, r: [HALF, 0, 0], p: [0, 1.13, 0] },
    // pengait jubah di punggung
    { g: rbox(0.68, 0.09, 0.1, 0.03), c: BRASS_LO, c2: BRASS, p: [0, 1.05, -0.29] },
    // kain depan warna api yang menggantung dari sabuk
    { g: box(0.22, 0.56, 0.04), c: FLAME_LO, c2: FLAME, p: [0, -0.2, 0.25], r: [-0.14, 0, 0] },
    { g: box(0.26, 0.05, 0.05), c: BRASS, p: [0, -0.47, 0.29], r: [-0.14, 0, 0] },
  ];
  const torsoGlow: THREE.BufferGeometry[] = [
    G(new THREE.OctahedronGeometry(0.11), [0, 0.88, 0.35], undefined, [1, 1.35, 0.6]),
    G(box(0.16, 0.07, 0.05), [0, 0.18, 0.24]),
  ];
  for (const s of [-1, 1]) {
    // bantalan bahu bertepi kuningan dengan satu duri
    torso.push({ g: sph(0.3, 12, 9), c: RED_LO, c2: RED, s: [1.05, 0.8, 1.05], p: [s * 0.62, 1.02, 0] });
    torso.push({ g: torus(0.29, 0.04, 16), c: BRASS, r: [HALF, 0, 0], s: [1.05, 1, 1.05], p: [s * 0.62, 0.92, 0] });
    torso.push({ g: cone(0.08, 0.3, 6), c: BRASS_LO, c2: BRASS, p: [s * 0.8, 1.24, 0], r: [0, 0, -s * 0.7] });
    torsoGlow.push(G(sph(0.06, 8, 6), [s * 0.93, 1.02, 0]));
  }
  k.fill(body, torso, torsoGlow);

  const head = joint(body, 0, 1.33, 0);
  k.fill(
    head,
    [
      { g: sph(0.29, 14, 10), c: RED_LO, c2: RED, s: [1, 1.08, 1.05] },
      { g: rbox(0.36, 0.3, 0.16, 0.06), c: IRON_LO, c2: IRON, p: [0, -0.06, 0.24] },
      { g: rbox(0.46, 0.07, 0.22, 0.03), c: BRASS_LO, c2: BRASS, p: [0, 0.1, 0.23] },
      { g: rbox(0.08, 0.28, 0.24, 0.03), c: RED, p: [0.25, -0.12, 0.08] },
      { g: rbox(0.08, 0.28, 0.24, 0.03), c: RED, p: [-0.25, -0.12, 0.08] },
      // sirip jambul dari dahi ke tengkuk
      { g: rbox(0.08, 0.26, 0.52, 0.03), c: BRASS_LO, c2: BRASS, p: [0, 0.25, -0.03] },
      { g: rbox(0.42, 0.14, 0.14, 0.04), c: RED_LO, c2: RED, p: [0, -0.22, -0.2], r: [0.4, 0, 0] },
    ],
    // celah mata berbentuk T
    [G(box(0.3, 0.05, 0.05), [0, 0, 0.325]), G(box(0.05, 0.17, 0.05), [0, -0.1, 0.325])],
  );

  // bagian yang melambai: jambul api di helm dan jubah pendek di punggung
  const sway: THREE.Object3D[] = [];
  // tiap ruas memanjang ke -Z dari sendinya; `base` positif = terangkat, `lift` = perubahan saat berlari
  const flap = (parent: THREE.Object3D, x: number, y: number, z: number, base: number, lift: number, parts: Part[], glow: THREE.BufferGeometry[] = []) => {
    const j = joint(parent, x, y, z);
    j.userData.baseX = base;
    j.userData.lift = lift;
    j.rotation.x = base;
    k.fill(j, parts, glow);
    sway.push(j);
    return j;
  };
  // jambul api tiga ruas: naik dari puncak helm lalu melengkung ke belakang, ujungnya menyala
  const PLUME: V3 = [0.75, 1, 1];
  const plume1 = flap(head, 0, 0.3, -0.12, 1.05, -0.4, [
    { g: cyl(0.17, 0.09, 0.4, 8), c: FLAME_LO, c2: FLAME, s: PLUME, r: [-HALF, 0, 0], p: [0, 0, -0.17] },
    // lidah api kecil di punggung jambul, supaya tepinya tidak mulus seperti tanduk
    { g: cone(0.08, 0.36, 6), c: FLAME, c2: FLAME_HI, s: PLUME, r: [-0.6, 0, 0], p: [0, 0.24, -0.2] },
  ]);
  const plume2 = flap(plume1, 0, 0, -0.36, -0.55, -0.05, [
    { g: sph(0.17, 10, 8), c: FLAME_LO, c2: FLAME, s: PLUME },
    { g: cyl(0.1, 0.17, 0.36, 8), c: FLAME_LO, c2: FLAME_HI, s: PLUME, r: [-HALF, 0, 0], p: [0, 0, -0.18] },
    { g: cone(0.07, 0.32, 6), c: FLAME, c2: FLAME_HI, s: PLUME, r: [-0.6, 0, 0], p: [0, 0.22, -0.12] },
  ]);
  flap(plume2, 0, 0, -0.34, -0.5, -0.05, [], [G(sph(0.1, 8, 6), [0, 0, 0], undefined, PLUME), G(cone(0.1, 0.44, 8), [0, 0, -0.22], [-HALF, 0, 0], PLUME)]);
  // jubah pendek belah dua: tiap ekor dua ruas, makin terang ke bawah, tepinya menyala
  for (const s of [-1, 1]) {
    const tail = flap(body, s * 0.17, 1.04, -0.3, -1.25, 0.45, [{ g: box(0.3, 0.05, 0.56).translate(0, 0, -0.28), c: CAPE_LO, c2: CAPE }]);
    flap(tail, 0, 0, -0.56, 0.18, 0.1, [{ g: box(0.27, 0.045, 0.46).translate(0, 0, -0.23), c: FLAME_LO, c2: CAPE_HI }], [G(box(0.27, 0.05, 0.06), [0, 0, -0.46])]);
  }

  // lengan kiri (sisi -X) memegang tombak panjang mendatar; lengan inilah yang mengayun saat menyerang
  const SPEAR_Y = -0.42;
  const TIP = 1.05; // pangkal mata tombak, diukur dari genggaman
  const spearArm = k.arm(
    body,
    -0.6,
    0.98,
    { phase: Math.PI, rest: 0.25, swing: 0.22, elbowDrop: 0.44, bend: 0.6 },
    [{ g: cyl(0.11, 0.1, 0.42), c: IRON_LO, c2: IRON, p: [0, -0.22, 0] }],
    [
      { g: sph(0.11), c: BRASS_LO, c2: BRASS },
      { g: cyl(0.11, 0.09, 0.36), c: RED_LO, c2: RED, p: [0, -0.2, 0] },
      { g: sph(0.1), c: IRON, p: [0, SPEAR_Y, 0] },
      // gagang, pangkal, cincin pengikat, sayap, dan mata tombak berbentuk daun
      { g: cyl(0.028, 0.028, TIP + 0.8, 6), c: WOOD, r: [HALF, 0, 0], p: [0, SPEAR_Y, (TIP - 0.8) / 2] },
      { g: cone(0.05, 0.16, 6), c: BRASS_LO, c2: BRASS, r: [-HALF, 0, 0], p: [0, SPEAR_Y, -0.86] },
      { g: cyl(0.05, 0.05, 0.14, 8), c: BRASS, r: [HALF, 0, 0], p: [0, SPEAR_Y, TIP - 0.07] },
      { g: box(0.04, 0.32, 0.05), c: BRASS_LO, c2: BRASS, p: [0, SPEAR_Y, TIP - 0.16] },
      { g: cone(0.13, 0.16, 4), c: STEEL, s: [0.5, 1, 1], r: [-HALF, 0, 0], p: [0, SPEAR_Y, TIP + 0.08] },
      { g: cone(0.13, 0.56, 4), c: STEEL, s: [0.5, 1, 1], r: [HALF, 0, 0], p: [0, SPEAR_Y, TIP + 0.44] },
    ],
    // rusuk bara di kedua sisi mata tombak, dan gelang bara di bawah sayapnya
    [G(cone(0.05, 0.5, 4), [0, SPEAR_Y, TIP + 0.45], [HALF, 0, 0], [1.6, 1, 1]), G(cyl(0.042, 0.042, 0.12, 8), [0, SPEAR_Y, TIP - 0.32], [HALF, 0, 0])],
  );

  // lengan kanan (sisi +X): perisai bundar kecil di sisi luar lengan bawah
  const shieldArm = k.arm(
    body,
    0.6,
    0.98,
    { phase: 0, rest: 0.1, swing: 0.45, elbowDrop: 0.44, bend: 0.75 },
    [{ g: cyl(0.11, 0.1, 0.42), c: IRON_LO, c2: IRON, p: [0, -0.22, 0] }],
    [
      { g: sph(0.11), c: BRASS_LO, c2: BRASS },
      { g: cyl(0.11, 0.09, 0.36), c: RED_LO, c2: RED, p: [0, -0.2, 0] },
      { g: sph(0.1), c: IRON, p: [0, -0.42, 0] },
      { g: cyl(0.34, 0.34, 0.07, 18), c: RED_LO, c2: RED, r: [0, -0.5, -HALF], p: [0.15, -0.24, 0.05] },
      { g: torus(0.33, 0.035, 20), c: BRASS_LO, c2: BRASS, r: [0, 1.07, 0], p: [0.17, -0.24, 0.06] },
      { g: sph(0.12), c: BRASS_LO, c2: BRASS, s: [0.55, 1, 1], r: [0, -0.5, 0], p: [0.2, -0.24, 0.08] },
    ],
    [G(torus(0.2, 0.025, 18), [0.195, -0.24, 0.075], [0, 1.07, 0])],
  );

  return {
    group: g,
    height: 3.15,
    rig: newRig({ body, head, legs, arms: [spearArm, shieldArm], strikeArm: spearArm, sway, stride: 1.6, legSwing: 0.7, kneeBend: 1.0, lean: 0.14, lunge: 0.3 }),
  };
}

// ----------------------------------------------------------------- Gale Archer

function galeArcher(mats: HeroMats): HeroModel {
  const g = new THREE.Group();
  const k = new Kit('gale', mats);
  const JADE = 0x2a9c86;
  const JADE_LO = 0x0f4f49;
  const DEEP = 0x1c4a4a;
  const DEEP_LO = 0x0b2628;
  const IVORY = 0xf4f0e0;
  const IVORY_LO = 0xb5ae98;
  const LEATHER = 0x7a5536;
  const LEATHER_LO = 0x3e2a1b;
  const SKIN = 0xe9c9a4;
  const HIP = 0.96;

  const legs = [-1, 1].map((s) =>
    k.leg(
      g,
      s * 0.18,
      HIP,
      0.48,
      s < 0 ? 0 : Math.PI,
      [
        { g: cyl(0.135, 0.105, 0.5), c: DEEP_LO, c2: DEEP, p: [0, -0.25, 0] },
        { g: cyl(0.142, 0.136, 0.07), c: LEATHER, p: [0, -0.2, 0] },
      ],
      [
        { g: sph(0.115), c: LEATHER_LO, c2: LEATHER, p: [0, 0, 0.04] },
        // sepatu bot tinggi dengan lipatan gading dan ujung lancip
        { g: cyl(0.125, 0.09, 0.44), c: LEATHER_LO, c2: LEATHER, p: [0, -0.22, 0] },
        { g: cyl(0.152, 0.132, 0.09), c: IVORY_LO, c2: IVORY, p: [0, -0.07, 0] },
        { g: rbox(0.19, 0.11, 0.4, 0.04), c: LEATHER_LO, c2: LEATHER, p: [0, -0.43, 0.07] },
        { g: cone(0.075, 0.18, 5), c: LEATHER, r: [HALF, 0, 0], p: [0, -0.44, 0.33] },
      ],
      [G(new THREE.OctahedronGeometry(0.045), [0, -0.07, 0.15], undefined, [1, 1.3, 0.6])],
    ),
  );

  const body = bodyJoint(g, HIP);
  const torso: Part[] = [
    { g: cyl(0.26, 0.24, 0.24), c: DEEP_LO, c2: DEEP, p: [0, 0.08, 0] },
    { g: cyl(0.28, 0.28, 0.09, 12), c: LEATHER_LO, c2: LEATHER, p: [0, 0.2, 0] },
    { g: cyl(0.36, 0.25, 0.72, 12), c: JADE_LO, c2: JADE, p: [0, 0.62, 0] },
    // pelindung dada pemanah di sisi busur, dan tali tabung panah yang melintang
    { g: rbox(0.36, 0.32, 0.12, 0.05), c: IVORY_LO, c2: IVORY, p: [-0.12, 0.76, 0.27], r: [-0.14, -0.22, 0] },
    { g: box(0.075, 0.92, 0.05), c: LEATHER_LO, c2: LEATHER, p: [0.02, 0.62, 0.31], r: [-0.12, 0, -0.62] },
    // syal tebal di leher
    { g: torus(0.22, 0.08, 14), c: IVORY_LO, c2: IVORY, r: [HALF, 0, 0], p: [0, 1.03, 0] },
    // kain depan dan belakang yang menggantung dari sabuk, dan kantong di pinggul
    { g: box(0.26, 0.5, 0.04), c: JADE_LO, c2: JADE, p: [0, -0.12, 0.25], r: [-0.12, 0, 0] },
    { g: box(0.3, 0.05, 0.05), c: IVORY, p: [0, -0.36, 0.28], r: [-0.12, 0, 0] },
    { g: box(0.34, 0.42, 0.04), c: JADE_LO, c2: JADE, p: [0, -0.08, -0.25], r: [0.14, 0, 0] },
    { g: rbox(0.15, 0.19, 0.13, 0.04), c: LEATHER_LO, c2: LEATHER, p: [0.27, 0.07, 0.08] },
    // tabung panah di punggung, miring ke bahu tangan penarik
    { g: cyl(0.13, 0.1, 0.78, 10), c: LEATHER_LO, c2: LEATHER, p: [0.1, 0.66, -0.37], r: [0, 0, -0.42] },
    { g: cyl(0.145, 0.145, 0.07, 10), c: IVORY_LO, c2: IVORY, p: [0.245, 0.98, -0.37], r: [0, 0, -0.42] },
    // bantalan bahu kulit di sisi tangan penarik
    { g: sph(0.19), c: LEATHER_LO, c2: LEATHER, s: [1.05, 0.75, 1.05], p: [0.42, 0.96, 0] },
  ];
  const torsoGlow: THREE.BufferGeometry[] = [G(new THREE.OctahedronGeometry(0.07), [0, 0.2, 0.29], undefined, [1, 1.3, 0.6])];
  // anak panah di tabung: batang gading, bulu ekornya menyala
  for (const [dx, dz, up] of [
    [-0.04, -0.03, 0.2],
    [0.05, 0.04, 0.27],
    [0.01, -0.01, 0.13],
  ]) {
    const x = 0.26 + dx + up * 0.41;
    const y = 1.0 + up * 0.91;
    torso.push({ g: cyl(0.014, 0.014, 0.3, 5), c: IVORY, p: [x - 0.06, y - 0.13, -0.37 + dz], r: [0, 0, -0.42] });
    torsoGlow.push(G(box(0.07, 0.11, 0.014), [x, y, -0.37 + dz], [0, 0, -0.42]), G(box(0.014, 0.11, 0.07), [x, y, -0.37 + dz], [0, 0, -0.42]));
  }
  // mantel bulu berlapis yang menjuntai dari bahu lengan busur
  for (let i = 0; i < 3; i++) {
    torso.push({
      g: cone(0.17, 0.46 - i * 0.05, 5),
      c: i === 2 ? JADE_LO : IVORY_LO,
      c2: i === 2 ? JADE : IVORY,
      s: [0.35, 1, 1],
      p: [-0.43 - i * 0.035, 0.97 - i * 0.07, -0.02 + (i - 1) * 0.03],
      r: [0, 0, 2.2 + i * 0.3],
    });
  }
  k.fill(body, torso, torsoGlow);

  const head = joint(body, 0, 1.24, 0);
  k.fill(
    head,
    [
      { g: sph(0.25, 14, 10), c: SKIN, s: [1, 1.05, 1] },
      // tudung kepala: menutup atas dan belakang, wajah tetap terlihat; tepinya berlis gading
      { g: sph(0.285, 14, 10), c: JADE_LO, c2: JADE, s: [1.04, 0.98, 1.08], p: [0, 0.07, -0.06] },
      { g: torus(0.24, 0.03, 18), c: IVORY_LO, c2: IVORY, p: [0, 0.04, 0.1], r: [-0.2, 0, 0] },
      // topeng mata dan lidah tudung yang runcing seperti paruh
      { g: rbox(0.44, 0.1, 0.14, 0.04), c: LEATHER_LO, p: [0, 0.01, 0.19] },
      { g: cone(0.14, 0.28, 4), c: IVORY_LO, c2: IVORY, s: [1.1, 1, 0.4], r: [1.75, 0, 0], p: [0, 0.18, 0.3] },
    ],
    [G(box(0.1, 0.04, 0.04), [0.1, 0.015, 0.255], [0, 0, 0.18]), G(box(0.1, 0.04, 0.04), [-0.1, 0.015, 0.255], [0, 0, -0.18])],
  );

  // bagian yang melambai: jambul bulu, ekor syal, dan pita di ujung busur
  const sway: THREE.Object3D[] = [];
  // tiap ruas memanjang ke -Z dari sendinya; `base` positif = terangkat, `lift` = perubahan saat berlari
  const flap = (parent: THREE.Object3D, x: number, y: number, z: number, base: number, lift: number, parts: Part[], glow: THREE.BufferGeometry[] = []) => {
    const j = joint(parent, x, y, z);
    j.userData.baseX = base;
    j.userData.lift = lift;
    j.rotation.x = base;
    k.fill(j, parts, glow);
    sway.push(j);
    return j;
  };
  // bulu pipih yang meruncing ke -Z, pangkalnya di sendi
  const feather = (len: number, w: number): THREE.BufferGeometry =>
    cone(w, len, 5)
      .scale(1, 1, 0.3)
      .rotateX(-HALF)
      .translate(0, 0, -len / 2);
  // jambul tiga bulu di puncak tudung: satu panjang di tengah, dua pendek membuka ke samping
  for (const [s, len, base] of [
    [0, 0.74, 0.62],
    [-1, 0.52, 0.42],
    [1, 0.52, 0.42],
  ]) {
    const f = flap(head, s * 0.07, 0.27, -0.12, base, -0.3, [{ g: feather(len, 0.115), c: s === 0 ? IVORY : IVORY_LO }]);
    f.rotation.y = -s * 0.55;
  }
  const scarf = flap(body, -0.1, 1.02, -0.26, -1.05, 0.75, [{ g: box(0.17, 0.04, 0.4).translate(0, 0, -0.2), c: IVORY_LO }]);
  flap(scarf, 0, 0, -0.4, 0.3, 0.12, [{ g: feather(0.5, 0.1), c: IVORY_LO }], [G(feather(0.16, 0.045), [0, 0, -0.37])]);

  // lengan busur (sisi -X): selalu terangkat lurus ke depan, sedikit condong ke tengah badan
  const BOW_REST = -1.42;
  const BOW_TILT = 0.2;
  const BOW_BEND = 0.14;
  const sleeve = (): Part[] => [{ g: cyl(0.085, 0.075, 0.4), c: JADE_LO, c2: JADE, p: [0, -0.2, 0] }];
  const bowArm = k.arm(body, -0.42, 0.93, { phase: Math.PI, rest: BOW_REST, swing: 0.1, elbowDrop: 0.4, bend: BOW_BEND }, sleeve(), [
    { g: sph(0.085), c: LEATHER_LO, c2: LEATHER },
    { g: cyl(0.075, 0.065, 0.34), c: DEEP_LO, c2: DEEP, p: [0, -0.17, 0] },
    // pelindung lengan bawah
    { g: rbox(0.13, 0.26, 0.17, 0.04), c: IVORY_LO, c2: IVORY, p: [0, -0.19, 0] },
    { g: sph(0.085), c: LEATHER_LO, c2: LEATHER, p: [0, -0.4, 0] },
  ]);
  bowArm.shoulder.rotation.z = BOW_TILT;

  // Busur di genggaman. Sendinya diputar balik terhadap pose lengan, jadi sumbunya sejajar badan:
  // Y = bentang busur, Z = arah anak panah (maju). Busur lalu dimiringkan (BOW_CANT) supaya
  // lengkungnya terbaca dari kamera atas.
  const BOW_CANT = 0.75;
  const bow = joint(bowArm.elbow!, 0, -0.42, 0);
  const armPose = new THREE.Matrix4().makeRotationX(BOW_REST).multiply(new THREE.Matrix4().makeRotationZ(BOW_TILT)).multiply(new THREE.Matrix4().makeRotationX(-BOW_BEND));
  bow.quaternion.setFromRotationMatrix(armPose.invert().multiply(new THREE.Matrix4().makeRotationZ(BOW_CANT)));
  const NOCK_Y = 0.712; // ujung bilah tempat tali terpasang
  const STRING_Z = -0.267;
  const ARROW_Y = 0.05;
  const ARROW_LEN = 0.86;
  const bowParts: Part[] = [
    { g: rbox(0.1, 0.28, 0.13, 0.035), c: LEATHER_LO, c2: LEATHER },
    { g: cyl(0.017, 0.017, ARROW_LEN, 5), c: IVORY, r: [HALF, 0, 0], p: [0, ARROW_Y, STRING_Z + ARROW_LEN / 2] },
  ];
  const bowGlow: THREE.BufferGeometry[] = [
    // tali busur, permata angin di gagang, lalu mata dan bulu anak panah yang terpasang
    G(box(0.034, NOCK_Y * 2, 0.034), [0, 0, STRING_Z]),
    G(new THREE.OctahedronGeometry(0.065), [0, -0.1, 0.08], undefined, [1, 1.4, 0.7]),
    G(cone(0.055, 0.2, 4), [0, ARROW_Y, STRING_Z + ARROW_LEN + 0.08], [HALF, 0, 0]),
    G(box(0.09, 0.016, 0.13), [0, ARROW_Y, STRING_Z + 0.1]),
    G(box(0.016, 0.09, 0.13), [0, ARROW_Y, STRING_Z + 0.1]),
  ];
  for (const s of [-1, 1]) {
    // bilah busur tiga ruas: melengkung ke arah pemanah, lalu ujungnya membalik ke depan
    bowParts.push(
      { g: box(0.085, 0.35, 0.11), c: IVORY_LO, c2: IVORY, p: [0, s * 0.275, -0.04], r: [-s * 0.24, 0, 0] },
      { g: box(0.075, 0.34, 0.09), c: IVORY_LO, c2: IVORY, p: [0, s * 0.576, -0.174], r: [-s * 0.6, 0, 0] },
      { g: box(0.065, 0.17, 0.07), c: JADE_LO, c2: JADE, p: [0, s * 0.778, -0.231], r: [s * 0.5, 0, 0] },
    );
    bowGlow.push(G(box(0.105, 0.06, 0.12), [0, s * 0.43, -0.079], [-s * 0.4, 0, 0]));
  }
  k.fill(bow, bowParts, bowGlow);
  // hembusan angin yang berputar mengelilingi mata panah (sumbu putar = arah panah)
  const swirlAxis = joint(bow, 0, ARROW_Y, STRING_Z + ARROW_LEN - 0.08);
  swirlAxis.rotation.x = HALF;
  const swirl = joint(swirlAxis, 0, 0, 0);
  k.fill(
    swirl,
    [],
    orbit(3, 0.13, (i) =>
      cone(0.032, 0.18, 4)
        .rotateX(HALF)
        .translate(0, (i - 1) * 0.07, 0),
    ),
  );
  // pita di ujung bawah busur
  flap(bow, 0, -0.8, -0.2, -1.2, 0.55, [{ g: feather(0.42, 0.06), c: IVORY }], [G(feather(0.14, 0.035), [0, 0, -0.32])]);

  // lengan penarik (sisi +X): santai di samping badan, berayun saat berlari
  const drawArm = k.arm(body, 0.42, 0.93, { phase: 0, rest: 0.12, swing: 0.75, elbowDrop: 0.4, bend: 0.45 }, sleeve(), [
    { g: sph(0.085), c: LEATHER_LO, c2: LEATHER },
    { g: cyl(0.075, 0.065, 0.34), c: DEEP_LO, c2: DEEP, p: [0, -0.17, 0] },
    // sarung tangan pemanah dengan manset gading
    { g: cyl(0.09, 0.08, 0.14), c: LEATHER_LO, c2: LEATHER, p: [0, -0.28, 0] },
    { g: cyl(0.095, 0.095, 0.035), c: IVORY, p: [0, -0.2, 0] },
    { g: sph(0.085), c: LEATHER_LO, c2: LEATHER, p: [0, -0.4, 0] },
  ]);

  return {
    group: g,
    height: 3.0,
    rig: newRig({ body, head, legs, arms: [bowArm, drawArm], aimArm: bowArm, sway, spin: [swirl], stride: 1.85, legSwing: 0.85, kneeBend: 1.1, lean: 0.2 }),
  };
}

export const HERO_MODELS: Record<string, { look: HeroLook; build: (mats: HeroMats) => HeroModel }> = {
  gale_archer: { look: { metal: 0.12, rough: 0.66, glow: 0xb4f25c, glowLum: 1.0 }, build: galeArcher },
  ember_lancer: { look: { metal: 0.42, rough: 0.46, glow: 0xff641f, glowLum: 0.9 }, build: emberLancer },
  lumen_sage: { look: { metal: 0.12, rough: 0.62, glow: 0x7dffb0, glowLum: 1.0 }, build: lumenSage },
  volt_titan: { look: { metal: 0.5, rough: 0.42, glow: 0xffc21e, glowLum: 0.95 }, build: voltTitan },
  nova_striker: { look: { metal: 0.3, rough: 0.4, glow: 0x25d8ff, glowLum: 1.05 }, build: novaStriker },
  shadow_fang: { look: { metal: 0.15, rough: 0.7, glow: 0xdd3cf5, glowLum: 0.9 }, build: shadowFang },
};

/** Model cadangan untuk hero yang belum punya builder sendiri. */
export const FALLBACK_HERO: { look: HeroLook; build: (mats: HeroMats) => HeroModel } = {
  look: { metal: 0.2, rough: 0.6, glow: 0xffffff, glowLum: 1 },
  build(mats) {
    const g = new THREE.Group();
    const k = new Kit('fallback', mats);
    const SKIN = 0x9aa4b8;
    const legs = [-1, 1].map((s) =>
      k.leg(g, s * 0.2, 0.9, 0.45, s < 0 ? 0 : Math.PI, [{ g: cyl(0.13, 0.11, 0.45), c: SKIN, p: [0, -0.22, 0] }], [{ g: cyl(0.11, 0.09, 0.45), c: SKIN, p: [0, -0.22, 0] }]),
    );
    const body = bodyJoint(g, 0.9);
    k.fill(body, [
      { g: new THREE.CapsuleGeometry(0.4, 0.6, 4, 10), c: SKIN, p: [0, 0.7, 0] },
      { g: sph(0.28), c: SKIN, p: [0, 1.45, 0] },
    ]);
    return { group: g, height: 2.6, rig: newRig({ body, legs }) };
  },
};
