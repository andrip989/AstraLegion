// Partikel: ribuan titik bercahaya/berasap digambar dalam satu draw call (THREE.Points dengan
// ukuran & warna per titik). Dipakai untuk percikan, asap, debu, halo lampu, dan kunang-kunang.
import * as THREE from 'three';

/** Piksel per unit dunia pada jarak 1; diisi SceneManager tiap kali ukuran layar berubah. */
export const POINT_SCALE = { value: 1000 };

const VERT = /* glsl */ `
  attribute float size;
  attribute vec4 tint;
  uniform float uScale;
  varying vec4 vTint;
  void main() {
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * uScale / max(0.1, -mv.z);
  }`;

const FRAG = /* glsl */ `
  uniform sampler2D map;
  varying vec4 vTint;
  void main() {
    float a = texture2D(map, gl_PointCoord).a * vTint.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vTint.rgb, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** Penyangga titik berkapasitas tetap. Isi dengan `put`, lalu `commit` jumlah yang dipakai. */
export class PointCloud {
  readonly points: THREE.Points;
  private pos: THREE.BufferAttribute;
  private tint: THREE.BufferAttribute;
  private size: THREE.BufferAttribute;

  constructor(
    readonly capacity: number,
    map: THREE.Texture,
    additive: boolean,
  ) {
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
    this.tint = new THREE.BufferAttribute(new Float32Array(capacity * 4), 4);
    this.size = new THREE.BufferAttribute(new Float32Array(capacity), 1);
    g.setAttribute('position', this.pos);
    g.setAttribute('tint', this.tint);
    g.setAttribute('size', this.size);
    g.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, uScale: POINT_SCALE },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
  }

  put(i: number, x: number, y: number, z: number, r: number, g: number, b: number, a: number, size: number): void {
    (this.pos.array as Float32Array).set([x, y, z], i * 3);
    (this.tint.array as Float32Array).set([r, g, b, a], i * 4);
    (this.size.array as Float32Array)[i] = size;
  }

  commit(count: number): void {
    this.points.geometry.setDrawRange(0, count);
    this.pos.needsUpdate = true;
    this.tint.needsUpdate = true;
    this.size.needsUpdate = true;
  }
}

export interface Spawn {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** Umur (detik). */
  life: number;
  /** Ukuran awal dan akhir (unit dunia). */
  size: number;
  size1?: number;
  /** Warna linear; boleh > 1 supaya ikut ber-bloom. */
  r: number;
  g: number;
  b: number;
  alpha?: number;
  /** Perlambatan per detik (0 = tidak ada). */
  drag?: number;
  gravity?: number;
}

interface P extends Required<Spawn> {
  age: number;
}

/** Sistem partikel sederhana di CPU; satu instance untuk satu jenis blending/tekstur. */
export class Particles {
  readonly cloud: PointCloud;
  private live: P[] = [];
  private pool: P[] = [];

  constructor(capacity: number, map: THREE.Texture, additive: boolean) {
    this.cloud = new PointCloud(capacity, map, additive);
  }

  get object(): THREE.Points {
    return this.cloud.points;
  }

  spawn(s: Spawn): void {
    if (this.live.length >= this.cloud.capacity) return;
    const p = this.pool.pop() ?? ({} as P);
    p.x = s.x;
    p.y = s.y;
    p.z = s.z;
    p.vx = s.vx ?? 0;
    p.vy = s.vy ?? 0;
    p.vz = s.vz ?? 0;
    p.life = s.life;
    p.size = s.size;
    p.size1 = s.size1 ?? s.size;
    p.r = s.r;
    p.g = s.g;
    p.b = s.b;
    p.alpha = s.alpha ?? 1;
    p.drag = s.drag ?? 0;
    p.gravity = s.gravity ?? 0;
    p.age = 0;
    this.live.push(p);
  }

  update(dt: number): void {
    const live = this.live;
    let n = 0;
    for (let i = 0; i < live.length; i++) {
      const p = live[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.pool.push(p);
        continue;
      }
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k - p.gravity * dt;
      p.vz *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.03 && p.gravity > 0) {
        p.y = 0.03;
        p.vy *= -0.3;
      }
      const t = p.age / p.life;
      // muncul cepat, memudar perlahan
      const fade = Math.min(1, t * 8) * (1 - t) * (1 - t * 0.3);
      this.cloud.put(n, p.x, p.y, p.z, p.r, p.g, p.b, p.alpha * fade, p.size + (p.size1 - p.size) * t);
      live[n++] = p;
    }
    live.length = n;
    this.cloud.commit(n);
  }
}

/** Warna hex (sRGB) -> komponen linear dikali `gain` (untuk partikel yang ikut ber-bloom). */
const _c = new THREE.Color();
export function rgb(hex: number, gain = 1): [number, number, number] {
  _c.setHex(hex);
  return [_c.r * gain, _c.g * gain, _c.b * gain];
}
