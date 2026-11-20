// Model minion (prajurit berperisai & penembak berjubah) dan monster jungle (kadal bersirip
// dan golem batu berlumut). Tiap bagian tubuh adalah satu geometri gabungan berwarna per-vertex.
import * as THREE from 'three';
import { boxUV, build, cached, tint, union, type Part } from './geo';
import { glowMat, hideMat, rockMat, TEAM_COLOR, unitMat } from './palette';
import { joint, newRig, type Arm, type Leg, type Rig } from './rig';

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

const METAL = 0xc3cad8;
const METAL_DARK = 0x6d7586;
const DARK = 0x2b3142;
const GOLD = 0xd6ad4e;
const EYE = 0xfff0a0;
const WOOD = 0x6e4d30;

const shade = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k).getHex();
const tintTo = (hex: number, k: number) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), k).getHex();

// ---------------------------------------------------------------------- minion

export function buildMinion(model: THREE.Group, team: number, ranged: boolean): Rig {
  const tc = TEAM_COLOR[team];
  const tcDark = shade(tc, 0.5);
  const tcLight = tintTo(tc, 0.35);
  const HIP = 0.52;
  const m = unitMat();

  const legGeo = cached('minionLeg', () =>
    build([
      { g: box(0.17, 0.3, 0.2), c: DARK, p: [0, -0.14, 0] },
      { g: box(0.2, 0.1, 0.23), c: METAL, p: [0, -0.27, 0.01] },
      { g: box(0.19, 0.2, 0.22), c: METAL_DARK, p: [0, -0.38, 0] },
      { g: box(0.22, 0.1, 0.36), c: DARK, p: [0, -0.47, 0.06] },
    ]),
  );
  const legs: Leg[] = [-1, 1].map((s) => {
    const hip = joint(model, s * 0.17, HIP, 0);
    hip.add(mesh(legGeo, m));
    return { hip, phase: s < 0 ? 0 : Math.PI };
  });

  const body = joint(model, 0, HIP, 0);
  body.userData.baseY = HIP;
  let armGeo: THREE.BufferGeometry;
  if (ranged) {
    body.add(
      mesh(
        cached(`minionR${team}`, () =>
          build([
            // jubah, selendang bahu, dan tudung
            { g: cyl(0.22, 0.38, 0.44), c: tcDark, c2: tc, p: [0, 0.12, 0] },
            { g: cyl(0.25, 0.23, 0.36), c: tc, c2: tcLight, p: [0, 0.5, 0] },
            { g: cyl(0.26, 0.26, 0.07), c: GOLD, p: [0, 0.33, 0] },
            { g: cone(0.42, 0.3, 8), c: tcDark, p: [0, 0.72, -0.02] },
            { g: sph(0.25), c: tcDark, c2: tc, p: [0, 0.95, -0.02] },
            { g: cone(0.17, 0.36, 6), c: tcDark, p: [0, 1.1, -0.2], r: [-1.0, 0, 0] },
            { g: sph(0.17), c: 0x12151f, p: [0, 0.93, 0.1] },
            { g: sph(0.045, 6, 5), c: EYE, p: [0.07, 0.95, 0.25] },
            { g: sph(0.045, 6, 5), c: EYE, p: [-0.07, 0.95, 0.25] },
            // ransel dengan dua tabung energi
            { g: box(0.34, 0.34, 0.16), c: DARK, p: [0, 0.48, -0.3] },
            { g: cyl(0.06, 0.06, 0.3, 6), c: METAL, p: [0.1, 0.58, -0.42] },
            { g: cyl(0.06, 0.06, 0.3, 6), c: METAL, p: [-0.1, 0.58, -0.42] },
            { g: sph(0.065, 6, 5), c: tcLight, p: [0.1, 0.75, -0.42] },
            { g: sph(0.065, 6, 5), c: tcLight, p: [-0.1, 0.75, -0.42] },
            // lengan kiri (statis)
            { g: box(0.11, 0.36, 0.13), c: tcDark, p: [-0.34, 0.42, 0.04], r: [0.2, 0, 0.1] },
          ]),
        ),
        m,
      ),
    );
    armGeo = cached(`minionRArm${team}`, () =>
      build([
        { g: box(0.11, 0.32, 0.13), c: tcDark, p: [0, -0.16, 0] },
        { g: box(0.13, 0.1, 0.15), c: METAL, p: [0, -0.32, 0] },
        // tongkat sihir: batang kayu, cincin emas, dan bola energi
        { g: cyl(0.028, 0.034, 1.0, 6), c: WOOD, p: [0, -0.62, 0.02] },
        { g: new THREE.TorusGeometry(0.11, 0.025, 6, 12), c: GOLD, p: [0, -1.12, 0.02], r: [Math.PI / 2, 0, 0] },
        { g: sph(0.1, 8, 6), c: tcLight, p: [0, -1.12, 0.02] },
        { g: cone(0.04, 0.14, 5), c: GOLD, p: [0, -1.3, 0.02], r: [Math.PI, 0, 0] },
      ]),
    );
  } else {
    body.add(
      mesh(
        cached(`minionM${team}`, () =>
          build([
            { g: box(0.46, 0.16, 0.32), c: DARK, p: [0, 0.04, 0] },
            { g: box(0.5, 0.07, 0.36), c: GOLD, p: [0, 0.14, 0] },
            { g: box(0.6, 0.46, 0.42), c: tcDark, c2: tc, p: [0, 0.4, 0] },
            // pelat dada + lambang
            { g: box(0.44, 0.3, 0.08), c: METAL, p: [0, 0.47, 0.22] },
            { g: box(0.16, 0.16, 0.05), c: tcLight, p: [0, 0.48, 0.265], r: [0, 0, Math.PI / 4] },
            { g: sph(0.17), c: METAL, p: [0.4, 0.63, 0], s: [1.1, 0.8, 1.1] },
            { g: sph(0.17), c: METAL, p: [-0.4, 0.63, 0], s: [1.1, 0.8, 1.1] },
            // helm, kaca mata, dan jambul warna tim
            { g: sph(0.23), c: METAL_DARK, c2: METAL, p: [0, 0.93, 0] },
            { g: box(0.3, 0.07, 0.1), c: EYE, p: [0, 0.94, 0.19] },
            { g: box(0.26, 0.1, 0.16), c: METAL_DARK, p: [0, 0.83, 0.1] },
            { g: box(0.07, 0.14, 0.2), c: tc, p: [0, 1.19, 0.06] },
            { g: box(0.07, 0.18, 0.2), c: tcLight, p: [0, 1.2, -0.1] },
            { g: box(0.07, 0.12, 0.16), c: tc, p: [0, 1.12, -0.24] },
            // jubah pendek di punggung
            { g: box(0.5, 0.52, 0.05), c: tcDark, c2: tc, p: [0, 0.34, -0.26], r: [0.14, 0, 0] },
            // lengan kiri + perisai bundar (statis)
            { g: box(0.12, 0.38, 0.14), c: DARK, p: [-0.44, 0.42, 0.04] },
            { g: cyl(0.3, 0.3, 0.05, 12), c: tc, p: [-0.52, 0.4, 0.2], r: [Math.PI / 2, 0, 0.35] },
            { g: new THREE.TorusGeometry(0.3, 0.035, 6, 14), c: METAL, p: [-0.52, 0.4, 0.2], r: [0, -0.35, 0] },
            { g: sph(0.08, 8, 6), c: GOLD, p: [-0.535, 0.4, 0.24] },
          ]),
        ),
        m,
      ),
    );
    armGeo = cached('minionMArm', () =>
      build([
        { g: box(0.12, 0.3, 0.14), c: DARK, p: [0, -0.15, 0] },
        { g: box(0.15, 0.14, 0.17), c: METAL, p: [0, -0.34, 0] },
        // pedang: gagang, pelindung, bilah
        { g: box(0.05, 0.05, 0.16), c: WOOD, p: [0, -0.4, 0.04] },
        { g: box(0.22, 0.05, 0.05), c: GOLD, p: [0, -0.4, 0.14] },
        { g: box(0.075, 0.025, 0.66), c: 0xeef3fb, p: [0, -0.4, 0.5] },
        { g: cone(0.04, 0.12, 4), c: 0xeef3fb, p: [0, -0.4, 0.88], r: [Math.PI / 2, Math.PI / 4, 0], s: [1, 1, 0.35] },
      ]),
    );
  }
  const shoulder = joint(body, ranged ? 0.36 : 0.44, ranged ? 0.62 : 0.56, 0);
  shoulder.add(mesh(armGeo, m));
  const arm: Arm = { shoulder, phase: 0, rest: ranged ? -1.25 : -0.3, swing: ranged ? 0.1 : 0.7 };
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

/** Kadal rimba berkaki empat: punggung bersirip, kerah duri di tengkuk, ekor beruas yang mengibas. */
export function buildLizard(model: THREE.Group): Rig {
  const BACK = 0x4c8a38;
  const BELLY = 0xc6cc86;
  const DARKH = 0x2f5a26;
  const FIN = 0xe0702e;
  const FIN_TIP = 0xf6c04a;
  const CLAW = 0xe9e4d2;
  const g = new THREE.Group();
  g.scale.setScalar(1.15);
  model.add(g);
  const m = hideMat();

  g.add(
    mesh(
      cached('lizardBody', () => {
        const parts: Part[] = [
          { g: sph(0.75, 14, 10), c: BELLY, c2: BACK, s: [0.78, 0.6, 1.25], p: [0, 0.62, 0] },
          { g: sph(0.4, 10, 8), c: BELLY, c2: BACK, s: [0.8, 0.8, 1.05], p: [0, 0.78, 0.85] },
          { g: sph(0.36, 12, 8), c: BELLY, c2: BACK, s: [0.95, 0.8, 1.2], p: [0, 0.88, 1.2] },
          { g: sph(0.3, 10, 6), c: BACK, s: [0.7, 0.42, 0.9], p: [0, 0.84, 1.5] },
          { g: box(0.3, 0.07, 0.42), c: BELLY, p: [0, 0.7, 1.46] },
          // mata menyala + tonjolan alis
          { g: sph(0.08, 8, 6), c: EYE, p: [0.21, 0.99, 1.32] },
          { g: sph(0.08, 8, 6), c: EYE, p: [-0.21, 0.99, 1.32] },
          { g: sph(0.035, 6, 5), c: 0x15120c, p: [0.25, 1.0, 1.38] },
          { g: sph(0.035, 6, 5), c: 0x15120c, p: [-0.25, 1.0, 1.38] },
          { g: box(0.13, 0.05, 0.2), c: DARKH, p: [0.2, 1.08, 1.3], r: [0, 0, -0.3] },
          { g: box(0.13, 0.05, 0.2), c: DARKH, p: [-0.2, 1.08, 1.3], r: [0, 0, 0.3] },
        ];
        // gigi
        for (const s of [-1, 1]) {
          for (let i = 0; i < 3; i++) parts.push({ g: cone(0.025, 0.08, 4), c: CLAW, p: [s * 0.12, 0.72, 1.36 + i * 0.12], r: [Math.PI, 0, 0] });
        }
        // kerah duri di tengkuk
        for (let i = 0; i < 5; i++) {
          const a = (i - 2) * 0.5;
          parts.push({ g: cone(0.085, 0.5, 4), c: FIN, c2: FIN_TIP, p: [Math.sin(a) * 0.3, 0.98 + Math.cos(a) * 0.3, 0.92], r: [-0.55, 0, -a], s: [1, 1, 0.5] });
        }
        // sirip punggung + bintik gelap
        for (let i = 0; i < 6; i++) {
          const z = 0.55 - i * 0.28;
          const h = 0.34 - Math.abs(i - 1.5) * 0.045;
          parts.push({ g: cone(0.1, h, 4), c: FIN, c2: FIN_TIP, p: [0, 1.0 - Math.abs(i - 2) * 0.02 + h / 2 - 0.06, z], r: [-0.3, 0, 0], s: [0.5, 1, 1.2] });
          const sx = i % 2 ? 0.26 : -0.26;
          parts.push({ g: sph(0.09, 6, 5), c: DARKH, s: [1, 0.4, 1.3], p: [sx, 0.95, z - 0.1] });
        }
        return build(parts);
      }),
      m,
    ),
  );

  const legGeo = cached('lizardLeg', () => {
    const parts: Part[] = [
      { g: sph(0.2, 8, 6), c: BACK, s: [0.9, 1.2, 1.05], p: [0, -0.06, 0] },
      { g: box(0.16, 0.3, 0.18), c: DARKH, p: [0, -0.28, 0.02] },
      { g: box(0.25, 0.08, 0.34), c: BACK, p: [0, -0.43, 0.08] },
    ];
    for (const x of [-0.08, 0, 0.08]) parts.push({ g: cone(0.03, 0.14, 4), c: CLAW, p: [x, -0.44, 0.3], r: [Math.PI / 2, 0, 0] });
    return build(parts);
  });
  const legs: Leg[] = [];
  [
    [-0.5, 0.5, 0],
    [0.5, 0.5, Math.PI],
    [-0.5, -0.5, Math.PI],
    [0.5, -0.5, 0],
  ].forEach(([x, z, phase]) => {
    const hip = joint(g, x, 0.47, z);
    hip.add(mesh(legGeo, m));
    legs.push({ hip, phase });
  });

  // ekor tiga ruas: tiap ruas ikut mengibas, makin ke ujung makin lebar ayunannya
  const seg = (i: number) =>
    cached(`lizardTail${i}`, () => {
      const r0 = 0.3 - i * 0.085;
      const r1 = 0.22 - i * 0.085;
      const parts: Part[] = [{ g: cyl(Math.max(0.03, r1), r0, 0.58, 8), c: BELLY, c2: BACK, r: [-Math.PI / 2, 0, 0], p: [0, 0, -0.29] }];
      parts.push({ g: cone(0.07, 0.2 - i * 0.04, 4), c: FIN, c2: FIN_TIP, p: [0, r0 * 0.75 + 0.05, -0.2], s: [0.5, 1, 1.2] });
      if (i === 2) parts.push({ g: cone(0.1, 0.34, 4), c: FIN, c2: FIN_TIP, r: [-Math.PI / 2, 0, 0], p: [0, 0, -0.68], s: [1.4, 1, 0.4] });
      return build(parts);
    });
  const tails: THREE.Object3D[] = [];
  let parent: THREE.Object3D = g;
  for (let i = 0; i < 3; i++) {
    const t = i === 0 ? joint(parent, 0, 0.62, -0.82) : joint(parent, 0, 0, -0.54);
    t.add(mesh(seg(i), m));
    t.userData.lift = 0.05;
    t.userData.wag = 0.16 + i * 0.07;
    t.userData.baseX = i === 0 ? 0.08 : -0.04;
    tails.push(t);
    parent = t;
  }
  return newRig({ legs, sway: tails, stride: 2.4, legSwing: 0.7, lean: 0, lunge: 0.5 });
}

/** Golem rimba: bongkahan batu berlumut dengan inti dan retakan yang menyala. */
/** Tampilan golem: golem rimba biasa, Titan Astra, atau Raksasa Astra milik sebuah tim. */
export interface GolemLook {
  /** Awalan kunci cache geometri (tiap tampilan punya geometrinya sendiri). */
  key: string;
  rock: number;
  rockDark: number;
  glow: number;
  glowPower: number;
  /** Warna dan kadar "lumut" di sisi atas batu (0 = tanpa). */
  moss: number;
  mossy: number;
  /** Tanduk dan duri kristal tambahan (Titan). */
  horns: boolean;
}
const GOLEM_LOOK: GolemLook = { key: 'golem', rock: 0x9a8c78, rockDark: 0x6e6252, glow: 0xffb040, glowPower: 1.0, moss: 0x5f8a3a, mossy: 1, horns: false };
/** Golem Arus: batu sungai kebiruan dengan nyala biru muda dan lumut toska. */
export const FLOW_LOOK: GolemLook = { key: 'flow', rock: 0x7f93a6, rockDark: 0x4d6072, glow: 0x5fd4ff, glowPower: 1.3, moss: 0x3f9a8c, mossy: 1, horns: false };
/** Titan Astra: obsidian gelap berabu dengan bara merah-jingga. */
export const TITAN_LOOK: GolemLook = { key: 'titan', rock: 0x57505f, rockDark: 0x2f2a37, glow: 0xff5a2a, glowPower: 1.7, moss: 0x8a8590, mossy: 0.35, horns: true };
/** Raksasa Astra: batu pucat dengan nyala warna timnya. */
export const siegeLook = (team: number): GolemLook => ({
  key: 'siege' + team,
  rock: 0xa9adb8,
  rockDark: 0x6c7180,
  glow: TEAM_COLOR[team] ?? 0xffffff,
  glowPower: 1.5,
  moss: TEAM_COLOR[team] ?? 0xffffff,
  mossy: 0.45,
  horns: false,
});

export function buildGolem(model: THREE.Group, look: GolemLook = GOLEM_LOOK): Rig {
  const K = look.key;
  const ROCK = look.rock;
  const ROCK_DARK = look.rockDark;
  const AMBER = look.glow;
  const m = rockMat();
  const moss = new THREE.Color(look.moss);
  /** Bongkahan batu: lumut di sisi yang menghadap atas, UV kotak untuk detail batu. */
  const rocky = (key: string, parts: Part[], mossy = 0.8) =>
    cached(key, () => {
      const geo = build(parts.map((p) => ({ ...p, flat: true })));
      tint(geo, (_x, _y, _z, ny, c) => {
        c.lerp(moss, Math.min(1, Math.max(0, (ny - 0.6) * 2.5)) * mossy * look.mossy);
      });
      return boxUV(geo, 0.7);
    });
  const ico = (r: number) => new THREE.IcosahedronGeometry(r, 1);
  const glow = glowMat(AMBER, look.glowPower);
  const HIP = 1.0;

  const legGeo = rocky(
    K + 'Leg',
    [
      { g: box(0.48, 0.56, 0.5), c: ROCK_DARK, p: [0, -0.26, 0], warp: 0.05, seed: 1 },
      { g: ico(0.36), c: ROCK, p: [0, -0.62, 0.02], s: [1, 0.95, 1.05], warp: 0.06, seed: 2 },
      { g: box(0.62, 0.26, 0.84), c: ROCK_DARK, p: [0, -0.88, 0.1], warp: 0.05, seed: 3 },
    ],
    0.2,
  );
  const legs: Leg[] = [-1, 1].map((s) => {
    const hip = joint(model, s * 0.45, HIP, 0);
    hip.add(mesh(legGeo, m));
    return { hip, phase: s < 0 ? 0 : Math.PI };
  });

  const body = joint(model, 0, HIP, 0);
  body.userData.baseY = HIP;
  body.add(
    mesh(
      rocky(K + 'Body', [
        { g: box(1.05, 0.46, 0.82), c: ROCK_DARK, p: [0, 0.14, 0], warp: 0.06, seed: 4 },
        { g: ico(0.95), c: ROCK_DARK, c2: ROCK, s: [1.08, 0.95, 0.82], p: [0, 0.95, 0], warp: 0.1, seed: 5 },
        { g: ico(0.52), c: ROCK, s: [1.1, 0.95, 1.1], p: [0.98, 1.42, 0], warp: 0.07, seed: 6 },
        { g: ico(0.52), c: ROCK, s: [1.1, 0.95, 1.1], p: [-0.98, 1.42, 0], warp: 0.07, seed: 7 },
        // kepala + rahang
        { g: ico(0.36), c: ROCK, s: [1.05, 0.85, 1], p: [0, 1.78, 0.22], warp: 0.05, seed: 8 },
        { g: box(0.42, 0.14, 0.34), c: ROCK_DARK, p: [0, 1.56, 0.36], warp: 0.03, seed: 9 },
        // lempeng batu di punggung
        { g: box(0.5, 0.7, 0.24), c: ROCK_DARK, p: [0.3, 1.25, -0.62], r: [-0.3, 0, 0.2], warp: 0.05, seed: 10 },
        { g: box(0.44, 0.56, 0.22), c: ROCK, p: [-0.34, 1.15, -0.62], r: [-0.35, 0, -0.25], warp: 0.05, seed: 11 },
      ]),
      m,
    ),
    // inti dada, retakan, mata, dan kristal punggung yang menyala
    mesh(
      cached(K + 'Glow', () =>
        union([
          new THREE.OctahedronGeometry(0.24).scale(1, 1.3, 0.6).translate(0, 0.98, 0.76),
          box(0.05, 0.5, 0.05).rotateZ(0.7).translate(0.3, 1.2, 0.72),
          box(0.05, 0.44, 0.05).rotateZ(-0.8).translate(-0.3, 1.18, 0.72),
          box(0.05, 0.4, 0.05).rotateZ(0.25).translate(0.1, 0.56, 0.7),
          box(0.05, 0.36, 0.05).rotateZ(-0.5).translate(-0.2, 0.6, 0.7),
          box(0.11, 0.06, 0.05).translate(0.14, 1.82, 0.56),
          box(0.11, 0.06, 0.05).translate(-0.14, 1.82, 0.56),
          new THREE.OctahedronGeometry(0.2).scale(1, 2.6, 1).rotateX(-0.5).translate(0.28, 1.86, -0.6),
          new THREE.OctahedronGeometry(0.16).scale(1, 2.4, 1).rotateX(-0.6).rotateZ(0.4).translate(-0.34, 1.68, -0.62),
          new THREE.OctahedronGeometry(0.13).scale(1, 2.2, 1).rotateX(-0.3).rotateZ(-0.5).translate(0.62, 1.6, -0.5),
        ]),
      ),
      glow,
    ),
  );

  if (look.horns) {
    body.add(
      mesh(
        rocky(
          K + 'Horns',
          [
            // sepasang tanduk melengkung ke depan
            { g: cone(0.17, 0.95, 6), c: ROCK_DARK, p: [0.34, 2.12, 0.1], r: [0.5, 0, -0.55], warp: 0.03, seed: 31 },
            { g: cone(0.17, 0.95, 6), c: ROCK_DARK, p: [-0.34, 2.12, 0.1], r: [0.5, 0, 0.55], warp: 0.03, seed: 32 },
            // pelat bahu bergerigi
            { g: cone(0.3, 0.8, 5), c: ROCK, p: [1.18, 1.92, 0], r: [0, 0, -0.5], warp: 0.05, seed: 33 },
            { g: cone(0.3, 0.8, 5), c: ROCK, p: [-1.18, 1.92, 0], r: [0, 0, 0.5], warp: 0.05, seed: 34 },
            { g: cone(0.22, 0.6, 5), c: ROCK_DARK, p: [1.42, 1.62, -0.12], r: [0, 0, -0.95], warp: 0.04, seed: 35 },
            { g: cone(0.22, 0.6, 5), c: ROCK_DARK, p: [-1.42, 1.62, -0.12], r: [0, 0, 0.95], warp: 0.04, seed: 36 },
          ],
          0.2,
        ),
        m,
      ),
      // mahkota kristal membara di punggung dan ujung tanduk
      mesh(
        cached(K + 'Crown', () =>
          union([
            new THREE.OctahedronGeometry(0.26).scale(1, 3.1, 1).rotateX(-0.35).translate(0, 2.2, -0.62),
            new THREE.OctahedronGeometry(0.2).scale(1, 2.8, 1).rotateX(-0.45).rotateZ(0.35).translate(-0.52, 1.98, -0.6),
            new THREE.OctahedronGeometry(0.2).scale(1, 2.8, 1).rotateX(-0.45).rotateZ(-0.35).translate(0.52, 1.98, -0.6),
            new THREE.OctahedronGeometry(0.09).scale(1, 1.8, 1).translate(0.62, 2.5, 0.34),
            new THREE.OctahedronGeometry(0.09).scale(1, 1.8, 1).translate(-0.62, 2.5, 0.34),
          ]),
        ),
        glow,
      ),
    );
  }

  const upperGeo = rocky(K + 'ArmU', [{ g: box(0.42, 0.72, 0.46), c: ROCK_DARK, p: [0, -0.4, 0], warp: 0.05, seed: 12 }], 0.3);
  const lowerGeo = rocky(
    K + 'ArmL',
    [
      { g: ico(0.42), c: ROCK, s: [1, 1.25, 1], p: [0, -0.34, 0], warp: 0.06, seed: 13 },
      { g: box(0.64, 0.5, 0.64), c: ROCK_DARK, c2: ROCK, p: [0, -0.86, 0.02], warp: 0.06, seed: 14 },
    ],
    0.3,
  );
  const knuckles = cached(K + 'Knuckles', () => union([-0.2, 0, 0.2].map((x) => box(0.1, 0.07, 0.07).translate(x, -0.98, 0.35))));
  const arms: Arm[] = [-1, 1].map((s) => {
    const shoulder = joint(body, s * 1.02, 1.3, 0);
    shoulder.add(mesh(upperGeo, m));
    const elbow = joint(shoulder, 0, -0.76, 0);
    elbow.add(mesh(lowerGeo, m), mesh(knuckles, glow));
    return { shoulder, elbow, bend: 0.2, phase: s < 0 ? Math.PI : 0, rest: 0.05, swing: 0.8 };
  });
  return newRig({ body, legs, arms, strikeArm: arms[1], stride: 1.6, legSwing: 0.5, lean: 0.06 });
}
