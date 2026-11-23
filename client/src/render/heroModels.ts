// Model hero bergaya chibi (kepala besar, badan bulat, tangan-kaki pendek, mata besar berkilau) dari
// bentuk primitif, lengkap dengan sendi (rig) untuk animasi berjalan, menyerang, dan casting. Tiap
// sendi berisi satu mesh badan (warna & gradasi per-vertex) dan satu mesh bagian yang menyala, jadi
// hero yang rumit pun hanya butuh sedikit draw call. Semua model menghadap +Z.
// Tambah hero baru: daftarkan `look` + fungsi builder di HERO_MODELS dengan key = id hero.
import * as THREE from 'three';
import { build, cached, orbit, union, type Part } from './geo';
import { joint, newRig, type Arm, type Leg, type Rig } from './rig';
import { blush, bolt, box, cap, catMouth, cone, cyl, eyes, faceOpening, fringe, HALF, onHead, rbox, smile, sph, torus, type V3 } from './cute';

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

const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
/** Geometri bagian menyala di posisi/rotasi/skala tertentu. */
function G(g: THREE.BufferGeometry, p: V3 = [0, 0, 0], r?: V3, s?: V3): THREE.BufferGeometry {
  if (s) g.scale(s[0], s[1], s[2]);
  if (r) g.applyMatrix4(_m.makeRotationFromEuler(_e.set(r[0], r[1], r[2])));
  return g.translate(p[0], p[1], p[2]);
}

const octa = (r: number) => new THREE.OctahedronGeometry(r);
const PINK = 0xff8fae;
const WHITE = 0xffffff;

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

  /** Bagian yang melambai (jubah, ekor, jambul): ruas memanjang ke -Z dari sendinya. */
  flap(sway: THREE.Object3D[], parent: THREE.Object3D, at: V3, base: number, lift: number, parts: Part[], glow: THREE.BufferGeometry[] = [], wag = 0): THREE.Group {
    const j = joint(parent, at[0], at[1], at[2]);
    j.userData.baseX = base;
    j.userData.lift = lift;
    if (wag) j.userData.wag = wag;
    j.rotation.x = base;
    this.fill(j, parts, glow);
    sway.push(j);
    return j;
  }
}

function bodyJoint(root: THREE.Object3D, y: number): THREE.Group {
  const b = joint(root, 0, y, 0);
  b.userData.baseY = y;
  return b;
}

/** Bulu/daun pipih yang meruncing ke -Z, pangkalnya di sendi. */
const feather = (len: number, w: number): THREE.BufferGeometry =>
  cone(w, len, 5)
    .scale(1, 1, 0.3)
    .rotateX(-HALF)
    .translate(0, 0, -len / 2);

// ------------------------------------------------------------------ Volt Titan
// Robot mungil gendut berkepala layar TV: mata layar menyala, antena petir, sarung tinju besar.

function voltTitan(mats: HeroMats): HeroModel {
  const g = new THREE.Group();
  const k = new Kit('volt', mats);
  const BLUE = 0x6a9cf4;
  const BLUE_LO = 0x3459b8;
  const NAVY = 0x2e3d6c;
  const NAVY_LO = 0x1b2444;
  const GOLD = 0xffcf55;
  const GOLD_LO = 0xc98f22;
  const CREAM = 0xf0f5ff;
  const CREAM_LO = 0xb4c4e8;
  const HIP = 0.5;

  const legs = [-1, 1].map((s) =>
    k.leg(
      g,
      s * 0.33,
      HIP,
      0.2,
      s < 0 ? 0 : Math.PI,
      [{ g: cap(0.15, 0.08), c: NAVY_LO, c2: NAVY, p: [0, -0.1, 0] }],
      [
        // sepatu bot bulat dengan ujung emas
        { g: rbox(0.42, 0.3, 0.52, 0.14), c: BLUE_LO, c2: BLUE, p: [0, -0.13, 0.04] },
        { g: rbox(0.46, 0.08, 0.58, 0.04), c: NAVY_LO, c2: NAVY, p: [0, -0.26, 0.05] },
        { g: sph(0.14, 12, 8), c: GOLD_LO, c2: GOLD, s: [1.2, 0.8, 0.8], p: [0, -0.15, 0.3] },
        { g: cyl(0.06, 0.06, 0.08, 10), c: GOLD, r: [0, 0, HALF], p: [s * 0.22, -0.1, 0] },
      ],
      [G(torus(0.16, 0.025, 16), [0, 0.02, 0.02], [HALF, 0, 0])],
    ),
  );

  const body = bodyJoint(g, HIP);
  const torso: Part[] = [
    // badan tong bulat, pelat perut krem, dan sabuk
    { g: sph(0.6, 18, 14), c: BLUE_LO, c2: BLUE, s: [1.12, 0.95, 1], p: [0, 0.42, 0] },
    // panel perut: tempelan kulit bola yang sepusat dengan badan, jadi tepinya rapi
    { g: new THREE.SphereGeometry(0.61, 20, 10, HALF - 0.75, 1.5, 1.5, 0.95), c: CREAM_LO, c2: CREAM, s: [1.12, 0.95, 1], p: [0, 0.42, 0] },
    { g: torus(0.53, 0.06, 24), c: NAVY_LO, c2: NAVY, s: [1.12, 1, 1], r: [HALF, 0, 0], p: [0, 0.12, 0] },
    { g: rbox(0.22, 0.15, 0.08, 0.04), c: GOLD_LO, c2: GOLD, p: [0, 0.12, 0.55] },
    // rumah reaktor di dada
    { g: torus(0.15, 0.04, 18), c: GOLD_LO, c2: GOLD, p: [0, 0.64, 0.55], r: [-0.3, 0, 0] },
    // ransel generator dengan dua kumparan petir
    { g: rbox(0.62, 0.56, 0.3, 0.12), c: NAVY_LO, c2: NAVY, p: [0, 0.55, -0.56] },
  ];
  const torsoGlow: THREE.BufferGeometry[] = [
    G(sph(0.12, 12, 8), [0, 0.64, 0.56], [-0.3, 0, 0], [1, 1, 0.45]),
    G(box(0.1, 0.05, 0.04), [0, 0.12, 0.6]),
    G(box(0.34, 0.06, 0.04), [0, 0.6, -0.72]),
    G(box(0.34, 0.06, 0.04), [0, 0.45, -0.72]),
  ];
  for (const s of [-1, 1]) {
    torso.push({ g: cyl(0.08, 0.1, 0.42), c: NAVY_LO, c2: NAVY, p: [s * 0.2, 0.95, -0.6] });
    for (const y of [0.85, 1.0]) torso.push({ g: torus(0.11, 0.025, 12), c: GOLD, r: [HALF, 0, 0], p: [s * 0.2, y, -0.6] });
    torsoGlow.push(G(sph(0.1, 10, 8), [s * 0.2, 1.2, -0.6]));
    // bantalan bahu bulat bertepi emas, dengan duri petir kecil
    torso.push({ g: sph(0.3, 14, 10), c: BLUE_LO, c2: BLUE, s: [1.1, 0.85, 1.05], p: [s * 0.68, 0.8, 0] });
    torso.push({ g: torus(0.3, 0.04, 18), c: GOLD_LO, c2: GOLD, r: [HALF, 0, 0], s: [1.1, 1.05, 1], p: [s * 0.68, 0.7, 0] });
    torsoGlow.push(G(cone(0.07, 0.24, 6), [s * 0.8, 1.06, 0], [0, 0, -s * 0.5]));
  }
  k.fill(body, torso, torsoGlow);

  // kepala layar TV: mata menyala di layar gelap, pipi merah muda, antena petir di ubun-ubun
  const head = joint(body, 0, 1.0, 0);
  const headParts: Part[] = [
    { g: rbox(1.12, 0.96, 0.92, 0.34), c: BLUE_LO, c2: BLUE, p: [0, 0.46, 0] },
    { g: rbox(0.86, 0.62, 0.1, 0.1), c: NAVY_LO, c2: NAVY, p: [0, 0.42, 0.43] },
    { g: rbox(0.16, 0.1, 0.06, 0.03), c: GOLD, p: [0, 0.88, 0.36] },
    // telinga baut dan kubah antena
    { g: cyl(0.14, 0.14, 0.1, 14), c: GOLD_LO, c2: GOLD, r: [0, 0, HALF], p: [0.58, 0.44, 0] },
    { g: cyl(0.14, 0.14, 0.1, 14), c: GOLD_LO, c2: GOLD, r: [0, 0, HALF], p: [-0.58, 0.44, 0] },
    { g: sph(0.11, 12, 8), c: GOLD_LO, c2: GOLD, p: [0, 0.94, 0] },
    { g: cyl(0.025, 0.03, 0.3, 6), c: NAVY, p: [0, 1.12, 0] },
  ];
  for (const s of [-1, 1]) {
    // kilau mata dan rona pipi di layar
    headParts.push({ g: sph(0.045, 8, 6), c: WHITE, s: [1, 1, 0.5], p: [s * 0.25, 0.53, 0.5] });
    headParts.push({ g: sph(0.022, 6, 5), c: WHITE, s: [1, 1, 0.5], p: [s * 0.165, 0.38, 0.5] });
    headParts.push({ g: sph(0.075, 10, 6), c: PINK, s: [1, 0.55, 0.3], p: [s * 0.33, 0.29, 0.48] });
  }
  k.fill(head, headParts, [
    G(sph(0.13, 14, 10), [-0.2, 0.46, 0.48], undefined, [0.85, 1.15, 0.3]),
    G(sph(0.13, 14, 10), [0.2, 0.46, 0.48], undefined, [0.85, 1.15, 0.3]),
    G(torus(0.06, 0.016, 10, Math.PI), [0, 0.3, 0.485], [0, 0, Math.PI]),
    ...bolt(0.42, 0.06).map((b) => G(b, [0, 1.42, 0])),
    G(sph(0.05, 8, 6), [0, 1.27, 0]),
  ]);

  const arms = [-1, 1].map((s) =>
    k.arm(
      body,
      s * 0.72,
      0.72,
      { phase: s < 0 ? Math.PI : 0, rest: 0.12, swing: 0.6, elbowDrop: 0.26, bend: 0.3 },
      [{ g: cap(0.12, 0.12), c: NAVY_LO, c2: NAVY, p: [0, -0.14, 0] }],
      [
        // sarung tinju bulat besar dengan buku jari emas
        { g: cap(0.12, 0.06), c: NAVY, p: [0, -0.06, 0] },
        { g: sph(0.27, 16, 12), c: BLUE_LO, c2: BLUE, s: [1, 0.95, 1.05], p: [0, -0.27, 0.03] },
        { g: torus(0.17, 0.045, 16), c: GOLD_LO, c2: GOLD, r: [HALF, 0, 0], p: [0, -0.07, 0] },
        ...[-0.11, 0, 0.11].map((x): Part => ({ g: sph(0.06, 8, 6), c: GOLD, p: [x, -0.3, 0.29] })),
      ],
      [G(torus(0.2, 0.02, 16), [0, -0.15, 0.02], [HALF, 0, 0]), G(box(0.05, 0.16, 0.04), [s * 0.27, -0.27, 0.03])],
    ),
  );

  return {
    group: g,
    height: 2.55,
    rig: newRig({ body, head, legs, arms, strikeArm: arms[1], stride: 2.5, legSwing: 0.55, kneeBend: 0.6, lean: 0.06, bounce: 0.06, castLift: 0.06, waddle: 0.09, headTilt: 0.06 }),
  };
}

