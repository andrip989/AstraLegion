// Geometri properti map: lampu jalan, obelisk kristal, panji tim, reruntuhan kuno, tembok rendah,
// peti & tong, serta permukaan energi di alas penyembuh (fountain).
import * as THREE from 'three';
import { boxUV, build, type Part } from './geo';
import { TEAM_COLOR } from './palette';
import { Tex } from './textures';

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);

const STONE = 0xb4bac8;
const STONE_DARK = 0x848b9c;
const STONE_WARM = 0xc4bba6;
const IRON = 0x2b303b;
const BRASS = 0xa07c3c;
const WOOD = 0x6b4a2e;
const WOOD_DARK = 0x4a3220;

// ------------------------------------------------------------------ lampu jalan

/** Tiang lampu; lengan lentera mengarah ke +Z. `glass` = kaca lentera yang menyala. */
export function lampPost(): { body: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  const lx = 0;
  const lz = 0.46;
  const ly = 2.18;
  const parts: Part[] = [
    { g: box(0.36, 0.16, 0.36), c: STONE_DARK, p: [0, 0.08, 0] },
    { g: box(0.26, 0.14, 0.26), c: STONE, p: [0, 0.22, 0] },
    { g: cyl(0.05, 0.07, 2.45, 6), c: IRON, p: [0, 1.5, 0] },
    { g: cyl(0.085, 0.085, 0.07, 6), c: BRASS, p: [0, 0.55, 0] },
    { g: cyl(0.075, 0.075, 0.06, 6), c: BRASS, p: [0, 2.3, 0] },
    { g: new THREE.SphereGeometry(0.075, 6, 5), c: BRASS, p: [0, 2.76, 0] },
    // lengan + penyangga miring
    { g: box(0.05, 0.05, 0.56), c: IRON, p: [0, 2.6, 0.26] },
    { g: box(0.035, 0.035, 0.42), c: IRON, p: [0, 2.44, 0.16], r: [0.75, 0, 0] },
    { g: box(0.02, 0.14, 0.02), c: IRON, p: [lx, ly + 0.27, lz] },
    // rangka lentera
    { g: new THREE.ConeGeometry(0.17, 0.13, 4), c: IRON, p: [lx, ly + 0.17, lz], r: [0, Math.PI / 4, 0] },
    { g: box(0.2, 0.035, 0.2), c: IRON, p: [lx, ly - 0.12, lz] },
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push({ g: box(0.022, 0.24, 0.022), c: IRON, p: [lx + sx * 0.085, ly, lz + sz * 0.085] });
  }
  return { body: build(parts), glass: box(0.15, 0.2, 0.15).translate(lx, ly, lz) };
}

// --------------------------------------------------------------------- obelisk

/** Obelisk batu bermahkota kristal melayang. `crystal` dirender dengan bahan berpendar. */
export function obelisk(): { stone: THREE.BufferGeometry; crystal: THREE.BufferGeometry } {
  const parts: Part[] = [
    { g: box(0.78, 0.2, 0.78), c: STONE_DARK, p: [0, 0.1, 0] },
    { g: box(0.6, 0.16, 0.6), c: STONE, p: [0, 0.28, 0] },
    { g: cyl(0.2, 0.3, 1.5, 4), c: STONE_DARK, c2: STONE, p: [0, 1.1, 0], r: [0, Math.PI / 4, 0], flat: true },
    { g: box(0.5, 0.07, 0.5), c: BRASS, p: [0, 0.52, 0] },
    { g: box(0.4, 0.06, 0.4), c: BRASS, p: [0, 1.5, 0] },
    { g: box(0.44, 0.12, 0.44), c: STONE, p: [0, 1.9, 0] },
  ];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push({
      g: new THREE.ConeGeometry(0.06, 0.34, 4),
      c: BRASS,
      p: [Math.cos(a) * 0.24, 2.1, Math.sin(a) * 0.24],
      r: [Math.sin(a) * -0.35, 0, Math.cos(a) * 0.35],
    });
  }
  const crystal = new THREE.OctahedronGeometry(0.24, 0).scale(1, 1.7, 1).translate(0, 2.55, 0);
  return { stone: boxUV(build(parts), 0.9), crystal };
}

// ----------------------------------------------------------------------- panji

