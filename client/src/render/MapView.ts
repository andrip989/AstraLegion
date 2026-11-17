// Visual map: tanah bertekstur, dataran tinggi jungle, pepohonan, rumput yang bergoyang,
// bunga, batu, semak, lampu jalan, hiasan base & fountain, dan kunang-kunang.
import * as THREE from 'three';
import {
  CAMPS,
  CORES,
  FOUNTAINS,
  FOUNTAIN_RADIUS,
  LANE_PATHS,
  MAP_SIZE,
  OBSTACLES,
  TOWERS,
} from '../../../shared/src';
import { TEAM_COLOR } from './models';
import { IS_TOUCH } from './SceneManager';

export interface MapView {
  /** Dipanggil tiap frame: angin pada rumput, kunang-kunang, air fountain. */
  update(time: number): void;
}

/** Generator angka acak berbenih, supaya map selalu terlihat sama. */
function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const wallHeight = (i: number) => 1.8 + (i % 5) * 0.13;

function obstacleAt(x: number, z: number, pad = 0): number {
  for (let i = 0; i < OBSTACLES.length; i++) {
    const r = OBSTACLES[i];
    if (x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad) return i;
  }
  return -1;
}

function distToLanes(x: number, z: number): number {
  let best = Infinity;
  for (const lane of LANE_PATHS) {
    for (let i = 0; i < lane.length - 1; i++) {
      const a = lane[i];
      const b = lane[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
    }
  }
  return best;
}

const nearAny = (list: { x: number; z: number }[], x: number, z: number, r: number) =>
  list.some((p) => Math.hypot(p.x - x, p.z - z) < r);

// ------------------------------------------------------------------ tekstur 2D

function strokeLanes(ctx: CanvasRenderingContext2D, s: number, width: number, style: string, dash?: number[]): void {
  ctx.strokeStyle = style;
  ctx.lineWidth = width * s;
  ctx.setLineDash(dash ? dash.map((d) => d * s) : []);
  for (const lane of LANE_PATHS) {
    ctx.beginPath();
    lane.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * s, p.z * s) : ctx.lineTo(p.x * s, p.z * s)));
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

