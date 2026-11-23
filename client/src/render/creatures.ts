// Model minion (prajurit helm bulat berperisai & penyihir bertudung) dan monster jungle (bayi kadal
// bersirip dan golem batu bulat berlumut) bergaya chibi: kepala besar, mata bulat, badan gempal.
// Tiap bagian tubuh adalah satu geometri gabungan berwarna per-vertex (dipakai bersama per jenis).
import * as THREE from 'three';
import { boxUV, build, cached, tint, union, type Part } from './geo';
import { glowMat, hideMat, rockMat, TEAM_COLOR, unitMat } from './palette';
import { joint, newRig, type Arm, type Leg, type Rig } from './rig';
import { blush, cap, cone, cyl, eyes, faceOpening, HALF, onHead, smile, sph, torus, type V3 } from './cute';

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const out = new THREE.Mesh(g, m);
  out.position.set(x, y, z);
  out.castShadow = true;
  return out;
}

const METAL = 0xd2d8e6;
const METAL_DARK = 0x6d7586;
const DARK = 0x2b3142;
const GOLD = 0xe6b84e;
const EYE = 0xfff4b8;
const WOOD = 0x7a5434;
const DOLL = 0xf4e4d4;

const shade = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k).getHex();
const tintTo = (hex: number, k: number) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), k).getHex();

// ---------------------------------------------------------------------- minion