/** Tiang panji dengan kain warna tim yang menggantung (dua sisi). */
export function banner(team: number): THREE.BufferGeometry {
  const tc = TEAM_COLOR[team];
  const dark = new THREE.Color(tc).multiplyScalar(0.45).getHex();
  const cloth = (flip: boolean): Part[] => {
    const g = new THREE.PlaneGeometry(0.8, 1.7, 4, 6);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const x = pos.getX(i);
      // makin ke bawah makin berkibar; ujung bawah meruncing
      const hang = (0.85 - y) / 1.7;
      pos.setZ(i, Math.sin(x * 4 + hang * 5) * 0.07 * hang);
      if (y < -0.8) pos.setY(i, y + Math.abs(x) * 0.55);
    }
    g.computeVertexNormals();
    const ry = flip ? Math.PI : 0;
    const z = flip ? -0.012 : 0.012;
    return [
      { g, c: dark, c2: tc, r: [0, ry, 0], p: [0, 2.35, z] },
      // lambang belah ketupat + garis emas
      { g: new THREE.PlaneGeometry(0.34, 0.34), c: 0xf2e6c4, r: [0, ry, Math.PI / 4], p: [0, 2.5, z * 3] },
      { g: new THREE.PlaneGeometry(0.8, 0.07), c: 0xe0b450, r: [0, ry, 0], p: [0, 3.1, z * 3] },
    ];
  };
  return build([
    { g: cyl(0.045, 0.06, 3.5, 6), c: WOOD_DARK, c2: WOOD, p: [0, 1.75, -0.06] },
    { g: box(1.0, 0.06, 0.06), c: WOOD, p: [0, 3.22, 0] },
    { g: new THREE.ConeGeometry(0.08, 0.26, 4), c: 0xe0b450, p: [0, 3.62, -0.06] },
    { g: box(0.3, 0.12, 0.3), c: STONE_DARK, p: [0, 0.06, -0.06] },
    ...cloth(false),
    ...cloth(true),
  ]);
}

// ----------------------------------------------------------------- reruntuhan

/** Tiang kuno: 0 = utuh berkepala, 1 = patah + potongan rebah, 2 = sisa pangkal + puing, 3 = gapura. */
export function ruin(variant: number): THREE.BufferGeometry {
  const parts: Part[] = [];
  const drum = (x: number, y: number, z: number, r = 0.32, tilt = 0, c = STONE_WARM): Part => ({
    g: cyl(r * 0.96, r, 0.56, 10),
    c: STONE_DARK,
    c2: c,
    p: [x, y, z],
    r: [tilt, 0, tilt * 0.6],
  });
  const column = (x: number, z: number, drums: number, cap: boolean) => {
    parts.push({ g: box(0.92, 0.2, 0.92), c: STONE_DARK, p: [x, 0.1, z] }, { g: box(0.76, 0.14, 0.76), c: STONE, p: [x, 0.27, z] });
    for (let i = 0; i < drums; i++) parts.push(drum(x + (i % 2) * 0.02, 0.62 + i * 0.56, z, 0.32 - i * 0.008, i === drums - 1 && !cap ? 0.09 : 0));
    if (cap) {
      const top = 0.34 + drums * 0.56;
      parts.push({ g: cyl(0.4, 0.31, 0.16, 10), c: STONE, p: [x, top + 0.08, z] }, { g: box(0.86, 0.16, 0.86), c: STONE_WARM, p: [x, top + 0.24, z] });
    }
  };
  switch (variant % 4) {
    case 0:
      column(0, 0, 4, true);
      break;
    case 1:
      column(0, 0, 2, false);
      parts.push({ g: cyl(0.3, 0.31, 1.1, 10), c: STONE_DARK, c2: STONE_WARM, p: [0.95, 0.3, 0.35], r: [Math.PI / 2, 0, 0.5] });
      parts.push({ g: box(0.4, 0.3, 0.34), c: STONE, p: [-0.7, 0.14, 0.5], r: [0.1, 0.6, 0.15], flat: true });
      break;
    case 2:
      column(0, 0, 1, false);
      parts.push({ g: box(0.5, 0.34, 0.4), c: STONE_WARM, p: [0.75, 0.16, -0.3], r: [0.2, 0.4, 0.1], flat: true });
      parts.push({ g: box(0.34, 0.24, 0.3), c: STONE_DARK, p: [-0.6, 0.11, 0.45], r: [0, 1.1, 0.2], flat: true });
      parts.push({ g: cyl(0.3, 0.31, 0.5, 10), c: STONE_DARK, c2: STONE, p: [0.2, 0.3, 0.85], r: [Math.PI / 2, 0, 1.2] });
      break;
    default:
      column(-1.1, 0, 3, true);
      column(1.1, 0, 3, true);
      parts.push({ g: box(3.3, 0.34, 0.8), c: STONE_DARK, c2: STONE_WARM, p: [0, 2.6, 0] });
      parts.push({ g: box(3.0, 0.14, 0.94), c: STONE, p: [0, 2.84, 0] });
      break;
  }
  return boxUV(build(parts), 0.9);
}

