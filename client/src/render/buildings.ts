// Model bangunan: tower penjaga dan core. Batu bertekstur, panji warna tim, jendela & cincin
// energi yang menyala, serta kristal melayang yang berputar.
import * as THREE from 'three';
import { boxUV, build, cached, orbit, union, type Part } from './geo';
import { glowColor, glowMat, paintMat, stoneMat, TEAM_COLOR } from './palette';
import { GFX } from './quality';
import { joint, newRig, type Rig } from './rig';
import { Tex } from './textures';

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const torus = (r: number, t: number, seg = 24) => new THREE.TorusGeometry(r, t, 6, seg).rotateX(Math.PI / 2);

const S = 0x9ba2b4;
const S_DARK = 0x6c7388;
const S_LIGHT = 0xb9bfcd;
const GOLD = 0xd9b04c;
const IRON = 0x343a48;

function mesh(g: THREE.BufferGeometry, m: THREE.Material, y = 0, shadow = true): THREE.Mesh {
  const out = new THREE.Mesh(g, m);
  out.position.y = y;
  out.castShadow = shadow;
  out.receiveShadow = shadow;
  return out;
}

const matCache = new Map<string, THREE.Material>();
function mat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = matCache.get(key) as T | undefined;
  if (!m) matCache.set(key, (m = make()));
  return m;
}

/** Kristal bersegi: menyala dari dalam, tetapi tiap sisi tetap memantulkan cahaya berbeda. */
const crystalMat = (team: number) =>
  mat(`crystal${team}`, () => {
    const c = TEAM_COLOR[team];
    return new THREE.MeshStandardMaterial({
      color: c,
      emissive: glowColor(c, 0.5),
      roughness: 0.18,
      metalness: 0.1,
      flatShading: true,
    });
  });

/** Pendar lembut di sekeliling kristal (tetap terlihat walau bloom dimatikan). */
function halo(team: number, size: number, y: number): THREE.Sprite {
  const m = mat(
    `halo${team}`,
    () =>
      new THREE.SpriteMaterial({
        map: Tex.dot(),
        color: glowColor(TEAM_COLOR[team], 0.11),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
  );
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  s.position.y = y;
  return s;
}

/** Kain panji yang menggantung di dinding menara, menghadap keluar pada sudut `a`. */
function wallBanner(team: number, a: number, r: number, top: number, w: number, h: number): Part[] {
  const tc = TEAM_COLOR[team];
  const dark = new THREE.Color(tc).multiplyScalar(0.5).getHex();
  const at = (rr: number, y: number): [number, number, number] => [Math.cos(a) * rr, y, Math.sin(a) * rr];
  // PlaneGeometry menghadap +Z; putar supaya menghadap arah radial
  const ry = Math.PI / 2 - a;
  const cloth = new THREE.PlaneGeometry(w, h, 2, 4);
  const pos = cloth.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < -h / 2 + 0.01) pos.setY(i, y + Math.abs(pos.getX(i)) * 0.7); // ujung bawah meruncing
    pos.setZ(i, Math.sin(pos.getX(i) * 5 + y * 3) * 0.035);
  }
  cloth.computeVertexNormals();
  return [
    { g: cloth, c: dark, c2: tc, r: [0, ry, 0], p: at(r, top - h / 2) },
    { g: new THREE.PlaneGeometry(w * 0.42, w * 0.42), c: 0xf4e8c6, r: [0, ry, Math.PI / 4], p: at(r + 0.02, top - h * 0.42) },
    { g: box(w + 0.16, 0.08, 0.08), c: GOLD, r: [0, ry, 0], p: at(r, top + 0.02) },
  ];
}

// ----------------------------------------------------------------------- tower