// ---------------------------------------------------------------- Nova Striker
// Astronot cilik: helm bundar terbuka, kacamata pilot di dahi, ransel jet, dan meriam plasma besar.

function novaStriker(mats: HeroMats): HeroModel {
  const g = new THREE.Group();
  const k = new Kit('nova', mats);
  const WH = 0xf6f8ff;
  const WH_LO = 0xbcc6de;
  const GREY = 0x4b5670;
  const GREY_LO = 0x2f3850;
  const ORANGE = 0xff8a3d;
  const ORANGE_LO = 0xcf5e26;
  const SKIN = 0xf7c6a4;
  const HAIR = 0x8a5a3c;
  const HIP = 0.42;

  const legs = [-1, 1].map((s) =>
    k.leg(
      g,
      s * 0.17,
      HIP,
      0.18,
      s < 0 ? 0 : Math.PI,
      [{ g: cap(0.12, 0.06), c: WH_LO, c2: WH, p: [0, -0.08, 0] }],
      [
        { g: rbox(0.26, 0.22, 0.32, 0.11), c: WH_LO, c2: WH, p: [0, -0.11, 0.03] },
        { g: rbox(0.28, 0.07, 0.36, 0.03), c: ORANGE_LO, c2: ORANGE, p: [0, -0.205, 0.04] },
        { g: cyl(0.1, 0.11, 0.05, 12), c: ORANGE, p: [0, 0.0, 0] },
      ],
      [G(sph(0.05, 8, 6), [0, -0.13, -0.15])],
    ),
  );

  const body = bodyJoint(g, HIP);
  const torso: Part[] = [
    { g: sph(0.36, 16, 12), c: WH_LO, c2: WH, s: [1, 1.1, 0.92], p: [0, 0.36, 0] },
    { g: torus(0.32, 0.045, 20), c: ORANGE_LO, c2: ORANGE, r: [HALF, 0, 0], s: [1, 0.95, 1], p: [0, 0.16, 0] },
    { g: torus(0.1, 0.025, 14), c: GREY, p: [0, 0.46, 0.325] },
    { g: torus(0.2, 0.06, 16), c: ORANGE_LO, c2: ORANGE, r: [HALF, 0, 0], p: [0, 0.74, 0] },
    // ransel jet dengan dua pendorong dan sirip
    { g: rbox(0.44, 0.48, 0.24, 0.1), c: GREY_LO, c2: GREY, p: [0, 0.42, -0.36] },
  ];
  const torsoGlow: THREE.BufferGeometry[] = [G(cyl(0.08, 0.08, 0.04, 12), [0, 0.46, 0.33], [HALF, 0, 0]), G(box(0.26, 0.06, 0.04), [0, 0.55, -0.485])];
  for (const s of [-1, 1]) {
    torso.push({ g: cyl(0.08, 0.11, 0.2, 10), c: GREY, p: [s * 0.13, 0.12, -0.4] });
    torso.push({ g: rbox(0.06, 0.34, 0.24, 0.03), c: WH_LO, c2: WH, p: [s * 0.27, 0.5, -0.42], r: [0, 0, -s * 0.3] });
    torso.push({ g: rbox(0.065, 0.1, 0.25, 0.03), c: ORANGE, p: [s * 0.32, 0.66, -0.42], r: [0, 0, -s * 0.3] });
    torso.push({ g: sph(0.13, 12, 8), c: ORANGE_LO, c2: ORANGE, p: [s * 0.36, 0.6, 0] });
    torsoGlow.push(G(cone(0.07, 0.18, 8), [s * 0.13, -0.06, -0.4], [Math.PI, 0, 0]));
  }
  k.fill(body, torso, torsoGlow);

  // cincin energi berputar di punggung
  const halo = joint(body, 0, 0.5, -0.56);
  k.fill(halo, [], [G(torus(0.34, 0.03, 28)), G(torus(0.22, 0.022, 22), [0, 0, 0], [0, HALF, 0])]);

  // kepala: wajah bulat di dalam helm putih terbuka
  const head = joint(body, 0, 0.78, 0);
  const C: V3 = [0, 0.5, 0.02];
  const A = 0.47;
  const R: V3 = [A, A, A];
  const HB = 0.56;
  const BACK = 0.16;
  const hole = faceOpening(A, HB, BACK);
  const hc: V3 = [0, C[1], C[2] - BACK];
  k.fill(
    head,
    [
      { g: sph(A, 20, 16), c: SKIN, p: C },
      { g: sph(HB, 20, 16), c: WH_LO, c2: WH, p: hc },
      { g: torus(hole.r, 0.045, 28), c: ORANGE_LO, c2: ORANGE, p: [0, C[1], C[2] + hole.z] },
      // poni kecil yang mengintip dari bawah tepi helm
      ...fringe(C, A, HAIR, HAIR, 0.55, 0.72, 4),
      ...eyes({ c: C, R, yaw: 0.36, pitch: -0.06, size: 0.12, iris: 0x2ec8ff, dark: 0x12224a }),
      ...blush(C, R, 0.64, -0.3, 0.075),
      ...smile(C, R, -0.38, 0.045),
      // sirip kecil di puncak helm
      { g: rbox(0.1, 0.12, 0.5, 0.05), c: ORANGE_LO, c2: ORANGE, p: [0, hc[1] + HB - 0.02, hc[2] - 0.06] },
      { g: cyl(0.13, 0.13, 0.1, 14), c: ORANGE_LO, c2: ORANGE, r: [0, 0, HALF], p: [0.56, C[1], -0.1] },
      { g: cyl(0.13, 0.13, 0.1, 14), c: ORANGE_LO, c2: ORANGE, r: [0, 0, HALF], p: [-0.56, C[1], -0.1] },
      { g: cyl(0.015, 0.015, 0.3, 6), c: GREY, p: [0.58, C[1] + 0.22, -0.1] },
    ],
    [G(box(0.04, 0.05, 0.4), [0, hc[1] + HB + 0.045, hc[2] - 0.06]), G(sph(0.045, 8, 6), [0.58, C[1] + 0.4, -0.1])],
  );

  // lengan kanan = meriam plasma besar, selalu terangkat membidik
  const cannon = joint(body, 0.42, 0.56, 0);
  k.fill(
    cannon,
    [
      { g: cap(0.1, 0.08), c: WH_LO, c2: WH, p: [0, -0.1, 0] },
      { g: cyl(0.17, 0.19, 0.5, 16), c: WH, c2: WH_LO, p: [0, -0.42, 0] },
      { g: cyl(0.2, 0.2, 0.08, 16), c: ORANGE_LO, c2: ORANGE, p: [0, -0.28, 0] },
      { g: cyl(0.15, 0.18, 0.14, 16), c: GREY, c2: GREY_LO, p: [0, -0.72, 0] },
      { g: rbox(0.05, 0.3, 0.16, 0.02), c: ORANGE, p: [0.2, -0.44, 0] },
      { g: rbox(0.05, 0.3, 0.16, 0.02), c: ORANGE, p: [-0.2, -0.44, 0] },
      { g: rbox(0.08, 0.14, 0.1, 0.03), c: GREY, p: [0, -0.36, 0.2] },
    ],
    [
      G(torus(0.19, 0.028, 18), [0, -0.52, 0], [HALF, 0, 0]),
      G(torus(0.185, 0.028, 18), [0, -0.62, 0], [HALF, 0, 0]),
      G(sph(0.12, 12, 8), [0, -0.8, 0]),
      G(box(0.04, 0.26, 0.03), [0, -0.46, 0.19]),
    ],
  );
  cannon.rotation.x = -1.35;
  const cannonArm: Arm = { shoulder: cannon, phase: 0, rest: -1.35, swing: 0.12 };

  const armL = k.arm(
    body,
    -0.42,
    0.56,
    { phase: Math.PI, rest: 0.1, swing: 1, elbowDrop: 0.2, bend: 0.3 },
    [{ g: cap(0.09, 0.08), c: WH_LO, c2: WH, p: [0, -0.1, 0] }],
    [
      { g: cap(0.085, 0.06), c: WH_LO, c2: WH, p: [0, -0.08, 0] },
      { g: sph(0.11, 12, 8), c: ORANGE_LO, c2: ORANGE, p: [0, -0.2, 0] },
    ],
    [G(box(0.03, 0.09, 0.03), [-0.09, -0.08, 0])],
  );

  return {
    group: g,
    height: 2.35,
    rig: newRig({ body, head, legs, arms: [armL, cannonArm], aimArm: cannonArm, spin: [halo], stride: 2.8, legSwing: 0.7, kneeBend: 0.8, lean: 0.1, bounce: 0.06, castLift: 0.06, waddle: 0.07, headTilt: 0.07 }),
  };
}