export function buildMinion(model: THREE.Group, team: number, ranged: boolean): Rig {
  const tc = TEAM_COLOR[team];
  const tcDark = shade(tc, 0.55);
  const tcLight = tintTo(tc, 0.4);
  const HIP = 0.34;
  const m = unitMat();

  const legGeo = cached('minionLeg', () =>
    build([
      { g: cap(0.09, 0.1, 8), c: DARK, p: [0, -0.1, 0] },
      { g: sph(0.1, 8, 6), c: METAL_DARK, c2: METAL, s: [0.9, 0.65, 1.3], p: [0, -0.28, 0.03] },
    ]),
  );
  const legs: Leg[] = [-1, 1].map((s) => {
    const hip = joint(model, s * 0.14, HIP, 0);
    hip.add(mesh(legGeo, m));
    return { hip, phase: s < 0 ? 0 : Math.PI };
  });

  const body = joint(model, 0, HIP, 0);
  body.userData.baseY = HIP;
  let armGeo: THREE.BufferGeometry;
  if (ranged) {
    // penyihir cilik: jubah & tudung warna tim, wajah gelap dengan dua mata bulat bercahaya
    const FC: V3 = [0, 0.76, 0.12];
    const FR = 0.23;
    body.add(
      mesh(
        cached(`minionR${team}`, () => {
          const eyesP: Part[] = [];
          for (const s of [-1, 1]) {
            const e = onHead(FC, [FR, FR, FR], s * 0.38, 0.02, 0);
            eyesP.push({ g: sph(0.08, 8, 6), c: 0xffffff, c2: EYE, s: [0.85, 1.2, 0.4], p: e.p, r: e.r });
          }
          return build([
            { g: cyl(0.2, 0.34, 0.42, 12), c: tcDark, c2: tc, p: [0, 0.1, 0] },
            { g: sph(0.24, 10, 8), c: tc, c2: tcLight, p: [0, 0.36, 0] },
            { g: cyl(0.225, 0.225, 0.05, 12), c: GOLD, p: [0, 0.3, 0] },
            { g: torus(0.33, 0.025, 14), c: GOLD, r: [HALF, 0, 0], p: [0, -0.1, 0] },
            // tudung bulat berujung pom-pom, dan wajah gelap di dalamnya
            { g: sph(0.32, 12, 10), c: tcDark, c2: tc, p: [0, 0.78, -0.06] },
            { g: cone(0.14, 0.34, 8), c: tc, c2: tcLight, p: [0, 1.06, -0.24], r: [-0.85, 0, 0] },
            { g: sph(0.065, 8, 6), c: tcLight, p: [0, 1.13, -0.4] },
            { g: sph(FR, 10, 8), c: 0x161a2a, p: FC },
            ...eyesP,
            // ransel dengan dua tabung energi
            { g: box(0.26, 0.26, 0.13), c: DARK, p: [0, 0.38, -0.25] },
            { g: cyl(0.05, 0.05, 0.24, 8), c: METAL, p: [0.08, 0.5, -0.33] },
            { g: cyl(0.05, 0.05, 0.24, 8), c: METAL, p: [-0.08, 0.5, -0.33] },
            { g: sph(0.055, 8, 6), c: tcLight, p: [0.08, 0.64, -0.33] },
            { g: sph(0.055, 8, 6), c: tcLight, p: [-0.08, 0.64, -0.33] },
            // lengan kiri (statis)
            { g: cap(0.07, 0.12, 8), c: tcDark, c2: tc, p: [-0.28, 0.32, 0.04], r: [0.25, 0, 0.15] },
            { g: sph(0.07, 8, 6), c: DOLL, p: [-0.3, 0.2, 0.08] },
          ]);
        }),
        m,
      ),
    );
    armGeo = cached(`minionRArm${team}`, () =>
      build([
        { g: cap(0.07, 0.1, 8), c: tcDark, c2: tc, p: [0, -0.1, 0] },
        { g: sph(0.07, 8, 6), c: DOLL, p: [0, -0.22, 0] },
        // tongkat sihir: batang kayu, cincin emas, dan bola energi
        { g: cyl(0.024, 0.03, 0.78, 6), c: WOOD, p: [0, -0.48, 0.02] },
        { g: torus(0.09, 0.022, 12), c: GOLD, p: [0, -0.9, 0.02], r: [HALF, 0, 0] },
        { g: sph(0.085, 10, 8), c: tcLight, p: [0, -0.9, 0.02] },
        { g: cone(0.035, 0.12, 5), c: GOLD, p: [0, -1.04, 0.02], r: [Math.PI, 0, 0] },
      ]),
    );
  } else {
    // prajurit cilik: helm bulat warna tim berjambul, wajah boneka bermata besar, perisai bundar
    const FC: V3 = [0, 0.8, 0.02];
    const FA = 0.27;
    const HB = 0.33;
    const BACK = 0.1;
    const hole = faceOpening(FA, HB, BACK);
    body.add(
      mesh(
        cached(`minionM${team}`, () =>
          build([
            { g: sph(0.27, 12, 8), c: tcDark, c2: tc, s: [1.05, 1, 0.95], p: [0, 0.25, 0] },
            { g: cyl(0.262, 0.262, 0.06, 12), c: GOLD, p: [0, 0.11, 0] },
            { g: sph(0.16, 10, 6), c: METAL_DARK, c2: METAL, s: [1, 1, 0.4], p: [0, 0.3, 0.21] },
            { g: box(0.09, 0.09, 0.04), c: tcLight, p: [0, 0.31, 0.27], r: [0, 0, Math.PI / 4] },
            { g: sph(0.11, 8, 6), c: METAL_DARK, c2: METAL, s: [1.1, 0.8, 1.1], p: [0.28, 0.42, 0] },
            { g: sph(0.11, 8, 6), c: METAL_DARK, c2: METAL, s: [1.1, 0.8, 1.1], p: [-0.28, 0.42, 0] },
            // kepala: wajah boneka di dalam helm warna tim, jambul & pom-pom terang
            { g: sph(FA, 12, 10), c: DOLL, p: FC },
            { g: sph(HB, 12, 10), c: tcDark, c2: tc, p: [0, FC[1], FC[2] - BACK] },
            { g: torus(hole.r, 0.03, 12), c: GOLD, p: [0, FC[1], FC[2] + hole.z] },
            { g: sph(0.12, 8, 6), c: tcLight, s: [0.28, 0.65, 1.7], p: [0, FC[1] + 0.33, -0.08] },
            { g: sph(0.07, 8, 6), c: tcLight, p: [0, FC[1] + 0.36, 0.12] },
            ...eyes({ c: FC, R: [FA, FA, FA], yaw: 0.36, pitch: -0.05, size: 0.07, iris: tc, dark: 0x141828, lo: true }),
            ...blush(FC, [FA, FA, FA], 0.62, -0.32, 0.045, 0xff8fae, true),
            // lengan kiri + perisai bundar (statis)
            { g: cap(0.07, 0.1, 8), c: DARK, p: [-0.31, 0.26, 0.04] },
            { g: cyl(0.22, 0.22, 0.05, 12), c: tcDark, c2: tc, p: [-0.38, 0.26, 0.15], r: [HALF, 0, 0.35] },
            { g: torus(0.22, 0.03, 12), c: METAL, p: [-0.38, 0.26, 0.15], r: [0, -0.35, 0] },
            { g: sph(0.065, 8, 6), c: GOLD, p: [-0.39, 0.26, 0.19] },
          ]),
        ),
        m,
      ),
    );
    armGeo = cached('minionMArm', () =>
      build([
        { g: cap(0.07, 0.1, 8), c: DARK, p: [0, -0.1, 0] },
        { g: sph(0.08, 8, 6), c: METAL_DARK, c2: METAL, p: [0, -0.22, 0] },
        // pedang pendek: gagang, pelindung, bilah
        { g: box(0.045, 0.045, 0.14), c: WOOD, p: [0, -0.24, 0.05] },
        { g: box(0.18, 0.04, 0.045), c: GOLD, p: [0, -0.24, 0.13] },
        { g: box(0.065, 0.022, 0.46), c: 0xeef3fb, p: [0, -0.24, 0.38] },
        { g: cone(0.035, 0.1, 4), c: 0xeef3fb, p: [0, -0.24, 0.66], r: [HALF, Math.PI / 4, 0], s: [1, 1, 0.35] },
      ]),
    );
  }
  const shoulder = joint(body, ranged ? 0.28 : 0.32, ranged ? 0.46 : 0.4, 0);
  shoulder.add(mesh(armGeo, m));
  const arm: Arm = { shoulder, phase: 0, rest: ranged ? -1.25 : -0.3, swing: ranged ? 0.1 : 0.7 };
  shoulder.rotation.x = arm.rest;

  return newRig({
    body,
    legs,
    arms: [arm],
    strikeArm: ranged ? undefined : arm,
    aimArm: ranged ? arm : undefined,
    stride: 3.2,
    legSwing: 0.8,
    lean: 0.08,
    bounce: 0.05,
    waddle: 0.08,
  });
}