export function buildTower(model: THREE.Group, team: number): Rig {
  const stone = cached('towerStone', () => {
    const parts: Part[] = [
      { g: cyl(2.15, 2.35, 0.34), c: S_DARK, p: [0, 0.17, 0], flat: true },
      { g: cyl(1.85, 2.0, 0.34), c: S, p: [0, 0.51, 0], flat: true },
      { g: cyl(1.22, 1.72, 0.95), c: S_DARK, c2: S, p: [0, 1.15, 0], flat: true },
      { g: cyl(0.95, 1.2, 3.1), c: S, c2: S_LIGHT, p: [0, 3.17, 0], flat: true },
      { g: cyl(1.62, 0.97, 0.56), c: S_DARK, c2: S, p: [0, 4.98, 0], flat: true },
      { g: cyl(1.78, 1.78, 0.2), c: S_LIGHT, p: [0, 5.35, 0], flat: true },
      { g: cyl(0.78, 1.0, 0.36), c: S_DARK, p: [0, 5.62, 0], flat: true },
    ];
    // sabuk batu yang menonjol di badan menara
    [1.75, 2.95, 4.15].forEach((y) => {
      const r = 1.2 - ((y - 1.62) / 3.1) * 0.25 + 0.05;
      parts.push({ g: cyl(r, r + 0.02, 0.17), c: S_LIGHT, p: [0, y, 0], flat: true });
    });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // penopang miring + tudung piramida
      parts.push({ g: box(0.66, 2.7, 0.38), c: S_DARK, c2: S, r: [0, -a, 0], p: [ca * 1.18, 1.95, sa * 1.18] });
      parts.push({ g: cyl(0.02, 0.36, 0.5, 4), c: S_LIGHT, s: [1, 1, 0.62], r: [0, -a + Math.PI / 4, 0], p: [ca * 1.14, 3.55, sa * 1.14], flat: true });
      parts.push({ g: box(0.8, 0.3, 0.5), c: S, r: [0, -a, 0], p: [ca * 1.5, 0.78, sa * 1.5] });
      // cakar penyangga kristal
      const b = (i / 4) * Math.PI * 2;
      const cb = Math.cos(b);
      const sb = Math.sin(b);
      parts.push({ g: box(0.22, 0.86, 0.3), c: S_DARK, c2: S, r: [0, -b, -0.42], p: [cb * 0.86, 6.02, sb * 0.86] });
      parts.push({ g: cyl(0.02, 0.15, 0.7, 4), c: S_LIGHT, r: [0, -b, 0.5], p: [cb * 0.88, 6.66, sb * 0.88], flat: true });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      parts.push({ g: box(0.3, 0.5, 0.56), c: S, c2: S_LIGHT, r: [0, -a, 0], p: [Math.cos(a) * 1.6, 5.7, Math.sin(a) * 1.6] });
    }
    return boxUV(build(parts), 0.9);
  });
  const trim = cached(`towerTrim${team}`, () =>
    build([
      ...wallBanner(team, Math.PI / 2, 1.14, 4.62, 0.66, 1.5),
      ...wallBanner(team, -Math.PI / 2, 1.14, 4.62, 0.66, 1.5),
      { g: cyl(1.0, 1.0, 0.08), c: GOLD, p: [0, 4.7, 0] },
      { g: cyl(1.26, 1.26, 0.07), c: IRON, p: [0, 1.66, 0] },
      { g: cyl(1.81, 1.81, 0.06), c: GOLD, p: [0, 5.33, 0] },
    ]),
  );
  const glowGeo = cached('towerGlow', () => {
    const list: THREE.BufferGeometry[] = [torus(1.66, 0.045).translate(0, 0.72, 0), torus(1.07, 0.04).translate(0, 4.5, 0)];
    // celah jendela di sisi kiri-kanan (panji ada di sisi depan-belakang)
    for (const a of [0, Math.PI]) {
      for (const [y, h, r] of [
        [3.35, 0.66, 1.08],
        [2.3, 0.4, 1.17],
      ]) {
        list.push(
          box(0.12, h, 0.2)
            .rotateY(-a)
            .translate(Math.cos(a) * r, y, Math.sin(a) * r),
        );
      }
    }
    list.push(...orbit(8, 2.27, () => box(0.06, 0.12, 0.3).translate(0, 0.19, 0)));
    return union(list);
  });
  model.add(mesh(stone, stoneMat()), mesh(trim, paintMat()), mesh(glowGeo, glowMat(TEAM_COLOR[team], 1.0), 0, false));

  const crystal = mesh(
    cached('towerCrystal', () => new THREE.OctahedronGeometry(0.78).scale(1, 1.45, 1)),
    crystalMat(team),
    7.0,
    false,
  );
  crystal.userData.baseY = 7.0;
  const shards = mesh(
    cached('towerShards', () => union(orbit(4, 1.3, (i) => new THREE.OctahedronGeometry(0.17).scale(1, 1.8, 1).translate(0, (i % 2) * 0.35 - 0.17, 0)))),
    crystalMat(team),
    6.95,
    false,
  );
  // cincin rune miring yang berputar mengelilingi kristal
  const ringPivot = joint(model, 0, 7.0, 0);
  ringPivot.rotation.x = 0.4;
  const ring = mesh(
    cached('towerRing', () => union([torus(1.12, 0.03, 32), ...orbit(6, 1.12, () => box(0.08, 0.16, 0.16))])),
    glowMat(TEAM_COLOR[team], 1.0),
    0,
    false,
  );
  ringPivot.add(ring);
  model.add(crystal, shards, halo(team, 4.6, 7.0));
  return newRig({ spin: [crystal, shards, ring], bob: [crystal] });
}

