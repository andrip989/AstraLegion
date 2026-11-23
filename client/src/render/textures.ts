// Tekstur prosedural. Semuanya digambar ke canvas saat game dimulai, jadi tidak ada file gambar
// yang perlu diunduh: rumput, tanah, batu jalan, batu tebing, noise, dan sprite cahaya/asap.
import * as THREE from 'three';
import { GFX } from './quality';

/** Generator angka acak berbenih, supaya hasilnya selalu sama. */
export function rng(seed: number): () => number {
  let s = Math.floor(seed) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Value noise 2D yang berulang tiap `period` satuan (maks. 256), hasil 0..1. */
export type Noise2 = (x: number, y: number, period: number) => number;

export function makeNoise(seed: number): Noise2 {
  const rnd = rng(seed);
  const val = new Float32Array(256);
  const perm = new Uint8Array(512);
  for (let i = 0; i < 256; i++) {
    val[i] = rnd();
    perm[i] = i;
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = perm[i];
    perm[i] = perm[j];
    perm[j] = t;
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  return (x, y, period) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y0 = ((yi % period) + period) % period;
    const y1 = (y0 + 1) % period;
    const a = val[perm[perm[x0] + y0]];
    const b = val[perm[perm[x1] + y0]];
    const c = val[perm[perm[x0] + y1]];
    const d = val[perm[perm[x1] + y1]];
    return a + (b - a) * u + (c - a + (a - b - c + d) * u) * v;
  };
}

/** Jumlah beberapa oktaf noise; `u`,`v` dalam 0..1 dan hasilnya berulang mulus di tepi. */
export function fbm(n: Noise2, u: number, v: number, freq: number, octaves: number, gain = 0.5): number {
  let amp = 1;
  let sum = 0;
  let norm = 0;
  let f = freq;
  for (let o = 0; o < octaves; o++) {
    sum += amp * n(u * f, v * f, f);
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

type RGB = [number, number, number];
/** Gradasi tiga warna: t=0 -> a, 0.5 -> b, 1 -> c. */
function ramp(a: RGB, b: RGB, c: RGB, t: number, out: RGB): void {
  const lo = t < 0.5 ? a : b;
  const hi = t < 0.5 ? b : c;
  const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  out[0] = lo[0] + (hi[0] - lo[0]) * k;
  out[1] = lo[1] + (hi[1] - lo[1]) * k;
  out[2] = lo[2] + (hi[2] - lo[2]) * k;
}

let anisotropy = 4;
/** Dipanggil sekali setelah renderer dibuat. */
export function configureTextures(renderer: THREE.WebGLRenderer): void {
  anisotropy = Math.min(GFX.low ? 2 : GFX.high ? 16 : 8, renderer.capabilities.getMaxAnisotropy());
}

export function newCanvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

/** Canvas -> tekstur. `flipY` dimatikan: baris 0 canvas = v 0, jadi uv = (x, z) dunia. */
export function canvasTexture(canvas: HTMLCanvasElement, srgb: boolean, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.flipY = false;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}

/** Peta normal dari peta ketinggian yang berulang (ukuran pangkat dua). */
function normalFromHeight(h: Float32Array, size: number, strength: number): THREE.CanvasTexture {
  const [c, ctx] = newCanvas(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const m = size - 1;
  const k = strength * (size / 512);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (h[y * size + ((x - 1) & m)] - h[y * size + ((x + 1) & m)]) * k;
      const ny = (h[((y - 1) & m) * size + x] - h[((y + 1) & m) * size + x]) * k;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      d[i] = (nx * inv * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      d[i + 2] = (inv * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c, false);
}

export interface TexPair {
  map: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
}

/** Gambar bentuk yang menyeberangi tepi canvas di sisi seberangnya juga, supaya tekstur berulang mulus. */
function wrapped(size: number, x: number, y: number, r: number, draw: (ox: number, oy: number) => void): void {
  for (const ox of x < r ? [0, size] : x > size - r ? [0, -size] : [0]) {
    for (const oy of y < r ? [0, size] : y > size - r ? [0, -size] : [0]) draw(ox, oy);
  }
}

/** Luminans canvas (0..1) dicampur ke peta ketinggian. */
function blendLuminance(ctx: CanvasRenderingContext2D, size: number, h: Float32Array, weight: number): void {
  const d = ctx.getImageData(0, 0, size, size).data;
  for (let i = 0; i < size * size; i++) {
    const lum = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
    h[i] = h[i] * (1 - weight) + lum * weight;
  }
}

// ------------------------------------------------------------------------ rumput

function grassTextures(size: number): TexPair {
  const n = makeNoise(11);
  const n2 = makeNoise(29);
  const [c, ctx] = newCanvas(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const h = new Float32Array(size * size);
  const dark: RGB = [38, 62, 40];
  const mid: RGB = [54, 82, 44];
  const light: RGB = [78, 98, 52];
  const col: RGB = [0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const a = fbm(n, u, v, 4, 4);
      const b = fbm(n2, u, v, 32, 2);
      ramp(dark, mid, light, clamp01((a - 0.5) * 2.4 + 0.5), col);
      const k = 0.84 + 0.32 * b;
      const i = (y * size + x) * 4;
      d[i] = col[0] * k;
      d[i + 1] = col[1] * k;
      d[i + 2] = col[2] * k;
      d[i + 3] = 255;
      h[y * size + x] = a * 0.4 + b * 0.6;
    }
  }
  ctx.putImageData(img, 0, 0);

  // ribuan helai pendek: memberi kesan rumput, bukan sekadar bercak warna
  const rnd = rng(301);
  const sc = size / 512;
  ctx.lineCap = 'round';
  for (let i = 0, count = Math.round((size * size) / 30); i < count; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const len = (5 + rnd() * 10) * sc;
    const lean = (rnd() - 0.5) * len * 0.9;
    ctx.strokeStyle = `hsl(${80 + rnd() * 44},${24 + rnd() * 24}%,${15 + rnd() * 21}%)`;
    ctx.lineWidth = (0.9 + rnd() * 1.1) * sc;
    wrapped(size, x, y, len + 2, (ox, oy) => {
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.quadraticCurveTo(x + ox + lean * 0.15, y + oy - len * 0.6, x + ox + lean, y + oy - len);
      ctx.stroke();
    });
  }
  blendLuminance(ctx, size, h, 0.65);
  return { map: canvasTexture(c, true), normal: normalFromHeight(h, size, 5) };
}

// ------------------------------------------------------------------------- tanah

function dirtTextures(size: number): TexPair {
  const n = makeNoise(53);
  const n2 = makeNoise(71);
  const [c, ctx] = newCanvas(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const h = new Float32Array(size * size);
  const dark: RGB = [74, 58, 42];
  const mid: RGB = [104, 84, 60];
  const light: RGB = [134, 112, 82];
  const col: RGB = [0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const a = fbm(n, u, v, 5, 4);
      const b = fbm(n2, u, v, 48, 2);
      ramp(dark, mid, light, clamp01((a - 0.5) * 2 + 0.5), col);
      const k = 0.86 + 0.28 * b;
      const i = (y * size + x) * 4;
      d[i] = col[0] * k;
      d[i + 1] = col[1] * k;
      d[i + 2] = col[2] * k;
      d[i + 3] = 255;
      h[y * size + x] = a * 0.55 + b * 0.45;
    }
  }
  ctx.putImageData(img, 0, 0);

  // kerikil: lonjong kecil dengan sisi terang di atas dan bayangan di bawah
  const rnd = rng(907);
  const sc = size / 512;
  for (let i = 0; i < 260; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = (1.6 + rnd() * rnd() * 7) * sc;
    const rot = rnd() * Math.PI;
    const g = 96 + rnd() * 70;
    wrapped(size, x, y, r * 2, (ox, oy) => {
      ctx.fillStyle = 'rgba(40,30,20,0.5)';
      ctx.beginPath();
      ctx.ellipse(x + ox + r * 0.2, y + oy + r * 0.35, r * 1.05, r * 0.75, rot, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgb(${g + 8},${g},${g - 14})`;
      ctx.beginPath();
      ctx.ellipse(x + ox, y + oy, r, r * 0.7, rot, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,250,235,0.28)';
      ctx.beginPath();
      ctx.ellipse(x + ox - r * 0.15, y + oy - r * 0.2, r * 0.55, r * 0.3, rot, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  blendLuminance(ctx, size, h, 0.5);
  return { map: canvasTexture(c, true), normal: normalFromHeight(h, size, 5) };
}

// -------------------------------------------------------------------- batu jalan

/** Batu jalan tak beraturan (sel Voronoi), dengan nat berlumut di sela-selanya. */
function cobbleTextures(size: number): TexPair {
  const N = 10;
  const rnd = rng(4242);
  const px = new Float32Array(N * N);
  const py = new Float32Array(N * N);
  const shade = new Float32Array(N * N);
  const tint = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    px[i] = (i % N) + 0.5 + (rnd() - 0.5) * 0.82;
    py[i] = Math.floor(i / N) + 0.5 + (rnd() - 0.5) * 0.82;
    shade[i] = 0.9 + rnd() * 0.17;
    tint[i] = Math.floor(rnd() * 4);
  }
  const tints: RGB[] = [
    [120, 125, 132],
    [131, 127, 118],
    [106, 111, 120],
    [124, 129, 131],
  ];
  const n = makeNoise(97);
  const n2 = makeNoise(131);
  const [c, ctx] = newCanvas(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const fx = u * N;
      const fy = v * N;
      const ci = Math.floor(fx);
      const cj = Math.floor(fy);
      let d1 = 9;
      let d2 = 9;
      let id = 0;
      let ax = 0;
      let ay = 0;
      let bx = 0;
      let by = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const gi = ci + di;
          const gj = cj + dj;
          const wi = ((gi % N) + N) % N;
          const wj = ((gj % N) + N) % N;
          const k = wj * N + wi;
          const qx = px[k] + (gi - wi);
          const qy = py[k] + (gj - wj);
          const dist = Math.hypot(qx - fx, qy - fy);
          if (dist < d1) {
            d2 = d1;
            bx = ax;
            by = ay;
            d1 = dist;
            ax = qx;
            ay = qy;
            id = k;
          } else if (dist < d2) {
            d2 = dist;
            bx = qx;
            by = qy;
          }
        }
      }
      // jarak ke batas sel terdekat
      const edge = ((d2 - d1) * (d2 + d1)) / (2 * Math.max(0.001, Math.hypot(ax - bx, ay - by)));
      const stone = smooth(0.02, 0.06, edge);
      const dome = smooth(0, 0.34, edge);
      const surf = fbm(n, u, v, 28, 3);
      const moss = smooth(0.5, 0.68, fbm(n2, u, v, 5, 3));
      const t = tints[tint[id]];
      const k = shade[id] * (0.8 + 0.34 * surf) * (0.9 + 0.1 * dome);
      const i = (y * size + x) * 4;
      d[i] = (70 + 4 * moss) * (1 - stone) + t[0] * k * stone;
      d[i + 1] = (68 + 20 * moss) * (1 - stone) + t[1] * k * stone;
      d[i + 2] = (62 + 2 * moss) * (1 - stone) + t[2] * k * stone;
      d[i + 3] = 255;
      h[y * size + x] = stone * (0.5 + 0.28 * dome + 0.22 * surf + (shade[id] - 0.95) * 0.3);
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: canvasTexture(c, true), normal: normalFromHeight(h, size, 4.5) };
}

// ------------------------------------------------------------------- batu tebing

/** Detail batu abu-abu (lapisan + retakan). Dikalikan dengan warna vertex pada tebing & bangunan. */
function rockTextures(size: number): TexPair {
  const n = makeNoise(211);
  const n2 = makeNoise(223);
  const [c, ctx] = newCanvas(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const a = fbm(n, u, v, 5, 4);
      const warp = fbm(n2, u, v, 3, 3);
      const strata = 0.5 + 0.5 * Math.sin((v * 9 + warp * 2.2) * Math.PI * 2);
      const crack = Math.pow(1 - Math.abs(2 * fbm(n2, u, v, 7, 3) - 1), 16);
      const fine = fbm(n, u, v, 56, 2);
      const g = clamp01(0.88 + 0.24 * (a - 0.5) + 0.1 * (strata - 0.5) + 0.16 * (fine - 0.5) - 0.08 * crack);
      const i = (y * size + x) * 4;
      d[i] = 255 * g * (1 + 0.04 * (warp - 0.5));
      d[i + 1] = 255 * g;
      d[i + 2] = 255 * g * (1 - 0.05 * (warp - 0.5));
      d[i + 3] = 255;
      h[y * size + x] = a * 0.5 + strata * 0.2 + fine * 0.22 - crack * 0.1;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: canvasTexture(c, true), normal: normalFromHeight(h, size, 6) };
}

// ------------------------------------------------------------------------- noise

/** R, G, B = tiga pola noise berbeda; dipakai shader untuk variasi & tepi tak beraturan. */
function noiseTexture(size: number): THREE.CanvasTexture {
  const a = makeNoise(401);
  const b = makeNoise(409);
  const cN = makeNoise(419);
  const [c, ctx] = newCanvas(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;
      d[i] = 255 * clamp01((fbm(a, u, v, 6, 4) - 0.5) * 1.9 + 0.5);
      d[i + 1] = 255 * clamp01((fbm(b, u, v, 3, 4) - 0.5) * 1.9 + 0.5);
      d[i + 2] = 255 * clamp01((fbm(cN, u, v, 12, 3) - 0.5) * 1.9 + 0.5);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = canvasTexture(c, false);
  t.anisotropy = 1;
  return t;
}

// ----------------------------------------------------------------------- sprite

/** Titik lembut putih; `power` besar = inti lebih kecil dan tajam. */
function dotTexture(size: number, power: number): THREE.CanvasTexture {
  const [c, ctx] = newCanvas(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
      const i = (y * size + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = 255 * Math.pow(clamp01(1 - r), power);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c, true, false);
}

/** Gambar bentuk putih di canvas (bentuknya dari `draw`), untuk sprite dan partikel bertepi tegas. */
function shapeTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const [c, ctx] = newCanvas(size);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  draw(ctx, size);
  return canvasTexture(c, true, false);
}

/** Bintang lima sudut membulat dengan pinggiran sedikit pudar (proyektil lucu). */
function starTexture(size: number): THREE.CanvasTexture {
  return shapeTexture(size, (ctx, s) => {
    const cx = s / 2;
    const cy = s / 2 + s * 0.03;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = (i % 2 ? 0.2 : 0.46) * s;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = s * 0.08;
    ctx.shadowColor = 'rgba(255,255,255,0.8)';
    ctx.shadowBlur = s * 0.06;
    ctx.fill();
    ctx.stroke();
  });
}

/** Tetes bulat bertepi tegas dengan kilau kecil (darah kartun). */
function dropTexture(size: number): THREE.CanvasTexture {
  return shapeTexture(size, (ctx, s) => {
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Genangan percikan di tanah: bulatan besar dengan beberapa tetes di sekelilingnya. */
function splatTexture(size: number): THREE.CanvasTexture {
  return shapeTexture(size, (ctx, s) => {
    const blob = (x: number, y: number, r: number) => {
      ctx.beginPath();
      ctx.arc(x * s, y * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    };
    blob(0.5, 0.5, 0.22);
    blob(0.38, 0.44, 0.13);
    blob(0.62, 0.56, 0.12);
    blob(0.5, 0.64, 0.1);
    // tetes yang terlempar
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 0.28 + rnd() * 0.17;
      blob(0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d, 0.02 + rnd() * 0.035);
    }
  });
}

/** Kepulan asap: gumpalan noise yang memudar ke tepi. */
function smokeTexture(size: number): THREE.CanvasTexture {
  const n = makeNoise(613);
  const [c, ctx] = newCanvas(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const r = Math.hypot(u - 0.5, v - 0.5) * 2;
      const puff = fbm(n, u, v, 4, 4);
      const i = (y * size + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = 255 * clamp01(smooth(1, 0.25, r + (0.5 - puff) * 0.9) * (0.55 + 0.6 * puff));
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c, true, false);
}

/** Cincin bercahaya (profil radial bebas), dipakai untuk gelombang kejut & penanda di tanah. */
function radialTexture(size: number, alphaAt: (r: number, ang: number) => number): THREE.CanvasTexture {
  const [c, ctx] = newCanvas(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const i = (y * size + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = 255 * clamp01(alphaAt(Math.hypot(dx, dy) * 2, Math.atan2(dy, dx)));
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c, true, false);
}

const band = (r: number, at: number, width: number) => clamp01(1 - Math.abs(r - at) / width);

// ------------------------------------------------------------------------ akses

const cache = new Map<string, unknown>();
function memo<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}
const detail = () => (GFX.low ? 256 : GFX.high ? 1024 : 512);

/** Semua tekstur dibuat saat pertama kali diminta, lalu dipakai bersama. */
export const Tex = {
  grass: () => memo('grass', () => grassTextures(detail())),
  dirt: () => memo('dirt', () => dirtTextures(detail())),
  cobble: () => memo('cobble', () => cobbleTextures(detail())),
  rock: () => memo('rock', () => rockTextures(detail())),
  noise: () => memo('noise', () => noiseTexture(256)),
  /** Titik cahaya lembut untuk partikel & halo. */
  dot: () => memo('dot', () => dotTexture(64, 1.6)),
  /** Kilau berinti tajam. */
  spark: () => memo('spark', () => dotTexture(64, 3.2)),
  smoke: () => memo('smoke', () => smokeTexture(128)),
  /** Bintang bulat untuk proyektil dan kilau lucu. */
  star: () => memo('star', () => starTexture(64)),
  /** Tetes bertepi tegas (darah kartun). */
  drop: () => memo('drop', () => dropTexture(32)),
  /** Genangan percikan di tanah. */
  splat: () => memo('splat', () => splatTexture(128)),
  /** Cincin tipis dengan pendar ke dalam: gelombang kejut. */
  shock: () =>
    memo('shock', () => radialTexture(256, (r) => (r > 1 ? 0 : Math.pow(band(r, 0.9, 0.1), 1.5) + 0.35 * smooth(0.25, 0.9, r) * (1 - smooth(0.9, 1, r))))),
  /** Cincin ganda di kaki unit. */
  unitRing: () =>
    memo('unitRing', () => radialTexture(128, (r) => Math.pow(band(r, 0.86, 0.09), 1.2) + 0.5 * band(r, 0.66, 0.035) + 0.16 * smooth(0.2, 0.8, r) * (1 - smooth(0.8, 0.9, r)))),
  /** Cincin milik pemain sendiri: bersegmen, supaya mudah dikenali. */
  selfRing: () =>
    memo('selfRing', () =>
      radialTexture(128, (r, a) => {
        const seg = smooth(0.12, 0.3, Math.abs(Math.sin(a * 2)));
        return Math.pow(band(r, 0.86, 0.1), 1.1) * (0.35 + 0.65 * seg) + 0.55 * band(r, 0.64, 0.04) + 0.2 * smooth(0.1, 0.8, r) * (1 - smooth(0.8, 0.92, r));
      }),
    ),
  /** Bayangan bulat lembut. */
  blob: () => memo('blob', () => radialTexture(64, (r) => 0.5 * (1 - smooth(0.55, 1, r)))),
  /** Pita cahaya: terang di tengah, memudar ke dua sisi (sepanjang sumbu U) dan ke kedua ujung. */
  beam: () =>
    memo('beam', () => {
      const [c, ctx] = newCanvas(64, 32);
      const img = ctx.createImageData(64, 32);
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 64; x++) {
          const across = 1 - Math.abs((x + 0.5) / 32 - 1);
          const along = Math.min(1, Math.min(y + 0.5, 31.5 - y) / 5);
          const i = (y * 64 + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
          img.data[i + 3] = 255 * Math.pow(across, 1.6) * along;
        }
      }
      ctx.putImageData(img, 0, 0);
      return canvasTexture(c, true, false);
    }),
  /** Lingkaran cahaya di tanah (di bawah lampu, kristal, dsb.). */
  pool: () => memo('pool', () => radialTexture(64, (r) => Math.pow(clamp01(1 - r), 2))),
};
