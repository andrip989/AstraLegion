// Potret hero untuk lobby: model 3D yang sama dengan di arena dirender sekali ke gambar.
import * as THREE from 'three';
import { buildHero } from './models';
import { animateRig } from './rig';

/** Potret yang sudah dirender (id hero -> data URL PNG); dipakai kartu lobby dan panel status HUD. */
export const PORTRAITS: Record<string, string> = {};

/** Render tiap hero ke PNG berlatar transparan dan simpan di PORTRAITS. Kosong bila WebGL tidak tersedia. */
export function renderPortraits(heroIds: string[], width = 360, height = 420, skins: Record<string, number> = {}): Record<string, string> {
  const out = PORTRAITS;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return out;
  }
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x30384c, 1.5));
  const key = new THREE.DirectionalLight(0xfff0dc, 3.2);
  key.position.set(-2.5, 4, 4);
  const rim = new THREE.DirectionalLight(0x8ab8ff, 2.4);
  rim.position.set(3, 2.5, -4);
  scene.add(key, rim);
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 50);
  const box = new THREE.Box3();

  for (const id of heroIds) {
    const hero = buildHero(id, skins[id] ?? 0);
    // pose diam yang wajar (lengan di posisi istirahat, sedikit menoleh)
    animateRig(hero.rig, { phase: 0, walk: 0, atk: 0, cast: 0, seed: 1.3 }, 0.6, 0);
    hero.model.rotation.y = -0.45;
    scene.add(hero.model);
    // bingkai dari kaki sampai puncak hiasan kepala (antena, jambul, halo), dibatasi supaya hiasan
    // yang sangat tinggi tidak membuat wajah chibi-nya jadi kecil
    const top = Math.min(box.setFromObject(hero.model).max.y, hero.height * 1.2);
    camera.position.set(0, top * 0.62, top * 2.15);
    camera.lookAt(0, top * 0.5, 0);
    renderer.render(scene, camera);
    out[id] = renderer.domElement.toDataURL('image/png');
    scene.remove(hero.model);
    for (const m of hero.mats) m.dispose();
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