// --------------------------------------------------------------------- monster

/** Bayi kadal rimba berkaki empat: kepala besar bermata bulat, punggung bersirip, ekor beruas yang mengibas. */
export function buildLizard(model: THREE.Group): Rig {
  const BACK = 0x5aa040;
  const BELLY = 0xe2e0a0;
  const DARKH = 0x3a7030;
  const FIN = 0xf07a34;
  const FIN_TIP = 0xffc84a;
  const CLAW = 0xf4efe0;
  const g = new THREE.Group();
  model.add(g);
  const m = hideMat();
  const HC: V3 = [0, 0.92, 0.62];
  const HR: V3 = [0.5, 0.44, 0.48];

  g.add(
    mesh(
      cached('lizardBody', () => {
        const parts: Part[] = [
          { g: sph(0.55, 14, 10), c: BELLY, c2: BACK, s: [0.95, 0.75, 1.1], p: [0, 0.58, -0.05] },
          // kepala besar dan moncong bulat
          { g: sph(0.48, 16, 12), c: BELLY, c2: BACK, s: [1.04, 0.92, 1], p: HC },
          { g: sph(0.3, 14, 10), c: BELLY, c2: BACK, s: [1.1, 0.68, 0.9], p: [0, 0.8, 1.0] },
          { g: sph(0.03, 6, 5), c: DARKH, p: [0.09, 0.9, 1.25] },
          { g: sph(0.03, 6, 5), c: DARKH, p: [-0.09, 0.9, 1.25] },
          ...eyes({ c: HC, R: HR, yaw: 0.5, pitch: 0.22, size: 0.13, iris: 0xffc23a, dark: 0x1e2410, lo: true }),
          ...blush(HC, HR, 0.75, -0.12, 0.08),
          ...smile([0, 0.8, 1.0], [0.33, 0.2, 0.27], -0.35, 0.09, 0x2a3a18),
        ];
        // gigi kecil di sudut mulut
        for (const s of [-1, 1]) parts.push({ g: cone(0.025, 0.07, 4), c: CLAW, p: [s * 0.1, 0.72, 1.2], r: [Math.PI, 0, 0] });
        // kerah sirip bulat di tengkuk
        for (let i = 0; i < 5; i++) {
          const a = (i - 2) * 0.5;
          parts.push({ g: cone(0.09, 0.34, 6), c: FIN, c2: FIN_TIP, p: [Math.sin(a) * 0.34, 0.96 + Math.cos(a) * 0.3, 0.3], r: [-0.6, 0, -a], s: [1, 1, 0.45] });
        }
        // sirip punggung + bintik gelap
        for (let i = 0; i < 4; i++) {
          const z = 0.15 - i * 0.24;
          const h = 0.24 - i * 0.03;
          parts.push({ g: cone(0.09, h, 6), c: FIN, c2: FIN_TIP, p: [0, 0.98 - i * 0.05 + h / 2 - 0.06, z], r: [-0.3, 0, 0], s: [0.5, 1, 1.2] });
          const sx = i % 2 ? 0.28 : -0.28;
          parts.push({ g: sph(0.08, 8, 6), c: DARKH, s: [1, 0.4, 1.3], p: [sx, 0.86, z - 0.1] });
        }
        return build(parts);
      }),
      m,
    ),
  );

  const legGeo = cached('lizardLeg', () => {
    const parts: Part[] = [
      { g: sph(0.16, 10, 8), c: BACK, s: [1, 1.1, 1], p: [0, -0.05, 0] },
      { g: sph(0.14, 10, 8), c: BACK, c2: DARKH, s: [1.1, 0.6, 1.3], p: [0, -0.3, 0.05] },
    ];
    for (const x of [-0.07, 0, 0.07]) parts.push({ g: sph(0.035, 6, 5), c: CLAW, p: [x, -0.32, 0.22] });
    return build(parts);
  });
  const legs: Leg[] = [];
  [
    [-0.4, 0.35, 0],
    [0.4, 0.35, Math.PI],
    [-0.4, -0.38, Math.PI],
    [0.4, -0.38, 0],
  ].forEach(([x, z, phase]) => {
    const hip = joint(g, x, 0.38, z);
    hip.add(mesh(legGeo, m));
    legs.push({ hip, phase });
  });

  // ekor tiga ruas: tiap ruas ikut mengibas, makin ke ujung makin lebar ayunannya
  const seg = (i: number) =>
    cached(`lizardTail${i}`, () => {
      const len = 0.42 - i * 0.06;
      const r0 = 0.24 - i * 0.07;
      const r1 = Math.max(0.04, r0 - 0.07);
      const parts: Part[] = [
        { g: cyl(r1, r0, len, 10), c: BELLY, c2: BACK, r: [-HALF, 0, 0], p: [0, 0, -len / 2] },
        { g: sph(r0, 10, 8), c: BACK },
        { g: cone(0.06, 0.16 - i * 0.03, 6), c: FIN, c2: FIN_TIP, p: [0, r0 * 0.8 + 0.04, -len * 0.4], s: [0.5, 1, 1.2] },
      ];
      if (i === 2) parts.push({ g: cone(0.1, 0.3, 6), c: FIN, c2: FIN_TIP, r: [-HALF, 0, 0], p: [0, 0, -len - 0.1], s: [1.4, 1, 0.4] });
      return build(parts);
    });
  const tails: THREE.Object3D[] = [];
  let parent: THREE.Object3D = g;
  for (let i = 0; i < 3; i++) {
    const t = i === 0 ? joint(parent, 0, 0.55, -0.6) : joint(parent, 0, 0, -(0.42 - (i - 1) * 0.06));
    t.add(mesh(seg(i), m));
    t.userData.lift = 0.05;
    t.userData.wag = 0.18 + i * 0.08;
    t.userData.baseX = i === 0 ? 0.15 : 0.05;
    tails.push(t);
    parent = t;
  }
  return newRig({ legs, sway: tails, stride: 3.0, legSwing: 0.75, lean: 0, lunge: 0.45, bounce: 0.06 });
}

