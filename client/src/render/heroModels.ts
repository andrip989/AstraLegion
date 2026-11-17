// Model hero low-poly dari bentuk primitif, lengkap dengan sendi (rig) untuk animasi
// berjalan, menyerang, dan casting. Semua model menghadap +Z.
// Tambah hero baru: daftarkan fungsi builder di HERO_MODELS dengan key = id hero.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { joint, newRig, type Arm, type Leg, type Rig } from './rig';

export interface MatOpts {
  emissive?: number;
  glow?: number;
  metal?: number;
  rough?: number;
}
/** Pembuat material; material dicatat supaya bisa dibuat transparan saat hero invisible. */
export type Mk = (color: number, o?: MatOpts) => THREE.MeshStandardMaterial;

export interface HeroModel {
  group: THREE.Group;
  rig: Rig;
  height: number;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r: number) => new THREE.SphereGeometry(r, 12, 10);
const cone = (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, seg);
const torus = (r: number, t: number) => new THREE.TorusGeometry(r, t, 8, 24);

/** Mesh di posisi tertentu, dengan rotasi opsional. */
function M(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  return mesh;
}

/** Kaki dua ruas: pinggul -> lutut. `thigh` relatif ke pinggul, `shin` relatif ke lutut. */
function leg(
  root: THREE.Object3D,
  x: number,
  hipY: number,
  kneeDrop: number,
  phase: number,
  thigh: THREE.Object3D[],
  shin: THREE.Object3D[],
): Leg {
  const hip = joint(root, x, hipY, 0);
  hip.add(...thigh);
  const knee = joint(hip, 0, -kneeDrop, 0);
  knee.add(...shin);
  return { hip, knee, phase };
}

function arm(
  body: THREE.Object3D,
  x: number,
  y: number,
  phase: number,
  rest: number,
  swing: number,
  parts: THREE.Object3D[],
): Arm {
  const shoulder = joint(body, x, y, 0);
  shoulder.add(...parts);
  shoulder.rotation.x = rest;
  return { shoulder, phase, rest, swing };
}

function bodyJoint(root: THREE.Object3D, y: number): THREE.Group {
  const b = joint(root, 0, y, 0);
  b.userData.baseY = y;
  return b;
}

// ------------------------------------------------------------------ Volt Titan