// ----------------------------------------------------------------- Shadow Fang
// Kucing ninja ungu: telinga runcing, ikat kepala, syal menyala, ekor yang mengibas, dua belati.

function shadowFang(mats: HeroMats): HeroModel {
  const g = new THREE.Group();
  const k = new Kit('fang', mats);
  const FUR = 0x6a52a8;
  const FUR_LO = 0x3a2a6a;
  const CREAM = 0xebe0ff;
  const CREAM_LO = 0xb9a8e0;
  const SUIT = 0x30244c;
  const SUIT_LO = 0x18112a;
  const SASH = 0x9a66f0;
  const SASH_LO = 0x5c3aa6;
  const STEEL = 0xd8dcf0;
  const HIP = 0.4;

  const legs = [-1, 1].map((s) =>
    k.leg(
      g,
      s * 0.16,
      HIP,
      0.17,
      s < 0 ? 0 : Math.PI,
      [{ g: cap(0.11, 0.06), c: SUIT_LO, c2: SUIT, p: [0, -0.08, 0] }],
      [
        { g: cap(0.1, 0.05), c: SUIT_LO, c2: SUIT, p: [0, -0.05, 0] },
        { g: cyl(0.105, 0.105, 0.04, 12), c: SASH, p: [0, -0.07, 0] },
        // kaki kucing bulat dengan "kacang" merah muda di ujungnya
        { g: sph(0.13, 12, 10), c: FUR_LO, c2: FUR, s: [0.95, 0.65, 1.3], p: [0, -0.15, 0.05] },
        { g: sph(0.05, 8, 6), c: PINK, s: [1, 0.6, 0.6], p: [0, -0.16, 0.21] },
      ],
    ),
  );

  const body = bodyJoint(g, HIP);
  const torso: Part[] = [
    { g: sph(0.32, 16, 12), c: SUIT_LO, c2: SUIT, s: [1, 1.08, 0.92], p: [0, 0.32, 0] },
    { g: sph(0.13, 12, 10), c: CREAM_LO, c2: CREAM, s: [1, 1.2, 0.35], p: [0, 0.47, 0.27] },
    { g: torus(0.29, 0.05, 18), c: SASH_LO, c2: SASH, r: [HALF, 0, 0], s: [1, 0.95, 1], p: [0, 0.17, 0] },
    { g: torus(0.17, 0.05, 14), c: SUIT, r: [HALF, 0, 0], p: [0, 0.68, 0] },
    // sepasang pedang pendek bersilang di punggung
    { g: box(0.05, 0.56, 0.06), c: STEEL, p: [0.09, 0.5, -0.32], r: [0, 0, 0.6] },
    { g: box(0.05, 0.56, 0.06), c: STEEL, p: [-0.09, 0.5, -0.32], r: [0, 0, -0.6] },
  ];
  const torsoGlow: THREE.BufferGeometry[] = [
    G(sph(0.06, 10, 8), [0.14, 0.17, 0.27]),
    G(box(0.06, 0.12, 0.07), [0.27, 0.72, -0.32], [0, 0, 0.6]),
    G(box(0.06, 0.12, 0.07), [-0.27, 0.72, -0.32], [0, 0, -0.6]),
  ];
  for (const s of [-1, 1]) torso.push({ g: sph(0.12, 10, 8), c: SUIT, p: [s * 0.32, 0.56, 0] });
  k.fill(body, torso, torsoGlow);

  // kepala kucing: lebar dan bulat, moncong krem, telinga dengan bagian dalam merah muda
  const head = joint(body, 0, 0.7, 0);
  const C: V3 = [0, 0.46, 0];
  const R: V3 = [0.56, 0.48, 0.5];
  const muzzle = onHead(C, R, 0, -0.32, -0.08);
  const nose = onHead(C, R, 0, -0.2, 0.05);
  const headParts: Part[] = [
    { g: sph(0.5, 20, 16), c: FUR_LO, c2: FUR, s: [1.12, 0.96, 1], p: C },
    { g: sph(0.17, 14, 10), c: CREAM_LO, c2: CREAM, s: [1.3, 0.8, 0.7], p: muzzle.p, r: muzzle.r },
    { g: sph(0.042, 8, 6), c: PINK, s: [1.4, 0.8, 0.8], p: nose.p, r: nose.r },
    ...catMouth(C, R, -0.36, 0.035, 0x3a2040, 0.07),
    ...eyes({ c: C, R, yaw: 0.4, pitch: 0.04, size: 0.135, iris: 0xffd23a, dark: 0x2a1640 }),
    ...blush(C, R, 0.68, -0.2, 0.07),
    // ikat kepala ninja dengan pelat logam
    { g: torus(0.5, 0.032, 28), c: SASH_LO, c2: SASH, r: [HALF + 0.1, 0, 0], s: [1.04, 0.93, 1], p: [0, C[1] + 0.15, 0] },
    { g: rbox(0.22, 0.11, 0.05, 0.02), c: STEEL, p: [0, C[1] + 0.2, 0.47], r: [-0.35, 0, 0] },
  ];
  for (const s of [-1, 1]) {
    headParts.push({ g: cone(0.21, 0.42, 8), c: FUR_LO, c2: FUR, s: [1, 1, 0.6], p: [s * 0.33, C[1] + 0.45, -0.03], r: [0, 0, -s * 0.38] });
    headParts.push({ g: cone(0.13, 0.28, 6), c: PINK, s: [1, 1, 0.4], p: [s * 0.32, C[1] + 0.43, 0.05], r: [0, 0, -s * 0.38] });
    // kumis
    for (const t of [-0.12, 0.1]) headParts.push({ g: box(0.2, 0.012, 0.012), c: CREAM, p: [s * 0.27, muzzle.p[1] + t * 0.3, muzzle.p[2] - 0.03], r: [0, -s * 0.3, s * t] });
  }
  k.fill(head, headParts, [G(octa(0.035), [0, C[1] + 0.2, 0.5])]);

  const sway: THREE.Object3D[] = [];
  // syal menyala dua ruas di tengkuk, dan buntut ikat kepala
  for (const sc of [
    { x: -0.06, len: 0.4, w: 0.15, base: -0.7 },
    { x: 0.09, len: 0.32, w: 0.11, base: -0.95 },
  ]) {
    const first = k.flap(sway, body, [sc.x, 0.7, -0.2], sc.base, 0.5, [], [box(sc.w, 0.04, sc.len).translate(0, 0, -sc.len / 2)]);
    k.flap(sway, first, [0, 0, -sc.len], 0.25, 0.1, [], [box(sc.w * 0.8, 0.04, sc.len * 0.9).translate(0, 0, -sc.len * 0.45)]);
  }
  for (const s of [-1, 1]) k.flap(sway, head, [s * 0.06, C[1] + 0.13, -0.46], -0.9, 0.4, [{ g: box(0.08, 0.03, 0.3).translate(0, 0, -0.15), c: SASH_LO, c2: SASH }]);
  // ekor kucing tiga ruas yang melengkung naik dan mengibas; ujungnya krem
  let parent: THREE.Object3D = body;
  for (let i = 0; i < 3; i++) {
    const r0 = 0.075 - i * 0.012;
    const parts: Part[] = [{ g: cyl(r0 - 0.012, r0, 0.26, 10), c: i === 2 ? CREAM_LO : FUR_LO, c2: i === 2 ? CREAM : FUR, r: [-HALF, 0, 0], p: [0, 0, -0.13] }];
    parts.push({ g: sph(r0, 10, 8), c: i === 2 ? CREAM : FUR });
    if (i === 2) parts.push({ g: sph(r0 - 0.005, 10, 8), c: CREAM, p: [0, 0, -0.26] });
    parent = k.flap(sway, parent, i === 0 ? [0, 0.12, -0.27] : [0, 0, -0.26], i === 0 ? 0.55 : 0.45, 0.05, parts, [], 0.22 + i * 0.08);
  }

  const arms = [-1, 1].map((s) =>
    k.arm(
      body,
      s * 0.36,
      0.56,
      { phase: s < 0 ? Math.PI : 0, rest: 0.45, swing: 0.4, elbowDrop: 0.18, bend: 0.35 },
      [{ g: cap(0.085, 0.06), c: SUIT_LO, c2: SUIT, p: [0, -0.09, 0] }],
      [
        { g: cap(0.08, 0.04), c: SUIT, p: [0, -0.06, 0] },
        { g: cyl(0.09, 0.09, 0.05, 12), c: SASH, p: [0, -0.1, 0] },
        { g: sph(0.1, 12, 8), c: FUR_LO, c2: FUR, p: [0, -0.18, 0.02] },
        // belati: gagang, pelindung, bilah, ujung
        { g: cyl(0.025, 0.025, 0.16, 6), c: SUIT_LO, r: [HALF, 0, 0], p: [0, -0.19, 0.1] },
        { g: box(0.16, 0.035, 0.04), c: STEEL, p: [0, -0.19, 0.18] },
        { g: box(0.022, 0.08, 0.46), c: STEEL, p: [0, -0.19, 0.42] },
      ],
      [G(box(0.03, 0.03, 0.46), [0, -0.235, 0.42]), G(cone(0.05, 0.16, 4), [0, -0.2, 0.72], [HALF, Math.PI / 4, 0], [0.4, 1, 1])],
    ),
  );

  return {
    group: g,
    height: 2.3,
    rig: newRig({ body, head, legs, arms, strikeArm: arms[1], sway, stride: 2.9, legSwing: 0.8, kneeBend: 0.9, lean: 0.24, bounce: 0.06, castLift: 0.06, waddle: 0.05, headTilt: 0.09 }),
  };
}

