// Pintu masuk model: memilih pembangun model menurut jenis entity (hero, minion, tower, core, monster).
import { newRig } from './rig';
import * as THREE from 'three';
import { SKINS, type EntityStatic, type SkinDef } from '../../../shared/src';
import { buildCore, buildTower } from './buildings';
import { buildGolem, buildLizard, buildMinion, FLOW_LOOK, siegeLook, TITAN_LOOK } from './creatures';
import { FALLBACK_HERO, HERO_MODELS } from './heroModels';
import { glowColor, TEAM_COLOR, glowMat, unitMat } from './palette';
import type { Rig } from './rig';

export { TEAM_COLOR };

export interface Built {
  model: THREE.Group;
  height: number;
  /** Material milik entity ini sendiri (bukan cache), boleh diubah/di-dispose. */
  mats: THREE.Material[];
  rig: Rig;
}

/**
 * Cahaya tepi (fresnel) untuk bahan hero: siluet hero tetap terbaca di atas tanah yang ramai.
 * Fungsinya sama untuk semua hero, jadi program shader-nya dipakai bersama.
 */
function addRim(shader: { fragmentShader: string }): void {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <opaque_fragment>',
    `float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.6);
    outgoingLight += vec3(0.6, 0.74, 1.0) * rimF * 0.42;
    #include <opaque_fragment>`,
  );
}

/** Geometri yang sudah diwarnai ulang untuk sebuah skin (kunci: uuid geometri asli + id skin). */
const skinGeo = new Map<string, THREE.BufferGeometry>();
const hsl = { h: 0, s: 0, l: 0 };

/** Geser rona/kejenuhan/kecerahan satu warna. Warna hampir kelabu (logam, kain netral) hanya ikut kecerahannya. */
function recolor(c: THREE.Color, skin: SkinDef): void {
  // warna pendar bisa lebih terang dari 1: kerjakan dalam rentang 0..1 lalu kembalikan
  const peak = Math.max(1, c.r, c.g, c.b);
  c.multiplyScalar(1 / peak).getHSL(hsl);
  // warna kulit (jingga muda dan terang: wajah dan tangan) tidak ikut digeser, supaya wajah tetap berwarna kulit
  const skinTone = hsl.h > 0.02 && hsl.h < 0.12 && hsl.l > 0.56 && hsl.s < 0.95;
  if (hsl.s > 0.16 && !skinTone) c.setHSL((hsl.h + skin.hue + 1) % 1, Math.min(1, hsl.s * skin.sat), Math.min(1, hsl.l * skin.lum));
  else c.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l * (1 + (skin.lum - 1) * 0.6)));
  c.multiplyScalar(peak);
}

/** Terapkan skin ke model hero: warna per-vertex tiap mesh dan warna bahan pendarnya. */
function applySkin(model: THREE.Object3D, glow: THREE.MeshBasicMaterial, skin: SkinDef): void {
  const c = new THREE.Color();
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry.getAttribute('color')) return;
    const key = `${mesh.geometry.uuid}:${skin.id}`;
    let g = skinGeo.get(key);
    if (!g) {
      // geometri hero di-cache dan dipakai bersama, jadi yang diubah adalah salinannya
      g = mesh.geometry.clone();
      const col = g.getAttribute('color') as THREE.BufferAttribute;
      for (let i = 0; i < col.count; i++) {
        c.fromBufferAttribute(col, i);
        recolor(c, skin);
        col.setXYZ(i, c.r, c.g, c.b);
      }
      skinGeo.set(key, g);
    }
    mesh.geometry = g;
  });
  recolor(glow.color, skin);
}

/** Model hero lengkap dengan materialnya sendiri (dipakai di arena dan untuk potret lobby). */
export function buildHero(heroId: string, skin = 0): Built {
  const model = new THREE.Group();
  const def = HERO_MODELS[heroId] ?? FALLBACK_HERO;
  const body = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: def.look.rough, metalness: def.look.metal });
  body.onBeforeCompile = addRim;
  body.customProgramCacheKey = () => 'heroRim';
  const glow = new THREE.MeshBasicMaterial({ color: glowColor(def.look.glow, def.look.glowLum) });
  const hero = def.build({ body, glow });
  model.add(hero.group);
  if (skin > 0 && SKINS[skin]) applySkin(hero.group, glow, SKINS[skin]);
  return { model, height: hero.height, mats: [body, glow], rig: hero.rig };
}

export function buildModel(st: EntityStatic): Built {
  const model = new THREE.Group();

  switch (st.kind) {
    case 'hero':
      return buildHero(st.sub, st.skin ?? 0);
    case 'minion':
      if (st.sub === 'siege') {
        // Raksasa Astra: golem pengepung berwarna tim
        const rig = buildGolem(model, siegeLook(st.team));
        model.scale.setScalar(1.25);
        model.userData.baseScale = 1.25;
        return { model, height: 2.6 * 1.25, mats: [], rig };
      }
      if (st.sub === 'dummy') {
        // boneka sasaran (mode latihan)
        const rig = buildMinion(model, st.team, false);
        model.scale.setScalar(1.7);
        model.userData.baseScale = 1.7;
        return { model, height: 1.55 * 1.7, mats: [], rig };
      }
      if (st.sub === 'super') {
        // minion super: model minion biasa yang diperbesar
        const rig = buildMinion(model, st.team, false);
        model.scale.setScalar(1.55);
        model.userData.baseScale = 1.55;
        return { model, height: 1.55 * 1.55, mats: [], rig };
      }
      return { model, height: 1.55, mats: [], rig: buildMinion(model, st.team, st.sub === 'ranged') };
    case 'tower':
      return { model, height: 8.3, mats: [], rig: buildTower(model, st.team) };
    case 'core':
      return { model, height: 7.2, mats: [], rig: buildCore(model, st.team) };
    case 'ward': {
      // suar penglihatan: tonggak batu kecil dengan bola cahaya warna tim yang melayang di atasnya
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.1, 6), unitMat());
      pole.position.y = 0.55;
      pole.castShadow = true;
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.26), glowMat(TEAM_COLOR[st.team] ?? 0xffffff, 1.8));
      orb.position.y = 1.45;
      orb.userData.baseY = 1.45;
      model.add(pole, orb);
      return { model, height: 1.3, mats: [], rig: newRig({ bob: [orb], spin: [orb] }) };
    }
    case 'monster':
      if (st.sub === 'titan') {
        const rig = buildGolem(model, TITAN_LOOK);
        model.scale.setScalar(1.9);
        model.userData.baseScale = 1.9;
        return { model, height: 3.0 * 1.9, mats: [], rig };
      }
      if (st.sub === 'flow') return { model, height: 2.5, mats: [], rig: buildGolem(model, FLOW_LOOK) };
      return st.sub === 'big' ? { model, height: 2.5, mats: [], rig: buildGolem(model) } : { model, height: 1.6, mats: [], rig: buildLizard(model) };
  }
}