/** Potongan tembok batu rendah (panjang ~2, sepanjang sumbu X). */
export function lowWall(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const row = (y: number, n: number, shift: number, h: number) => {
    for (let i = 0; i < n; i++) {
      const w = 2 / n;
      parts.push({
        g: box(w * 0.94, h, 0.42 - (i % 2) * 0.04),
        c: i % 2 ? STONE : STONE_DARK,
        c2: i % 2 ? STONE_WARM : STONE,
        p: [-1 + w * (i + 0.5) + shift, y, 0],
        warp: 0.012,
        seed: i + y * 10,
      });
    }
  };
  row(0.15, 3, 0, 0.3);
  row(0.44, 4, 0.03, 0.26);
  parts.push({ g: box(1.3, 0.12, 0.5), c: STONE, p: [-0.3, 0.63, 0] });
  return boxUV(build(parts), 0.9);
}

/** Tumpukan peti dan tong perbekalan. */
export function supplies(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const crate = (x: number, y: number, z: number, s: number, ry: number) => {
    parts.push({ g: box(s, s, s), c: WOOD_DARK, c2: WOOD, p: [x, y + s / 2, z], r: [0, ry, 0] });
    for (const e of [-1, 1]) {
      parts.push({ g: box(s * 1.04, s * 0.1, s * 1.04), c: 0x8a6a44, p: [x, y + s / 2 + e * s * 0.42, z], r: [0, ry, 0] });
    }
  };
  crate(0, 0, 0, 0.62, 0.2);
  crate(0.72, 0, 0.12, 0.54, -0.3);
  crate(0.3, 0.62, 0.05, 0.46, 0.5);
  parts.push({ g: cyl(0.26, 0.24, 0.66, 10), c: WOOD_DARK, c2: WOOD, p: [-0.62, 0.33, 0.3] });
  for (const y of [0.14, 0.52]) parts.push({ g: cyl(0.275, 0.275, 0.06, 10), c: IRON, p: [-0.62, y, 0.3] });
  parts.push({ g: cyl(0.27, 0.27, 0.03, 10), c: 0x8a6a44, p: [-0.62, 0.665, 0.3] });
  return build(parts);
}

// --------------------------------------------------------------- alas penyembuh

/** Cincin batu rendah bersegmen mengelilingi alas penyembuh. */
export function padRim(r: number): THREE.BufferGeometry {
  const parts: Part[] = [];
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const tall = i % 2 === 0;
    parts.push({
      g: box(((Math.PI * 2 * r) / n) * 0.9, tall ? 0.2 : 0.13, 0.36),
      c: tall ? STONE_DARK : STONE,
      c2: tall ? STONE : STONE_WARM,
      p: [Math.cos(a) * r, tall ? 0.1 : 0.065, Math.sin(a) * r],
      r: [0, -a + Math.PI / 2, 0],
    });
  }
  return boxUV(build(parts), 0.9);
}

/** Permukaan energi berkilau (pola kaustik bergerak) dalam warna tim. */
export function energyPool(color: THREE.Color, uTime: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uColor: { value: color }, tNoise: { value: Tex.noise() } },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform sampler2D tNoise;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        float n1 = texture2D(tNoise, vUv * 1.5 + vec2(uTime * 0.031, uTime * 0.017)).r;
        float n2 = texture2D(tNoise, vUv * 2.3 - vec2(uTime * 0.023, -uTime * 0.029)).g;
        float caustic = pow(clamp(1.0 - abs(n1 - n2) * 2.6, 0.0, 1.0), 7.0);
        float rings = 0.5 + 0.5 * sin(r * 16.0 - uTime * 1.8);
        vec3 col = uColor * (0.22 + 1.5 * caustic + 0.16 * rings * (1.0 - r));
        float alpha = (0.42 + 0.5 * caustic) * smoothstep(1.0, 0.86, r);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ------------------------------------------------------------------------ kolam