/** Tampilan golem: golem rimba biasa, Golem Arus, Titan Astra, atau Raksasa Astra milik sebuah tim. */
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
  /** Tanduk, alis marah, taring, dan mahkota kristal (Titan). */
  horns: boolean;
  /** Hiasan di ubun-ubun: tunas daun (golem rimba) atau kristal menyala (Golem Arus, Raksasa). */
  crest?: 'sprout' | 'crystal';
}
const GOLEM_LOOK: GolemLook = { key: 'golem', rock: 0xa89a84, rockDark: 0x786a58, glow: 0xffb040, glowPower: 1.0, moss: 0x6a9a3e, mossy: 1, horns: false, crest: 'sprout' };
/** Golem Arus: batu sungai kebiruan dengan nyala biru muda dan lumut toska. */
export const FLOW_LOOK: GolemLook = { key: 'flow', rock: 0x8ea2b6, rockDark: 0x56697c, glow: 0x5fd4ff, glowPower: 1.3, moss: 0x3fa894, mossy: 1, horns: false, crest: 'crystal' };
/** Titan Astra: obsidian gelap berabu dengan bara merah-jingga. */
export const TITAN_LOOK: GolemLook = { key: 'titan', rock: 0x5e5668, rockDark: 0x332d3c, glow: 0xff5a2a, glowPower: 1.7, moss: 0x8a8590, mossy: 0.35, horns: true };
/** Raksasa Astra: batu pucat dengan nyala warna timnya. */
export const siegeLook = (team: number): GolemLook => ({
  key: 'siege' + team,
  rock: 0xb4b8c4,
  rockDark: 0x727786,
  glow: TEAM_COLOR[team] ?? 0xffffff,
  glowPower: 1.5,
  moss: TEAM_COLOR[team] ?? 0xffffff,
  mossy: 0.55,
  horns: false,
  crest: 'crystal',
});