// ------------------------------------------------------------------ Lumen Sage
// Peri cahaya berwajah porselen: tudung putih-emas, sayap kecil, lingkaran cahaya, tongkat bulan sabit.

function lumenSage(mats: HeroMats): HeroModel {
  const g = new THREE.Group();
  const k = new Kit('lumen', mats);
  const ROBE = 0xfdfaf0;
  const ROBE_LO = 0xc9c0a6;
  const TEAL = 0x34a88e;
  const TEAL_LO = 0x1f6b5a;
  const GOLD = 0xf2c95a;
  const GOLD_LO = 0xb08a2a;
  // wajah putih porselen (hampir tanpa warna, jadi skin hanya mengubah terangnya)
  const FACE = 0xf3f1ef;
  const HIP = 0.38;

  // kaki kecil di balik jubah (hanya ujung sepatunya yang terlihat saat melangkah)
  const legs = [-1, 1].map((s) =>
    k.leg(
      g,
      s * 0.14,
      HIP,
      0.15,
      s < 0 ? 0 : Math.PI,
      [{ g: cap(0.09, 0.04), c: TEAL_LO, c2: TEAL, p: [0, -0.06, 0] }],
      [
        { g: cap(0.08, 0.04), c: TEAL_LO, c2: TEAL, p: [0, -0.07, 0] },
        { g: rbox(0.18, 0.1, 0.28, 0.05), c: GOLD_LO, c2: GOLD, p: [0, -0.18, 0.05] },
      ],
    ),
  );

  const body = bodyJoint(g, HIP);
  const torso: Part[] = [
    // jubah lonceng berpinggiran emas
    { g: cyl(0.28, 0.5, 0.56, 20), c: ROBE_LO, c2: ROBE, p: [0, 0.04, 0] },
    { g: torus(0.5, 0.04, 26), c: GOLD_LO, c2: GOLD, r: [HALF, 0, 0], p: [0, -0.24, 0] },
    { g: sph(0.32, 16, 12), c: ROBE_LO, c2: ROBE, s: [1, 1, 0.92], p: [0, 0.44, 0] },
    { g: cone(0.44, 0.26, 18), c: ROBE_LO, c2: ROBE, p: [0, 0.66, 0] },
    { g: torus(0.2, 0.06, 16), c: GOLD_LO, c2: GOLD, r: [HALF, 0, 0], p: [0, 0.76, 0] },
    { g: torus(0.29, 0.025, 20), c: GOLD, r: [HALF, 0, 0], p: [0, 0.32, 0] },
  ];
  for (const s of [-1, 1]) {
    // selendang toska di depan, ujungnya emas
    torso.push({ g: box(0.11, 0.56, 0.03), c: TEAL_LO, c2: TEAL, p: [s * 0.11, 0.06, 0.38], r: [-0.37, 0, 0] });
    torso.push({ g: box(0.115, 0.05, 0.035), c: GOLD, p: [s * 0.11, -0.2, 0.48], r: [-0.37, 0, 0] });
    // sayap kecil berbulu tiga di punggung
    for (let i = 0; i < 3; i++) {
      torso.push({ g: sph(0.16 - i * 0.03, 12, 8), c: ROBE_LO, c2: ROBE, s: [1.5, 0.6, 0.25], p: [s * (0.24 + i * 0.07), 0.62 - i * 0.09, -0.3 - i * 0.02], r: [0, s * 0.45, s * (0.5 + i * 0.25)] });
    }
  }
  k.fill(body, torso, [G(octa(0.08), [0, 0.52, 0.32], undefined, [1, 1.3, 0.6]), G(box(0.24, 0.04, 0.04), [0, 0.32, 0.3])]);

  // kepala: wajah porselen di dalam tudung putih berlis emas
  const head = joint(body, 0, 0.74, 0);
  const C: V3 = [0, 0.46, 0];
  const A = 0.45;
  const R: V3 = [A, A, A];
  const HB = 0.52;
  const BACK = 0.12;
  const hole = faceOpening(A, HB, BACK);
  const hc: V3 = [0, C[1] + 0.03, -BACK];
  k.fill(
    head,
    [
      { g: sph(A, 20, 16), c: FACE, p: C },
      { g: sph(HB, 20, 16), c: ROBE_LO, c2: ROBE, p: hc },
      { g: torus(hole.r, 0.045, 28), c: GOLD_LO, c2: GOLD, p: [0, C[1] + 0.02, hole.z] },
      { g: cone(0.16, 0.36, 10), c: ROBE_LO, c2: ROBE, p: [0, C[1] + 0.48, -0.32], r: [-0.9, 0, 0] },
      { g: sph(0.06, 8, 6), c: GOLD, p: [0, C[1] + 0.58, -0.5] },
      ...eyes({ c: C, R, yaw: 0.36, pitch: -0.08, size: 0.115, iris: 0x3fdc9c, dark: 0x173a3a, lash: 0x4a3a30 }),
      ...blush(C, R, 0.64, -0.3, 0.075),
      ...smile(C, R, -0.38, 0.04),
    ],
    [G(octa(0.06), [0, C[1] + 0.02 + hole.r, hole.z + 0.04], undefined, [1, 1.4, 0.6])],
  );

  // lingkaran cahaya yang berputar di atas kepala, dengan empat permata kecil
  const halo = joint(head, 0, 1.12, -0.04);
  k.fill(halo, [], [G(torus(0.32, 0.03, 28), [0, 0, 0], [HALF, 0, 0]), ...orbit(4, 0.32, () => octa(0.06).scale(1, 1.6, 1))]);

  // lengan kanan memegang tongkat bulan sabit, selalu terarah ke depan
  const staff = joint(body, 0.36, 0.56, 0);
  const TOP = -1.18;
  k.fill(
    staff,
    [
      { g: cyl(0.08, 0.13, 0.26, 12), c: ROBE_LO, c2: ROBE, p: [0, -0.13, 0] },
      { g: sph(0.07, 10, 8), c: FACE, p: [0, -0.28, 0] },
      { g: cyl(0.026, 0.032, 1.25, 8), c: GOLD_LO, c2: GOLD, p: [0, -0.5, 0.05] },
      { g: sph(0.05, 8, 6), c: GOLD, p: [0, 0.12, 0.05] },
      { g: torus(0.15, 0.035, 16, Math.PI * 1.4), c: GOLD_LO, c2: GOLD, p: [0, TOP, 0.05], r: [0, 0, -0.63] },
    ],
    [G(sph(0.1, 12, 8), [0, TOP, 0.05]), G(octa(0.06), [0, TOP - 0.24, 0.05], undefined, [1, 1.5, 1]), G(torus(0.21, 0.015, 20), [0, TOP, 0.05], [HALF, 0, 0])],
  );
  staff.rotation.x = -1.15;
  const staffArm: Arm = { shoulder: staff, phase: 0, rest: -1.15, swing: 0.12 };

  // lengan kiri: telapak terbuka dengan bola cahaya melayang
  const armL = k.arm(
    body,
    -0.36,
    0.56,
    { phase: Math.PI, rest: -0.35, swing: 0.5, elbowDrop: 0.17, bend: 0.7 },
    [{ g: cyl(0.07, 0.11, 0.2, 12), c: ROBE_LO, c2: ROBE, p: [0, -0.1, 0] }],
    [
      { g: cyl(0.1, 0.14, 0.2, 12), c: ROBE_LO, c2: ROBE, p: [0, -0.08, 0] },
      { g: torus(0.14, 0.02, 14), c: GOLD, r: [HALF, 0, 0], p: [0, -0.18, 0] },
      { g: sph(0.065, 10, 8), c: FACE, p: [0, -0.22, 0] },
    ],
    [G(sph(0.09, 12, 8), [0, -0.38, 0.03])],
  );

  return {
    group: g,
    height: 2.3,
    rig: newRig({ body, head, legs, arms: [armL, staffArm], aimArm: staffArm, spin: [halo], stride: 2.9, legSwing: 0.45, kneeBend: 0.5, lean: 0.05, bounce: 0.06, castLift: 0.06, waddle: 0.06, headTilt: 0.08 }),
  };
}

