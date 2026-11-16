// Visual map statis: tanah bertekstur (lane, base), dinding jungle, pepohonan.
import * as THREE from 'three';
import { CAMPS, CORES, FOUNTAINS, FOUNTAIN_RADIUS, LANE_PATHS, MAP_SIZE, OBSTACLES } from '../../../shared/src';

/** Gambar lane/base ke canvas 2D. Dipakai untuk tekstur tanah dan latar minimap. */
export function paintMap(ctx: CanvasRenderingContext2D, size: number, forMinimap: boolean): void {
  const s = size / MAP_SIZE;
  ctx.fillStyle = forMinimap ? '#10192c' : '#2a4046';
  ctx.fillRect(0, 0, size, size);

  if (!forMinimap) {
    // bercak acak supaya tanah tidak polos
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(${50 + rnd() * 30},${95 + rnd() * 45},${75 + rnd() * 30},0.22)`;
      ctx.beginPath();
      ctx.arc(rnd() * size, rnd() * size, (1 + rnd() * 3) * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // area base
  const baseCols = ['rgba(60,130,255,', 'rgba(255,80,80,'];
  CORES.forEach((c, t) => {
    const g = ctx.createRadialGradient(c.x * s, c.z * s, 0, c.x * s, c.z * s, 24 * s);
    g.addColorStop(0, baseCols[t] + '0.45)');
    g.addColorStop(1, baseCols[t] + '0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });

  // lane
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass === 0 ? (forMinimap ? '#33425f' : '#4a5861') : forMinimap ? '#52658c' : '#73828b';
    ctx.lineWidth = (pass === 0 ? 11 : 8) * s;
    for (const lane of LANE_PATHS) {
      ctx.beginPath();
      lane.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * s, p.z * s) : ctx.lineTo(p.x * s, p.z * s)));
      ctx.stroke();
    }
  }

  // fountain
  FOUNTAINS.forEach((f, t) => {
    ctx.fillStyle = baseCols[t] + '0.35)';
    ctx.strokeStyle = baseCols[t] + '0.9)';
    ctx.lineWidth = 0.5 * s;
    ctx.beginPath();
    ctx.arc(f.x * s, f.z * s, FOUNTAIN_RADIUS * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // camp jungle
  for (const c of CAMPS) {
    ctx.fillStyle = 'rgba(200,170,70,0.25)';
    ctx.beginPath();
    ctx.arc(c.x * s, c.z * s, (c.big ? 3.2 : 2.4) * s, 0, Math.PI * 2);
    ctx.fill();
  }

  if (forMinimap) {
    ctx.fillStyle = '#26402f';
    for (const r of OBSTACLES) ctx.fillRect(r.x0 * s, r.z0 * s, (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
  }
}

export function buildMap(scene: THREE.Scene): void {
  // tanah
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  paintMap(canvas.getContext('2d')!, 1024, false);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }),
  );
  ground.position.set(MAP_SIZE / 2, 0, MAP_SIZE / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // alas luar map
  const skirt = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_SIZE * 4, MAP_SIZE * 4).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x0b111c, roughness: 1 }),
  );
  skirt.position.set(MAP_SIZE / 2, -0.05, MAP_SIZE / 2);
  scene.add(skirt);

  // dinding jungle
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x35463c, roughness: 0.9, flatShading: true });
  const trees: { x: number; z: number; y: number; s: number }[] = [];
  let seed = 99;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  OBSTACLES.forEach((r, i) => {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const h = 1.8 + (i % 5) * 0.13;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rockMat);
    m.position.set(r.x0 + w / 2, h / 2, r.z0 + d / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    const n = Math.max(2, Math.round((w * d) / 14));
    for (let k = 0; k < n; k++) {
      trees.push({ x: r.x0 + 1 + rnd() * (w - 2), z: r.z0 + 1 + rnd() * (d - 2), y: h, s: 0.8 + rnd() * 0.7 });
    }
  });

  // pohon (instanced)
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.25, 1, 6).translate(0, 0.5, 0);
  const leafGeo = new THREE.ConeGeometry(1, 2.6, 7).translate(0, 2.2, 0);
  const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 }), trees.length);
  const leaf = new THREE.InstancedMesh(
    leafGeo,
    new THREE.MeshStandardMaterial({ color: 0x2f7a4a, roughness: 0.85, flatShading: true }),
    trees.length,
  );
  const mtx = new THREE.Matrix4();
  trees.forEach((t, i) => {
    mtx.makeScale(t.s, t.s, t.s).setPosition(t.x, t.y, t.z);
    trunk.setMatrixAt(i, mtx);
    leaf.setMatrixAt(i, mtx);
  });
  trunk.castShadow = leaf.castShadow = true;
  scene.add(trunk, leaf);

  // tembok tepi map
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x232c3d, roughness: 0.9 });
  for (const [x, z, w, d] of [
    [MAP_SIZE / 2, -0.5, MAP_SIZE + 2, 1],
    [MAP_SIZE / 2, MAP_SIZE + 0.5, MAP_SIZE + 2, 1],
    [-0.5, MAP_SIZE / 2, 1, MAP_SIZE],
    [MAP_SIZE + 0.5, MAP_SIZE / 2, 1, MAP_SIZE],
  ]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 2.5, d), wallMat);
    wall.position.set(x, 1.25, z);
    scene.add(wall);
  }
}
