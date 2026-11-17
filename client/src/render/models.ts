// Model untuk semua jenis entity (minion, tower, core, monster, hero), masing-masing dengan rig.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EntityStatic } from '../../../shared/src';
import { fallbackHero, HERO_MODELS, type MatOpts } from './heroModels';
import { joint, newRig, type Arm, type Leg, type Rig } from './rig';

export const TEAM_COLOR = [0x3b82f6, 0xef4444, 0xc9a646];

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material>();

function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
}

function mat(key: string, make: () => THREE.Material): THREE.Material {
  let m = matCache.get(key);
  if (!m) matCache.set(key, (m = make()));
  return m;
}

/** Material bersama untuk geometri gabungan berwarna per-vertex. */
const vcMat = () => mat('vc', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.25 }));
const vcFlat = () =>
  mat('vcFlat', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.05, flatShading: true }));
const glowMat = (team: number) =>
  mat(`glow${team}`, () => {
    const c = TEAM_COLOR[team];
    return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.5, roughness: 0.4 });
  });

interface Part {
  g: THREE.BufferGeometry;
  c: number;
  p?: [number, number, number];
  r?: [number, number, number];
  s?: [number, number, number];
}

/**
 * Gabungkan beberapa bentuk primitif menjadi satu geometri berwarna per-vertex (satu draw call).
 * Hasilnya di-cache dengan `key`, jadi ratusan minion berbagi geometri yang sama.
 */
function merged(key: string, parts: () => Part[]): THREE.BufferGeometry {
  return geo(key, () => {
    const color = new THREE.Color();
    const m4 = new THREE.Matrix4();
    const list = parts().map(({ g, c, p, r, s }) => {
      const out = g.index ? g.toNonIndexed() : g.clone();
      g.dispose();
      if (s) out.scale(s[0], s[1], s[2]);
      if (r) out.applyMatrix4(m4.makeRotationFromEuler(new THREE.Euler(r[0], r[1], r[2])));
      if (p) out.translate(p[0], p[1], p[2]);
      color.setHex(c);
      const n = out.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set([color.r, color.g, color.b], i * 3);
      out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return out;
    });
    const result = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (!result) throw new Error(`gagal menggabungkan geometri: ${key}`);
    return result;
  });
}

/** Gabungkan geometri sejenis (satu material) menjadi satu draw call. */
function union(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const result = mergeGeometries(list, false);
  list.forEach((g) => g.dispose());
  if (!result) throw new Error('gagal menggabungkan geometri');
  return result;
}

/** `count` salinan geometri yang disusun melingkar pada radius `r`. */
function orbit(count: number, r: number, make: () => THREE.BufferGeometry): THREE.BufferGeometry[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return make().rotateY(-a).translate(Math.cos(a) * r, 0, Math.sin(a) * r);
  });
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r: number, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
const cone = (r: number, h: number, seg = 6) => new THREE.ConeGeometry(r, h, seg);

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const out = new THREE.Mesh(g, m);
  out.position.set(x, y, z);
  out.castShadow = true;
  return out;
}

export interface Built {
  model: THREE.Group;
  height: number;
  /** Material milik entity ini sendiri (bukan cache), boleh diubah/di-dispose. */
  mats: THREE.MeshStandardMaterial[];
  rig: Rig;
}

const METAL = 0xb8c0d0;
const DARK = 0x2a3142;
const GLOW = 0xffe27a;
const STONE = 0x8a93a6;
const STONE_DARK = 0x626b7d;

// ---------------------------------------------------------------------- minion

