// Model untuk semua jenis entity (minion, tower, core, monster, hero).
import * as THREE from 'three';
import type { EntityStatic } from '../../../shared/src';
import { fallbackHero, HERO_HEIGHT, HERO_MODELS, type MatOpts } from './heroModels';

export const TEAM_COLOR = [0x3b82f6, 0xef4444, 0xc9a646];

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material>();

function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
}

function mat(key: string, color: number, o: MatOpts = {}): THREE.Material {
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.rough ?? 0.6,
      metalness: o.metal ?? 0.2,
      emissive: o.emissive ?? 0x000000,
      emissiveIntensity: o.glow ?? 1,
    });
    matCache.set(key, m);
  }
  return m;
}

function part(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

export interface Built {
  model: THREE.Group;
  height: number;
  /** Material milik entity ini sendiri (bukan cache), boleh diubah/di-dispose. */
  mats: THREE.MeshStandardMaterial[];
  /** Bagian yang berputar terus (kristal tower/core). */
  spin?: THREE.Object3D;
}

export function buildModel(st: EntityStatic): Built {
  const model = new THREE.Group();
  const t = st.team;
  const tc = TEAM_COLOR[t];
  const mats: THREE.MeshStandardMaterial[] = [];

  switch (st.kind) {
    case 'hero': {
      const mk = (color: number, o: MatOpts = {}) => {
        const m = new THREE.MeshStandardMaterial({
          color,
          roughness: o.rough ?? 0.6,
          metalness: o.metal ?? 0.2,
          emissive: o.emissive ?? 0x000000,
          emissiveIntensity: o.glow ?? 1,
        });
        mats.push(m);
        return m;
      };
      model.add((HERO_MODELS[st.sub] ?? fallbackHero)(mk));
      return { model, height: HERO_HEIGHT[st.sub] ?? 2.6, mats };
    }
    case 'minion': {
      const body = mat(`minion${t}`, tc, { metal: 0.4, rough: 0.5 });
      const metal = mat('minionMetal', 0xb8c0d0, { metal: 0.6, rough: 0.4 });
      if (st.sub === 'ranged') {
        model.add(part(geo('mrBody', () => new THREE.CylinderGeometry(0.3, 0.4, 0.8, 8)), body, 0, 0.5, 0));
        model.add(part(geo('mHead', () => new THREE.SphereGeometry(0.26, 10, 8)), metal, 0, 1.1, 0));
        model.add(part(geo('mrHat', () => new THREE.ConeGeometry(0.14, 0.5, 6)), body, 0, 1.5, 0));
      } else {
        model.add(part(geo('mmBody', () => new THREE.BoxGeometry(0.75, 0.7, 0.6)), body, 0, 0.5, 0));
        model.add(part(geo('mHead', () => new THREE.SphereGeometry(0.26, 10, 8)), metal, 0, 1.08, 0));
        model.add(part(geo('mmArm', () => new THREE.BoxGeometry(0.16, 0.16, 0.6)), metal, 0.45, 0.6, 0.25));
      }
      return { model, height: 1.6, mats };
    }
    case 'tower': {
      const stone = mat('stone', 0x8a93a6, { rough: 0.8 });
      const glow = mat(`glow${t}`, tc, { emissive: tc, glow: 1.4 });
      model.add(part(geo('tBase', () => new THREE.CylinderGeometry(1.5, 1.8, 1, 8)), stone, 0, 0.5, 0));
      model.add(part(geo('tCol', () => new THREE.CylinderGeometry(0.85, 1.2, 4, 8)), stone, 0, 3, 0));
      model.add(part(geo('tTop', () => new THREE.CylinderGeometry(1.25, 0.9, 0.5, 8)), stone, 0, 5.2, 0));
      model.add(part(geo('tRing', () => new THREE.TorusGeometry(1.0, 0.08, 6, 20).rotateX(Math.PI / 2)), glow, 0, 2.2, 0));
      const crystal = part(geo('tCrystal', () => new THREE.OctahedronGeometry(0.85)), glow, 0, 6.5, 0);
      model.add(crystal);
      return { model, height: 7.6, mats, spin: crystal };
    }
    case 'core': {
      const stone = mat('stone', 0x8a93a6, { rough: 0.8 });
      const glow = mat(`glow${t}`, tc, { emissive: tc, glow: 1.4 });
      model.add(part(geo('cBase', () => new THREE.CylinderGeometry(2.8, 3.2, 0.9, 10)), stone, 0, 0.45, 0));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        model.add(part(geo('cPylon', () => new THREE.BoxGeometry(0.5, 2.6, 0.5)), stone, Math.cos(a) * 2.2, 2.1, Math.sin(a) * 2.2));
      }
      const crystal = part(geo('cCrystal', () => new THREE.IcosahedronGeometry(1.7)), glow, 0, 3.6, 0);
      model.add(crystal);
      return { model, height: 6.4, mats, spin: crystal };
    }
    case 'monster': {
      const big = st.sub === 'big';
      const s = big ? 1.6 : 1;
      const hide = mat(big ? 'monBig' : 'monSmall', big ? 0x7a5c3a : 0x5b8c3a, { rough: 0.9 });
      const eye = mat('monEye', 0xffe14d, { emissive: 0xffc400, glow: 1.5 });
      const g = new THREE.Group();
      g.add(part(geo('monBody', () => new THREE.SphereGeometry(0.75, 10, 8).scale(1, 0.85, 1.15)), hide, 0, 0.75, 0));
      g.add(part(geo('monHead', () => new THREE.SphereGeometry(0.4, 10, 8)), hide, 0, 1.05, 0.75));
      for (const sx of [-1, 1]) g.add(part(geo('monEyeG', () => new THREE.SphereGeometry(0.08, 6, 6)), eye, sx * 0.17, 1.15, 1.08));
      for (let i = 0; i < 3; i++) {
        g.add(part(geo('monSpike', () => new THREE.ConeGeometry(0.16, 0.5, 5)), hide, 0, 1.5, 0.35 - i * 0.4));
      }
      g.scale.setScalar(s);
      model.add(g);
      return { model, height: big ? 3.3 : 2.2, mats };
    }
  }
}
