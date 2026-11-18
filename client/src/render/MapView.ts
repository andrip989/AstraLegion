// Perakit visual map: tanah, tebing jungle, hutan, tanaman kecil, lampu jalan, hiasan base,
// alas penyembuh, camp monster, dunia di luar batas map, dan partikel suasana.
import * as THREE from 'three';
import { BUSHES, CAMPS, CORES, FOUNTAINS, FOUNTAIN_RADIUS, LANE_PATHS, MAP_SIZE, OBSTACLES, TOWERS, type Rect, type Vec2 } from '../../../shared/src';
import { buildCliffs, type CliffSpec } from './cliffs';
import * as F from './foliage';
import { addWind, instanced, type Item } from './geo';
import { glowColor, glowMat, glowVertexMat, paintMat, rockMat as sharedRockMat, stoneMat, TEAM_COLOR } from './palette';
import { PointCloud } from './particles';
import * as P from './props';
import { GFX, pick } from './quality';
import { SUN_DIR } from './SceneManager';
import { buildGround, TRAILS } from './terrain';
import { makeNoise, rng, Tex } from './textures';

export interface MapView {
  /** Dipanggil tiap frame: angin, kunang-kunang, kilau alas penyembuh. */
  update(time: number): void;
}

const wallHeight = (i: number) => 2.0 + ((i * 7) % 5) * 0.16;

function obstacleAt(x: number, z: number, pad = 0): number {
  for (let i = 0; i < OBSTACLES.length; i++) {
    const r = OBSTACLES[i];
    if (x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad) return i;
  }
  return -1;
}

function distToPaths(paths: Vec2[][], x: number, z: number): number {
  let best = Infinity;
  for (const path of paths) {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
    }
  }
  return best;
}
const distToLanes = (x: number, z: number) => distToPaths(LANE_PATHS, x, z);

const nearAny = (list: { x: number; z: number }[], x: number, z: number, r: number) => list.some((p) => Math.hypot(p.x - x, p.z - z) < r);

const rect = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x0, z0, x1, z1 });