function buildMinion(model: THREE.Group, team: number, ranged: boolean): Rig {
  const tc = TEAM_COLOR[team];
  const HIP = 0.5;
  const legGeo = merged('minionLeg', () => [
    { g: box(0.16, 0.4, 0.18), c: DARK, p: [0, -0.2, 0] },
    { g: box(0.2, 0.1, 0.3), c: METAL, p: [0, -0.45, 0.05] },
  ]);
  const legs: Leg[] = [-1, 1].map((s) => {
    const hip = joint(model, s * 0.16, HIP, 0);
    hip.add(mesh(legGeo, vcMat()));
    return { hip, phase: s < 0 ? 0 : Math.PI };
  });

  const body = joint(model, 0, HIP, 0);
  body.userData.baseY = HIP;
  let armGeo: THREE.BufferGeometry;
  if (ranged) {
    body.add(
      mesh(
        merged(`minionR${team}`, () => [
          { g: box(0.42, 0.14, 0.34), c: DARK, p: [0, 0.02, 0] },
          { g: cyl(0.26, 0.32, 0.5), c: tc, p: [0, 0.32, 0] },
          { g: cyl(0.3, 0.3, 0.08), c: METAL, p: [0, 0.58, 0] },
          { g: sph(0.2), c: METAL, p: [0, 0.78, 0] },
          { g: sph(0.07, 6, 6), c: GLOW, p: [0, 0.8, 0.17] },
          { g: cyl(0.02, 0.02, 0.34, 5), c: DARK, p: [0.1, 1.06, 0] },
          { g: sph(0.05, 6, 6), c: GLOW, p: [0.1, 1.25, 0] },
          { g: box(0.3, 0.3, 0.14), c: DARK, p: [0, 0.34, -0.28] },
          { g: box(0.1, 0.36, 0.12), c: DARK, p: [-0.34, 0.3, 0.02] },
        ]),
        vcMat(),
      ),
    );
    armGeo = merged(`minionRArm${team}`, () => [
      { g: box(0.1, 0.3, 0.12), c: DARK, p: [0, -0.15, 0] },
      { g: cyl(0.08, 0.1, 0.5), c: METAL, p: [0, -0.5, 0] },
      { g: sph(0.07, 6, 6), c: tc, p: [0, -0.78, 0] },
    ]);
  } else {
    body.add(
      mesh(
        merged(`minionM${team}`, () => [
          { g: box(0.46, 0.14, 0.36), c: DARK, p: [0, 0.02, 0] },
          { g: box(0.62, 0.5, 0.44), c: tc, p: [0, 0.32, 0] },
          { g: box(0.4, 0.22, 0.06), c: METAL, p: [0, 0.38, 0.24] },
          { g: sph(0.22), c: METAL, p: [0, 0.78, 0] },
          { g: box(0.3, 0.08, 0.1), c: GLOW, p: [0, 0.8, 0.17] },
          { g: box(0.08, 0.14, 0.34), c: tc, p: [0, 0.98, 0] },
          { g: box(0.36, 0.32, 0.16), c: DARK, p: [0, 0.34, -0.3] },
          // lengan kiri + perisai (statis)
          { g: box(0.12, 0.38, 0.14), c: DARK, p: [-0.4, 0.3, 0.05] },
          { g: box(0.08, 0.46, 0.4), c: tc, p: [-0.5, 0.3, 0.14] },
        ]),
        vcMat(),
      ),
    );
    armGeo = merged('minionMArm', () => [
      { g: box(0.12, 0.38, 0.14), c: DARK, p: [0, -0.19, 0] },
      { g: box(0.06, 0.12, 0.62), c: METAL, p: [0, -0.36, 0.32] },
    ]);
  }
  const shoulder = joint(body, 0.4, 0.5, 0);
  shoulder.add(mesh(armGeo, vcMat()));
  const arm: Arm = { shoulder, phase: 0, rest: ranged ? -1.4 : -0.3, swing: ranged ? 0.1 : 0.7 };
  shoulder.rotation.x = arm.rest;

  return newRig({
    body,
    legs,
    arms: [arm],
    strikeArm: ranged ? undefined : arm,
    aimArm: ranged ? arm : undefined,
    stride: 2.6,
    legSwing: 0.8,
    lean: 0.08,
  });
}

// --------------------------------------------------------------------- monster

