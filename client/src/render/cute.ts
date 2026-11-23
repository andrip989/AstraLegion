// Perkakas gaya "chibi": bentuk bulat (kapsul, bola, kotak tumpul) dan bagian wajah imut (mata besar
// berkilau, pipi merona, senyum kecil) yang ditempel di permukaan kepala berbentuk elipsoid.
// Semua fungsi menghasilkan `Part` biasa, jadi tetap digabung jadi satu geometri per sendi.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Part } from './geo';

export type V3 = [number, number, number];

export const HALF = Math.PI / 2;
export const sph = (r: number, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs);
/** Kapsul tegak: `len` = panjang bagian lurus (tinggi total = len + 2r). */
export const cap = (r: number, len: number, seg = 10) => new THREE.CapsuleGeometry(r, len, 3, seg);
export const rbox = (w: number, h: number, d: number, r = 0.08) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
export const cyl = (rt: number, rb: number, h: number, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const cone = (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, seg);
export const torus = (r: number, t: number, seg = 20, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 6, seg, arc);
export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

const _v = new THREE.Vector3();
const _e = new THREE.Euler();

/**
 * Titik di permukaan kepala elipsoid (pusat `c`, jari-jari `R`) ke arah `yaw` (kiri-kanan) dan
 * `pitch` (atas-bawah), plus rotasi yang menghadapkan sumbu +Z bagian ke luar permukaan.
 */
export function onHead(c: V3, R: V3, yaw: number, pitch: number, lift = 0): { p: V3; r: V3; dir: V3 } {
  const dir: V3 = [Math.sin(yaw), Math.cos(yaw) * Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  return {
    p: [c[0] + dir[0] * (R[0] + lift), c[1] + dir[1] * (R[1] + lift), c[2] + dir[2] * (R[2] + lift)],
    r: [-pitch, yaw, 0],
    dir,
  };
}

/** Geser titik `p` sejauh `off` dalam kerangka lokal berotasi `r` (x = samping, y = atas, z = keluar). */
function local(p: V3, r: V3, off: V3): V3 {
  _v.set(off[0], off[1], off[2]).applyEuler(_e.set(r[0], r[1], r[2]));
  return [p[0] + _v.x, p[1] + _v.y, p[2] + _v.z];
}

export interface EyeOpts {
  /** Pusat & jari-jari kepala. */
  c: V3;
  R: V3;
  /** Sudut ke samping tiap mata dari tengah wajah, dan tinggi mata. */
  yaw: number;
  pitch: number;
  /** Jari-jari mata. */
  size: number;
  /** Warna iris (bawah) dan warna gelap di atasnya. */
  iris: number;
  dark?: number;
  /** Pinggiran putih tipis (sklera) di sekeliling iris. */
  white?: boolean;
  /** Alis kecil: warna (tanpa = tidak ada) dan kemiringan (positif = tegas/serius). */
  brow?: number;
  browTilt?: number;
  /** Bulu mata di sudut luar. */
  lash?: number;
  /** Versi hemat segitiga untuk unit yang jumlahnya banyak (minion). */
  lo?: boolean;
}

/** Sepasang mata besar mengilap: iris bergradasi, pupil, dua titik kilau putih, opsional alis. */
export function eyes(o: EyeOpts): Part[] {
  const out: Part[] = [];
  const dark = o.dark ?? 0x1b1330;
  const e = o.size;
  const [a, b, c] = o.lo ? [8, 6, 5] : [14, 10, 8];
  for (const s of [-1, 1]) {
    const { p, r } = onHead(o.c, o.R, s * o.yaw, o.pitch, -e * 0.12);
    if (o.white) out.push({ g: sph(e * 1.12, a, b), c: 0xf4f6ff, s: [1, 1.14, 0.32], r, p: local(p, r, [0, 0, -e * 0.02]) });
    // iris: terang di bawah, gelap di atas
    out.push({ g: sph(e, a, b), c: o.iris, c2: dark, s: [0.92, 1.12, 0.36], r, p });
    out.push({ g: sph(e * 0.5, b, c), c: dark, s: [1, 1.15, 0.36], r, p: local(p, r, [0, e * 0.1, e * 0.08]) });
    // kilau: satu besar di atas-luar, satu kecil di bawah-dalam
    out.push({ g: sph(e * 0.3, c + 1, c), c: 0xffffff, s: [1, 1, 0.5], r, p: local(p, r, [s * e * 0.32, e * 0.4, e * 0.24]) });
    if (!o.lo) out.push({ g: sph(e * 0.14, 6, 5), c: 0xffffff, s: [1, 1, 0.5], r, p: local(p, r, [-s * e * 0.28, -e * 0.42, e * 0.22]) });
    if (o.brow !== undefined) {
      const b = onHead(o.c, o.R, s * o.yaw * 1.05, o.pitch + e * 1.55 / o.R[1], 0);
      out.push({ g: cap(e * 0.12, e * 0.7, 6), c: o.brow, r: [b.r[0], b.r[1], HALF - s * (o.browTilt ?? 0)], p: b.p });
    }
    if (o.lash !== undefined) {
      out.push({ g: cone(e * 0.16, e * 0.55, 4), c: o.lash, s: [1, 1, 0.4], r: [r[0], r[1], -s * 1.0], p: local(p, r, [s * e * 0.95, e * 0.7, -e * 0.05]) });
    }
  }
  return out;
}

/** Pipi merona: dua elips merah muda di bawah-luar mata. */
export function blush(c: V3, R: V3, yaw: number, pitch: number, size: number, color = 0xff8fae, lo = false): Part[] {
  return [-1, 1].map((s) => {
    const { p, r } = onHead(c, R, s * yaw, pitch, -size * 0.25);
    return { g: lo ? sph(size, 8, 4) : sph(size, 10, 6), c: color, s: [1, 0.6, 0.25], r, p };
  });
}

/** Senyum kecil (busur setengah lingkaran) di wajah. `open` = mulut terbuka berbentuk "D". */
export function smile(c: V3, R: V3, pitch: number, w: number, color = 0x4a2030, open = false, lift = 0): Part[] {
  const { p, r } = onHead(c, R, 0, pitch, lift - w * 0.05);
  if (open) {
    // mulut terbuka: setengah cakram gelap dengan lidah merah muda
    return [
      { g: new THREE.CircleGeometry(w, 10, Math.PI, Math.PI), c: color, r, p: local(p, r, [0, w * 0.3, w * 0.02]) },
      { g: new THREE.CircleGeometry(w * 0.55, 8, Math.PI, Math.PI), c: 0xff7a8a, r, p: local(p, r, [0, w * 0.0, w * 0.03]) },
    ];
  }
  return [{ g: torus(w, w * 0.22, 10, Math.PI), c: color, r: [r[0], r[1], Math.PI], p: local(p, r, [0, w * 0.5, 0]) }];
}

/** Mulut kucing "w": dua busur kecil berdampingan. */
export function catMouth(c: V3, R: V3, pitch: number, w: number, color = 0x3a2040, lift = 0): Part[] {
  const { p, r } = onHead(c, R, 0, pitch, lift - w * 0.05);
  return [-1, 1].map((s) => ({ g: torus(w, w * 0.25, 8, Math.PI), c: color, r: [r[0], r[1], Math.PI], p: local(p, r, [s * w, w * 0.5, 0]) }));
}

/**
 * Poni: tudung rambut tipis menutupi dahi wajah bola (pusat `c`, jari-jari `a`), dicondongkan ke
 * depan sebesar `tilt`, dengan beberapa ujung rambut runcing di tepi depannya.
 */
export function fringe(c: V3, a: number, color: number, color2 = color, tilt = 0.55, cover = 0.72, tips = 3): Part[] {
  const out: Part[] = [{ g: new THREE.SphereGeometry(a + 0.012, 20, 8, 0, Math.PI * 2, 0, cover), c: color, c2: color2, r: [tilt, 0, 0], p: c }];
  const edge = HALF - tilt - cover;
  for (let i = 0; i < tips; i++) {
    const yaw = (i - (tips - 1) / 2) * 0.32;
    const { p, r } = onHead(c, [a, a, a], yaw, edge + Math.abs(yaw) * 0.25 - 0.05, -0.005);
    out.push({ g: cone(0.075, 0.17, 6), c: color, s: [1, 1, 0.45], r: [r[0], r[1], Math.PI], p });
  }
  return out;
}

/**
 * Lubang wajah pada helm/tudung bulat: wajah bola berjari-jari `a` (pusatnya titik nol) di dalam
 * cangkang bola berjari-jari `b` yang digeser `back` ke belakang. Hasil: jarak bibir lubang ke depan
 * pusat wajah (`z`) dan jari-jari lubangnya (`r`), untuk memasang lis di tepinya.
 */
export function faceOpening(a: number, b: number, back: number): { z: number; r: number } {
  const z = (b * b - a * a - back * back) / (2 * back);
  return { z, r: Math.sqrt(Math.max(0, a * a - z * z)) };
}

/** Geometri sambaran petir zig-zag (untuk bagian menyala), tinggi ~`h`, menghadap +Z. */
export function bolt(h: number, t = 0.05): THREE.BufferGeometry[] {
  const seg = h / 3;
  return [
    new THREE.BoxGeometry(t, seg * 1.25, t).rotateZ(-0.5).translate(seg * 0.15, seg, 0),
    new THREE.BoxGeometry(seg * 0.9, t, t).translate(0, seg * 0.42, 0),
    new THREE.BoxGeometry(t, seg * 1.25, t).rotateZ(-0.5).translate(-seg * 0.15, -seg * 0.15, 0),
    new THREE.ConeGeometry(t * 1.3, seg * 0.6, 4).rotateZ(Math.PI - 0.5).translate(-seg * 0.42, -seg * 0.75, 0),
  ];
}
