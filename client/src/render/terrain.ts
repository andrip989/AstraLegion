// Tanah: satu bidang besar dengan shader "splat". Tekstur rumput, tanah, dan batu jalan yang
// berulang (tajam walau dilihat dari dekat) dicampur menurut peta topeng yang digambar dari
// layout map, lalu ditimpa lapisan hiasan (pelataran base, alas tower, lingkaran camp).
import * as THREE from 'three';
import { CAMPS, CORES, FOUNTAINS, LANE_PATHS, MAP_SIZE, OBSTACLES, TOWERS, type Vec2 } from '../../../shared/src';
import { GFX } from './quality';
import { canvasTexture, newCanvas, rng, Tex } from './textures';

const TEAM_RGB = ['64,140,255', '255,84,84'];

type Ctx = CanvasRenderingContext2D;

/** Jalan setapak tanah di jungle (sisi kiri-atas); sisi lain adalah cermin titiknya. */
const TRAILS_HALF: Vec2[][] = [
  [
    { x: 18, z: 36 },
    { x: 30, z: 37 },
    { x: 32, z: 40 },
  ],
  [
    { x: 36, z: 18 },
    { x: 36, z: 30 },
    { x: 40, z: 32 },
  ],
  [
    { x: 32, z: 40 },
    { x: 32, z: 48 },
    { x: 44, z: 49.5 },
    { x: 49, z: 49 },
  ],
  [
    { x: 40, z: 32 },
    { x: 48, z: 32 },
    { x: 49.5, z: 40 },
    { x: 49, z: 49 },
  ],
  [
    { x: 49, z: 49 },
    { x: 59, z: 59 },
  ],
  [
    { x: 60, z: 18 },
    { x: 60.5, z: 30 },
    { x: 66, z: 35 },
    { x: 69, z: 48 },
  ],
  [
    { x: 18, z: 60 },
    { x: 30, z: 60.5 },
    { x: 35, z: 66 },
    { x: 48, z: 69 },
  ],
];
export const TRAILS: Vec2[][] = [...TRAILS_HALF, ...TRAILS_HALF.map((t) => t.map((p) => ({ x: MAP_SIZE - p.x, z: MAP_SIZE - p.z })))];

function polyline(ctx: Ctx, s: number, pts: Vec2[]): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * s, p.z * s) : ctx.lineTo(p.x * s, p.z * s)));
}

function strokeLanes(ctx: Ctx, s: number, width: number): void {
  ctx.lineWidth = width * s;
  for (const lane of LANE_PATHS) {
    polyline(ctx, s, lane);
    ctx.stroke();
  }
}

function disc(ctx: Ctx, s: number, x: number, z: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x * s, z * s, Math.max(0.01, r) * s, 0, Math.PI * 2);
}

/**
 * Gambar bentuk dengan tepi memudar: `draw(grow)` dipanggil beberapa kali dengan ukuran
 * -1..+1, tiap lapis menambah sebagian intensitas (komposit 'lighter').
 */
function feather(ctx: Ctx, steps: number, draw: (grow: number) => void): void {
  ctx.globalAlpha = 1 / steps;
  for (let k = 0; k < steps; k++) draw(steps === 1 ? 0 : -1 + (2 * k) / (steps - 1));
  ctx.globalAlpha = 1;
}

/**
 * Peta topeng: R = batu jalan, G = tanah gundul, B = gelap di kaki tebing.
 * Alpha selalu penuh supaya nilai warna tidak rusak oleh premultiply canvas.
 */