/** Kadal berkaki empat. */
function buildLizard(model: THREE.Group): Rig {
  const HIDE = 0x5b8c3a;
  const HIDE_DARK = 0x3f6a2c;
  const g = new THREE.Group();
  g.scale.setScalar(1.15);
  model.add(g);
  g.add(
    mesh(
      merged('lizardBody', () => [
        { g: sph(0.75), c: HIDE, s: [0.8, 0.62, 1.25], p: [0, 0.62, 0] },
        { g: sph(0.38), c: HIDE, p: [0, 0.82, 0.95] },
        { g: box(0.3, 0.2, 0.42), c: HIDE_DARK, p: [0, 0.74, 1.26] },
        { g: sph(0.08, 6, 6), c: GLOW, p: [0.2, 0.96, 1.12] },
        { g: sph(0.08, 6, 6), c: GLOW, p: [-0.2, 0.96, 1.12] },
        ...[0, 1, 2, 3].map((i): Part => ({ g: cone(0.14, 0.42, 5), c: HIDE_DARK, p: [0, 1.14 - i * 0.03, 0.55 - i * 0.4] })),
      ]),
      vcFlat(),
    ),
  );
  const legGeo = merged('lizardLeg', () => [
    { g: box(0.2, 0.45, 0.22), c: HIDE_DARK, p: [0, -0.22, 0] },
    { g: box(0.26, 0.08, 0.34), c: HIDE, p: [0, -0.42, 0.06] },
  ]);
  const legs: Leg[] = [];
  [
    [-0.5, 0.5, 0],
    [0.5, 0.5, Math.PI],
    [-0.5, -0.5, Math.PI],
    [0.5, -0.5, 0],
  ].forEach(([x, z, phase]) => {
    const hip = joint(g, x, 0.45, z);
    hip.add(mesh(legGeo, vcFlat()));
    legs.push({ hip, phase });
  });
  const tail = joint(g, 0, 0.62, -0.85);
  tail.add(
    mesh(
      merged('lizardTail', () => [{ g: cone(0.22, 1.1, 6), c: HIDE_DARK, r: [-Math.PI / 2, 0, 0], p: [0, 0, -0.55] }]),
      vcFlat(),
    ),
  );
  return newRig({ legs, sway: [tail], stride: 2.4, legSwing: 0.7, lean: 0, lunge: 0.5 });
}

/** Golem batu berkaki dua. */
function buildGolem(model: THREE.Group): Rig {
  const ROCK = 0x7a6a55;
  const ROCK_DARK = 0x54483a;
  const MOSS = 0x4f7a3a;
  const HIP = 1.0;
  const legGeo = merged('golemLeg', () => [
    { g: box(0.5, 1.0, 0.55), c: ROCK_DARK, p: [0, -0.5, 0] },
    { g: box(0.6, 0.18, 0.8), c: ROCK, p: [0, -0.91, 0.1] },
  ]);
  const legs: Leg[] = [-1, 1].map((s) => {
    const hip = joint(model, s * 0.42, HIP, 0);
    hip.add(mesh(legGeo, vcFlat()));
    return { hip, phase: s < 0 ? 0 : Math.PI };
  });
  const body = joint(model, 0, HIP, 0);
  body.userData.baseY = HIP;
  body.add(
    mesh(
      merged('golemBody', () => [
        { g: box(1.1, 0.5, 0.85), c: ROCK_DARK, p: [0, 0.12, 0] },
        { g: box(1.5, 1.2, 1.0), c: ROCK, p: [0, 0.82, 0] },
        { g: box(0.6, 0.5, 0.6), c: ROCK, p: [0, 1.62, 0.1] },
        { g: box(0.36, 0.1, 0.06), c: GLOW, p: [0, 1.65, 0.42] },
        { g: box(0.6, 0.14, 0.7), c: MOSS, p: [-0.5, 1.46, 0] },
        { g: box(0.5, 0.14, 0.6), c: MOSS, p: [0.55, 1.46, -0.05] },
        { g: cone(0.2, 0.7, 5), c: GLOW, p: [0.25, 1.6, -0.5], r: [-0.5, 0, 0] },
        { g: cone(0.16, 0.55, 5), c: GLOW, p: [-0.3, 1.5, -0.5], r: [-0.6, 0, 0.3] },
      ]),
      vcFlat(),
    ),
  );
  const armGeo = merged('golemArm', () => [
    { g: box(0.45, 0.8, 0.5), c: ROCK_DARK, p: [0, -0.45, 0] },
    { g: box(0.62, 0.55, 0.62), c: ROCK, p: [0, -1.05, 0] },
  ]);
  const arms: Arm[] = [-1, 1].map((s) => {
    const shoulder = joint(body, s * 1.0, 1.25, 0);
    shoulder.add(mesh(armGeo, vcFlat()));
    return { shoulder, phase: s < 0 ? Math.PI : 0, rest: 0.05, swing: 0.8 };
  });
  return newRig({ body, legs, arms, strikeArm: arms[1], stride: 1.6, legSwing: 0.5, lean: 0.06 });
}

// ------------------------------------------------------------------- bangunan