export function buildGolem(model: THREE.Group, look: GolemLook = GOLEM_LOOK): Rig {
  const K = look.key;
  const ROCK = look.rock;
  const ROCK_DARK = look.rockDark;
  const m = rockMat();
  const moss = new THREE.Color(look.moss);
  /** Bongkahan batu bulat: lumut di sisi yang menghadap atas, UV kotak untuk detail batu. */
  const rocky = (key: string, parts: Part[], mossy = 0.8) =>
    cached(key, () => {
      const geo = build(parts);
      tint(geo, (_x, _y, _z, ny, c) => {
        c.lerp(moss, Math.min(1, Math.max(0, (ny - 0.55) * 2.5)) * mossy * look.mossy);
      });
      return boxUV(geo, 0.7);
    });
  const ico = (r: number, d = 2) => new THREE.IcosahedronGeometry(r, d);
  const glow = glowMat(look.glow, look.glowPower);
  const HIP = 0.42;
  const BC: V3 = [0, 1.0, 0];
  const BR: V3 = [1.02, 0.9, 0.84];
  const eyeAt = [-1, 1].map((s) => onHead(BC, BR, s * 0.34, 0.24, -0.03));

  const legGeo = rocky(K + 'Leg', [{ g: ico(0.3, 1), c: ROCK_DARK, c2: ROCK, s: [1.05, 0.75, 1.25], p: [0, -0.24, 0.06], warp: 0.03, seed: 1 }], 0.2);
  const legs: Leg[] = [-1, 1].map((s) => {
    const hip = joint(model, s * 0.42, HIP, 0);
    hip.add(mesh(legGeo, m));
    return { hip, phase: s < 0 ? 0 : Math.PI };
  });

  const body = joint(model, 0, HIP, 0);
  body.userData.baseY = HIP;
  const bodyParts: Part[] = [
    // satu bongkahan bulat besar: badan sekaligus kepala, wajahnya di depan
    { g: ico(0.95), c: ROCK_DARK, c2: ROCK, s: [BR[0] / 0.95, BR[1] / 0.95, BR[2] / 0.95], p: BC },
    // pipi batu dan alis yang menonjol
    ...eyeAt.map(({ p }, i): Part => ({ g: ico(0.2, 1), c: ROCK, s: [1.4, 0.45, 0.7], p: [p[0] * 1.05, p[1] + 0.22, p[2] - 0.05], r: [0, 0, look.horns ? (i ? -0.45 : 0.45) : i ? 0.12 : -0.12], warp: 0.02, seed: 20 + i })),
    // pupil gelap & kilau di depan mata menyala
    ...eyeAt.flatMap(({ p, r }, i): Part[] => [
      { g: sph(0.075, 10, 8), c: 0x1a1410, s: [1, 1.1, 0.4], r, p: [p[0] + (i ? -0.02 : 0.02), p[1] - 0.02, p[2] + 0.06] },
      { g: sph(0.03, 6, 5), c: 0xffffff, s: [1, 1, 0.5], r, p: [p[0] + (i ? 0.03 : -0.01), p[1] + 0.03, p[2] + 0.085] },
    ]),
    // lempeng batu kecil di punggung
    { g: ico(0.3, 1), c: ROCK_DARK, s: [1, 1.2, 0.5], p: [0.3, 1.25, -0.72], r: [-0.3, 0, 0.2], warp: 0.04, seed: 10 },
    { g: ico(0.26, 1), c: ROCK, s: [1, 1.2, 0.5], p: [-0.34, 1.1, -0.72], r: [-0.35, 0, -0.25], warp: 0.04, seed: 11 },
  ];
  if (look.crest === 'sprout') {
    // tunas daun dua helai di ubun-ubun
    bodyParts.push({ g: cyl(0.025, 0.03, 0.24, 6), c: 0x4a7a2a, p: [0.05, 1.98, 0], r: [0, 0, -0.15] });
    for (const s of [-1, 1]) bodyParts.push({ g: sph(0.13, 10, 8), c: 0x5aa83a, c2: 0x8ad860, s: [1.4, 0.3, 0.7], p: [0.07 + s * 0.15, 2.1, 0], r: [0, 0, s * 0.45] });
  }
  if (look.horns) {
    // taring kecil di sudut mulut
    for (const s of [-1, 1]) bodyParts.push({ g: cone(0.06, 0.18, 6), c: 0xf2ece0, p: [s * 0.24, 0.82, 0.78], r: [-0.25, 0, -s * 0.2] });
  }
  const bodyGlow: THREE.BufferGeometry[] = [
    // mata bulat menyala, inti dada, senyum (atau seringai Titan), dan kristal punggung
    ...eyeAt.map(({ p, r }) => sph(0.16, 14, 10).scale(0.9, 1.15, 0.4).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r[0], r[1], r[2]))).translate(p[0], p[1], p[2])),
    new THREE.OctahedronGeometry(0.17).scale(1, 1.3, 0.6).translate(0, 0.55, 0.8),
    look.horns ? box(0.34, 0.05, 0.05).translate(0, 0.86, 0.83) : new THREE.TorusGeometry(0.1, 0.025, 6, 12, Math.PI).rotateZ(Math.PI).translate(0, 0.94, 0.835),
    box(0.04, 0.3, 0.04).rotateZ(0.7).translate(0.55, 0.62, 0.62),
    box(0.04, 0.26, 0.04).rotateZ(-0.6).translate(-0.58, 0.68, 0.58),
    new THREE.OctahedronGeometry(0.16).scale(1, 2.4, 1).rotateX(-0.5).translate(0.28, 1.5, -0.74),
    new THREE.OctahedronGeometry(0.12).scale(1, 2.2, 1).rotateX(-0.6).rotateZ(0.4).translate(-0.34, 1.36, -0.76),
  ];
  if (look.crest === 'crystal') {
    bodyGlow.push(new THREE.OctahedronGeometry(0.13).scale(1, 2.2, 1).translate(0, 2.0, -0.05), new THREE.OctahedronGeometry(0.08).scale(1, 2, 1).rotateZ(0.5).translate(0.16, 1.92, 0), new THREE.OctahedronGeometry(0.08).scale(1, 2, 1).rotateZ(-0.5).translate(-0.16, 1.92, 0));
  }
  body.add(mesh(rocky(K + 'Body', bodyParts), m), mesh(cached(K + 'Glow', () => union(bodyGlow)), glow));

  if (look.horns) {
    body.add(
      mesh(
        rocky(
          K + 'Horns',
          [
            // sepasang tanduk bulat melengkung ke atas
            { g: cone(0.17, 0.62, 10), c: ROCK_DARK, p: [0.5, 1.86, 0.1], r: [0.3, 0, -0.6] },
            { g: cone(0.17, 0.62, 10), c: ROCK_DARK, p: [-0.5, 1.86, 0.1], r: [0.3, 0, 0.6] },
            // bahu batu berduri tumpul
            { g: cone(0.24, 0.5, 8), c: ROCK, p: [0.95, 1.5, -0.1], r: [0, 0, -0.75] },
            { g: cone(0.24, 0.5, 8), c: ROCK, p: [-0.95, 1.5, -0.1], r: [0, 0, 0.75] },
          ],
          0.2,
        ),
        m,
      ),
      // mahkota kristal membara di ubun-ubun dan ujung tanduk
      mesh(
        cached(K + 'Crown', () =>
          union([
            new THREE.OctahedronGeometry(0.2).scale(1, 2.6, 1).translate(0, 2.1, -0.12),
            new THREE.OctahedronGeometry(0.15).scale(1, 2.3, 1).rotateZ(0.35).translate(-0.28, 1.98, -0.16),
            new THREE.OctahedronGeometry(0.15).scale(1, 2.3, 1).rotateZ(-0.35).translate(0.28, 1.98, -0.16),
            new THREE.OctahedronGeometry(0.08).scale(1, 1.8, 1).translate(0.72, 2.12, 0.22),
            new THREE.OctahedronGeometry(0.08).scale(1, 1.8, 1).translate(-0.72, 2.12, 0.22),
          ]),
        ),
        glow,
      ),
    );
  }

  const upperGeo = rocky(K + 'ArmU', [{ g: ico(0.22, 1), c: ROCK_DARK, s: [1, 1.2, 1], p: [0, -0.12, 0], warp: 0.03, seed: 12 }], 0.3);
  const lowerGeo = rocky(K + 'ArmL', [{ g: ico(0.42), c: ROCK_DARK, c2: ROCK, s: [1, 1.05, 1.08], p: [0, -0.36, 0.04] }], 0.5);
  const knuckles = cached(K + 'Knuckles', () => union([-0.16, 0, 0.16].map((x) => sph(0.055, 8, 6).translate(x, -0.5, 0.42))));
  const arms: Arm[] = [-1, 1].map((s) => {
    const shoulder = joint(body, s * 1.0, 1.08, 0);
    shoulder.add(mesh(upperGeo, m));
    const elbow = joint(shoulder, 0, -0.26, 0);
    elbow.add(mesh(lowerGeo, m), mesh(knuckles, glow));
    return { shoulder, elbow, bend: 0.2, phase: s < 0 ? Math.PI : 0, rest: 0.05, swing: 0.8 };
  });
  return newRig({ body, legs, arms, strikeArm: arms[1], stride: 2.2, legSwing: 0.55, lean: 0.06, bounce: 0.1, waddle: 0.1 });
}
