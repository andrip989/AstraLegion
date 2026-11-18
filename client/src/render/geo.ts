// Perkakas geometri: merakit model dari bentuk-bentuk primitif menjadi SATU geometri berwarna
// per-vertex (satu draw call), dengan gradasi warna, permukaan tak beraturan, dan UV proyeksi kotak.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V3 = [number, number, number];

export interface Part {
  g: THREE.BufferGeometry;
  /** Warna (di bagian bawah bila `c2` diisi). */
  c: number;
  /** Warna di bagian atas: gradasi vertikal dari `c` ke `c2`. */
  c2?: number;
  p?: V3;
  r?: V3;
  s?: V3 | number;
  /** Normal per-muka (tampilan low-poly bersudut). */
  flat?: boolean;
  /** Geser tiap vertex secara acak sejauh ini (bentuk organik: batu, daun). */
  warp?: number;
  /** Benih untuk `warp`. */
  seed?: number;
}

const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _a = new THREE.Color();
const _b = new THREE.Color();

export function hash3(x: number, y: number, z: number, seed = 0): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453;
  return s - Math.floor(s);
}

/** Geser vertex menurut posisinya (vertex kembar tetap menyatu). */
export function warpGeometry(g: THREE.BufferGeometry, amount: number, seed = 0): void {
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = Math.round(pos.getX(i) * 1000);
    const y = Math.round(pos.getY(i) * 1000);
    const z = Math.round(pos.getZ(i) * 1000);
    pos.setXYZ(
      i,
      pos.getX(i) + (hash3(x, y, z, seed) - 0.5) * 2 * amount,
      pos.getY(i) + (hash3(y, z, x, seed + 1) - 0.5) * 2 * amount,
      pos.getZ(i) + (hash3(z, x, y, seed + 2) - 0.5) * 2 * amount,
    );
  }
}

/** Siapkan satu bagian: non-indexed, atribut seragam (position, normal, uv, color). */
function prepare(part: Part): THREE.BufferGeometry {
  const g = part.g.index ? part.g.toNonIndexed() : part.g.clone();
  part.g.dispose();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  const count = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (part.warp) warpGeometry(g, part.warp, part.seed ?? 0);
  if (part.s !== undefined) {
    if (typeof part.s === 'number') g.scale(part.s, part.s, part.s);
    else g.scale(part.s[0], part.s[1], part.s[2]);
  }
  if (part.r) g.applyMatrix4(_m.makeRotationFromEuler(_e.set(part.r[0], part.r[1], part.r[2])));
  if (part.p) g.translate(part.p[0], part.p[1], part.p[2]);
  if (part.flat || part.warp) g.computeVertexNormals();

  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(count * 3);
  _a.setHex(part.c);
  if (part.c2 === undefined) {
    for (let i = 0; i < count; i++) col.set([_a.r, _a.g, _a.b], i * 3);
  } else {
    _b.setHex(part.c2);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < count; i++) {
      lo = Math.min(lo, pos.getY(i));
      hi = Math.max(hi, pos.getY(i));
    }
    const span = Math.max(1e-5, hi - lo);
    for (let i = 0; i < count; i++) {
      const t = (pos.getY(i) - lo) / span;
      col.set([_a.r + (_b.r - _a.r) * t, _a.g + (_b.g - _a.g) * t, _a.b + (_b.b - _a.b) * t], i * 3);
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Gabungkan bagian-bagian menjadi satu geometri berwarna per-vertex. */
export function build(parts: Part[]): THREE.BufferGeometry {
  const list = parts.map(prepare);
  const out = mergeGeometries(list, false);
  list.forEach((g) => g.dispose());
  if (!out) throw new Error('gagal menggabungkan geometri');
  return out;
}

/** Gabungkan geometri sejenis (tanpa warna) menjadi satu. */
export function union(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = list.map((g) => {
    const out = g.index ? g.toNonIndexed() : g;
    if (out !== g) g.dispose();
    return out;
  });
  const result = mergeGeometries(flat, false);
  flat.forEach((g) => g.dispose());
  if (!result) throw new Error('gagal menggabungkan geometri');
  return result;
}

/** `count` salinan geometri yang disusun melingkar pada radius `r`, menghadap keluar. */
export function orbit(count: number, r: number, make: (i: number) => THREE.BufferGeometry, phase = 0): THREE.BufferGeometry[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + phase;
    return make(i)
      .rotateY(-a)
      .translate(Math.cos(a) * r, 0, Math.sin(a) * r);
  });
}