function buildTower(model: THREE.Group, team: number): Rig {
  model.add(
    mesh(
      merged('towerStone', () => {
        const parts: Part[] = [
          { g: cyl(1.75, 1.95, 0.5), c: STONE_DARK, p: [0, 0.25, 0] },
          { g: cyl(1.4, 1.6, 0.5), c: STONE, p: [0, 0.75, 0] },
          { g: cyl(0.8, 1.15, 3.6), c: STONE, p: [0, 2.8, 0] },
          { g: cyl(1.25, 0.9, 0.5), c: STONE_DARK, p: [0, 4.85, 0] },
        ];
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          parts.push({ g: box(0.26, 2.4, 0.5), c: STONE_DARK, r: [0, -a, 0], p: [Math.cos(a) * 1.02, 2.2, Math.sin(a) * 1.02] });
        }
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          parts.push({ g: box(0.3, 0.36, 0.3), c: STONE, r: [0, -a, 0], p: [Math.cos(a) * 1.08, 5.27, Math.sin(a) * 1.08] });
        }
        return parts;
      }),
      vcMat(),
    ),
  );
  const glow = glowMat(team);
  const ring = (r: number, t: number, y: number) => new THREE.TorusGeometry(r, t, 6, 20).rotateX(Math.PI / 2).translate(0, y, 0);
  model.add(mesh(geo('towerRings', () => union([ring(1.04, 0.07, 1.6), ring(0.88, 0.06, 3.9)])), glow));
  const crystal = mesh(geo('towerCrystal', () => new THREE.OctahedronGeometry(0.85)), glow, 0, 6.5, 0);
  const shards = mesh(geo('towerShards', () => union(orbit(3, 1.3, () => new THREE.OctahedronGeometry(0.2)))), glow, 0, 6.3, 0);
  model.add(crystal, shards);
  return newRig({ spin: [crystal, shards] });
}

function buildCore(model: THREE.Group, team: number): Rig {
  model.add(
    mesh(
      merged('coreStone', () => {
        const parts: Part[] = [
          { g: cyl(2.9, 3.3, 0.6, 12), c: STONE_DARK, p: [0, 0.3, 0] },
          { g: cyl(2.3, 2.6, 0.5, 12), c: STONE, p: [0, 0.85, 0] },
        ];
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          parts.push({ g: box(0.45, 2.4, 0.45), c: STONE, r: [0, -a, 0], p: [Math.cos(a) * 2.25, 2.2, Math.sin(a) * 2.25] });
        }
        return parts;
      }),
      vcMat(),
    ),
  );
  const glow = glowMat(team);
  model.add(mesh(geo('corePylonTips', () => union(orbit(6, 2.25, () => box(0.3, 0.3, 0.3)))), glow, 0, 3.55, 0));
  const crystal = mesh(geo('coreCrystal', () => new THREE.IcosahedronGeometry(1.6)), glow, 0, 3.7, 0);
  // cincin miring yang berputar mengelilingi kristal
  const halo = joint(model, 0, 3.7, 0);
  halo.rotation.x = 0.35;
  const haloRing = mesh(
    geo('coreHalo', () =>
      union([new THREE.TorusGeometry(2.3, 0.08, 6, 32).rotateX(Math.PI / 2), ...orbit(4, 2.3, () => new THREE.SphereGeometry(0.2, 6, 5))]),
    ),
    glow,
  );
  halo.add(haloRing);
  model.add(crystal);
  return newRig({ spin: [crystal, haloRing] });
}

// --------------------------------------------------------------------- builder

export function buildModel(st: EntityStatic): Built {
  const model = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];

  switch (st.kind) {
    case 'hero': {
      const mk = (color: number, o: MatOpts = {}) => {
        const m = new THREE.MeshStandardMaterial({
          color,
          roughness: o.rough ?? 0.6,
          metalness: o.metal ?? 0.2,
          emissive: o.emissive ?? 0x000000,
          emissiveIntensity: o.glow ?? 1,
        });
        mats.push(m);
        return m;
      };
      const hero = (HERO_MODELS[st.sub] ?? fallbackHero)(mk);
      model.add(hero.group);
      return { model, height: hero.height, mats, rig: hero.rig };
    }
    case 'minion':
      return { model, height: 1.7, mats, rig: buildMinion(model, st.team, st.sub === 'ranged') };
    case 'tower':
      return { model, height: 7.6, mats, rig: buildTower(model, st.team) };
    case 'core':
      return { model, height: 6.6, mats, rig: buildCore(model, st.team) };
    case 'monster':
      return st.sub === 'big'
        ? { model, height: 3.4, mats, rig: buildGolem(model) }
        : { model, height: 2.1, mats, rig: buildLizard(model) };
  }
}