/** Air kolam: tepi tak beraturan, riak bergerak, pantulan langit, dan kilau matahari. */
export function pondWater(uTime: { value: number }, sunDir: THREE.Vector3): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uSun: { value: sunDir }, tNoise: { value: Tex.noise() } },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSun;
      uniform sampler2D tNoise;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float shore = r + (texture2D(tNoise, vWorld.xz * 0.21).r - 0.5) * 0.34;
        if (shore > 0.94) discard;
        vec2 w = vWorld.xz * 0.33;
        vec2 n1 = texture2D(tNoise, w + uTime * vec2(0.021, 0.013)).rg - 0.5;
        vec2 n2 = texture2D(tNoise, w * 1.9 - uTime * vec2(0.017, 0.023)).gb - 0.5;
        vec3 n = normalize(vec3((n1.x + n2.x) * 0.8, 1.0, (n1.y + n2.y) * 0.8));
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 col = mix(vec3(0.015, 0.07, 0.09), vec3(0.06, 0.24, 0.22), smoothstep(0.45, 0.94, shore));
        col = mix(col, vec3(0.42, 0.6, 0.8), clamp(fres * 0.9 + 0.08, 0.0, 1.0));
        col += vec3(1.0, 0.88, 0.66) * pow(max(dot(n, normalize(v + uSun)), 0.0), 140.0) * 3.0;
        col += vec3(0.5, 0.72, 0.7) * smoothstep(0.86, 0.94, shore) * 0.22;
        gl_FragColor = vec4(col, 0.92);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// --------------------------------------------------------- kupu-kupu & daun melayang

/**
 * Bahan untuk InstancedMesh sayap (lihat foliage.wings). Atribut per instance:
 *   aBase (titik pusat), aSeed (x = fase acak, y = 0 kupu-kupu / 1 daun gugur), aTint (warna).
 * Semua gerak (mengepak, berkeliling, jatuh) dihitung di vertex shader.
 */
export function flutterMaterial(uTime: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 aBase;
      attribute vec2 aSeed;
      attribute vec3 aTint;
      uniform float uTime;
      varying vec3 vTint;
      void main() {
        float ph = aSeed.x * 6.2831;
        float leaf = aSeed.y;
        vec3 p = position;
        // kupu-kupu mengepak cepat; daun berputar pelan
        float flap = mix(sin(uTime * 15.0 + ph * 9.0) * 0.95, sin(uTime * 2.2 + ph) * 0.5, leaf);
        p.y += abs(p.x) * flap;
        float t = uTime * mix(0.5, 0.22, leaf) + ph;
        vec2 wander = vec2(sin(t) * 1.5 + sin(t * 2.3) * 0.5, cos(t * 0.8) * 1.5 + cos(t * 1.9) * 0.4);
        vec2 heading = normalize(vec2(cos(t) * 1.5 + cos(t * 2.3) * 1.15, -sin(t * 0.8) * 1.2 - sin(t * 1.9) * 0.76));
        float spin = leaf * (uTime * 1.3 + ph);
        vec2 f = mix(heading, vec2(sin(spin), cos(spin)), leaf);
        // sumbu +Z model diarahkan ke arah terbang
        vec3 q = vec3(p.x * f.y + p.z * f.x, p.y, -p.x * f.x + p.z * f.y);
        float fall = mod(uTime * 0.55 + aSeed.x * 7.0, 4.2);
        vec3 c = aBase;
        c.xz += wander * mix(1.0, 0.5, leaf);
        c.y += mix(0.3 * sin(t * 1.7), -fall, leaf);
        vTint = aTint * (0.75 + 0.25 * step(0.0, p.x * flap));
        gl_Position = projectionMatrix * viewMatrix * vec4(c + q * mix(0.8, 0.7, leaf), 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vTint;
      void main() {
        gl_FragColor = vec4(vTint, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