export function buildMap(scene: THREE.Scene): MapView {
  const low = GFX.low;
  const rnd = rng(99);
  const noise = makeNoise(57);
  const wn = (x: number, z: number, f: number) => noise(x * f + 11.3, z * f + 5.7, 256);
  const uTime = { value: 0 };
  const between = (a: number, b: number) => a + rnd() * (b - a);
  const yaw = () => rnd() * Math.PI * 2;
  // generator terpisah untuk detail tambahan, supaya letak pohon dsb. tidak ikut bergeser
  const rnd2 = rng(4711);
  const between2 = (a: number, b: number) => a + rnd2() * (b - a);

  buildGround(scene, uTime);

  // ------------------------------------------------------------------- tebing
  const plateaus: CliffSpec[] = OBSTACLES.map((r, i) => ({ rect: r, height: wallHeight(i), rough: 0.2, step: pick(1.3, 0.95, 0.6) }));
  // pagar batu di tepi map; sisi dekat kamera (selatan) dibuat rendah supaya tidak menutupi lane
  const borders: CliffSpec[] = [
    { rect: rect(-9, -10, MAP_SIZE + 9, -0.6), height: 4.6, rough: 0.5, step: 1.7 },
    { rect: rect(-10, -0.6, -0.6, MAP_SIZE + 0.6), height: 3.5, rough: 0.5, step: 1.7 },
    { rect: rect(MAP_SIZE + 0.6, -0.6, MAP_SIZE + 10, MAP_SIZE + 0.6), height: 3.5, rough: 0.5, step: 1.7 },
    { rect: rect(-9, MAP_SIZE + 0.6, MAP_SIZE + 9, MAP_SIZE + 4.5), height: 1.1, rough: 0.35, step: 1.7 },
  ];
  const cliffs = buildCliffs(scene, [...plateaus, ...borders]);

  // ------------------------------------------------------------ daftar instance
  const pines: Item[] = [];
  const leafy: Item[] = [];
  const stumps: Item[] = [];
  const bushes: Item[] = [];
  const ferns: Item[] = [];
  const rocks: Item[][] = [[], [], []];
  const ruins: Item[][] = [[], [], [], []];
  const mushrooms: Item[] = [];
  const crystals: Item[] = [];
  const ponds: Item[] = [];
  const lilies: Item[] = [];
  const reeds: Item[] = [];
  const pondFlowers: Item[] = [];
  const litter: Item[] = [];
  const LITTER_COLORS = [0xb5651d, 0xd08a2c, 0x8a5a24, 0xc9a23a, 0x6f7f2e].map((c) => new THREE.Color(c));
  /** Halo cahaya statis: [x, y, z, warna, ukuran, alpha]. */
  const halos: [number, number, number, THREE.Color, number, number][] = [];

  const pineTint = () => F.hsl(between(0.33, 0.42), between(0.3, 0.42), between(0.27, 0.37));
  const leafTint = () => {
    const k = rnd();
    if (k < 0.1) return F.hsl(between(0.91, 0.96), 0.42, between(0.58, 0.66)); // berbunga merah muda
    if (k < 0.2) return F.hsl(between(0.07, 0.11), 0.52, between(0.42, 0.5)); // jingga musim gugur
    return F.hsl(between(0.21, 0.31), between(0.28, 0.42), between(0.29, 0.38));
  };
  const bushTint = () => F.hsl(between(0.24, 0.34), between(0.28, 0.42), between(0.26, 0.36));
  const MUSHROOM_COLORS = [0x58e6ff, 0xd070ff, 0x7dffb0].map((c) => new THREE.Color(c));

  const addTree = (x: number, y: number, z: number, scale: number, pineChance: number) => {
    const sy = scale * between(0.9, 1.25);
    if (rnd() < pineChance) pines.push({ x, y, z, sx: scale, sy, sz: scale, ry: yaw(), color: pineTint() });
    else leafy.push({ x, y, z, sx: scale, sy: scale * between(0.9, 1.1), sz: scale, ry: yaw(), color: leafTint() });
  };
  const addRock = (x: number, y: number, z: number, s: number) => {
    const sy = s * between(0.7, 1.15);
    rocks[Math.floor(rnd() * 3)].push({ x, y: y + sy * 0.22, z, sx: s * between(0.8, 1.3), sy, sz: s, ry: yaw() });
  };
  const addMushrooms = (x: number, y: number, z: number, s: number) => {
    const color = MUSHROOM_COLORS[Math.floor(rnd() * MUSHROOM_COLORS.length)];
    mushrooms.push({ x, y, z, sx: s, sy: s, sz: s, ry: yaw(), color });
    halos.push([x, y + 0.22 * s, z, color, 1.3 * s, 0.34]);
  };

  // ------------------------------------------------- isi tiap dataran tinggi
  plateaus.forEach((spec) => {
    const r = spec.rect;
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const area = w * d;
    const taken: { x: number; z: number; r: number }[] = [];
    const free = (x: number, z: number, rad: number) => !taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + rad);
    const spot = (inset: number) => ({ x: between(r.x0 + inset, r.x1 - inset), z: between(r.z0 + inset, r.z1 - inset) });

    // reruntuhan kuno di dataran yang cukup luas
    if (area >= 70 && rnd() < 0.8) {
      const p = { x: (r.x0 + r.x1) / 2 + between(-1, 1) * (w / 2 - 2.6), z: (r.z0 + r.z1) / 2 + between(-1, 1) * (d / 2 - 2.6) };
      const v = Math.floor(rnd() * 4);
      ruins[v].push({ ...p, y: cliffs.topY(spec, p.x, p.z) - 0.05, sx: 1, sy: 1, sz: 1, ry: v === 3 ? between(-0.4, 0.4) : yaw() });
      taken.push({ ...p, r: v === 3 ? 2.1 : 1.3 });
      if (v !== 3 && rnd() < 0.6) {
        const q = { x: p.x + between(-1.6, 1.6), z: p.z + between(1.2, 1.8) * (rnd() < 0.5 ? -1 : 1) };
        if (q.x > r.x0 + 1.2 && q.x < r.x1 - 1.2 && q.z > r.z0 + 1.2 && q.z < r.z1 - 1.2) {
          const v2 = 1 + Math.floor(rnd() * 2);
          ruins[v2].push({ ...q, y: cliffs.topY(spec, q.x, q.z) - 0.05, sx: 0.9, sy: 0.9, sz: 0.9, ry: yaw() });
          taken.push({ ...q, r: 1.2 });
        }
      }
    }
    // kolam kecil berteratai di dataran yang luas (sedang & tinggi)
    if (!low && area >= 70 && (taken.length === 0 || area >= 100)) {
      for (let tries = 0; tries < 10; tries++) {
        const R = between2(1.5, 2.2);
        const m = R + 1.3;
        if (w < m * 2 + 0.5 || d < m * 2 + 0.5) break;
        const p = { x: between2(r.x0 + m, r.x1 - m), z: between2(r.z0 + m, r.z1 - m) };
        if (!free(p.x, p.z, R + 0.5)) continue;
        const y = cliffs.topY(spec, p.x, p.z) + 0.07;
        ponds.push({ ...p, y, sx: R, sy: 1, sz: R, ry: rnd2() * 6.28 });
        taken.push({ ...p, r: R + 0.2 });
        for (let k = 0, n = 4 + Math.floor(rnd2() * 4); k < n; k++) {
          const a = rnd2() * 6.28;
          const dist = Math.sqrt(rnd2()) * R * 0.62;
          const s = between2(0.5, 0.95);
          const lx = p.x + Math.cos(a) * dist;
          const lz = p.z + Math.sin(a) * dist;
          lilies.push({ x: lx, y: y + 0.015, z: lz, sx: s, sy: 1, sz: s, ry: rnd2() * 6.28 });
          if (rnd2() < 0.35) pondFlowers.push({ x: lx, y: y - 0.2, z: lz, sx: 1.5, sy: 1.1, sz: 1.5, ry: 0, color: new THREE.Color(rnd2() < 0.5 ? 0xffc2dc : 0xffffff) });
        }
        for (let k = 0, n = 5 + Math.floor(rnd2() * 4); k < n; k++) {
          const a = rnd2() * 6.28;
          const s = between2(0.8, 1.3);
          reeds.push({ x: p.x + Math.cos(a) * R * 0.86, y: y - 0.05, z: p.z + Math.sin(a) * R * 0.86, sx: s, sy: s, sz: s, ry: rnd2() * 6.28 });
          if (k % 2 === 0) addRock(p.x + Math.cos(a + 0.5) * (R * 0.97), y - 0.12, p.z + Math.sin(a + 0.5) * (R * 0.97), between2(0.3, 0.55));
        }
        break;
      }
    }
    for (let k = 0, n = Math.max(2, Math.round(area / 10.5)), tries = 0; k < n && tries < n * 6; tries++) {
      const p = spot(1.15);
      if (!free(p.x, p.z, 0.9)) continue;
      const ty = cliffs.topY(spec, p.x, p.z);
      addTree(p.x, ty - 0.06, p.z, between(0.8, 1.45), 0.58);
      taken.push({ ...p, r: 0.75 });
      k++;
      // serasah daun gugur di sekitar pangkal pohon
      for (let i = 0, m = pick(0, 3, 9); i < m; i++) {
        const a = rnd2() * 6.28;
        const dist = 0.4 + rnd2() * 1.5;
        const lx = p.x + Math.cos(a) * dist;
        const lz = p.z + Math.sin(a) * dist;
        if (lx < r.x0 + 0.5 || lx > r.x1 - 0.5 || lz < r.z0 + 0.5 || lz > r.z1 - 0.5) continue;
        const s = between2(0.16, 0.3);
        litter.push({ x: lx, y: cliffs.topY(spec, lx, lz) + 0.035, z: lz, sx: s, sy: 1, sz: s, ry: rnd2() * 6.28, color: LITTER_COLORS[Math.floor(rnd2() * LITTER_COLORS.length)] });
      }
    }
    for (let k = 0, n = Math.round(area / 16); k < n; k++) {
      const p = spot(0.8);
      if (!free(p.x, p.z, 0.3)) continue;
      const y = cliffs.topY(spec, p.x, p.z);
      const s = between(0.6, 1.25);
      const roll = rnd();
      if (roll < 0.45) bushes.push({ ...p, y: y - 0.05, sx: s * 1.25, sy: s, sz: s * 1.2, ry: yaw(), color: bushTint() });
      else if (roll < 0.8) ferns.push({ ...p, y, sx: s * 1.5, sy: s * 1.5, sz: s * 1.5, ry: yaw() });
      else if (roll < 0.93) addRock(p.x, y - 0.04, p.z, between(0.4, 0.9));
      else stumps.push({ ...p, y: y - 0.04, sx: s, sy: s, sz: s, ry: yaw() });
    }

    // batu, semak, pakis, dan jamur berpendar di kaki tebing
    for (let k = 0, n = Math.round((w + d) / 1.7); k < n; k++) {
      const side = Math.floor(rnd() * 4);
      const t = rnd();
      const out = between(0.3, 0.75);
      const x = side === 0 ? r.x0 - out : side === 1 ? r.x1 + out : r.x0 + t * w;
      const z = side === 2 ? r.z0 - out : side === 3 ? r.z1 + out : r.z0 + t * d;
      if (distToLanes(x, z) < 5.4 || nearAny(TOWERS, x, z, 2.6) || obstacleAt(x, z) >= 0) continue;
      const roll = rnd();
      const s = between(0.45, 1.0);
      if (roll < 0.42) addRock(x, 0, z, s);
      else if (roll < 0.66) bushes.push({ x, y: -0.04, z, sx: s * 1.2, sy: s * 0.9, sz: s * 1.1, ry: yaw(), color: bushTint() });
      else if (roll < 0.86) ferns.push({ x, y: 0, z, sx: s * 1.4, sy: s * 1.4, sz: s * 1.4, ry: yaw() });
      else addMushrooms(x, 0, z, between(0.9, 1.5));
    }
  });

  // --------------------------------------- titik acak di area hijau (bukan jalan)
  /** Titik acak di luar lane/base/camp. `y` mengikuti puncak dataran tinggi bila `onPlateau`. */
  const greenSpot = (margin: number, onPlateau: boolean, random = rnd): { x: number; y: number; z: number } | null => {
    const x = 1.2 + random() * (MAP_SIZE - 2.4);
    const z = 1.2 + random() * (MAP_SIZE - 2.4);
    if (distToLanes(x, z) < margin) return null;
    if (nearAny(CORES, x, z, 10.6) || nearAny(FOUNTAINS, x, z, 6.2) || nearAny(TOWERS, x, z, 3.1)) return null;
    for (const c of CAMPS) if (Math.hypot(c.x - x, c.z - z) < (c.big ? 4.9 : 3.8)) return null;
    const ob = obstacleAt(x, z);
    if (ob >= 0) {
      if (!onPlateau || obstacleAt(x, z, -0.45) < 0) return null;
      return { x, y: cliffs.topY(plateaus[ob], x, z), z };
    }
    if (obstacleAt(x, z, 0.5) >= 0 || distToPaths(TRAILS, x, z) < 1.25) return null;
    return { x, y: 0, z };
  };

  // rumput bergoyang, tumbuh berkelompok mengikuti pola noise
  const grass: Item[] = [];
  for (let i = 0, want = pick(4500, 13000, 36000); grass.length < want && i < want * 5; i++) {
    const p = greenSpot(5.7, true);
    if (!p || wn(p.x, p.z, 0.16) < 0.3 + rnd() * 0.42) continue;
    const s = between(0.75, 1.5);
    const shade = between(0.78, 1.22);
    grass.push({ ...p, sx: s, sy: s * between(0.8, 1.35), sz: s, ry: between(-0.5, 0.5), color: new THREE.Color(shade * between(0.9, 1.15), shade, shade * between(0.75, 1.05)) });
  }

  // bunga dalam rumpun-rumpun sewarna
  const flowers: Item[] = [];
  const FLOWER_COLORS = [0xfff2a0, 0xffffff, 0xff9ecf, 0x9fe2ff, 0xffb45e, 0xd7a6ff].map((c) => new THREE.Color(c));
  const flowerCenters: { x: number; y: number; z: number }[] = [];
  for (let c = 0, clusters = pick(28, 78, 170); c < clusters; c++) {
    const center = greenSpot(6.2, true);
    if (!center) continue;
    flowerCenters.push(center);
    const color = FLOWER_COLORS[Math.floor(rnd() * FLOWER_COLORS.length)];
    for (let k = 0, n = 5 + Math.floor(rnd() * 9); k < n; k++) {
      const a = yaw();
      const dist = Math.sqrt(rnd()) * 1.7;
      const x = center.x + Math.cos(a) * dist;
      const z = center.z + Math.sin(a) * dist;
      // rumpun di tepi dataran tinggi tidak boleh melayang keluar tebing (dan sebaliknya)
      if (center.y > 0 ? obstacleAt(x, z, -0.5) < 0 : obstacleAt(x, z, 0.5) >= 0) continue;
      const s = between(0.8, 1.5);
      flowers.push({ x, y: center.y, z, sx: s, sy: s * between(0.8, 1.3), sz: s, ry: yaw(), color: rnd() < 0.85 ? color : FLOWER_COLORS[1] });
    }
  }

  // batu kecil, pakis, dan jamur yang tersebar di lantai jungle
  for (let i = 0, n = pick(110, 260, 520); i < n; i++) {
    const p = greenSpot(6.4, false);
    if (!p) continue;
    const roll = rnd();
    if (roll < 0.5) addRock(p.x, 0, p.z, between(0.22, 0.6));
    else if (roll < 0.86) ferns.push({ ...p, sx: 1, sy: 1, sz: 1, ry: yaw() });
    else addMushrooms(p.x, 0, p.z, between(0.8, 1.3));
  }

  // ---------------------------------- detail tambahan (memakai generator acak terpisah)
  // rumpun rumput tinggi di sela rumput biasa
  const tallGrass: Item[] = [];
  for (let i = 0, want = pick(0, 500, 3000); tallGrass.length < want && i < want * 6; i++) {
    const p = greenSpot(6.3, true, rnd2);
    if (!p || wn(p.x + 40, p.z + 17, 0.11) < 0.5) continue;
    const s = between2(0.8, 1.35);
    const shade = between2(0.8, 1.15);
    tallGrass.push({ ...p, sx: s, sy: s * between2(0.85, 1.25), sz: s, ry: between2(-0.5, 0.5), color: new THREE.Color(shade, shade, shade * 0.9) });
  }
  // Semak persembunyian (BUSHES): rumpun semak besar dikelilingi rumput tinggi yang rapat, lebih
  // gelap dan kebiruan dari tumbuhan hias supaya langsung dikenali. Ada di semua tingkat grafik.
  const hideGrass: Item[] = [];
  for (const b of BUSHES) {
    const lumps = 8;
    for (let i = 0; i < lumps; i++) {
      const a = (i / lumps) * Math.PI * 2 + between2(-0.35, 0.35);
      const d = i === 0 ? 0 : b.r * between2(0.4, 0.82);
      const s = between2(1.35, 1.8);
      bushes.push({
        x: b.x + Math.cos(a) * d,
        y: -0.06,
        z: b.z + Math.sin(a) * d,
        sx: s * 1.25,
        sy: s * 1.2,
        sz: s * 1.25,
        ry: between2(0, Math.PI * 2),
        color: F.hsl(between2(0.36, 0.42), between2(0.34, 0.46), between2(0.2, 0.27)),
      });
    }
    for (let i = 0, blades = pick(18, 30, 46); i < blades; i++) {
      const a = between2(0, Math.PI * 2);
      const d = b.r * Math.sqrt(between2(0.02, 1.05));
      const s = between2(1.5, 2.2);
      const shade = between2(0.62, 0.9);
      hideGrass.push({ x: b.x + Math.cos(a) * d, y: 0, z: b.z + Math.sin(a) * d, sx: s, sy: s * between2(1, 1.3), sz: s, ry: between2(-0.5, 0.5), color: new THREE.Color(shade * 0.8, shade, shade * 0.85) });
    }
  }
  // kerikil di tanah gundul: jalan setapak, bahu jalan, dan camp
  const pebbles: Item[] = [];
  for (let i = 0, want = pick(0, 500, 2000); pebbles.length < want && i < want * 12; i++) {
    const x = 1 + rnd2() * (MAP_SIZE - 2);
    const z = 1 + rnd2() * (MAP_SIZE - 2);
    if (obstacleAt(x, z, 0.35) >= 0 || nearAny(CORES, x, z, 9.6) || nearAny(FOUNTAINS, x, z, 5.6)) continue;
    const lane = distToLanes(x, z);
    const onDirt = (lane > 5.0 && lane < 6.5) || distToPaths(TRAILS, x, z) < 1.3 || CAMPS.some((c) => Math.hypot(c.x - x, c.z - z) < (c.big ? 5 : 3.8));
    if (!onDirt) continue;
    const s = between2(0.07, 0.2);
    pebbles.push({ x, y: s * 0.14, z, sx: s * between2(0.8, 1.4), sy: s, sz: s, ry: rnd2() * 6.28 });
  }
  // daun gugur di kaki tebing
  plateaus.forEach((spec) => {
    const r = spec.rect;
    for (let k = 0, n = Math.round((r.x1 - r.x0 + r.z1 - r.z0) * pick(0, 0.5, 1.8)); k < n; k++) {
      const side = Math.floor(rnd2() * 4);
      const t = rnd2();
      const out = between2(0.35, 1.5);
      const x = side === 0 ? r.x0 - out : side === 1 ? r.x1 + out : r.x0 + t * (r.x1 - r.x0);
      const z = side === 2 ? r.z0 - out : side === 3 ? r.z1 + out : r.z0 + t * (r.z1 - r.z0);
      if (distToLanes(x, z) < 5.2 || obstacleAt(x, z, 0.3) >= 0 || x < 1 || z < 1 || x > MAP_SIZE - 1 || z > MAP_SIZE - 1) continue;
      const s = between2(0.16, 0.3);
      litter.push({ x, y: 0.03, z, sx: s, sy: 1, sz: s, ry: rnd2() * 6.28, color: LITTER_COLORS[Math.floor(rnd2() * LITTER_COLORS.length)] });
    }
  });

  // ------------------------------------------------------------- camp monster
  for (const c of CAMPS) {
    const r = c.big ? 4.4 : 3.4;
    for (let i = 0, n = c.big ? 11 : 8; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + between(-0.15, 0.15);
      const rr = r + between(-0.2, 0.3);
      addRock(c.x + Math.cos(a) * rr, 0, c.z + Math.sin(a) * rr, between(0.3, 0.62));
    }
    for (let i = 0; i < 3; i++) {
      const a = yaw();
      addMushrooms(c.x + Math.cos(a) * (r + 0.5), 0, c.z + Math.sin(a) * (r + 0.5), between(1, 1.5));
    }
    if (c.big) {
      const amber = new THREE.Color(0xffc24a);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.6;
        const s = between(0.75, 1.05);
        const x = c.x + Math.cos(a) * (r + 0.35);
        const z = c.z + Math.sin(a) * (r + 0.35);
        crystals.push({ x, y: 0, z, sx: s, sy: s, sz: s, ry: yaw(), color: amber });
        halos.push([x, 0.7 * s, z, amber, 2.6 * s, 0.4]);
      }
    }
  }

  // ---------------------------------------------- dunia di luar batas map: hutan
  for (let i = 0, n = pick(150, 420, 700); i < n; i++) {
    const x = between(-52, MAP_SIZE + 52);
    const z = between(-46, MAP_SIZE + 34);
    const inner = x > -11.5 && x < MAP_SIZE + 11.5 && z > -11.5 && z < MAP_SIZE + 7.5;
    if (inner) continue;
    const south = z > MAP_SIZE;
    addTree(x, 0, z, south ? between(0.9, 1.4) : between(1.2, 2.3), 0.84);
  }
  // pohon hutan luar digambar terpisah tanpa bayangan (jauh dari arena, hemat pass bayangan)
  const isOuter = (t: Item) => t.y === 0 && (t.x < -11 || t.x > MAP_SIZE + 11 || t.z < -11 || t.z > MAP_SIZE + 7);
  const pinesOut = pines.filter(isOuter);
  const leafyOut = leafy.filter(isOuter);
  for (const [list, out] of [
    [pines, pinesOut],
    [leafy, leafyOut],
  ]) {
    for (const t of out) list.splice(list.indexOf(t), 1);
  }
  // pepohonan & batu di atas pagar tebing (utara, barat, timur)
  borders.slice(0, 3).forEach((spec, i) => {
    const r = spec.rect;
    for (let k = 0, n = i === 0 ? 46 : 26; k < n; k++) {
      const x = between(r.x0 + 1.6, r.x1 - 1.6);
      const z = between(r.z0 + 1.6, r.z1 - (i === 0 ? 2.4 : 1.6));
      const y = cliffs.topY(spec, x, z);
      if (rnd() < 0.72) addTree(x, y - 0.06, z, between(0.9, 1.6), 0.75);
      else addRock(x, y, z, between(0.6, 1.5));
    }
  });
  // bongkahan batu besar di kaki pagar tebing, memecah garis lurus tepi map
  for (let i = 0; i < 70; i++) {
    const side = Math.floor(rnd() * 4);
    const t = between(1, MAP_SIZE - 1);
    const [x, z] = side === 0 ? [t, -0.2] : side === 1 ? [-0.2, t] : side === 2 ? [MAP_SIZE + 0.2, t] : [t, MAP_SIZE + 0.5];
    if (distToLanes(x, z) < 7.5 || nearAny(FOUNTAINS, x, z, 9.5)) continue;
    addRock(x, 0, z, side === 3 ? between(0.5, 1.0) : between(0.7, 1.7));
  }

  // --------------------------------------------------------------- lampu jalan
  const lamps: Item[] = [];
  const pools: Item[] = [];
  const walls: Item[] = [];
  const warm = glowColor(0xffb45e, 1);
  LANE_PATHS.forEach((lane) => {
    let carry = 6;
    let side = 1;
    let count = 0;
    for (let i = 0; i < lane.length - 1; i++) {
      const a = lane[i];
      const b = lane[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const dx = (b.x - a.x) / len;
      const dz = (b.z - a.z) / len;
      for (let d = carry; d < len; d += 11) {
        const nx = -dz * side;
        const nz = dx * side;
        const x = a.x + dx * d + nx * 5.95;
        const z = a.z + dz * d + nz * 5.95;
        side = -side;
        count++;
        if (nearAny(CORES, x, z, 13) || nearAny(TOWERS, x, z, 4.5) || obstacleAt(x, z, 0.9) >= 0) continue;
        if (x < 2 || z < 2 || x > MAP_SIZE - 2 || z > MAP_SIZE - 2) continue;
        // lengan lentera menghadap ke jalan
        const ry = Math.atan2(-nx, -nz);
        lamps.push({ x, y: 0, z, sx: 1.25, sy: 1.25, sz: 1.25, ry });
        const lx = x - nx * 0.575;
        const lz = z - nz * 0.575;
        halos.push([lx, 2.72, lz, warm, 2.6, 0.5]);
        pools.push({ x: lx - nx * 0.5, y: 0.045, z: lz - nz * 0.5, sx: 3.6, sy: 1, sz: 3.6, ry: 0 });
        // sesekali, tembok batu rendah di seberang lampu
        if (count % 3 === 0) {
          const wx = a.x + dx * (d + 5.5) - nx * 6.4;
          const wz = a.z + dz * (d + 5.5) - nz * 6.4;
          const clear = !nearAny(CORES, wx, wz, 14) && !nearAny(TOWERS, wx, wz, 4.2) && obstacleAt(wx, wz, 1.2) < 0;
          if (clear && wx > 2 && wz > 2 && wx < MAP_SIZE - 2 && wz < MAP_SIZE - 2 && d + 5.5 < len - 4) {
            walls.push({ x: wx, y: 0, z: wz, sx: 1, sy: 1, sz: 1, ry: Math.atan2(-dz, dx) + between(-0.06, 0.06) });
          }
        }
      }
      carry = 11 - ((len - carry) % 11);
    }
  });

  // ------------------------------------------------------------ base & fountain
  const obelisks: Item[][] = [[], []];
  const banners: Item[][] = [[], []];
  const supplies: Item[] = [];
  /** Titik asal kilauan yang naik dari alas penyembuh: [x, z, fase, tim]. */
  const sparkles: [number, number, number, number][] = [];
  const linePolygonOffset = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  const flatRing = (r0: number, r1: number, seg: number) => new THREE.RingGeometry(r0, r1, seg).rotateX(-Math.PI / 2);
  const angDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

  CORES.forEach((c, t) => {
    const f = FOUNTAINS[t];
    const team = new THREE.Color(TEAM_COLOR[t]);
    const toFountain = Math.atan2(f.z - c.z, f.x - c.x);

    // obelisk & panji mengelilingi pelataran, kecuali di jalur keluar-masuk
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
      const r = i % 2 === 0 ? 9.7 : 10.3;
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      if (distToLanes(x, z) < 5.6 || angDiff(a, toFountain) < 0.42) continue;
      if (i % 2 === 0) {
        obelisks[t].push({ x, y: 0, z, sx: 1.15, sy: 1.15, sz: 1.15, ry: a });
        halos.push([x, 2.95, z, team, 2.4, 0.5]);
      } else {
        banners[t].push({ x, y: 0, z, sx: 1.1, sy: 1.1, sz: 1.1, ry: between(-0.35, 0.35) });
      }
    }
    // garis energi warna tim di lantai pelataran
    const lineMat = new THREE.MeshBasicMaterial({ color: glowColor(TEAM_COLOR[t], 0.72), ...linePolygonOffset });
    for (const [r0, r1] of [
      [7.97, 8.13],
      [4.22, 4.32],
    ]) {
      const ring = new THREE.Mesh(flatRing(r0, r1, 96), lineMat);
      ring.position.set(c.x, 0.03, c.z);
      scene.add(ring);
    }
    for (const a of [toFountain + 2.2, toFountain - 2.2]) {
      const x = c.x + Math.cos(a) * 11.4;
      const z = c.z + Math.sin(a) * 11.4;
      if (distToLanes(x, z) > 6 && x > 1.5 && z > 1.5 && x < MAP_SIZE - 1.5 && z < MAP_SIZE - 1.5) supplies.push({ x, y: 0, z, sx: 1, sy: 1, sz: 1, ry: yaw() });
    }

    // alas penyembuh: cincin batu, kolam energi, obelisk kecil, dan batas zona
    const rim = new THREE.Mesh(P.padRim(3.5), stoneMat());
    rim.position.set(f.x, 0, f.z);
    rim.castShadow = rim.receiveShadow = true;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.3, 48).rotateX(-Math.PI / 2), P.energyPool(glowColor(TEAM_COLOR[t], 0.6), uTime));
    pool.position.set(f.x, 0.05, f.z);
    pool.renderOrder = 1;
    const zone = new THREE.Mesh(
      flatRing(FOUNTAIN_RADIUS - 0.06, FOUNTAIN_RADIUS + 0.06, 128),
      new THREE.MeshBasicMaterial({ color: glowColor(TEAM_COLOR[t], 0.6), transparent: true, opacity: 0.5, depthWrite: false, ...linePolygonOffset }),
    );
    zone.position.set(f.x, 0.03, f.z);
    scene.add(rim, pool, zone);
    const toCore = Math.atan2(c.z - f.z, c.x - f.x);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + toCore + Math.PI / 6;
      if (angDiff(a, toCore) < 0.6) continue;
      const x = f.x + Math.cos(a) * 4.5;
      const z = f.z + Math.sin(a) * 4.5;
      if (x < 1 || z < 1 || x > MAP_SIZE - 1 || z > MAP_SIZE - 1) continue;
      obelisks[t].push({ x, y: 0, z, sx: 0.8, sy: 0.8, sz: 0.8, ry: a });
      halos.push([x, 2.05, z, team, 1.8, 0.45]);
    }
    for (let i = 0, n = pick(12, 24, 40); i < n; i++) {
      const a = yaw();
      const r = Math.sqrt(rnd()) * 3;
      sparkles.push([f.x + Math.cos(a) * r, f.z + Math.sin(a) * r, rnd(), t]);
    }
  });

  // ------------------------------------------------------------------- material
  const leafMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  const canopyMat = addWind(leafMat(), uTime, 0.03, 0.8);
  const bushMat = addWind(leafMat(), uTime, 0.05, 0.1);
  const barkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const rockMat = sharedRockMat();
  const grassMat = addWind(new THREE.MeshLambertMaterial({ vertexColors: true }), uTime, 0.16);
  const fernMat = addWind(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), uTime, 0.06);
  const flowerMat = addWind(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), uTime, 0.1);
  const noShadow = { cast: false, receive: false };
  const noTint = (items: Item[]) => items.map((t) => ({ ...t, color: undefined }));

  // kristal obelisk naik-turun pelan
  const bobbing = (hex: number) => {
    const m = new THREE.MeshBasicMaterial({ color: glowColor(hex, 1.9) });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += sin(uTime * 1.6 + instanceMatrix[3][0] * 1.7 + instanceMatrix[3][2]) * 0.07;');
    };
    return m;
  };

  const lamp = P.lampPost();
  const ob = P.obelisk();
  scene.add(
    instanced(F.pineTrunk(), barkMat, noTint(pines)),
    instanced(GFX.high ? F.pineCanopyDetailed() : F.pineCanopy(), canopyMat, pines),
    instanced(F.leafTrunk(), barkMat, noTint(leafy)),
    instanced(GFX.high ? F.leafCanopyDetailed() : F.leafCanopy(), canopyMat, leafy),
    instanced(F.pineTrunk(), barkMat, noTint(pinesOut), { cast: false }),
    instanced(F.pineCanopy(), canopyMat, pinesOut, { cast: false }),
    instanced(F.leafTrunk(), barkMat, noTint(leafyOut), { cast: false }),
    instanced(F.leafCanopy(), canopyMat, leafyOut, { cast: false }),
    instanced(F.tallGrass(), grassMat, tallGrass, { cast: false }),
    instanced(F.tallGrass(), grassMat, hideGrass, { cast: false }),
    instanced(F.pebble(), new THREE.MeshLambertMaterial({ vertexColors: true }), pebbles, { cast: false }),
    instanced(F.fallenLeaf(), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), litter, { cast: false }),
    instanced(F.lilyPad(), new THREE.MeshLambertMaterial({ vertexColors: true }), lilies, { cast: false }),
    instanced(F.reed(), addWind(new THREE.MeshLambertMaterial({ vertexColors: true }), uTime, 0.07), reeds),
    instanced(F.flower(), flowerMat, pondFlowers, { cast: false }),
    instanced(F.stump(), barkMat, stumps),
    instanced(F.bush(), bushMat, bushes),
    instanced(F.fern(), fernMat, ferns, { cast: false }),
    ...rocks.map((items, v) => instanced(F.rock(v), rockMat, items)),
    ...ruins.map((items, v) => instanced(P.ruin(v), stoneMat(), items)),
    instanced(F.grassTuft(), grassMat, grass, { cast: false }),
    instanced(F.flower(), flowerMat, flowers, { cast: false }),
    instanced(F.mushrooms(), glowVertexMat(1.7), mushrooms, noShadow),
    instanced(F.crystalCluster(), glowVertexMat(1.5), crystals, noShadow),
    instanced(lamp.body, paintMat(), lamps),
    instanced(lamp.glass, glowMat(0xffc878, 2.4), lamps, noShadow),
    instanced(P.lowWall(), stoneMat(), walls),
    instanced(P.supplies(), paintMat(), supplies),
    ...[0, 1].flatMap((t) => [
      instanced(ob.stone, stoneMat(), obelisks[t]),
      instanced(ob.crystal, bobbing(TEAM_COLOR[t]), obelisks[t], noShadow),
      instanced(P.banner(t), paintMat(), banners[t]),
    ]),
  );

  // kolam: satu bidang air beriak per kolam
  if (ponds.length) {
    const water = P.pondWater(uTime, SUN_DIR);
    const disc = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
    for (const p of ponds) {
      const m = new THREE.Mesh(disc, water);
      m.position.set(p.x, p.y, p.z);
      m.scale.set(p.sx, 1, p.sz);
      m.renderOrder = 1;
      scene.add(m);
    }
  }

  // kupu-kupu di sekitar rumpun bunga, dan daun yang melayang jatuh dari pepohonan
  {
    const base: number[] = [];
    const seed: number[] = [];
    const tint: number[] = [];
    const WING_COLORS = [0xffd34d, 0xff8fc8, 0x9fe2ff, 0xffffff, 0xff9a3d, 0xc7a6ff].map((c) => new THREE.Color(c));
    for (let i = 0, n = Math.min(pick(0, 24, 70), flowerCenters.length * 2); i < n; i++) {
      const c = flowerCenters[Math.floor(rnd2() * flowerCenters.length)];
      const col = WING_COLORS[Math.floor(rnd2() * WING_COLORS.length)];
      base.push(c.x, c.y + between2(0.7, 1.5), c.z);
      seed.push(rnd2(), 0);
      tint.push(col.r, col.g, col.b);
    }
    const trees = [...pines, ...leafy].filter((t) => t.y > 1 && t.x > 0 && t.x < MAP_SIZE && t.z > 0 && t.z < MAP_SIZE);
    for (let i = 0, n = trees.length ? pick(0, 0, 110) : 0; i < n; i++) {
      const t = trees[Math.floor(rnd2() * trees.length)];
      const col = LITTER_COLORS[Math.floor(rnd2() * LITTER_COLORS.length)];
      base.push(t.x + between2(-1, 1), t.y + 3.3 * t.sx, t.z + between2(-1, 1));
      seed.push(rnd2(), 1);
      tint.push(col.r, col.g, col.b);
    }
    if (seed.length) {
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', F.wings().attributes.position);
      g.setAttribute('aBase', new THREE.InstancedBufferAttribute(new Float32Array(base), 3));
      g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seed), 2));
      g.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(tint), 3));
      g.instanceCount = seed.length / 2;
      const flutter = new THREE.Mesh(g, P.flutterMaterial(uTime));
      flutter.frustumCulled = false;
      scene.add(flutter);
    }
  }

  // mode ringan (tanpa shadow map): bayangan bulat statis di bawah pohon, reruntuhan, dan obelisk
  if (low) {
    const shade = (list: Item[], r: number): Item[] => list.map((t) => ({ x: t.x + 0.75 * t.sx, y: t.y + 0.16, z: t.z - 0.55 * t.sx, sx: r * t.sx, sy: 1, sz: r * t.sx, ry: 0 }));
    const inMap = (t: Item) => t.x > -2 && t.x < MAP_SIZE + 2 && t.z > -2 && t.z < MAP_SIZE + 2;
    const blobs = instanced(
      new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: Tex.blob(), color: 0x000000, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      [...shade(pines.filter(inMap), 1.6), ...shade(leafy.filter(inMap), 2.1), ...shade(ruins.flat(), 1.5), ...shade(obelisks.flat(), 1)],
      noShadow,
    );
    blobs.renderOrder = 1;
    scene.add(blobs);
  }

  // lingkaran cahaya hangat di tanah di bawah tiap lampu
  const poolMesh = instanced(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: Tex.pool(),
      color: glowColor(0xffb45e, 0.34),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    pools,
    noShadow,
  );
  poolMesh.renderOrder = 2;
  scene.add(poolMesh);

  // ------------------------------------------------ partikel suasana (1 draw call)
  const flyCount = pick(60, 150, 260);
  const flyBase = new Float32Array(flyCount * 3);
  for (let i = 0, guard = 0; i < flyCount && guard < 20000; guard++) {
    const p = greenSpot(7, false);
    if (!p) continue;
    flyBase.set([p.x, between(0.7, 2.6), p.z], i * 3);
    i++;
  }
  const ambient = new PointCloud(halos.length + flyCount + sparkles.length, Tex.dot(), true);
  halos.forEach(([x, y, z, c, size, alpha], i) => ambient.put(i, x, y, z, c.r, c.g, c.b, alpha, size));
  scene.add(ambient.points);
  const flyColor = glowColor(0xd8ff8a, 1.5);
  const teamGlow = [glowColor(TEAM_COLOR[0], 1.6), glowColor(TEAM_COLOR[1], 1.6)];

  return {
    update(time: number): void {
      uTime.value = time;
      let n = halos.length;
      for (let i = 0; i < flyCount; i++) {
        const blink = 0.35 + 0.65 * Math.max(0, Math.sin(time * 1.3 + i * 2.4));
        ambient.put(
          n++,
          flyBase[i * 3] + Math.sin(time * 0.7 + i) * 0.9,
          flyBase[i * 3 + 1] + Math.sin(time * 1.1 + i * 2.1) * 0.35,
          flyBase[i * 3 + 2] + Math.cos(time * 0.6 + i * 1.7) * 0.9,
          flyColor.r,
          flyColor.g,
          flyColor.b,
          blink,
          0.3,
        );
      }
      for (const [x, z, phase, t] of sparkles) {
        const k = (time * 0.32 + phase) % 1;
        const c = teamGlow[t];
        ambient.put(n++, x + Math.sin(time + phase * 40) * 0.12, 0.1 + k * 2.8, z, c.r, c.g, c.b, Math.sin(k * Math.PI) * 0.9, 0.34 - k * 0.14);
      }
      ambient.commit(n);
    },
  };
}
