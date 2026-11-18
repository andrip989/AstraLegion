/**
 * Siklus siang, senja, malam, fajar mengikuti waktu pertandingan (fasenya dihitung di shared supaya
 * server memakai hitungan yang sama). Di sini hanya suasananya: warna dan kuat cahaya serta kabut.
 * Arah matahari tetap, supaya bayangan tidak berkedip dan malam tetap terbaca jelas.
 */
import * as THREE from 'three';
import { DAY_CYCLE, dayPhase, NIGHT_JUNGLE_GOLD, type DayPhase } from '../../../shared/src';

export { dayPhase, type DayPhase };

export const PHASE_LABEL: Record<DayPhase, { icon: string; text: string }> = {
  siang: { icon: '☀', text: 'Fajar berlalu, hari kembali terang.' },
  senja: { icon: '🌇', text: 'Senja turun di medan tempur.' },
  malam: { icon: '🌙', text: `Malam tiba: monster hutan memberi emas +${Math.round((NIGHT_JUNGLE_GOLD - 1) * 100)}%.` },
  fajar: { icon: '🌅', text: 'Fajar menyingsing.' },
};

interface Key {
  t: number;
  sun: number;
  sunI: number;
  sky: number;
  ground: number;
  hemiI: number;
  haze: number;
  env: number;
  rim: number;
  rimI: number;
}

const DAY: Omit<Key, 't'> = { sun: 0xffe4bd, sunI: 3.0, sky: 0xc4d8f8, ground: 0x5a6248, hemiI: 1.25, haze: 0x1d2b3a, env: 0.45, rim: 0xa9c6ff, rimI: 0.8 };
const DUSK: Omit<Key, 't'> = { sun: 0xff9a60, sunI: 2.6, sky: 0xf0b592, ground: 0x5c4a44, hemiI: 1.15, haze: 0x3b2733, env: 0.38, rim: 0xb9a4ff, rimI: 0.75 };
const NIGHT: Omit<Key, 't'> = { sun: 0xb9ccff, sunI: 1.9, sky: 0x93a8e6, ground: 0x40506e, hemiI: 1.3, haze: 0x0e1830, env: 0.34, rim: 0x7f9cff, rimI: 0.7 };
const DAWN: Omit<Key, 't'> = { sun: 0xffbd8a, sunI: 2.3, sky: 0xdcc3cf, ground: 0x57544c, hemiI: 1.05, haze: 0x2b2c42, env: 0.38, rim: 0xb7b9ff, rimI: 0.75 };

/** Titik kunci dalam satu putaran; di antaranya nilainya dicampur halus. */
const KEYS: Key[] = [
  { t: 0, ...DAY },
  { t: 210, ...DAY },
  { t: 255, ...DUSK },
  { t: 300, ...NIGHT },
  { t: 420, ...NIGHT },
  { t: 450, ...DAWN },
  { t: 480, ...DAY },
];

export interface Daylight {
  sun: THREE.Color;
  sunI: number;
  sky: THREE.Color;
  ground: THREE.Color;
  hemiI: number;
  haze: THREE.Color;
  env: number;
  rim: THREE.Color;
  rimI: number;
}

const A = new THREE.Color();
const B = new THREE.Color();
function mix(out: THREE.Color, a: number, b: number, k: number): void {
  out.copy(A.setHex(a)).lerp(B.setHex(b), k);
}

/** Isi `out` dengan pencahayaan untuk waktu pertandingan `t`. */
export function daylightAt(t: number, out: Daylight): Daylight {
  const p = ((t % DAY_CYCLE) + DAY_CYCLE) % DAY_CYCLE;
  let i = 0;
  while (i < KEYS.length - 2 && p >= KEYS[i + 1].t) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  let k = (p - a.t) / (b.t - a.t);
  k = k * k * (3 - 2 * k); // masuk dan keluar tiap peralihan dengan lembut
  mix(out.sun, a.sun, b.sun, k);
  mix(out.sky, a.sky, b.sky, k);
  mix(out.ground, a.ground, b.ground, k);
  mix(out.haze, a.haze, b.haze, k);
  mix(out.rim, a.rim, b.rim, k);
  out.sunI = a.sunI + (b.sunI - a.sunI) * k;
  out.hemiI = a.hemiI + (b.hemiI - a.hemiI) * k;
  out.env = a.env + (b.env - a.env) * k;
  out.rimI = a.rimI + (b.rimI - a.rimI) * k;
  return out;
}

export function newDaylight(): Daylight {
  return daylightAt(0, { sun: new THREE.Color(), sunI: 0, sky: new THREE.Color(), ground: new THREE.Color(), hemiI: 0, haze: new THREE.Color(), env: 0, rim: new THREE.Color(), rimI: 0 });
}