/**
 * UV proyeksi kotak (per segitiga, menurut arah normal dominan) untuk geometri non-indexed.
 * Dipakai supaya tekstur detail batu menempel rata tanpa perlu UV buatan tangan.
 */
export function boxUV(g: THREE.BufferGeometry, scale: number): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 3) {
    const nx = Math.abs(nrm.getX(i) + nrm.getX(i + 1) + nrm.getX(i + 2));
    const ny = Math.abs(nrm.getY(i) + nrm.getY(i + 1) + nrm.getY(i + 2));
    const nz = Math.abs(nrm.getZ(i) + nrm.getZ(i + 1) + nrm.getZ(i + 2));
    for (let k = 0; k < 3; k++) {
      const x = pos.getX(i + k);
      const y = pos.getY(i + k);
      const z = pos.getZ(i + k);
      const [u, v] = ny >= nx && ny >= nz ? [x, z] : nx >= nz ? [z, y] : [x, y];
      uv[(i + k) * 2] = u * scale;
      uv[(i + k) * 2 + 1] = v * scale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Kalikan warna vertex dengan fungsi posisi/normal (mis. lumut di sisi atas, gelap di bawah). */
export function tint(
  g: THREE.BufferGeometry,
  fn: (x: number, y: number, z: number, ny: number, out: THREE.Color) => void,
): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const col = g.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    _a.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    fn(pos.getX(i), pos.getY(i), pos.getZ(i), nrm.getY(i), _a);
    col.setXYZ(i, _a.r, _a.g, _a.b);
  }
  return g;
}

export interface Item {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  ry: number;
  rx?: number;
  rz?: number;
  color?: THREE.Color;
}

const _o = new THREE.Object3D();

/** Satu InstancedMesh untuk banyak salinan objek yang sama. */
export function instanced(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  items: Item[],
  opts: { cast?: boolean; receive?: boolean } = {},
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => {
    _o.position.set(it.x, it.y, it.z);
    _o.rotation.set(it.rx ?? 0, it.ry, it.rz ?? 0);
    _o.scale.set(it.sx, it.sy, it.sz);
    _o.updateMatrix();
    mesh.setMatrixAt(i, _o.matrix);
    if (it.color) mesh.setColorAt(i, it.color);
  });
  mesh.castShadow = opts.cast ?? true;
  mesh.receiveShadow = opts.receive ?? true;
  mesh.frustumCulled = false; // tersebar di seluruh map
  return mesh;
}

/**
 * Tambahkan goyangan angin ke material (di vertex shader, tanpa biaya CPU). Bagian di atas
 * `base` bergoyang makin kuat seiring tingginya.
 */
export function addWind<T extends THREE.Material>(mat: T, uTime: { value: number }, amp: number, base = 0): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float wgx = instanceMatrix[3][0];
        float wgz = instanceMatrix[3][2];
      #else
        float wgx = modelMatrix[3][0];
        float wgz = modelMatrix[3][2];
      #endif
      float wind = sin(uTime * 1.5 + wgx * 0.33 + wgz * 0.27) + 0.45 * sin(uTime * 3.1 + wgx * 0.9 - wgz * 0.6);
      float wh = max(0.0, position.y - ${base.toFixed(2)});
      transformed.x += wind * ${amp.toFixed(3)} * wh;
      transformed.z += wind * ${(amp * 0.55).toFixed(3)} * wh;`,
    );
  };
  mat.customProgramCacheKey = () => `wind${amp}:${base}`;
  return mat;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
/** Geometri bersama: dibuat sekali, dipakai semua unit sejenis (jangan di-dispose per unit). */
export function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
}
