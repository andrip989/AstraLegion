// Rig sederhana untuk model dari bentuk primitif: sendi kaki/lengan yang diputar secara
// prosedural (jalan, diam, menyerang, casting) tanpa file animasi.
import * as THREE from 'three';

export interface Leg {
  hip: THREE.Object3D;
  knee?: THREE.Object3D;
  /** Geseran fase langkah (0 atau PI untuk kaki yang berlawanan). */
  phase: number;
}

export interface Arm {
  shoulder: THREE.Object3D;
  /** Sendi siku (opsional): lengan bawah menekuk saat berjalan dan menyerang. */
  elbow?: THREE.Object3D;
  /** Tekukan siku saat diam (radian, positif = menekuk ke depan). */
  bend?: number;
  phase: number;
  /** Rotasi X saat diam (negatif = terangkat ke depan). */
  rest: number;
  /** Seberapa besar lengan ikut berayun saat berjalan (0..1). */
  swing: number;
}

export interface Rig {
  body?: THREE.Object3D;
  head?: THREE.Object3D;
  legs: Leg[];
  arms: Arm[];
  /** Lengan yang mengayun saat serangan jarak dekat. */
  strikeArm?: Arm;
  /** Lengan senjata jarak jauh (tersentak saat menembak). */
  aimArm?: Arm;
  /** Bagian yang melambai (syal, ekor). */
  sway: THREE.Object3D[];
  /** Bagian yang berputar terus (kristal, cincin energi). */
  spin: THREE.Object3D[];
  /** Bagian yang melayang naik-turun (kristal); posisi dasar di userData.baseY. */
  bob: THREE.Object3D[];
  /** Radian fase langkah per unit jarak tempuh. */
  stride: number;
  legSwing: number;
  kneeBend: number;
  /** Condong badan ke depan saat berlari. */
  lean: number;
  /** Jarak terjang seluruh model saat menyerang (untuk model tanpa lengan penyerang). */
  lunge: number;
}

export interface AnimState {
  phase: number;
  /** 0 = diam, 1 = berjalan (dihaluskan). */
  walk: number;
  /** 1 saat serangan dimulai, turun ke 0. */
  atk: number;
  /** 1 saat skill dilempar, turun ke 0. */
  cast: number;
  seed: number;
}

export function newRig(partial: Partial<Rig> = {}): Rig {
  return {
    legs: [],
    arms: [],
    sway: [],
    spin: [],
    bob: [],
    stride: 2.2,
    legSwing: 0.75,
    kneeBend: 1.0,
    lean: 0.1,
    lunge: 0,
    ...partial,
  };
}

/** Grup kosong di posisi tertentu, dipasang ke induknya; dipakai sebagai sendi. */
export function joint(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Sudut lengan penyerang: angkat cepat, tebas melewati posisi netral, lalu kembali. */
function strikeAngle(t: number): number {
  if (t < 0.3) return -2.3 * smooth(t / 0.3);
  if (t < 0.55) return -2.3 + 3.0 * smooth((t - 0.3) / 0.25);
  return 0.7 * (1 - smooth((t - 0.55) / 0.45));
}

export function animateRig(r: Rig, s: AnimState, time: number, dt: number): void {
  const w = s.walk;
  const idle = 1 - w;
  const step = Math.sin(s.phase);
  const atkT = s.atk > 0 ? 1 - s.atk : 0; // progres serangan 0..1
  const castK = s.cast > 0 ? Math.sin(s.cast * Math.PI) : 0;

  for (const leg of r.legs) {
    const p = s.phase + leg.phase;
    leg.hip.rotation.x = -Math.sin(p) * r.legSwing * w;
    if (leg.knee) leg.knee.rotation.x = Math.max(0, Math.cos(p)) * r.kneeBend * w;
  }

  for (const arm of r.arms) {
    let x = arm.rest - Math.sin(s.phase + arm.phase) * 0.7 * arm.swing * w;
    x += Math.sin(time * 1.6 + s.seed + arm.phase) * 0.05 * idle; // napas saat diam
    if (s.atk > 0) {
      if (arm === r.strikeArm) x = arm.rest + strikeAngle(atkT);
      else if (arm === r.aimArm) x = arm.rest - 0.45 * s.atk; // sentakan tembakan
    }
    if (castK > 0) x += (-2.4 - x) * castK * 0.85; // kedua lengan terangkat saat casting
    arm.shoulder.rotation.x = x;
    if (arm.elbow) {
      let bend = (arm.bend ?? 0.25) + Math.max(0, Math.sin(s.phase + arm.phase)) * 0.55 * arm.swing * w;
      if (s.atk > 0 && arm === r.strikeArm) bend += Math.sin(Math.min(1, atkT * 1.6) * Math.PI) * 0.9;
      arm.elbow.rotation.x = -bend * (1 - castK * 0.7);
    }
  }

  if (r.body) {
    const b = r.body;
    const base = (b.userData.baseY as number | undefined) ?? 0;
    b.position.y = base + Math.abs(step) * 0.07 * w + Math.sin(time * 2 + s.seed) * 0.02 * idle + castK * 0.22;
    b.rotation.x = r.lean * w + (s.atk > 0 && r.strikeArm ? Math.sin(atkT * Math.PI) * 0.22 : 0);
    b.rotation.z = step * 0.05 * w;
    b.rotation.y = step * 0.1 * w + (s.atk > 0 && r.strikeArm ? -Math.sin(atkT * Math.PI) * 0.45 : 0);
    b.position.z = r.aimArm ? -0.14 * s.atk : 0;
  }
  if (r.head) {
    r.head.rotation.y = Math.sin(time * 0.7 + s.seed * 3) * 0.22 * idle;
    r.head.rotation.x = -0.06 * w;
  }

  r.sway.forEach((o, i) => {
    const base = (o.userData.baseX as number | undefined) ?? 0;
    // lift: seberapa terangkat saat berlari (syal); wag: kibasan ke samping (ekor)
    const lift = (o.userData.lift as number | undefined) ?? 0.55;
    const wag = (o.userData.wag as number | undefined) ?? 0;
    o.rotation.x = base + Math.sin(time * 3.2 + s.seed + i * 1.3) * (0.12 + 0.1 * w) * (wag ? 0.4 : 1) + lift * w;
    o.rotation.z = Math.sin(time * 2.1 + s.seed + i) * 0.1;
    if (wag) o.rotation.y = Math.sin(time * (2.2 + 3 * w) + s.seed - i * 0.9) * wag;
  });
  r.spin.forEach((o, i) => {
    o.rotation.y += dt * (i % 2 === 0 ? 1.2 : -1.9);
  });
  r.bob.forEach((o, i) => {
    o.position.y = ((o.userData.baseY as number | undefined) ?? 0) + Math.sin(time * 1.6 + s.seed + i * 2.1) * 0.12;
  });
}