// ---------------------------------------------------------------- Ember Lancer
// Ksatria cilik berhelm merah dengan jambul api, perisai bundar, dan tombak; rambut jingga mengintip.

function emberLancer(mats: HeroMats): HeroModel {
  const g = new THREE.Group();
  const k = new Kit('ember', mats);
  const RED = 0xe24a3a;
  const RED_LO = 0x8e2420;
  const IRON = 0x4a4250;
  const IRON_LO = 0x272230;
  const BRASS = 0xf2bb55;
  const BRASS_LO = 0xa8742a;
  const FLAME = 0xff8f3c;
  const FLAME_LO = 0xc8401c;
  const FLAME_HI = 0xffd25a;
  const CAPE = 0xb8301e;
  const CAPE_LO = 0x6a1a12;
  const CAPE_HI = 0xff6a2a;
  const STEEL = 0xe2e5ee;
  const WOOD = 0x7a4a2e;
  const SKIN = 0xf7c6a4;
  const HAIR = 0xff7a2a;
  const HIP = 0.42;

  const legs = [-1, 1].map((s) =>
    k.leg(
      g,
      s * 0.18,
      HIP,
      0.18,
      s < 0 ? 0 : Math.PI,
      [{ g: cap(0.12, 0.06), c: IRON_LO, c2: IRON, p: [0, -0.08, 0] }],
      [
        { g: rbox(0.26, 0.24, 0.34, 0.1), c: RED_LO, c2: RED, p: [0, -0.1, 0.03] },
        { g: sph(0.075, 10, 8), c: BRASS_LO, c2: BRASS, p: [0, 0.0, 0.09] },
        { g: rbox(0.28, 0.07, 0.36, 0.03), c: IRON_LO, c2: IRON, p: [0, -0.205, 0.04] },
      ],
      [G(box(0.04, 0.1, 0.03), [0, -0.09, 0.2])],
    ),
  );

  const body = bodyJoint(g, HIP);
  const torso: Part[] = [
    { g: sph(0.36, 16, 12), c: RED_LO, c2: RED, s: [1.05, 1.05, 0.95], p: [0, 0.38, 0] },
    { g: torus(0.33, 0.05, 20), c: BRASS_LO, c2: BRASS, r: [HALF, 0, 0], s: [1.04, 0.95, 1], p: [0, 0.14, 0] },
    { g: rbox(0.14, 0.1, 0.06, 0.03), c: BRASS, p: [0, 0.14, 0.33] },
    // kain depan warna api yang menggantung dari sabuk
    { g: box(0.2, 0.26, 0.035), c: FLAME_LO, c2: FLAME, p: [0, -0.04, 0.29], r: [-0.18, 0, 0] },
    { g: torus(0.2, 0.06, 16), c: IRON_LO, c2: IRON, r: [HALF, 0, 0], p: [0, 0.74, 0] },
    // pengait jubah di punggung
    { g: rbox(0.46, 0.07, 0.08, 0.03), c: BRASS_LO, c2: BRASS, p: [0, 0.68, -0.28] },
  ];
  const torsoGlow: THREE.BufferGeometry[] = [G(octa(0.09), [0, 0.44, 0.35], undefined, [1, 1.35, 0.6]), G(box(0.07, 0.05, 0.04), [0, 0.14, 0.36])];
  for (const s of [-1, 1]) {
    // bantalan bahu bulat bertepi kuningan
    torso.push({ g: sph(0.17, 14, 10), c: RED_LO, c2: RED, s: [1.1, 0.8, 1.05], p: [s * 0.38, 0.64, 0] });
    torso.push({ g: torus(0.17, 0.03, 16), c: BRASS, r: [HALF, 0, 0], s: [1.1, 1.05, 1], p: [s * 0.38, 0.58, 0] });
    torsoGlow.push(G(sph(0.04, 8, 6), [s * 0.56, 0.62, 0]));
  }
  k.fill(body, torso, torsoGlow);

  // kepala: wajah ceria di dalam helm merah bulat, sirip kuningan di atasnya
  const head = joint(body, 0, 0.78, 0);
  const C: V3 = [0, 0.5, 0.02];
  const A = 0.47;
  const R: V3 = [A, A, A];
  const HB = 0.55;
  const BACK = 0.15;
  const hole = faceOpening(A, HB, BACK);
  const hc: V3 = [0, C[1], C[2] - BACK];
  const headParts: Part[] = [
    { g: sph(A, 20, 16), c: SKIN, p: C },
    { g: sph(HB, 20, 16), c: RED_LO, c2: RED, p: hc },
    { g: torus(hole.r, 0.045, 28), c: BRASS_LO, c2: BRASS, p: [0, C[1], C[2] + hole.z] },
    { g: rbox(0.07, 0.2, 0.5, 0.03), c: BRASS_LO, c2: BRASS, p: [0, C[1] + 0.5, -0.12] },
    // pelindung pipi bulat
    { g: sph(0.12, 10, 8), c: RED_LO, c2: RED, s: [0.6, 1, 1], p: [0.47, C[1] - 0.12, 0.08] },
    { g: sph(0.12, 10, 8), c: RED_LO, c2: RED, s: [0.6, 1, 1], p: [-0.47, C[1] - 0.12, 0.08] },
    ...eyes({ c: C, R, yaw: 0.36, pitch: -0.06, size: 0.12, iris: 0xff8a1e, dark: 0x3a1408, brow: 0xb8401a, browTilt: 0.3 }),
    ...blush(C, R, 0.64, -0.3, 0.075),
    ...smile(C, R, -0.37, 0.055, 0x5a1a1a, true),
  ];
  // poni jingga yang mengintip dari bawah tepi helm
  headParts.push(...fringe(C, A, 0xe0561a, HAIR, 0.55, 0.72, 4));
  k.fill(head, headParts);

  const sway: THREE.Object3D[] = [];
  // jambul api tiga ruas: naik dari puncak helm lalu melengkung ke belakang, ujungnya menyala
  const PL: V3 = [0.7, 0.75, 0.75];
  const plume1 = k.flap(sway, head, [0, C[1] + 0.58, -0.02], 1.05, -0.4, [
    { g: cyl(0.17, 0.09, 0.4, 10), c: FLAME_LO, c2: FLAME, s: PL, r: [-HALF, 0, 0], p: [0, 0, -0.13] },
    { g: cone(0.08, 0.36, 6), c: FLAME, c2: FLAME_HI, s: PL, r: [-0.6, 0, 0], p: [0, 0.18, -0.15] },
  ]);
  const plume2 = k.flap(sway, plume1, [0, 0, -0.27], -0.55, -0.05, [
    { g: sph(0.17, 10, 8), c: FLAME_LO, c2: FLAME, s: PL },
    { g: cyl(0.1, 0.17, 0.36, 10), c: FLAME_LO, c2: FLAME_HI, s: PL, r: [-HALF, 0, 0], p: [0, 0, -0.13] },
    { g: cone(0.07, 0.32, 6), c: FLAME, c2: FLAME_HI, s: PL, r: [-0.6, 0, 0], p: [0, 0.16, -0.09] },
  ]);
  k.flap(sway, plume2, [0, 0, -0.26], -0.5, -0.05, [], [G(sph(0.1, 8, 6), [0, 0, 0], undefined, PL), G(cone(0.1, 0.44, 8), [0, 0, -0.16], [-HALF, 0, 0], PL)]);
  // jubah pendek belah dua: tiap ekor dua ruas, makin terang ke bawah, tepinya menyala
  for (const s of [-1, 1]) {
    const tail = k.flap(sway, body, [s * 0.12, 0.68, -0.3], -1.3, 0.45, [{ g: box(0.22, 0.04, 0.36).translate(0, 0, -0.18), c: CAPE_LO, c2: CAPE }]);
    k.flap(sway, tail, [0, 0, -0.36], 0.18, 0.1, [{ g: box(0.2, 0.035, 0.28).translate(0, 0, -0.14), c: FLAME_LO, c2: CAPE_HI }], [G(box(0.2, 0.04, 0.05), [0, 0, -0.28])]);
  }

  // lengan kiri (sisi -X) memegang tombak mendatar; lengan inilah yang mengayun saat menyerang
  const SY = -0.2;
  const TIP = 0.82; // pangkal mata tombak, diukur dari genggaman
  const spearArm = k.arm(
    body,
    -0.42,
    0.6,
    { phase: Math.PI, rest: 0.25, swing: 0.22, elbowDrop: 0.18, bend: 0.6 },
    [{ g: cap(0.09, 0.06), c: IRON_LO, c2: IRON, p: [0, -0.09, 0] }],
    [
      { g: cap(0.085, 0.04), c: RED_LO, c2: RED, p: [0, -0.06, 0] },
      { g: sph(0.095, 12, 8), c: BRASS_LO, c2: BRASS, p: [0, SY, 0] },
      // gagang, pangkal, cincin pengikat, sayap, dan mata tombak berbentuk daun
      { g: cyl(0.026, 0.026, TIP + 0.55, 6), c: WOOD, r: [HALF, 0, 0], p: [0, SY, (TIP - 0.55) / 2] },
      { g: sph(0.045, 8, 6), c: BRASS, p: [0, SY, -0.56] },
      { g: cyl(0.045, 0.045, 0.1, 8), c: BRASS, r: [HALF, 0, 0], p: [0, SY, TIP - 0.05] },
      { g: box(0.035, 0.24, 0.045), c: BRASS_LO, c2: BRASS, p: [0, SY, TIP - 0.12] },
      { g: cone(0.11, 0.13, 4), c: STEEL, s: [0.5, 1, 1], r: [-HALF, 0, 0], p: [0, SY, TIP + 0.06] },
      { g: cone(0.11, 0.44, 4), c: STEEL, s: [0.5, 1, 1], r: [HALF, 0, 0], p: [0, SY, TIP + 0.34] },
    ],
    // rusuk bara di mata tombak, dan gelang bara di bawah sayapnya
    [G(cone(0.04, 0.4, 4), [0, SY, TIP + 0.35], [HALF, 0, 0], [1.6, 1, 1]), G(cyl(0.038, 0.038, 0.09, 8), [0, SY, TIP - 0.25], [HALF, 0, 0])],
  );

  // lengan kanan (sisi +X): perisai bundar dengan lambang api di sisi luar lengan bawah
  const shieldArm = k.arm(
    body,
    0.42,
    0.6,
    { phase: 0, rest: 0.1, swing: 0.45, elbowDrop: 0.18, bend: 0.75 },
    [{ g: cap(0.09, 0.06), c: IRON_LO, c2: IRON, p: [0, -0.09, 0] }],
    [
      { g: cap(0.085, 0.04), c: RED_LO, c2: RED, p: [0, -0.06, 0] },
      { g: sph(0.09, 12, 8), c: BRASS_LO, c2: BRASS, p: [0, -0.2, 0] },
      { g: cyl(0.3, 0.3, 0.06, 22), c: RED_LO, c2: RED, r: [0, -0.5, -HALF], p: [0.13, -0.13, 0.05] },
      { g: torus(0.3, 0.035, 24), c: BRASS_LO, c2: BRASS, r: [0, 1.07, 0], p: [0.15, -0.13, 0.06] },
      { g: sph(0.1, 10, 8), c: BRASS_LO, c2: BRASS, s: [0.55, 1, 1], r: [0, -0.5, 0], p: [0.17, -0.13, 0.08] },
    ],
    [G(torus(0.18, 0.022, 20), [0.165, -0.13, 0.07], [0, 1.07, 0])],
  );

  return {
    group: g,
    height: 2.4,
    rig: newRig({ body, head, legs, arms: [spearArm, shieldArm], strikeArm: spearArm, sway, stride: 2.7, legSwing: 0.65, kneeBend: 0.8, lean: 0.12, lunge: 0.25, bounce: 0.06, castLift: 0.06, waddle: 0.07, headTilt: 0.06 }),
  };
}

