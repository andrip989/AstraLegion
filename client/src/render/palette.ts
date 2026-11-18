// Warna tim dan material bersama (batu bertekstur, bahan berpendar).
import * as THREE from 'three';
import { Tex } from './textures';

export const TEAM_COLOR = [0x3b82f6, 0xef4444, 0xc9a646];

const cache = new Map<string, THREE.Material>();
function shared<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) cache.set(key, (m = make()));
  return m;
}

/**
 * Warna "menyala": hex dinaikkan sampai luminansnya `lum` (> 1 = HDR). Dengan begitu biru, merah,
 * dan kuning sama-sama cukup terang untuk memicu bloom, padahal luminans aslinya jauh berbeda.
 */
export function glowColor(hex: number, lum = 1.6): THREE.Color {
  const c = new THREE.Color(hex);
  const l = Math.max(0.1, 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
  return c.multiplyScalar(lum / l);
}

/** Bahan berpendar tanpa pengaruh cahaya (kristal, lampu, garis energi). */
export const glowMat = (hex: number, lum = 1.6) =>
  shared(`glow:${hex}:${lum}`, () => new THREE.MeshBasicMaterial({ color: glowColor(hex, lum) }));

/** Seperti `glowMat`, tetapi mengalikan warna vertex/instance (untuk kristal & jamur). */
export const glowVertexMat = (lum = 2.2) =>
  shared(`glowv:${lum}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(lum, lum, lum), vertexColors: true }));

/** Batu berwarna per-vertex dengan detail & peta normal (butuh UV, lihat `boxUV`). */
export const stoneMat = () =>
  shared('stone', () => {
    const rock = Tex.rock();
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: rock.map,
      normalMap: rock.normal,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.86,
      metalness: 0.02,
    });
  });

/** Bahan umum berwarna per-vertex (kayu, kain, logam kusam). */
export const paintMat = () =>
  shared('paint', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15 }));

/** Logam berwarna per-vertex. */
export const metalMat = () =>
  shared('metal', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.85 }));

/** Batu alam (bongkahan, golem): warna per-vertex + detail batu. */
export const rockMat = () =>
  shared('rock', () => {
    const rock = Tex.rock();
    return new THREE.MeshStandardMaterial({ vertexColors: true, map: rock.map, normalMap: rock.normal, roughness: 0.9, metalness: 0 });
  });

/** Zirah & perlengkapan unit: sedikit mengilap. */
export const unitMat = () =>
  shared('unit', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35 }));

/** Kulit makhluk: tidak mengilap. */
export const hideMat = () =>
  shared('hide', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 }));