/** Gambar map ke canvas 2D. Dipakai untuk tekstur tanah dan latar minimap. */
export function paintMap(ctx: CanvasRenderingContext2D, size: number, forMinimap: boolean): void {
  const s = size / MAP_SIZE;
  const circle = (x: number, z: number, r: number) => {
    ctx.beginPath();
    ctx.arc(x * s, z * s, r * s, 0, Math.PI * 2);
  };
  const teamCols = ['rgba(60,130,255,', 'rgba(255,80,80,'];
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';

  if (forMinimap) {
    ctx.fillStyle = '#10192c';
    ctx.fillRect(0, 0, size, size);
  } else {
    // rumput: warna dasar + ribuan bercak hijau & tanah supaya tidak polos
    const rnd = rng(7);
    ctx.fillStyle = '#31503b';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = `rgba(${35 + rnd() * 50},${95 + rnd() * 60},${45 + rnd() * 40},0.16)`;
      circle(rnd() * MAP_SIZE, rnd() * MAP_SIZE, 0.8 + rnd() * 3.2);
      ctx.fill();
    }
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = 'rgba(24,38,30,0.18)';
      circle(rnd() * MAP_SIZE, rnd() * MAP_SIZE, 1.5 + rnd() * 4);
      ctx.fill();
    }
  }

  // cahaya warna tim di sekitar base
  CORES.forEach((c, t) => {
    const g = ctx.createRadialGradient(c.x * s, c.z * s, 0, c.x * s, c.z * s, 24 * s);
    g.addColorStop(0, teamCols[t] + '0.42)');
    g.addColorStop(1, teamCols[t] + '0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });

  // camp jungle: tanah gundul
  for (const c of CAMPS) {
    ctx.fillStyle = forMinimap ? 'rgba(200,170,70,0.25)' : 'rgba(104,84,56,0.6)';
    circle(c.x, c.z, c.big ? 4 : 3);
    ctx.fill();
  }

  // lane
  if (forMinimap) {
    strokeLanes(ctx, s, 11, '#33425f');
    strokeLanes(ctx, s, 8, '#52658c');
  } else {
    strokeLanes(ctx, s, 12.6, 'rgba(70,62,46,0.75)'); // tepi tanah
    strokeLanes(ctx, s, 10.6, '#333d42'); // pinggiran batu gelap
    strokeLanes(ctx, s, 9.8, '#7a878d'); // jalan batu
    strokeLanes(ctx, s, 9.8, 'rgba(40,48,52,0.4)', [0.22, 2.6]); // sambungan melintang
    strokeLanes(ctx, s, 6.4, 'rgba(160,172,178,0.16)', [2.4, 0.42]); // ubin tengah lebih terang
    strokeLanes(ctx, s, 0.16, 'rgba(40,48,52,0.4)'); // garis tengah
  }

  // pelataran base
  CORES.forEach((c, t) => {
    if (!forMinimap) {
      ctx.fillStyle = '#59646f';
      circle(c.x, c.z, 8.8);
      ctx.fill();
      for (const [r, w, a] of [
        [8.6, 0.35, 0.9],
        [6.2, 0.18, 0.6],
        [4.2, 0.18, 0.6],
      ]) {
        ctx.strokeStyle = teamCols[t] + a + ')';
        ctx.lineWidth = w * s;
        circle(c.x, c.z, r);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(30,36,42,0.5)';
      ctx.lineWidth = 0.12 * s;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo((c.x + Math.cos(a) * 4.2) * s, (c.z + Math.sin(a) * 4.2) * s);
        ctx.lineTo((c.x + Math.cos(a) * 8.6) * s, (c.z + Math.sin(a) * 8.6) * s);
        ctx.stroke();
      }
    }
  });

  // fountain
  FOUNTAINS.forEach((f, t) => {
    ctx.fillStyle = teamCols[t] + (forMinimap ? '0.35)' : '0.22)');
    ctx.strokeStyle = teamCols[t] + '0.9)';
    ctx.lineWidth = (forMinimap ? 0.5 : 0.25) * s;
    circle(f.x, f.z, FOUNTAIN_RADIUS);
    ctx.fill();
    ctx.stroke();
  });

  if (forMinimap) {
    ctx.fillStyle = '#26402f';
    for (const r of OBSTACLES) ctx.fillRect(r.x0 * s, r.z0 * s, (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
  }
}

// --------------------------------------------------------------- objek instanced

interface Item {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  ry: number;
  color?: THREE.Color;
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: Item[], shadow = true): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const o = new THREE.Object3D();
  items.forEach((it, i) => {
    o.position.set(it.x, it.y, it.z);
    o.rotation.set(0, it.ry, 0);
    o.scale.set(it.sx, it.sy, it.sz);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    if (it.color) mesh.setColorAt(i, it.color);
  });
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // tersebar di seluruh map
  return mesh;
}

/** Satu rumpun rumput: tiga helai melengkung, lebih gelap di pangkal, lebih terang di ujung. */
function grassTuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const nrm: number[] = [];
  const base = [0.1, 0.24, 0.1];
  const mid = [0.17, 0.36, 0.13];
  const tip = [0.36, 0.55, 0.2];
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI * 2 + 0.4;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const h = 0.4 + b * 0.08;
    const w = 0.07;
    // titik helai dalam ruang lokal (x = lebar, z = arah lengkung), lalu diputar a
    const P = (x: number, y: number, z: number) => [x * ca - (z + 0.06) * sa, y, x * sa + (z + 0.06) * ca];
    const bl = P(-w, 0, 0);
    const br = P(w, 0, 0);
    const ml = P(-w * 0.65, h * 0.55, 0.07);
    const mr = P(w * 0.65, h * 0.55, 0.07);
    const tp = P(0, h, 0.2);
    const tri = (...v: [number[], number[]][]) => v.forEach(([p, c]) => (pos.push(...p), col.push(...c), nrm.push(0, 1, 0)));
    tri([bl, base], [br, base], [ml, mid]);
    tri([br, base], [mr, mid], [ml, mid]);
    tri([ml, mid], [mr, mid], [tp, tip]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

// ------------------------------------------------------------------- build map

export function buildMap(scene: THREE.Scene): MapView {
  const rnd = rng(99);
  const uTime = { value: 0 };

  // tanah
  const texSize = IS_TOUCH ? 1024 : 2048;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = texSize;
  paintMap(canvas.getContext('2d')!, texSize, false);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }),
  );
  ground.position.set(MAP_SIZE / 2, 0, MAP_SIZE / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  const skirt = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_SIZE * 4, MAP_SIZE * 4).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x0b111c, roughness: 1 }),
  );
  skirt.position.set(MAP_SIZE / 2, -0.05, MAP_SIZE / 2);
  scene.add(skirt);

  // dataran tinggi jungle: sisi tebing batu, puncak berumput
  const cliff = new THREE.MeshStandardMaterial({ color: 0x55645c, roughness: 0.95, flatShading: true });
  const plateauTop = new THREE.MeshStandardMaterial({ color: 0x3b6a44, roughness: 1 });
  const trees: Item[] = [];
  const rocks: Item[] = [];
  const bushes: Item[] = [];
  OBSTACLES.forEach((r, i) => {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const h = wallHeight(i);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [cliff, cliff, plateauTop, cliff, cliff, cliff]);
    m.position.set(r.x0 + w / 2, h / 2, r.z0 + d / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);

    for (let k = 0, n = Math.max(2, Math.round((w * d) / 12)); k < n; k++) {
      const sc = 0.8 + rnd() * 0.8;
      trees.push({
        x: r.x0 + 1 + rnd() * (w - 2),
        y: h,
        z: r.z0 + 1 + rnd() * (d - 2),
        sx: sc,
        sy: sc * (0.9 + rnd() * 0.4),
        sz: sc,
        ry: rnd() * 6.28,
        color: new THREE.Color().setHSL(0.31 + rnd() * 0.07, 0.42, 0.24 + rnd() * 0.1),
      });
    }
    // batu dan semak di kaki tebing
    for (let k = 0, n = Math.round((w + d) / 2.2); k < n; k++) {
      const side = Math.floor(rnd() * 4);
      const t = rnd();
      const out = 0.15 + rnd() * 0.5;
      const x = side === 0 ? r.x0 - out : side === 1 ? r.x1 + out : r.x0 + t * w;
      const z = side === 2 ? r.z0 - out : side === 3 ? r.z1 + out : r.z0 + t * d;
      const sc = 0.45 + rnd() * 0.6;
      if (rnd() < 0.55) {
        rocks.push({ x, y: sc * 0.25, z, sx: sc * (0.8 + rnd() * 0.6), sy: sc * (0.6 + rnd() * 0.5), sz: sc, ry: rnd() * 6.28 });
      } else {
        bushes.push({
          x,
          y: sc * 0.4,
          z,
          sx: sc * 1.5,
          sy: sc,
          sz: sc * 1.4,
          ry: rnd() * 6.28,
          color: new THREE.Color().setHSL(0.3 + rnd() * 0.08, 0.45, 0.26 + rnd() * 0.1),
        });
      }
    }
  });

  // pohon cemara: batang + dua tingkat daun
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true });
  scene.add(
    instanced(
      new THREE.CylinderGeometry(0.16, 0.24, 1.1, 6).translate(0, 0.55, 0),
      new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 }),
      trees.map((t) => ({ ...t, color: undefined })),
    ),
    instanced(new THREE.ConeGeometry(1.05, 1.9, 7).translate(0, 1.75, 0), leafMat, trees),
    instanced(new THREE.ConeGeometry(0.72, 1.6, 7).translate(0, 2.85, 0), leafMat, trees),
  );

  // titik acak di area hijau (bukan lane, bukan base); y mengikuti puncak dataran tinggi
  const greenSpot = (margin: number, onPlateau: boolean): { x: number; y: number; z: number } | null => {
    const x = 1.5 + rnd() * (MAP_SIZE - 3);
    const z = 1.5 + rnd() * (MAP_SIZE - 3);
    if (distToLanes(x, z) < margin) return null;
    if (nearAny(CORES, x, z, 9.4) || nearAny(FOUNTAINS, x, z, 3.8) || nearAny(CAMPS, x, z, 2.6)) return null;
    const ob = obstacleAt(x, z);
    if (ob >= 0) return onPlateau ? { x, y: wallHeight(ob), z } : null;
    return obstacleAt(x, z, 0.25) >= 0 ? null : { x, y: 0, z };
  };

  // rumput bergoyang ditiup angin (animasi di vertex shader, tanpa biaya CPU)
  const grassItems: Item[] = [];
  for (let i = 0, want = IS_TOUCH ? 5500 : 14000; grassItems.length < want && i < want * 3; i++) {
    const p = greenSpot(5.5, true);
    if (!p) continue;
    const sc = 0.8 + rnd() * 0.6;
    grassItems.push({
      ...p,
      sx: sc,
      sy: sc * (0.8 + rnd() * 0.5),
      sz: sc,
      ry: rnd() * 6.28,
      color: new THREE.Color(0.8 + rnd() * 0.35, 0.85 + rnd() * 0.25, 0.75 + rnd() * 0.3),
    });
  }
  // Tanpa pencahayaan: dengan material berlampu, sisi belakang helai (normal terbalik) jadi hitam.
  const grassMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float gx = instanceMatrix[3][0];
          float gz = instanceMatrix[3][2];
          float wind = sin(uTime * 1.7 + gx * 0.33 + gz * 0.27) + 0.45 * sin(uTime * 3.3 + gx * 0.9 - gz * 0.6);
          transformed.x += wind * 0.16 * position.y;
          transformed.z += wind * 0.09 * position.y;
        #endif`,
      );
  };
  scene.add(instanced(grassTuftGeometry(), grassMat, grassItems, false));

  // bunga kecil warna-warni
  const flowerColors = [0xfff3a8, 0xffffff, 0xff9ecf, 0x9fe8ff, 0xffc46b].map((c) => new THREE.Color(c));
  const flowers: Item[] = [];
  for (let i = 0, want = IS_TOUCH ? 320 : 800; flowers.length < want && i < want * 3; i++) {
    const p = greenSpot(5.8, true);
    if (!p) continue;
    const sc = 0.8 + rnd() * 0.6;
    flowers.push({ ...p, y: p.y + 0.3, sx: sc, sy: sc * 0.6, sz: sc, ry: 0, color: flowerColors[Math.floor(rnd() * flowerColors.length)] });
  }
  scene.add(instanced(new THREE.SphereGeometry(0.1, 6, 5), new THREE.MeshLambertMaterial({ color: 0xffffff }), flowers, false));

  // batu dan semak yang tersebar di jungle
  for (let i = 0; i < 260; i++) {
    const p = greenSpot(6.2, false);
    if (!p) continue;
    const sc = 0.3 + rnd() * 0.7;
    if (rnd() < 0.5) {
      rocks.push({ ...p, y: sc * 0.22, sx: sc * (0.8 + rnd() * 0.7), sy: sc * (0.5 + rnd() * 0.5), sz: sc, ry: rnd() * 6.28 });
    } else {
      bushes.push({
        ...p,
        y: sc * 0.35,
        sx: sc * 1.4,
        sy: sc * 0.9,
        sz: sc * 1.3,
        ry: rnd() * 6.28,
        color: new THREE.Color().setHSL(0.29 + rnd() * 0.09, 0.45, 0.25 + rnd() * 0.12),
      });
    }
  }
  scene.add(
    instanced(
      new THREE.DodecahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x8b95a1, roughness: 0.95, flatShading: true }),
      rocks,
    ),
    instanced(
      new THREE.IcosahedronGeometry(0.6, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
      bushes,
    ),
  );

  // lampu jalan di tepi lane, berselang-seling kiri-kanan
  const lamps: Item[] = [];
  LANE_PATHS.forEach((lane) => {
    let carry = 6;
    let side = 1;
    for (let i = 0; i < lane.length - 1; i++) {
      const a = lane[i];
      const b = lane[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const dx = (b.x - a.x) / len;
      const dz = (b.z - a.z) / len;
      for (let d = carry; d < len; d += 11) {
        const x = a.x + dx * d - dz * 5.9 * side;
        const z = a.z + dz * d + dx * 5.9 * side;
        side = -side;
        if (nearAny(CORES, x, z, 13) || nearAny(TOWERS, x, z, 4.5) || obstacleAt(x, z, 0.8) >= 0) continue;
        if (x < 2 || z < 2 || x > MAP_SIZE - 2 || z > MAP_SIZE - 2) continue;
        lamps.push({ x, y: 0, z, sx: 1, sy: 1, sz: 1, ry: 0 });
      }
      carry = 11 - ((len - carry) % 11);
    }
  });
  scene.add(
    instanced(
      new THREE.CylinderGeometry(0.06, 0.1, 2.3, 6).translate(0, 1.15, 0),
      new THREE.MeshStandardMaterial({ color: 0x2b3340, roughness: 0.6, metalness: 0.6 }),
      lamps,
    ),
    instanced(
      new THREE.SphereGeometry(0.22, 10, 8).translate(0, 2.45, 0),
      new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffc860, emissiveIntensity: 2.2 }),
      lamps,
      false,
    ),
  );

  // hiasan base: tiang berpendar di sekeliling pelataran, dan fountain
  const waters: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  const stone = new THREE.MeshStandardMaterial({ color: 0x8a93a6, roughness: 0.8 });
  CORES.forEach((c, t) => {
    const glow = new THREE.MeshStandardMaterial({ color: TEAM_COLOR[t], emissive: TEAM_COLOR[t], emissiveIntensity: 1.6 });
    const posts: Item[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const x = c.x + Math.cos(a) * 8.7;
      const z = c.z + Math.sin(a) * 8.7;
      if (distToLanes(x, z) < 4.6) continue; // jangan menghalangi jalan keluar base
      posts.push({ x, y: 0, z, sx: 1, sy: 1, sz: 1, ry: a });
    }
    scene.add(
      instanced(new THREE.BoxGeometry(0.5, 1.5, 0.5).translate(0, 0.75, 0), stone, posts),
      instanced(new THREE.OctahedronGeometry(0.28).translate(0, 1.95, 0), glow, posts, false),
    );

    const f = FOUNTAINS[t];
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(3.3, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: TEAM_COLOR[t], transparent: true, opacity: 0.45, depthWrite: false }),
    );
    water.position.set(f.x, 0.05, f.z);
    waters.push(water);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.45, 0.2, 6, 32).rotateX(Math.PI / 2), stone);
    rim.position.set(f.x, 0.1, f.z);
    rim.receiveShadow = true;
    const zone = new THREE.Mesh(new THREE.TorusGeometry(FOUNTAIN_RADIUS, 0.08, 6, 48).rotateX(Math.PI / 2), glow);
    zone.position.set(f.x, 0.07, f.z);
    scene.add(water, rim, zone);
  });

  // kunang-kunang melayang di jungle
  const flyCount = IS_TOUCH ? 60 : 140;
  const flyBase = new Float32Array(flyCount * 3);
  for (let i = 0; i < flyCount; ) {
    const p = greenSpot(7, false);
    if (!p) continue;
    flyBase.set([p.x, 0.8 + rnd() * 1.8, p.z], i * 3);
    i++;
  }
  const flyPos = new THREE.BufferAttribute(flyBase.slice(), 3);
  const flyGeo = new THREE.BufferGeometry();
  flyGeo.setAttribute('position', flyPos);
  const flies = new THREE.Points(
    flyGeo,
    new THREE.PointsMaterial({
      color: 0xe2ff9a,
      size: 0.34,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  flies.frustumCulled = false;
  scene.add(flies);

  // tembok tepi map
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a3446, roughness: 0.9 });
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

  return {
    update(time: number): void {
      uTime.value = time;
      const arr = flyPos.array as Float32Array;
      for (let i = 0; i < flyCount; i++) {
        arr[i * 3] = flyBase[i * 3] + Math.sin(time * 0.7 + i) * 0.9;
        arr[i * 3 + 1] = flyBase[i * 3 + 1] + Math.sin(time * 1.1 + i * 2.1) * 0.35;
        arr[i * 3 + 2] = flyBase[i * 3 + 2] + Math.cos(time * 0.6 + i * 1.7) * 0.9;
      }
      flyPos.needsUpdate = true;
      for (const w of waters) {
        const sc = 1 + Math.sin(time * 2) * 0.03;
        w.scale.set(sc, 1, sc);
        w.material.opacity = 0.42 + Math.sin(time * 2.4) * 0.08;
      }
    },
  };
}