function voltTitan(mk: Mk): HeroModel {
  const g = new THREE.Group();
  const steel = mk(0x6f83ad, { metal: 0.55, rough: 0.4 });
  const dark = mk(0x3b4763, { metal: 0.5, rough: 0.5 });
  const volt = mk(0xffd23f, { emissive: 0xffb300, glow: 2 });
  const HIP = 1.1;

  const legs = [-1, 1].map((s) =>
    leg(
      g,
      s * 0.38,
      HIP,
      0.55,
      s < 0 ? 0 : Math.PI,
      [M(box(0.46, 0.6, 0.5), dark, 0, -0.28, 0)],
      [
        M(box(0.5, 0.5, 0.56), steel, 0, -0.22, 0),
        M(box(0.3, 0.16, 0.12), volt, 0, -0.02, 0.3),
        M(box(0.56, 0.2, 0.82), dark, 0, -0.45, 0.1),
      ],
    ),
  );

  const body = bodyJoint(g, HIP);
  body.add(
    M(box(1.1, 0.35, 0.8), dark, 0, 0.05, 0),
    M(box(1.2, 0.14, 0.86), volt, 0, 0.24, 0),
    M(box(1.5, 1.15, 0.95), steel, 0, 0.82, 0),
    M(box(1.2, 0.5, 0.12), dark, 0, 0.98, 0.5),
    M(sph(0.26), volt, 0, 0.92, 0.54),
    M(torus(0.36, 0.05), volt, 0, 0.92, 0.52),
    M(box(0.9, 0.12, 0.1), volt, 0, 0.5, 0.49),
  );
  for (const s of [-1, 1]) {
    // generator petir di punggung
    body.add(M(cyl(0.16, 0.16, 0.8), dark, s * 0.36, 0.95, -0.58), M(sph(0.17), volt, s * 0.36, 1.4, -0.58));
    // bahu berduri
    body.add(M(sph(0.52), steel, s * 1.02, 1.28, 0), M(cone(0.13, 0.5, 6), volt, s * 1.16, 1.74, 0, 0, 0, -s * 0.5));
  }
  const head = joint(body, 0, 1.66, 0);
  head.add(
    M(box(0.58, 0.52, 0.58), steel, 0, 0, 0),
    M(box(0.46, 0.13, 0.1), volt, 0, 0.03, 0.28),
    M(box(0.42, 0.14, 0.5), dark, 0, -0.2, 0.03),
    M(box(0.1, 0.3, 0.42), volt, 0, 0.36, -0.04),
  );
  for (const s of [-1, 1]) head.add(M(cone(0.09, 0.5, 6), volt, s * 0.3, 0.42, 0, 0, 0, -s * 0.5));

  const armParts = () => [
    M(box(0.42, 0.62, 0.42), dark, 0, -0.35, 0),
    M(box(0.47, 0.1, 0.47), volt, 0, -0.63, 0),
    M(box(0.58, 0.56, 0.58), steel, 0, -0.96, 0.03),
    M(box(0.5, 0.3, 0.5), dark, 0, -1.32, 0.05),
    M(box(0.42, 0.1, 0.1), volt, 0, -1.32, 0.31),
  ];
  const armL = arm(body, -1.06, 1.22, Math.PI, 0.1, 0.6, armParts());
  const armR = arm(body, 1.06, 1.22, 0, 0.1, 0.6, armParts());

  return {
    group: g,
    height: 3.4,
    rig: newRig({ body, head, legs, arms: [armL, armR], strikeArm: armR, stride: 1.5, legSwing: 0.6, kneeBend: 0.9, lean: 0.08 }),
  };
}

// ---------------------------------------------------------------- Nova Striker