// ----------------------------------------------------------------- Gale Archer
// Pemanah hutan cilik: tudung giok berujung daun, jambul bulu, syal gading, tabung panah, busur.

function galeArcher(mats: HeroMats): HeroModel {
  const g = new THREE.Group();
  const k = new Kit('gale', mats);
  const JADE = 0x34bc96;
  const JADE_LO = 0x167a62;
  const LIME = 0xb4f25c;
  const LIME_LO = 0x6aa82a;
  const DEEP = 0x22585a;
  const DEEP_LO = 0x123536;
  const IVORY = 0xfaf5e4;
  const IVORY_LO = 0xc8bfa2;
  const LEATHER = 0x8a5e3a;
  const LEATHER_LO = 0x4a3220;
  const SKIN = 0xf7c6a4;
  const HAIR = 0x6a4428;
  const HIP = 0.42;

  const legs = [-1, 1].map((s) =>
    k.leg(
      g,
      s * 0.16,
      HIP,
      0.18,
      s < 0 ? 0 : Math.PI,
      [{ g: cap(0.11, 0.06), c: DEEP_LO, c2: DEEP, p: [0, -0.08, 0] }],
      [
        // sepatu bot kulit berlipatan gading dengan ujung lancip
        { g: rbox(0.22, 0.24, 0.3, 0.1), c: LEATHER_LO, c2: LEATHER, p: [0, -0.1, 0.02] },
        { g: cyl(0.125, 0.12, 0.06, 12), c: IVORY_LO, c2: IVORY, p: [0, 0.0, 0] },
        { g: cone(0.07, 0.14, 6), c: LEATHER, r: [HALF, 0, 0], p: [0, -0.17, 0.2] },
      ],
      [G(octa(0.035), [0, 0.0, 0.13], undefined, [1, 1.3, 0.6])],
    ),
  );

  const body = bodyJoint(g, HIP);
  const torso: Part[] = [
    { g: sph(0.33, 16, 12), c: JADE_LO, c2: JADE, s: [1, 1.08, 0.92], p: [0, 0.36, 0] },
    { g: cone(0.4, 0.3, 14), c: JADE_LO, c2: JADE, p: [0, 0.02, 0] },
    { g: torus(0.31, 0.04, 20), c: LEATHER_LO, c2: LEATHER, r: [HALF, 0, 0], s: [1, 0.95, 1], p: [0, 0.15, 0] },
    { g: torus(0.2, 0.07, 16), c: IVORY_LO, c2: IVORY, r: [HALF, 0, 0], p: [0, 0.72, 0] },
    // tali tabung panah yang melintang di dada
    { g: box(0.06, 0.6, 0.035), c: LEATHER_LO, c2: LEATHER, p: [0.02, 0.42, 0.3], r: [-0.12, 0, -0.62] },
    // tabung panah di punggung, miring ke bahu tangan penarik
    { g: cyl(0.1, 0.08, 0.5, 10), c: LEATHER_LO, c2: LEATHER, p: [0.1, 0.48, -0.33], r: [0, 0, -0.4] },
    { g: cyl(0.112, 0.112, 0.05, 10), c: IVORY_LO, c2: IVORY, p: [0.2, 0.71, -0.33], r: [0, 0, -0.4] },
    { g: rbox(0.12, 0.14, 0.1, 0.03), c: LEATHER_LO, c2: LEATHER, p: [0.27, 0.06, 0.08] },
  ];
  const torsoGlow: THREE.BufferGeometry[] = [G(octa(0.06), [0, 0.15, 0.3], undefined, [1, 1.3, 0.6])];
  // anak panah di tabung: batang gading, bulu ekornya menyala
  for (const [dx, dz, up] of [
    [-0.03, -0.03, 0.14],
    [0.04, 0.03, 0.2],
    [0.01, -0.01, 0.08],
  ]) {
    const x = 0.21 + dx + up * 0.39;
    const y = 0.73 + up * 0.92;
    torso.push({ g: cyl(0.012, 0.012, 0.22, 5), c: IVORY, p: [x - 0.04, y - 0.1, -0.33 + dz], r: [0, 0, -0.4] });
    torsoGlow.push(G(box(0.06, 0.09, 0.012), [x, y, -0.33 + dz], [0, 0, -0.4]), G(box(0.012, 0.09, 0.06), [x, y, -0.33 + dz], [0, 0, -0.4]));
  }
  // mantel daun berlapis di bahu lengan busur
  for (let i = 0; i < 3; i++) {
    torso.push({
      g: cone(0.13, 0.34 - i * 0.04, 6),
      c: i === 1 ? LIME_LO : JADE_LO,
      c2: i === 1 ? LIME : JADE,
      s: [0.35, 1, 1],
      p: [-0.34 - i * 0.03, 0.62 - i * 0.06, -0.02 + (i - 1) * 0.04],
      r: [0, 0, 2.2 + i * 0.3],
    });
  }
  k.fill(body, torso, torsoGlow);

  // kepala: wajah di dalam tudung giok berujung daun, poni cokelat, dua daun di sisi tudung
  const head = joint(body, 0, 0.76, 0);
  const C: V3 = [0, 0.48, 0.02];
  const A = 0.47;
  const R: V3 = [A, A, A];
  const HB = 0.55;
  const BACK = 0.15;
  const hole = faceOpening(A, HB, BACK);
  const hc: V3 = [0, C[1], C[2] - BACK];
  const headParts: Part[] = [
    { g: sph(A, 20, 16), c: SKIN, p: C },
    { g: sph(HB, 20, 16), c: JADE_LO, c2: JADE, p: hc },
    { g: torus(hole.r, 0.04, 28), c: IVORY_LO, c2: IVORY, p: [0, C[1], C[2] + hole.z] },
    { g: cone(0.17, 0.42, 10), c: JADE_LO, c2: JADE, p: [0, C[1] + 0.46, -0.36], r: [-1.0, 0, 0] },
    ...fringe(C, A, HAIR, 0x8a5a36, 0.55, 0.72, 4),
    ...eyes({ c: C, R, yaw: 0.36, pitch: -0.06, size: 0.12, iris: 0x58d24a, dark: 0x163a2a, lash: 0x3a2a1a }),
    ...blush(C, R, 0.64, -0.3, 0.075),
    ...smile(C, R, -0.38, 0.045),
  ];
  for (const s of [-1, 1]) {
    headParts.push({ g: cone(0.1, 0.36, 6), c: LIME_LO, c2: LIME, s: [1, 1, 0.3], p: [s * 0.56, C[1] + 0.06, -0.1], r: [0.3, s * 0.4, -s * 1.1] });
  }
  k.fill(head, headParts);

  const sway: THREE.Object3D[] = [];
  // jambul tiga bulu di puncak tudung: satu panjang di tengah, dua pendek membuka ke samping
  for (const [s, len, base] of [
    [0, 0.56, 0.62],
    [-1, 0.4, 0.42],
    [1, 0.4, 0.42],
  ]) {
    const f = k.flap(sway, head, [s * 0.06, C[1] + 0.5, -0.12], base, -0.3, [{ g: feather(len, 0.09), c: s === 0 ? IVORY : IVORY_LO }]);
    f.rotation.y = -s * 0.55;
  }
  const scarf = k.flap(sway, body, [-0.1, 0.7, -0.2], -1.05, 0.75, [{ g: box(0.14, 0.035, 0.3).translate(0, 0, -0.15), c: IVORY_LO }]);
  k.flap(sway, scarf, [0, 0, -0.3], 0.3, 0.12, [{ g: feather(0.38, 0.08), c: IVORY_LO }], [G(feather(0.12, 0.035), [0, 0, -0.28])]);

  // lengan busur (sisi -X): selalu terangkat lurus ke depan, sedikit condong ke tengah badan
  const BOW_REST = -1.42;
  const BOW_TILT = 0.2;
  const BOW_BEND = 0.14;
  const sleeve = (): Part[] => [{ g: cap(0.08, 0.06), c: JADE_LO, c2: JADE, p: [0, -0.09, 0] }];
  const bowArm = k.arm(body, -0.38, 0.58, { phase: Math.PI, rest: BOW_REST, swing: 0.1, elbowDrop: 0.18, bend: BOW_BEND }, sleeve(), [
    { g: cap(0.075, 0.04), c: DEEP_LO, c2: DEEP, p: [0, -0.06, 0] },
    { g: rbox(0.12, 0.12, 0.16, 0.04), c: IVORY_LO, c2: IVORY, p: [0, -0.09, 0] },
    { g: sph(0.08, 10, 8), c: LEATHER_LO, c2: LEATHER, p: [0, -0.2, 0] },
  ]);
  bowArm.shoulder.rotation.z = BOW_TILT;

  // Busur di genggaman. Sendinya diputar balik terhadap pose lengan, jadi sumbunya sejajar badan:
  // Y = bentang busur, Z = arah anak panah (maju). Busur lalu dimiringkan (BOW_CANT) supaya
  // lengkungnya terbaca dari kamera atas. Seluruh busur diperkecil supaya serasi dengan badan mungil.
  const BOW_CANT = 0.75;
  const bow = joint(bowArm.elbow!, 0, -0.2, 0);
  const armPose = new THREE.Matrix4().makeRotationX(BOW_REST).multiply(new THREE.Matrix4().makeRotationZ(BOW_TILT)).multiply(new THREE.Matrix4().makeRotationX(-BOW_BEND));
  bow.quaternion.setFromRotationMatrix(armPose.invert().multiply(new THREE.Matrix4().makeRotationZ(BOW_CANT)));
  bow.scale.setScalar(0.72);
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
    G(octa(0.065), [0, -0.1, 0.08], undefined, [1, 1.4, 0.7]),
    G(cone(0.055, 0.2, 4), [0, ARROW_Y, STRING_Z + ARROW_LEN + 0.08], [HALF, 0, 0]),
    G(box(0.09, 0.016, 0.13), [0, ARROW_Y, STRING_Z + 0.1]),
    G(box(0.016, 0.09, 0.13), [0, ARROW_Y, STRING_Z + 0.1]),
  ];
  for (const s of [-1, 1]) {
    // bilah busur tiga ruas: melengkung ke arah pemanah, lalu ujungnya membalik ke depan (ujung berbentuk daun)
    bowParts.push(
      { g: rbox(0.085, 0.35, 0.11, 0.03), c: IVORY_LO, c2: IVORY, p: [0, s * 0.275, -0.04], r: [-s * 0.24, 0, 0] },
      { g: rbox(0.075, 0.34, 0.09, 0.03), c: IVORY_LO, c2: IVORY, p: [0, s * 0.576, -0.174], r: [-s * 0.6, 0, 0] },
      { g: cone(0.07, 0.24, 6), c: LIME_LO, c2: LIME, s: [0.5, 1, 1], p: [0, s * 0.8, -0.23], r: [s > 0 ? 0.5 : Math.PI - 0.5, 0, 0] },
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
  k.flap(sway, bow, [0, -0.8, -0.2], -1.2, 0.55, [{ g: feather(0.42, 0.06), c: IVORY }], [G(feather(0.14, 0.035), [0, 0, -0.32])]);

  // lengan penarik (sisi +X): santai di samping badan, berayun saat berlari
  const drawArm = k.arm(body, 0.38, 0.58, { phase: 0, rest: 0.12, swing: 0.75, elbowDrop: 0.18, bend: 0.45 }, sleeve(), [
    { g: cap(0.075, 0.04), c: DEEP_LO, c2: DEEP, p: [0, -0.06, 0] },
    { g: cyl(0.085, 0.08, 0.06, 12), c: IVORY, p: [0, -0.1, 0] },
    { g: sph(0.08, 10, 8), c: LEATHER_LO, c2: LEATHER, p: [0, -0.2, 0] },
  ]);

  return {
    group: g,
    height: 2.3,
    rig: newRig({ body, head, legs, arms: [bowArm, drawArm], aimArm: bowArm, sway, spin: [swirl], stride: 2.8, legSwing: 0.75, kneeBend: 0.9, lean: 0.15, bounce: 0.06, castLift: 0.06, waddle: 0.06, headTilt: 0.07 }),
  };
}

/**
 * Skala akhir semua hero: model chibi dirancang sedikit lebih kecil, lalu diperbesar seragam supaya
 * tetap mudah dikenali dari kamera atas (tinggi untuk HP bar ikut diskalakan).
 */
const HERO_SCALE = 1.12;
const scaled =
  (fn: (mats: HeroMats) => HeroModel) =>
  (mats: HeroMats): HeroModel => {
    const out = fn(mats);
    out.group.scale.setScalar(HERO_SCALE);
    return { ...out, height: out.height * HERO_SCALE };
  };

export const HERO_MODELS: Record<string, { look: HeroLook; build: (mats: HeroMats) => HeroModel }> = {
  gale_archer: { look: { metal: 0.06, rough: 0.6, glow: 0xb4f25c, glowLum: 1.0 }, build: scaled(galeArcher) },
  ember_lancer: { look: { metal: 0.22, rough: 0.48, glow: 0xff641f, glowLum: 0.9 }, build: scaled(emberLancer) },
  lumen_sage: { look: { metal: 0.08, rough: 0.58, glow: 0x7dffb0, glowLum: 1.0 }, build: scaled(lumenSage) },
  volt_titan: { look: { metal: 0.3, rough: 0.4, glow: 0xffc21e, glowLum: 0.95 }, build: scaled(voltTitan) },
  nova_striker: { look: { metal: 0.16, rough: 0.42, glow: 0x25d8ff, glowLum: 1.05 }, build: scaled(novaStriker) },
  shadow_fang: { look: { metal: 0.08, rough: 0.66, glow: 0xdd3cf5, glowLum: 0.9 }, build: scaled(shadowFang) },
};

/** Model cadangan untuk hero yang belum punya builder sendiri. */
export const FALLBACK_HERO: { look: HeroLook; build: (mats: HeroMats) => HeroModel } = {
  look: { metal: 0.2, rough: 0.6, glow: 0xffffff, glowLum: 1 },
  build(mats) {
    const g = new THREE.Group();
    const k = new Kit('fallback', mats);
    const SKIN = 0x9aa4b8;
    const legs = [-1, 1].map((s) => k.leg(g, s * 0.17, 0.42, 0.18, s < 0 ? 0 : Math.PI, [{ g: cap(0.11, 0.06), c: SKIN, p: [0, -0.08, 0] }], [{ g: cap(0.1, 0.06), c: SKIN, p: [0, -0.1, 0] }]));
    const body = bodyJoint(g, 0.42);
    const C: V3 = [0, 1.24, 0];
    const R: V3 = [0.48, 0.48, 0.48];
    k.fill(body, [{ g: sph(0.34), c: SKIN, p: [0, 0.36, 0] }, { g: sph(0.48, 18, 14), c: SKIN, p: C }, ...eyes({ c: C, R, yaw: 0.36, pitch: -0.06, size: 0.12, iris: 0x8090b0 })]);
    return { group: g, height: 2.2, rig: newRig({ body, legs, stride: 2.8, bounce: 0.1 }) };
  },
};