function paintMask(ctx: Ctx, size: number): void {
  const s = size / MAP_SIZE;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const N = 6;

  // --- R: batu
  ctx.strokeStyle = ctx.fillStyle = '#ff0000';
  feather(ctx, N, (g) => {
    strokeLanes(ctx, s, 9.5 + g * 0.5);
    for (const c of CORES) {
      disc(ctx, s, c.x, c.z, 9.1 + g * 0.3);
      ctx.fill();
    }
    FOUNTAINS.forEach((f, t) => {
      disc(ctx, s, f.x, f.z, 5.3 + g * 0.3);
      ctx.fill();
      ctx.lineWidth = (4.6 + g * 0.5) * s;
      polyline(ctx, s, [f, CORES[t]]);
      ctx.stroke();
    });
    for (const t of TOWERS) {
      disc(ctx, s, t.x, t.z, 2.5 + g * 0.25);
      ctx.fill();
    }
  });

  // --- G: tanah
  ctx.strokeStyle = ctx.fillStyle = '#00ff00';
  feather(ctx, N, (g) => {
    strokeLanes(ctx, s, 12.6 + g * 1.4);
    for (const c of CORES) {
      disc(ctx, s, c.x, c.z, 11.5 + g * 1.2);
      ctx.fill();
    }
    for (const f of FOUNTAINS) {
      disc(ctx, s, f.x, f.z, 7 + g);
      ctx.fill();
    }
    for (const c of CAMPS) {
      disc(ctx, s, c.x, c.z, (c.big ? 5.2 : 4) + g * 1.2);
      ctx.fill();
    }
    for (const t of TOWERS) {
      disc(ctx, s, t.x, t.z, 3.7 + g * 0.8);
      ctx.fill();
    }
    ctx.lineWidth = (2.5 + g * 0.9) * s;
    for (const trail of TRAILS) {
      polyline(ctx, s, trail);
      ctx.stroke();
    }
  });

  // --- B: bayangan lembut di kaki tebing
  ctx.strokeStyle = '#0000ff';
  ctx.lineJoin = 'round';
  feather(ctx, N, (g) => {
    ctx.lineWidth = (2.2 + g * 1.6) * s;
    for (const r of OBSTACLES) ctx.strokeRect(r.x0 * s, r.z0 * s, (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
  });
  ctx.globalCompositeOperation = 'source-over';
}

/** Deretan batu kecil melingkar (tiap batu sedikit berbeda warna). */
function stoneRing(ctx: Ctx, s: number, x: number, z: number, r: number, count: number, w: number, rnd: () => number, alpha = 0.92): void {
  for (let i = 0; i < count; i++) {
    const a0 = (i / count) * Math.PI * 2;
    const a1 = ((i + 0.86) / count) * Math.PI * 2;
    const g = 150 + rnd() * 50;
    ctx.fillStyle = `rgba(${g + 4},${g + 2},${g - 6},${alpha})`;
    ctx.beginPath();
    ctx.arc(x * s, z * s, (r + w / 2) * s, a0, a1);
    ctx.arc(x * s, z * s, (r - w / 2) * s, a1, a0, true);
    ctx.closePath();
    ctx.fill();
  }
}

/** Lapisan hiasan di atas tanah (RGBA, transparan di luar pola). */
function paintOverlay(ctx: Ctx, size: number): void {
  const s = size / MAP_SIZE;
  const rnd = rng(77);
  ctx.clearRect(0, 0, size, size);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';

  // batu pinggir jalan: garis putus-putus selebar jalan, lalu bagian dalamnya dihapus
  ctx.strokeStyle = 'rgba(178,180,172,0.9)';
  ctx.setLineDash([1.15 * s, 0.16 * s]);
  strokeLanes(ctx, s, 10.3);
  ctx.setLineDash([]);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.strokeStyle = '#000';
  strokeLanes(ctx, s, 9.3);
  for (const c of CORES) {
    disc(ctx, s, c.x, c.z, 9.4);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  // bekas pijakan: tengah jalan sedikit lebih terang
  ctx.strokeStyle = 'rgba(255,244,214,0.07)';
  strokeLanes(ctx, s, 4.2);

  // lingkaran camp: tanah hangus di tengah, dikelilingi batu-batu
  for (const c of CAMPS) {
    const r = c.big ? 4.3 : 3.3;
    const g = ctx.createRadialGradient(c.x * s, c.z * s, 0, c.x * s, c.z * s, r * s);
    g.addColorStop(0, 'rgba(40,28,20,0.5)');
    g.addColorStop(0.7, 'rgba(48,34,22,0.22)');
    g.addColorStop(1, 'rgba(48,34,22,0)');
    ctx.fillStyle = g;
    disc(ctx, s, c.x, c.z, r);
    ctx.fill();
    for (let i = 0, n = c.big ? 26 : 20; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.12;
      const rr = r + (rnd() - 0.5) * 0.35;
      const sz = 0.2 + rnd() * 0.22;
      const gr = 120 + rnd() * 60;
      ctx.fillStyle = `rgba(${gr},${gr},${gr - 8},0.95)`;
      ctx.beginPath();
      ctx.ellipse((c.x + Math.cos(a) * rr) * s, (c.z + Math.sin(a) * rr) * s, sz * s, sz * 0.75 * s, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // alas tower: cincin batu + empat tanda warna tim
  for (const t of TOWERS) {
    ctx.fillStyle = 'rgba(58,64,76,0.5)';
    disc(ctx, s, t.x, t.z, 2.3);
    ctx.fill();
    stoneRing(ctx, s, t.x, t.z, 2.25, 18, 0.32, rnd);
    ctx.fillStyle = `rgba(${TEAM_RGB[t.team]},0.8)`;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      ctx.beginPath();
      for (const [da, rr] of [
        [0, 2.02],
        [0.2, 1.62],
        [-0.2, 1.62],
      ]) {
        ctx.lineTo((t.x + Math.cos(a + da) * rr) * s, (t.z + Math.sin(a + da) * rr) * s);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  // pelataran base & fountain
  CORES.forEach((c, t) => {
    const team = TEAM_RGB[t];
    const f = FOUNTAINS[t];

    // jalan penghubung fountain -> core: garis tepi
    ctx.strokeStyle = 'rgba(178,180,172,0.85)';
    ctx.lineWidth = 4.9 * s;
    ctx.setLineDash([1.0 * s, 0.14 * s]);
    polyline(ctx, s, [f, c]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 4.2 * s;
    polyline(ctx, s, [f, c]);
    ctx.stroke();
    for (const [p, r] of [
      [c, 9.3],
      [f, 5.5],
    ] as [Vec2, number][]) {
      disc(ctx, s, p.x, p.z, r);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // pelataran: lantai lebih gelap kebiruan, makin gelap ke tengah
    const g = ctx.createRadialGradient(c.x * s, c.z * s, 0, c.x * s, c.z * s, 9 * s);
    g.addColorStop(0, 'rgba(44,50,66,0.62)');
    g.addColorStop(1, 'rgba(58,64,78,0.4)');
    ctx.fillStyle = g;
    disc(ctx, s, c.x, c.z, 9);
    ctx.fill();
    stoneRing(ctx, s, c.x, c.z, 8.8, 56, 0.5, rnd);
    stoneRing(ctx, s, c.x, c.z, 4.3, 30, 0.36, rnd);
    // mosaik segitiga warna tim / batu terang, berselang-seling
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const da = Math.PI / 32;
      const up = i % 2 === 0;
      ctx.fillStyle = up ? `rgba(${team},0.78)` : 'rgba(196,194,184,0.75)';
      ctx.beginPath();
      const [r0, r1] = up ? [6.1, 7.2] : [7.2, 6.1];
      ctx.moveTo((c.x + Math.cos(a - da) * r0) * s, (c.z + Math.sin(a - da) * r0) * s);
      ctx.lineTo((c.x + Math.cos(a + da) * r0) * s, (c.z + Math.sin(a + da) * r0) * s);
      ctx.lineTo((c.x + Math.cos(a) * r1) * s, (c.z + Math.sin(a) * r1) * s);
      ctx.closePath();
      ctx.fill();
    }
    ctx.lineWidth = 0.14 * s;
    ctx.strokeStyle = 'rgba(22,26,34,0.7)';
    for (const r of [5.95, 7.35]) {
      disc(ctx, s, c.x, c.z, r);
      ctx.stroke();
    }
    ctx.lineWidth = 0.2 * s;
    ctx.strokeStyle = `rgba(${team},0.9)`;
    disc(ctx, s, c.x, c.z, 8.05);
    ctx.stroke();
    // jari-jari
    ctx.strokeStyle = 'rgba(22,26,34,0.6)';
    ctx.lineWidth = 0.12 * s;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
      ctx.beginPath();
      ctx.moveTo((c.x + Math.cos(a) * 4.5) * s, (c.z + Math.sin(a) * 4.5) * s);
      ctx.lineTo((c.x + Math.cos(a) * 5.9) * s, (c.z + Math.sin(a) * 5.9) * s);
      ctx.stroke();
    }

    // lantai fountain
    const fg = ctx.createRadialGradient(f.x * s, f.z * s, 0, f.x * s, f.z * s, 5.2 * s);
    fg.addColorStop(0, `rgba(${team},0.3)`);
    fg.addColorStop(1, 'rgba(58,64,78,0.42)');
    ctx.fillStyle = fg;
    disc(ctx, s, f.x, f.z, 5.2);
    ctx.fill();
    stoneRing(ctx, s, f.x, f.z, 5.05, 34, 0.42, rnd);
    ctx.strokeStyle = `rgba(${team},0.85)`;
    ctx.lineWidth = 0.16 * s;
    disc(ctx, s, f.x, f.z, 4.5);
    ctx.stroke();
  });
}

const MAP_FRAGMENT = /* glsl */ `
  vec2 wuv = vWPos.xz;
  vec2 muv = wuv / ${MAP_SIZE.toFixed(1)};
  vec2 tIn2 = step(vec2(0.0), muv) * step(muv, vec2(1.0));
  float tIn = tIn2.x * tIn2.y;
  vec2 cuv = clamp(muv, 0.002, 0.998);
  vec4 tMaskV = texture2D(tMask, cuv);
  vec3 tNz = texture2D(tNoise, wuv * 0.137).rgb;
  vec3 tLo = texture2D(tNoise, wuv * 0.021 + 0.37).rgb;
  float tStoneW = smoothstep(0.44, 0.56, tMaskV.r + (tNz.b - 0.5) * 0.22) * tIn;
  float tDirtM = mix(smoothstep(0.6, 0.82, tLo.r) * 0.8, tMaskV.g, tIn);
  float tDirtW = smoothstep(0.34, 0.66, tDirtM + (tNz.r - 0.5) * 0.55) * (1.0 - tStoneW);
  vec3 tGrassC = mix(texture2D(tGrass, wuv * 0.17).rgb, texture2D(tGrass, wuv * 0.047 + vec2(0.31, 0.67)).rgb, 0.4);
  tGrassC *= mix(vec3(0.8, 0.86, 0.78), vec3(1.1, 1.06, 0.88), tLo.g);
  vec3 tDirtC = texture2D(tDirt, wuv * 0.21).rgb * mix(0.84, 1.14, tLo.b);
  vec3 tStoneC = texture2D(tStone, wuv * 0.2).rgb * mix(0.86, 1.1, tLo.r);
  vec3 tCol = mix(mix(tGrassC, tDirtC, tDirtW), tStoneC, tStoneW);
  vec4 tOv = texture2D(tOverlay, cuv) * tIn;
  float tDet = clamp(dot(tStoneC, vec3(0.3, 0.59, 0.11)) / 0.2, 0.45, 1.7);
  tCol = mix(tCol, tOv.rgb * mix(1.0, tDet, 0.55), tOv.a);
  tCol *= 1.0 - 0.5 * tMaskV.b * tIn;
  tCol *= mix(0.62, 1.0, tIn);
`;

/** Bayangan awan yang bergerak pelan di atas tanah (kualitas sedang & tinggi). */
const CLOUD_FRAGMENT = /* glsl */ `
  float tCloud = texture2D(tNoise, wuv * 0.011 + uTime * vec2(0.0045, 0.0021)).g;
  tCol *= mix(0.74, 1.0, smoothstep(0.34, 0.62, tCloud));
`;

/** Kualitas tinggi: lapisan detail halus tambahan supaya tanah tetap tajam saat kamera dekat. */
const MICRO_FRAGMENT = /* glsl */ `
  vec3 tMicro = mix(texture2D(tGrass, wuv * 0.63).rgb, texture2D(tStone, wuv * 0.71).rgb, tStoneW);
  float tMicroL = dot(tMicro, vec3(0.3, 0.59, 0.11));
  tCol *= mix(1.0, clamp(tMicroL / mix(0.085, 0.2, tStoneW), 0.6, 1.5), 0.35 * (1.0 - tDirtW));
`;

const NORMAL_FRAGMENT = /* glsl */ `
  vec3 tnG = texture2D(tGrassN, wuv * 0.17).xyz * 2.0 - 1.0;
  vec3 tnD = texture2D(tDirtN, wuv * 0.21).xyz * 2.0 - 1.0;
  vec3 tnS = texture2D(tStoneN, wuv * 0.2).xyz * 2.0 - 1.0;
  vec3 tnT = mix(mix(tnG, tnD, tDirtW), tnS, tStoneW);
  tnT.xy *= 1.3;
  normal = normalize((viewMatrix * vec4(normalize(vec3(tnT.x, tnT.z, tnT.y)), 0.0)).xyz);
`;

/** Bidang tanah: area map + pinggiran luar sampai tertutup kabut. */
export function buildGround(scene: THREE.Scene, uTime: { value: number }): void {
  const low = GFX.low;
  const high = GFX.high;
  const grass = Tex.grass();
  const dirt = Tex.dirt();
  const cobble = Tex.cobble();

  const [mc, mctx] = newCanvas(low ? 512 : high ? 2048 : 1024);
  paintMask(mctx, mc.width);
  const mask = canvasTexture(mc, false, false);
  const [oc, octx] = newCanvas(low ? 1024 : high ? 4096 : 2048);
  paintOverlay(octx, oc.width);
  const overlay = canvasTexture(oc, true, false);

  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      tMask: { value: mask },
      tOverlay: { value: overlay },
      tNoise: { value: Tex.noise() },
      tGrass: { value: grass.map },
      tDirt: { value: dirt.map },
      tStone: { value: cobble.map },
      tGrassN: { value: grass.normal },
      tDirtN: { value: dirt.normal },
      tStoneN: { value: cobble.normal },
      uTime,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    let frag = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        uniform float uTime;
        uniform sampler2D tMask, tOverlay, tNoise, tGrass, tDirt, tStone, tGrassN, tDirtN, tStoneN;`,
      )
      .replace('#include <map_fragment>', MAP_FRAGMENT + (high ? MICRO_FRAGMENT : '') + (low ? '' : CLOUD_FRAGMENT) + 'diffuseColor.rgb *= tCol;')
      .replace(
        '#include <roughnessmap_fragment>',
        // kualitas tinggi: batu yang lebih terang sedikit lebih licin, jadi ada kilau saat terkena cahaya
        `#include <roughnessmap_fragment>\nroughnessFactor = mix(1.0, ${high ? 'clamp(1.02 - tDet * 0.34, 0.5, 0.9)' : '0.8'}, tStoneW);`,
      );
    if (!low) frag = frag.replace('#include <normal_fragment_maps>', high ? NORMAL_FRAGMENT.replace('tnT.xy *= 1.3;', 'tnT.xy *= 1.6;') : NORMAL_FRAGMENT);
    shader.fragmentShader = frag;
  };

  const span = MAP_SIZE + 280;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(span, span).rotateX(-Math.PI / 2), mat);
  ground.position.set(MAP_SIZE / 2, 0, MAP_SIZE / 2);
  ground.receiveShadow = true;
  scene.add(ground);
}

/** Latar minimap: lane, dinding jungle, camp, dan base dalam warna datar yang mudah dibaca. */
export function paintMinimap(ctx: Ctx, size: number): void {
  const s = size / MAP_SIZE;
  const bg = ctx.createLinearGradient(0, size, size, 0);
  bg.addColorStop(0, '#16263a');
  bg.addColorStop(0.5, '#162a24');
  bg.addColorStop(1, '#2a1c2a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(120,96,64,0.5)';
  ctx.lineWidth = 2.2 * s;
  for (const trail of TRAILS) {
    polyline(ctx, s, trail);
    ctx.stroke();
  }
  ctx.strokeStyle = '#3a4862';
  strokeLanes(ctx, s, 11.5);
  ctx.strokeStyle = '#6a7a9c';
  strokeLanes(ctx, s, 8.4);

  CORES.forEach((c, t) => {
    const g = ctx.createRadialGradient(c.x * s, c.z * s, 0, c.x * s, c.z * s, 22 * s);
    g.addColorStop(0, `rgba(${TEAM_RGB[t]},0.5)`);
    g.addColorStop(1, `rgba(${TEAM_RGB[t]},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#4c5a78';
    disc(ctx, s, c.x, c.z, 8.8);
    ctx.fill();
    const f = FOUNTAINS[t];
    ctx.fillStyle = `rgba(${TEAM_RGB[t]},0.4)`;
    ctx.strokeStyle = `rgba(${TEAM_RGB[t]},0.95)`;
    ctx.lineWidth = 0.6 * s;
    disc(ctx, s, f.x, f.z, 5);
    ctx.fill();
    ctx.stroke();
  });
  for (const c of CAMPS) {
    ctx.fillStyle = 'rgba(214,170,70,0.35)';
    disc(ctx, s, c.x, c.z, c.big ? 4 : 3);
    ctx.fill();
  }
  for (const r of OBSTACLES) {
    ctx.fillStyle = '#1d3a2a';
    ctx.fillRect(r.x0 * s, r.z0 * s, (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
    ctx.fillStyle = '#2f5a3c';
    ctx.fillRect(r.x0 * s + 1, r.z0 * s + 1, (r.x1 - r.x0) * s - 2, (r.z1 - r.z0) * s - 3);
  }
}