function novaStriker(mk: Mk): HeroModel {
  const g = new THREE.Group();
  const white = mk(0xe8ecf4, { metal: 0.3, rough: 0.4 });
  const grey = mk(0x4a5468, { metal: 0.7, rough: 0.4 });
  const plasma = mk(0x2ee6ff, { emissive: 0x18c8ff, glow: 1.9 });
  const orange = mk(0xff8a3d, { rough: 0.5 });
  const HIP = 0.95;

  const legs = [-1, 1].map((s) =>
    leg(
      g,
      s * 0.2,
      HIP,
      0.48,
      s < 0 ? 0 : Math.PI,
      [M(cyl(0.15, 0.13, 0.5), white, 0, -0.25, 0)],
      [
        M(cyl(0.13, 0.1, 0.45), grey, 0, -0.22, 0),
        M(sph(0.12), orange, 0, 0, 0.04),
        M(box(0.24, 0.14, 0.44), orange, 0, -0.42, 0.06),
        M(sph(0.07), plasma, 0, -0.38, -0.16),
      ],
    ),
  );

  const body = bodyJoint(g, HIP);
  body.add(
    M(box(0.62, 0.2, 0.42), orange, 0, 0.05, 0),
    M(new THREE.CapsuleGeometry(0.36, 0.5, 4, 12), white, 0, 0.58, 0),
    M(box(0.46, 0.12, 0.1), plasma, 0, 0.7, 0.33),
    M(box(0.2, 0.3, 0.08), grey, 0, 0.42, 0.34),
    // jetpack
    M(box(0.52, 0.62, 0.26), grey, 0, 0.62, -0.42),
    M(box(0.3, 0.1, 0.06), plasma, 0, 0.8, -0.56),
  );
  for (const s of [-1, 1]) {
    body.add(
      M(sph(0.21), orange, s * 0.48, 0.88, 0),
      M(cyl(0.1, 0.14, 0.26), grey, s * 0.16, 0.24, -0.44),
      M(sph(0.09), plasma, s * 0.16, 0.1, -0.44),
    );
  }
  // cincin energi berputar di punggung
  const halo = joint(body, 0, 0.78, -0.62);
  halo.add(M(torus(0.5, 0.045), plasma), M(torus(0.32, 0.03), plasma, 0, 0, 0, 0, Math.PI / 2, 0));

  const head = joint(body, 0, 1.22, 0);
  head.add(
    M(sph(0.3), white),
    M(box(0.44, 0.14, 0.22), plasma, 0, 0.02, 0.2),
    M(box(0.5, 0.08, 0.4), orange, 0, 0.2, -0.02),
    M(cyl(0.02, 0.02, 0.32, 6), grey, 0.24, 0.32, -0.05),
    M(sph(0.045), plasma, 0.24, 0.5, -0.05),
  );
  for (const s of [-1, 1]) head.add(M(cyl(0.08, 0.08, 0.1, 8), grey, s * 0.3, 0, 0, 0, 0, Math.PI / 2));

  // lengan kanan = meriam plasma, selalu terangkat membidik
  const cannon = arm(body, 0.5, 0.84, 0, -1.35, 0.12, [
    M(cyl(0.11, 0.1, 0.4), white, 0, -0.2, 0),
    M(cyl(0.18, 0.21, 0.72), grey, 0, -0.66, 0),
    M(torus(0.21, 0.03), plasma, 0, -0.45, 0, Math.PI / 2),
    M(torus(0.22, 0.03), plasma, 0, -0.82, 0, Math.PI / 2),
    M(sph(0.15), plasma, 0, -1.04, 0),
  ]);
  const armL = arm(body, -0.5, 0.84, Math.PI, 0.1, 1, [
    M(cyl(0.1, 0.09, 0.4), white, 0, -0.2, 0),
    M(cyl(0.09, 0.08, 0.36), grey, 0, -0.56, 0),
    M(sph(0.1), orange, 0, -0.78, 0),
  ]);

  return {
    group: g,
    height: 2.8,
    rig: newRig({ body, head, legs, arms: [armL, cannon], aimArm: cannon, spin: [halo], stride: 1.7, lean: 0.12 }),
  };
}

// ----------------------------------------------------------------- Shadow Fang

