// Tebing batu untuk dataran tinggi jungle dan pagar tepi map. Tiap persegi panjang halangan
// diubah menjadi bongkahan batu bersudut tumpul: dinding berlekuk tak beraturan dengan warna
// berlapis, dan puncak berumput yang sedikit menggunung.
import * as THREE from 'three';
import type { Rect } from '../../../shared/src';
import { makeNoise, Tex } from './textures';

export interface CliffSpec {
  rect: Rect;
  height: number;
  /** Besar lekukan dinding (unit). */
  rough: number;
  /** Jarak antar titik di keliling (unit). */
  step: number;
}

const noise = makeNoise(733);
/** Noise dunia (tidak perlu berulang). */
const wn = (x: number, z: number, f: number) => noise(x * f + 31.7, z * f + 17.3, 256);
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

interface Pt {
  x: number;
  z: number;
  nx: number;
  nz: number;
  /** Panjang busur dari titik awal (untuk UV). */
  d: number;
}

/** Keliling persegi panjang bersudut tumpul, dengan normal mengarah keluar. */
function outline(r: Rect, cr: number, step: number): Pt[] {
  const pts: Pt[] = [];
  let dist = 0;
  const push = (x: number, z: number, nx: number, nz: number) => {
    const prev = pts[pts.length - 1];
    if (prev) dist += Math.hypot(x - prev.x, z - prev.z);
    pts.push({ x, z, nx, nz, d: dist });
  };
  const edge = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) push(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, nx, nz);
  };
  const arc = (cx: number, cz: number, a0: number) => {
    const n = 3;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      push(cx + Math.cos(a) * cr, cz + Math.sin(a) * cr, Math.cos(a), Math.sin(a));
    }
  };
  edge(r.x0 + cr, r.z0, r.x1 - cr, r.z0, 0, -1);
  arc(r.x1 - cr, r.z0 + cr, -Math.PI / 2);
  edge(r.x1, r.z0 + cr, r.x1, r.z1 - cr, 1, 0);
  arc(r.x1 - cr, r.z1 - cr, 0);
  edge(r.x1 - cr, r.z1, r.x0 + cr, r.z1, 0, 1);
  arc(r.x0 + cr, r.z1 - cr, Math.PI / 2);
  edge(r.x0, r.z1 - cr, r.x0, r.z0 + cr, -1, 0);
  arc(r.x0 + cr, r.z0 + cr, Math.PI);
  return pts;
}

class Builder {
  pos: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  get count(): number {
    return this.pos.length / 3;
  }
  vertex(x: number, y: number, z: number, c: THREE.Color, u: number, v: number): void {
    this.pos.push(x, y, z);
    this.col.push(c.r, c.g, c.b);
    this.uv.push(u, v);
  }
  /** Sambungkan dua cincin berisi `n` vertex (cincin tertutup). */
  band(lower: number, upper: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.idx.push(lower + i, upper + i, lower + j, lower + j, upper + i, upper + j);
    }
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

const ROCK_A = new THREE.Color(0x9a9ea6);
const ROCK_B = new THREE.Color(0xb0a794);
const ROCK_DARK = new THREE.Color(0x4f5560);
const MOSS = new THREE.Color(0x5f7d40);
const EARTH = new THREE.Color(0x6b5a40);
const GRASS_EDGE = new THREE.Color(0.62, 0.7, 0.5);
const tmp = new THREE.Color();

/** Tingkat-tingkat dinding dari kaki ke bibir: [tinggi relatif, tonjolan keluar, acak]. */
const RINGS: [number, number, number][] = [
  [0, 0.3, 0.1],
  [0.24, 0.12, 0.2],
  [0.55, -0.04, 0.2],
  [0.84, -0.14, 0.14],
  [1, 0, 0.06],
];

function addCliff(side: Builder, top: Builder, spec: CliffSpec, id: number): void {
  const { rect: r, height: h, rough } = spec;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const cr = Math.min(1.3, Math.min(w, d) * 0.22);
  const pts = outline(r, cr, spec.step);
  const n = pts.length;
  const total = pts[n - 1].d + Math.hypot(pts[0].x - pts[n - 1].x, pts[0].z - pts[n - 1].z);
  // UV melingkar harus menutup tepat di sambungan: bulatkan jumlah ulangan tekstur
  const uScale = Math.max(1, Math.round(total * 0.2)) / total;

  // --- dinding
  let prev = -1;
  let lip = -1;
  RINGS.forEach(([fy, out, jit], k) => {
    const start = side.count;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      // lekukan yang sama dari kaki sampai puncak membentuk "tiang-tiang" batu
      const column = (wn(p.x, p.z, 0.42) - 0.5) * 2 * rough + (hash(i * 3.1 + id, 7) - 0.5) * rough * 0.7;
      const off = out + column * (1 - fy * 0.35) + (hash(i + id * 13, k) - 0.5) * 2 * jit * rough * 2.2;
      const y = fy * h + (k > 0 && k < RINGS.length - 1 ? (hash(i + id, k * 5.3) - 0.5) * 0.22 * h : 0);
      const x = p.x + p.nx * off;
      const z = p.z + p.nz * off;
      tmp.copy(ROCK_A).lerp(ROCK_B, wn(x, z + y * 2, 0.3));
      const strata = 0.9 + 0.14 * Math.sin(y * 5.5 + wn(x, z, 0.2) * 5);
      tmp.multiplyScalar((0.82 + 0.26 * fy) * strata * (0.9 + 0.2 * hash(i + id, k + 40)));
      if (k === 0) tmp.lerp(ROCK_DARK, 0.25);
      if (k >= RINGS.length - 2) tmp.lerp(MOSS, k === RINGS.length - 1 ? 0.7 : 0.25 + 0.3 * wn(x, z, 0.8));
      side.vertex(x, y, z, tmp, p.d * uScale, y * 0.2);
    }
    if (prev >= 0) side.band(prev, start, n);
    prev = start;
    if (k === RINGS.length - 1) lip = start;
  });

