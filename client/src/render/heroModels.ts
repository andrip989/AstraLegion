// Model hero low-poly dari bentuk primitif. Semua model menghadap +Z.
// Tambah hero baru: daftarkan fungsi builder di HERO_MODELS dengan key = id hero.
import * as THREE from 'three';

export interface MatOpts {
  emissive?: number;
  glow?: number;
  metal?: number;
  rough?: number;
}
/** Pembuat material; material dicatat supaya bisa dibuat transparan saat hero invisible. */
export type Mk = (color: number, o?: MatOpts) => THREE.MeshStandardMaterial;

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function voltTitan(mk: Mk): THREE.Group {
  const g = new THREE.Group();
  const steel = mk(0x6f83ad, { metal: 0.55, rough: 0.4 });
  const dark = mk(0x3b4763, { metal: 0.5, rough: 0.5 });
  const volt = mk(0xffd23f, { emissive: 0xffb300, glow: 2 });
  for (const s of [-1, 1]) {
    g.add(part(new THREE.BoxGeometry(0.48, 0.95, 0.55), dark, s * 0.36, 0.48, 0));
    g.add(part(new THREE.SphereGeometry(0.5, 12, 10), steel, s * 1.02, 2.02, 0));
    g.add(part(new THREE.BoxGeometry(0.42, 1.0, 0.42), dark, s * 1.08, 1.32, 0));
    g.add(part(new THREE.BoxGeometry(0.56, 0.5, 0.56), steel, s * 1.08, 0.72, 0.06));
    const horn = part(new THREE.ConeGeometry(0.09, 0.55, 6), volt, s * 0.27, 2.88, 0);
    horn.rotation.z = -s * 0.45;
    g.add(horn);
    g.add(part(new THREE.BoxGeometry(0.12, 0.5, 0.12), volt, s * 1.02, 2.5, 0));
  }
  g.add(part(new THREE.BoxGeometry(1.5, 1.2, 0.9), steel, 0, 1.55, 0));
  g.add(part(new THREE.BoxGeometry(1.1, 0.35, 0.8), dark, 0, 0.98, 0));
  g.add(part(new THREE.SphereGeometry(0.26, 12, 10), volt, 0, 1.65, 0.46));
  g.add(part(new THREE.BoxGeometry(0.56, 0.5, 0.56), steel, 0, 2.42, 0));
  g.add(part(new THREE.BoxGeometry(0.46, 0.12, 0.1), volt, 0, 2.45, 0.27));
  return g;
}

function novaStriker(mk: Mk): THREE.Group {
  const g = new THREE.Group();
  const white = mk(0xe8ecf4, { metal: 0.3, rough: 0.4 });
  const grey = mk(0x4a5468, { metal: 0.7, rough: 0.4 });
  const plasma = mk(0x2ee6ff, { emissive: 0x18c8ff, glow: 1.8 });
  const orange = mk(0xff8a3d, { rough: 0.5 });
  for (const s of [-1, 1]) g.add(part(new THREE.CylinderGeometry(0.14, 0.11, 0.9, 8), grey, s * 0.2, 0.45, 0));
  g.add(part(new THREE.CapsuleGeometry(0.36, 0.55, 4, 10), white, 0, 1.35, 0));
  g.add(part(new THREE.BoxGeometry(0.5, 0.14, 0.1), plasma, 0, 1.5, 0.33));
  g.add(part(new THREE.BoxGeometry(0.74, 0.16, 0.5), orange, 0, 1.02, 0));
  g.add(part(new THREE.SphereGeometry(0.3, 14, 12), white, 0, 2.08, 0));
  g.add(part(new THREE.BoxGeometry(0.42, 0.13, 0.2), plasma, 0, 2.1, 0.2));
  // meriam lengan kanan
  const cannon = part(new THREE.CylinderGeometry(0.17, 0.2, 0.95, 10), grey, 0.52, 1.38, 0.34);
  cannon.rotation.x = Math.PI / 2;
  g.add(cannon);
  g.add(part(new THREE.SphereGeometry(0.15, 10, 8), plasma, 0.52, 1.38, 0.84));
  g.add(part(new THREE.CylinderGeometry(0.1, 0.09, 0.75, 8), white, -0.5, 1.28, 0));
  // cincin energi di punggung
  g.add(part(new THREE.TorusGeometry(0.5, 0.05, 8, 24), plasma, 0, 1.62, -0.42));
  return g;
}

function shadowFang(mk: Mk): THREE.Group {
  const g = new THREE.Group();
  const cloth = mk(0x2a1f3d, { rough: 0.8 });
  const black = mk(0x120d1c, { rough: 0.7 });
  const neon = mk(0xd946ef, { emissive: 0xc026d3, glow: 1.8 });
  for (const s of [-1, 1]) {
    g.add(part(new THREE.CylinderGeometry(0.13, 0.1, 0.9, 8), black, s * 0.18, 0.45, 0));
    g.add(part(new THREE.CylinderGeometry(0.09, 0.08, 0.7, 8), cloth, s * 0.46, 1.3, 0.08));
    g.add(part(new THREE.SphereGeometry(0.05, 6, 6), neon, s * 0.1, 1.98, 0.22));
    const blade = part(new THREE.BoxGeometry(0.06, 0.13, 0.95), neon, s * 0.5, 1.0, 0.45);
    blade.rotation.x = -0.25;
    g.add(blade);
  }
  g.add(part(new THREE.CylinderGeometry(0.38, 0.24, 0.9, 10), cloth, 0, 1.35, 0));
  g.add(part(new THREE.SphereGeometry(0.26, 12, 10), black, 0, 1.96, 0));
  const hood = part(new THREE.ConeGeometry(0.4, 0.62, 10), cloth, 0, 2.2, -0.04);
  hood.rotation.x = -0.2;
  g.add(hood);
  const scarf = part(new THREE.BoxGeometry(0.16, 0.08, 0.85), neon, 0, 1.78, -0.55);
  scarf.rotation.x = 0.35;
  g.add(scarf);
  return g;
}

export const HERO_MODELS: Record<string, (mk: Mk) => THREE.Group> = {
  volt_titan: voltTitan,
  nova_striker: novaStriker,
  shadow_fang: shadowFang,
};

/** Tinggi kira-kira tiap model, untuk menaruh HP bar. */
export const HERO_HEIGHT: Record<string, number> = {
  volt_titan: 3.3,
  nova_striker: 2.7,
  shadow_fang: 2.7,
};

export function fallbackHero(mk: Mk): THREE.Group {
  const g = new THREE.Group();
  g.add(part(new THREE.CapsuleGeometry(0.45, 1, 4, 10), mk(0x9aa4b8), 0, 1.1, 0));
  return g;
}