function shadowFang(mk: Mk): HeroModel {
  const g = new THREE.Group();
  const cloth = mk(0x5a4290, { rough: 0.8 });
  const black = mk(0x2c2140, { rough: 0.7 });
  const neon = mk(0xd946ef, { emissive: 0xc026d3, glow: 1.9 });
  const HIP = 0.95;

  const legs = [-1, 1].map((s) =>
    leg(
      g,
      s * 0.18,
      HIP,
      0.48,
      s < 0 ? 0 : Math.PI,
      [M(cyl(0.14, 0.11, 0.5), black, 0, -0.25, 0)],
      [
        M(cyl(0.11, 0.08, 0.45), cloth, 0, -0.22, 0),
        M(box(0.2, 0.06, 0.2), neon, 0, -0.04, 0),
        M(box(0.18, 0.1, 0.38), black, 0, -0.43, 0.06),
      ],
    ),
  );

  const body = bodyJoint(g, HIP);
  body.add(
    M(cyl(0.26, 0.24, 0.26), black, 0, 0.1, 0),
    M(box(0.52, 0.1, 0.44), neon, 0, 0.22, 0),
    M(cyl(0.38, 0.26, 0.76), cloth, 0, 0.64, 0),
    M(box(0.07, 0.82, 0.06), black, 0, 0.64, 0.33, 0, 0, 0.55),
    M(box(0.07, 0.82, 0.06), black, 0, 0.64, 0.33, 0, 0, -0.55),
    M(sph(0.07), neon, 0, 0.64, 0.36),
  );
  for (const s of [-1, 1]) body.add(M(cone(0.2, 0.36, 6), cloth, s * 0.44, 1.0, 0, 0, 0, -s * 1.2));

  const head = joint(body, 0, 1.22, 0);
  head.add(
    M(sph(0.26), black),
    M(box(0.36, 0.16, 0.14), cloth, 0, -0.07, 0.2),
    M(cone(0.42, 0.68, 10), cloth, 0, 0.22, -0.05, -0.2),
  );
  for (const s of [-1, 1]) head.add(M(sph(0.05), neon, s * 0.1, 0.04, 0.23));

  // dua helai syal yang melambai di belakang
  const scarves = [
    { x: -0.06, len: 0.95, w: 0.18, base: -0.7 },
    { x: 0.1, len: 0.66, w: 0.13, base: -0.95 },
  ].map((sc) => {
    const j = joint(body, sc.x, 1.02, -0.28);
    j.userData.baseX = sc.base;
    j.rotation.x = sc.base;
    j.add(M(box(sc.w, 0.05, sc.len), neon, 0, 0, -sc.len / 2));
    return j;
  });

  const bladeArm = () => [
    M(cyl(0.09, 0.08, 0.4), cloth, 0, -0.2, 0),
    M(cyl(0.08, 0.07, 0.38), black, 0, -0.56, 0),
    M(box(0.18, 0.06, 0.18), neon, 0, -0.4, 0),
    M(box(0.22, 0.06, 0.08), black, 0, -0.78, 0.08),
    M(box(0.05, 0.13, 0.95), neon, 0, -0.8, 0.55),
  ];
  const armL = arm(body, -0.44, 0.92, Math.PI, 0.45, 0.4, bladeArm());
  const armR = arm(body, 0.44, 0.92, 0, 0.45, 0.4, bladeArm());

  return {
    group: g,
    height: 2.8,
    rig: newRig({
      body,
      head,
      legs,
      arms: [armL, armR],
      strikeArm: armR,
      sway: scarves,
      stride: 1.9,
      legSwing: 0.95,
      kneeBend: 1.2,
      lean: 0.28,
    }),
  };
}

/**
 * Gabungkan mesh-mesh statis di dalam tiap sendi menjadi satu mesh per material.
 * Bentuk dan animasinya sama persis, tetapi jumlah draw call per hero turun kira-kira separuh.
 */
function compact(node: THREE.Object3D): void {
  const byMat = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of [...node.children]) {
    if (child instanceof THREE.Mesh) {
      const list = byMat.get(child.material as THREE.Material) ?? [];
      list.push(child);
      byMat.set(child.material as THREE.Material, list);
    } else {
      compact(child);
    }
  }
  for (const [material, list] of byMat) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      m.updateMatrix();
      return m.geometry.clone().applyMatrix4(m.matrix);
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    for (const m of list) {
      m.geometry.dispose();
      node.remove(m);
    }
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    node.add(mesh);
  }
}

const compacted =
  (build: (mk: Mk) => HeroModel) =>
  (mk: Mk): HeroModel => {
    const hero = build(mk);
    compact(hero.group);
    return hero;
  };

export const HERO_MODELS: Record<string, (mk: Mk) => HeroModel> = {
  volt_titan: compacted(voltTitan),
  nova_striker: compacted(novaStriker),
  shadow_fang: compacted(shadowFang),
};

/** Model cadangan untuk hero yang belum punya builder sendiri. */
export function fallbackHero(mk: Mk): HeroModel {
  const g = new THREE.Group();
  const skin = mk(0x9aa4b8);
  const legs = [-1, 1].map((s) =>
    leg(g, s * 0.2, 0.9, 0.45, s < 0 ? 0 : Math.PI, [M(cyl(0.13, 0.11, 0.45), skin, 0, -0.22, 0)], [
      M(cyl(0.11, 0.09, 0.45), skin, 0, -0.22, 0),
    ]),
  );
  const body = bodyJoint(g, 0.9);
  body.add(M(new THREE.CapsuleGeometry(0.4, 0.6, 4, 10), skin, 0, 0.7, 0), M(sph(0.28), skin, 0, 1.45, 0));
  return { group: g, height: 2.6, rig: newRig({ body, legs }) };
}