  // --- puncak berumput: tepi turun ke bibir tebing, bagian tengah sedikit menggunung
  const half = Math.min(w, d) / 2;
  const insets: [number, number][] = [
    [0, 0],
    [0.34, 0.09],
    [Math.min(1.4, half * 0.6), 0.2],
    [half, 0.3],
  ];
  let prevTop = -1;
  insets.forEach(([inset, rise], k) => {
    const start = top.count;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      let x: number;
      let z: number;
      let y = h + rise;
      if (k === 0) {
        x = side.pos[(lip + i) * 3];
        z = side.pos[(lip + i) * 3 + 2];
      } else {
        x = Math.min(r.x1 - inset, Math.max(r.x0 + inset, p.x));
        z = Math.min(r.z1 - inset, Math.max(r.z0 + inset, p.z));
        y += (wn(x, z, 0.33) - 0.5) * 0.24 * Math.min(1, inset);
      }
      if (k === 0) tmp.copy(EARTH).lerp(GRASS_EDGE, 0.35);
      else if (k === 1) tmp.copy(GRASS_EDGE);
      else tmp.setScalar(0.86 + 0.3 * wn(x, z, 0.21)).lerp(GRASS_EDGE, 0.15);
      top.vertex(x, y, z, tmp, x * 0.17, z * 0.17);
    }
    if (prevTop >= 0) top.band(prevTop, start, n);
    prevTop = start;
  });
}

export interface Cliffs {
  /** Tinggi permukaan rumput di titik (x, z) sebuah tebing: dipakai untuk menaruh pohon dsb. */
  topY(spec: CliffSpec, x: number, z: number): number;
}

/** Bangun semua tebing sebagai dua mesh (dinding batu + puncak rumput). */
export function buildCliffs(scene: THREE.Scene, specs: CliffSpec[]): Cliffs {
  const side = new Builder();
  const top = new Builder();
  specs.forEach((s, i) => addCliff(side, top, s, i + 1));

  const rock = Tex.rock();
  const grass = Tex.grass();
  const sideMesh = new THREE.Mesh(
    side.geometry(),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: rock.map,
      normalMap: rock.normal,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughness: 0.92,
      metalness: 0,
      flatShading: true,
    }),
  );
  const topMesh = new THREE.Mesh(
    top.geometry(),
    new THREE.MeshStandardMaterial({ vertexColors: true, map: grass.map, normalMap: grass.normal, roughness: 1, metalness: 0 }),
  );
  for (const m of [sideMesh, topMesh]) {
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }

  return {
    topY(spec, x, z) {
      const r = spec.rect;
      const edge = Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z);
      const half = Math.min(r.x1 - r.x0, r.z1 - r.z0) / 2;
      const k = Math.min(1, Math.max(0, edge) / Math.min(1.4, half * 0.6));
      return spec.height + 0.09 + 0.13 * k + (wn(x, z, 0.33) - 0.5) * 0.24 * k;
    },
  };
}