// ------------------------------------------------------------------------ core

export function buildCore(model: THREE.Group, team: number): Rig {
  const stone = cached('coreStone', () => {
    const parts: Part[] = [
      { g: cyl(3.65, 3.95, 0.4, 12), c: S_DARK, p: [0, 0.2, 0], flat: true },
      { g: cyl(3.05, 3.3, 0.4, 12), c: S, p: [0, 0.6, 0], flat: true },
      { g: cyl(2.35, 2.62, 0.42, 12), c: S_LIGHT, p: [0, 1.01, 0], flat: true },
      { g: cyl(0.95, 1.5, 0.6, 12), c: S_DARK, c2: S, p: [0, 1.5, 0], flat: true },
    ];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const at = (r: number, y: number): [number, number, number] => [ca * r, y, sa * r];
      parts.push({ g: box(0.66, 0.34, 0.66), c: S_DARK, r: [0, -a, 0], p: at(2.72, 0.97) });
      parts.push({ g: cyl(0.2, 0.27, 2.5, 6), c: S, c2: S_LIGHT, p: at(2.72, 2.35), flat: true });
      parts.push({ g: box(0.56, 0.2, 0.56), c: S_LIGHT, r: [0, -a, 0], p: at(2.72, 3.68) });
      // tanduk yang melengkung ke dalam, mengurung kristal
      parts.push({ g: box(0.26, 1.2, 0.34), c: S, c2: S_DARK, r: [0, -a, 0.55], p: at(2.42, 4.22) });
      parts.push({ g: cyl(0.03, 0.17, 0.95, 4), c: S_LIGHT, r: [0, -a, 1.05], p: at(1.78, 4.95), flat: true });
      // anak tangga di antara pilar
      const b = a + Math.PI / 6;
      parts.push({ g: box(0.5, 0.2, 1.3), c: S, r: [0, -b, 0], p: [Math.cos(b) * 3.55, 0.3, Math.sin(b) * 3.55] });
    }
    return boxUV(build(parts), 0.9);
  });
  const trim = cached('coreTrim', () =>
    build([
      { g: cyl(3.13, 3.16, 0.07, 12), c: GOLD, p: [0, 0.7, 0] },
      { g: cyl(2.44, 2.46, 0.07, 12), c: GOLD, p: [0, 1.12, 0] },
      { g: cyl(1.0, 1.0, 0.1, 12), c: GOLD, p: [0, 1.82, 0] },
      ...Array.from({ length: 6 }, (_, i): Part => {
        const a = (i / 6) * Math.PI * 2;
        return { g: cyl(0.3, 0.3, 0.09, 6), c: GOLD, p: [Math.cos(a) * 2.72, 3.54, Math.sin(a) * 2.72] };
      }),
    ]),
  );
  const glowGeo = cached('coreGlow', () =>
    union([
      torus(3.35, 0.05, 48).translate(0, 0.42, 0),
      torus(1.2, 0.05).translate(0, 1.84, 0),
      ...orbit(12, 3.07, () => box(0.06, 0.2, 0.34).translate(0, 0.6, 0), Math.PI / 12),
      ...orbit(6, 2.72, () => new THREE.OctahedronGeometry(0.2).translate(0, 3.98, 0)),
    ]),
  );
  model.add(mesh(stone, stoneMat()), mesh(trim, paintMat()), mesh(glowGeo, glowMat(TEAM_COLOR[team], 1.0), 0, false));

  const crystal = mesh(
    cached('coreCrystal', () => new THREE.IcosahedronGeometry(1.5, 0).scale(1, 1.3, 1)),
    crystalMat(team),
    4.05,
    false,
  );
  crystal.userData.baseY = 4.05;
  const glow = glowMat(TEAM_COLOR[team], 1.0);
  const ringGeo = cached('coreHalo', () => union([torus(2.3, 0.06, 48), ...orbit(4, 2.3, () => new THREE.OctahedronGeometry(0.22))]));
  const pivots = [0.38, -0.5].map((tilt, i) => {
    const pivot = joint(model, 0, 4.05, 0);
    pivot.rotation.x = tilt;
    pivot.rotation.z = i * 0.4;
    const ring = mesh(ringGeo, glow, 0, false);
    ring.scale.setScalar(1 - i * 0.16);
    pivot.add(ring);
    return ring;
  });
  const shards = mesh(
    cached('coreShards', () => union(orbit(5, 2.0, (i) => new THREE.OctahedronGeometry(0.2).scale(1, 2, 1).translate(0, ((i * 37) % 10) * 0.12 - 0.5, 0)))),
    crystalMat(team),
    4.1,
    false,
  );
  // tiang cahaya dari kristal ke langit
  const beam = mesh(
    cached('coreBeam', () => new THREE.CylinderGeometry(0.1, 0.5, 11, 12, 1, true).translate(0, 5.5, 0)),
    mat(
      `beam${team}`,
      () =>
        new THREE.MeshBasicMaterial({
          color: glowColor(TEAM_COLOR[team], GFX.low ? 0.12 : 0.3),
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
    ),
    5.2,
    false,
  );
  model.add(crystal, shards, beam, halo(team, 9, 4.05));
  return newRig({ spin: [crystal, pivots[0], shards, pivots[1]], bob: [crystal] });
}

/** Puing yang tertinggal setelah tower hancur. */
export function towerRubble(): THREE.Mesh {
  const g = cached('towerRubble', () => {
    const parts: Part[] = [
      { g: cyl(2.15, 2.35, 0.34), c: S_DARK, p: [0, 0.17, 0], flat: true },
      { g: cyl(1.5, 1.95, 0.5), c: S, p: [0, 0.55, 0], flat: true, warp: 0.12, seed: 3 },
      { g: cyl(0.7, 1.3, 0.7, 6), c: S_DARK, p: [0.2, 1.0, -0.1], flat: true, warp: 0.2, seed: 5 },
    ];
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      const r = 1.2 + ((i * 53) % 10) * 0.16;
      const s = 0.35 + ((i * 29) % 10) * 0.045;
      parts.push({
        g: box(s * 1.4, s, s),
        c: i % 2 ? S : S_DARK,
        r: [i * 0.7, a, i * 0.4],
        p: [Math.cos(a) * r, s * 0.4, Math.sin(a) * r],
        warp: 0.05,
        seed: i,
      });
    }
    return boxUV(build(parts), 0.55);
  });
  return mesh(g, stoneMat());
}
