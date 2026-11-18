// Geometri tumbuhan & batu: pohon cemara bertingkat, pohon rindang, semak, pakis, rumpun rumput,
// bunga, jamur berpendar, gugus kristal, dan bongkahan batu berlumut. Semuanya low-poly dengan
// gradasi warna per-vertex; warna dasar tiap salinan diatur lewat warna instance.
import * as THREE from 'three';
import { boxUV, build, hash3, tint, type Part } from './geo';

type V3 = [number, number, number];

/** Abu-abu sRGB 0..1 sebagai hex (dipakai sebagai "terang-gelap" yang dikalikan warna instance). */
const gray = (v: number) => {
  const c = Math.max(0, Math.min(255, Math.round(v * 255)));
  return (c << 16) | (c << 8) | c;
};

export const hsl = (h: number, s: number, l: number) => new THREE.Color().setHSL(h, s, l, THREE.SRGBColorSpace);

/** Kerucut terbuka dengan tepi bawah bergerigi (ujung dahan panjang-pendek berselang-seling). */
function skirt(r: number, h: number, segs: number, jag: number, droop: number, twist: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const ring = (i: number): V3 => {
    const a = (i / segs) * Math.PI * 2 + twist;
    const long = i % 2 === 0;
    const rr = r * (long ? 1 + jag : 1 - jag);
    return [Math.cos(a) * rr, long ? -droop : 0, Math.sin(a) * rr];
  };
  for (let i = 0; i < segs; i++) pos.push(0, h, 0, ...ring((i + 1) % segs), ...ring(i));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------------ pohon

export function pineCanopy(): THREE.BufferGeometry {
  const tiers: [number, number, number][] = [
    [1.28, 1.25, 0.62],
    [1.08, 1.15, 1.22],
    [0.86, 1.05, 1.82],
    [0.63, 0.95, 2.4],
    [0.4, 0.95, 2.95],
  ];
  return build(
    tiers.map(([r, h, y], t): Part => {
      const k = t / (tiers.length - 1);
      // ujung dahan (bawah) terang kena matahari, pangkal di dalam lebih gelap
      return { g: skirt(r, h, 10, 0.16, 0.14, t * 0.9), c: gray(0.8 + 0.2 * k), c2: gray(0.56 + 0.18 * k), p: [0, y, 0] };
    }),
  );
}

export function pineTrunk(): THREE.BufferGeometry {
  return build([
    { g: new THREE.CylinderGeometry(0.11, 0.2, 1.5, 6), c: 0x3a2a1c, c2: 0x5a4330, p: [0, 0.75, 0], flat: true },
    { g: new THREE.ConeGeometry(0.34, 0.3, 6), c: 0x33251a, p: [0, 0.12, 0], flat: true },
  ]);
}

export function leafCanopy(): THREE.BufferGeometry {
  const blobs: [number, number, number, number][] = [
    [0, 3.05, 0, 1.0],
    [0.85, 2.5, 0.15, 0.8],
    [-0.75, 2.45, 0.35, 0.78],
    [0.1, 2.4, -0.85, 0.76],
    [-0.2, 2.35, 0.9, 0.7],
    [0.55, 3.2, -0.5, 0.55],
    [-0.6, 3.15, -0.35, 0.58],
  ];
  return build(
    blobs.map(
      ([x, y, z, r], i): Part => ({
        // gumpalan utama lebih halus; yang kecil cukup bersegi kasar
        g: new THREE.IcosahedronGeometry(r, i < 3 ? 1 : 0),
        c: gray(0.46),
        c2: gray(1),
        p: [x, y, z],
        s: [1, 0.82, 1],
        warp: r * (i < 3 ? 0.13 : 0.08),
        seed: i * 7 + 3,
      }),
    ),
  );
}

export function leafTrunk(): THREE.BufferGeometry {
  const bark = 0x4a3524;
  const barkLight = 0x6b5038;
  return build([
    { g: new THREE.CylinderGeometry(0.15, 0.3, 2.2, 7), c: bark, c2: barkLight, p: [0, 1.1, 0], flat: true },
    { g: new THREE.ConeGeometry(0.46, 0.4, 7), c: 0x3d2b1d, p: [0, 0.15, 0], flat: true },
    { g: new THREE.CylinderGeometry(0.07, 0.11, 1.1, 5), c: barkLight, p: [0.42, 2.15, 0.08], r: [0, 0, -0.75], flat: true },
    { g: new THREE.CylinderGeometry(0.07, 0.11, 1.0, 5), c: barkLight, p: [-0.38, 2.1, 0.2], r: [0.3, 0, 0.75], flat: true },
    { g: new THREE.CylinderGeometry(0.06, 0.1, 0.9, 5), c: bark, p: [0.05, 2.1, -0.4], r: [-0.8, 0, 0], flat: true },
  ]);
}

/** Tunggul pohon dengan cincin tahun di atasnya. */
export function stump(): THREE.BufferGeometry {
  return build([
    { g: new THREE.CylinderGeometry(0.3, 0.4, 0.42, 8), c: 0x3d2c1e, c2: 0x5c4532, p: [0, 0.21, 0], flat: true },
    { g: new THREE.CylinderGeometry(0.27, 0.27, 0.03, 8), c: 0xb09468, p: [0, 0.43, 0] },
    { g: new THREE.CylinderGeometry(0.14, 0.14, 0.035, 8), c: 0x8d7450, p: [0, 0.435, 0] },
    { g: new THREE.ConeGeometry(0.16, 0.26, 4), c: 0x3d2c1e, p: [0.36, 0.1, 0.1], r: [0, 0, -0.9], flat: true },
    { g: new THREE.ConeGeometry(0.15, 0.24, 4), c: 0x3d2c1e, p: [-0.3, 0.1, -0.22], r: [0.5, 0, 0.9], flat: true },
  ]);
}

export function bush(): THREE.BufferGeometry {
  const blobs: [number, number, number, number][] = [
    [0, 0.34, 0, 0.44],
    [0.36, 0.26, 0.12, 0.33],
    [-0.32, 0.25, 0.18, 0.32],
    [0.05, 0.24, -0.34, 0.3],
    [-0.1, 0.5, 0.02, 0.26],
  ];
  return build(
    blobs.map(
      ([x, y, z, r], i): Part => ({
        g: new THREE.DodecahedronGeometry(r, 0),
        c: gray(0.4),
        c2: gray(1),
        p: [x, y, z],
        warp: r * 0.1,
        seed: i * 11,
      }),
    ),
  );
}

// ------------------------------------------------------------------------- batu

/** Bongkahan batu tak beraturan; `variant` memilih bentuk (0..2). Sisi atas berlumut. */
export function rock(variant: number): THREE.BufferGeometry {
  const shapes: V3[] = [
    [1, 0.72, 0.9],
    [1.25, 0.55, 0.85],
    [0.8, 1.05, 0.8],
  ];
  const g = build([
    {
      g: new THREE.IcosahedronGeometry(0.5, 1),
      c: 0x8c9099,
      s: shapes[variant % 3],
      warp: 0.085,
      seed: 40 + variant * 9,
    },
  ]);
  const moss = new THREE.Color(0x5d7a3e);
  const dark = new THREE.Color(0x4a4f58);
  tint(g, (x, y, z, ny, c) => {
    c.multiplyScalar(0.82 + 0.36 * hash3(Math.round(x * 9), Math.round(y * 9), Math.round(z * 9), variant));
    if (y < -0.1) c.lerp(dark, Math.min(1, (-0.1 - y) * 3));
    const m = Math.min(1, Math.max(0, (ny - 0.55) * 2.6));
    c.lerp(moss, m * 0.75);
  });
  return boxUV(g, 0.8);
}

// ---------------------------------------------------------------- tanaman kecil

/** Satu rumpun rumput: empat helai melengkung menghadap kamera, gelap di pangkal. */
export function grassTuft(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const nrm: number[] = [];
  const base = [0.03, 0.065, 0.026];
  const mid = [0.055, 0.115, 0.04];
  const tip = [0.11, 0.19, 0.06];
  const blades: [number, number, number, number][] = [
    // x, yaw, tinggi, condong
    [-0.13, -0.55, 0.42, 0.16],
    [-0.03, 0.12, 0.56, 0.1],
    [0.09, 0.5, 0.46, 0.18],
    [0.17, -0.2, 0.34, 0.12],
  ];
  for (const [bx, yaw, h, lean] of blades) {
    const ca = Math.cos(yaw);
    const sa = Math.sin(yaw);
    const w = 0.055;
    // ruang lokal helai: x = lebar, z = arah condong (menjauh dari kamera), lalu diputar
    const P = (x: number, y: number, z: number) => [bx + x * ca + z * sa, y, -x * sa + z * ca];
    const bl = P(-w, 0, 0);
    const br = P(w, 0, 0);
    const ml = P(-w * 0.7, h * 0.55, -lean * 0.35);
    const mr = P(w * 0.7, h * 0.55, -lean * 0.35);
    const tp = P(0, h, -lean);
    const tri = (...v: [number[], number[]][]) => v.forEach(([p, c]) => (pos.push(...p), col.push(...c), nrm.push(0, 1, 0)));
    tri([bl, base], [br, base], [mr, mid]);
    tri([bl, base], [mr, mid], [ml, mid]);
    tri([ml, mid], [mr, mid], [tp, tip]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

/** Pakis: beberapa pelepah melengkung keluar dari satu titik. */
export function fern(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const nrm: number[] = [];
  const count = 7;
  for (let f = 0; f < count; f++) {
    const a = (f / count) * Math.PI * 2 + 0.3;
    const len = 0.5 + 0.2 * hash3(f, 1, 2);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const sect = (t: number) => {
      const r = t * len;
      const y = Math.sin(t * Math.PI * 0.85) * 0.34 * (1 - t * 0.25);
      const w = 0.1 * (1 - t) + 0.012;
      const shade = 0.5 + 0.7 * t;
      return {
        l: [ca * r - sa * w, y, sa * r + ca * w],
        r: [ca * r + sa * w, y, sa * r - ca * w],
        c: [0.05 * shade, 0.16 * shade, 0.045 * shade],
      };
    };
    for (let s = 0; s < 4; s++) {
      const p = sect(s / 4);
      const q = sect((s + 1) / 4);
      for (const [v, c] of [
        [p.l, p.c],
        [q.l, q.c],
        [p.r, p.c],
        [p.r, p.c],
        [q.l, q.c],
        [q.r, q.c],
      ]) {
        pos.push(...v);
        col.push(...c);
        nrm.push(0, 1, 0);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

/** Bunga: tangkai + lima kelopak (putih, diwarnai lewat warna instance) + putik kuning. */
export function flower(): THREE.BufferGeometry {
  // hemat segitiga: tangkai = satu bidang, kelopak = belah ketupat pipih, putik = oktahedron
  const parts: Part[] = [{ g: new THREE.PlaneGeometry(0.03, 0.3), c: 0x2f5a26, p: [0, 0.15, 0] }];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push({
      g: new THREE.CircleGeometry(0.075, 4),
      c: 0xffffff,
      s: [1, 0.62, 1],
      r: [-Math.PI / 2 + 0.3, -a, 0],
      p: [Math.cos(a) * 0.075, 0.31, Math.sin(a) * 0.075],
    });
  }
  parts.push({ g: new THREE.OctahedronGeometry(0.04), c: 0xffd84a, p: [0, 0.33, 0] });
  const g = build(parts);
  // normal ke atas: kelopak selalu terang, dari sisi mana pun cahaya datang
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

/** Tiga jamur dalam satu rumpun. Dipakai dengan material tanpa cahaya supaya topinya berpendar. */
export function mushrooms(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const list: [number, number, number][] = [
    [0, 0, 1],
    [0.16, 0.06, 0.68],
    [-0.12, 0.13, 0.52],
  ];
  for (const [x, z, s] of list) {
    parts.push({ g: new THREE.CylinderGeometry(0.03 * s, 0.045 * s, 0.2 * s, 5), c: 0x9aa39a, p: [x, 0.1 * s, z] });
    parts.push({
      g: new THREE.SphereGeometry(0.13 * s, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2),
      c: gray(0.72),
      c2: gray(1),
      s: [1, 0.75, 1],
      p: [x, 0.19 * s, z],
    });
  }
  return build(parts);
}

/** Gugus kristal: beberapa prisma runcing, pangkal gelap dan ujung terang. */
export function crystalCluster(): THREE.BufferGeometry {
  const shards: [number, number, number, number, number, number][] = [
    // x, z, tinggi, tebal, miring x, miring z
    [0, 0, 1.25, 0.2, 0.05, 0.08],
    [0.24, 0.1, 0.8, 0.15, 0.15, -0.5],
    [-0.22, 0.12, 0.7, 0.14, 0.25, 0.5],
    [0.05, -0.24, 0.62, 0.13, -0.5, 0.1],
    [-0.08, 0.28, 0.48, 0.11, 0.6, 0.15],
  ];
  return build(
    shards.map(
      ([x, z, h, w, rx, rz]): Part => ({
        g: new THREE.OctahedronGeometry(0.5, 0),
        c: gray(0.35),
        c2: gray(1),
        s: [w * 2, h, w * 2],
        r: [rx, 0.6, rz],
        p: [x + Math.sin(rz) * -h * 0.3, h * 0.42, z + Math.sin(rx) * h * 0.3],
        flat: true,
      }),
    ),
  );
}

// ------------------------------------------------- detail tambahan (kualitas sedang & tinggi)

/** Rumpun rumput tinggi: tujuh helai panjang yang melengkung ke berbagai arah. */
export function tallGrass(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const nrm: number[] = [];
  const base = [0.028, 0.06, 0.024];
  const mid = [0.06, 0.12, 0.04];
  const tip = [0.14, 0.2, 0.07];
  for (let b = 0; b < 7; b++) {
    const yaw = (b / 7) * 2.2 - 1.1 + (hash3(b, 3, 1) - 0.5) * 0.3;
    const h = 0.62 + hash3(b, 7, 2) * 0.42;
    const lean = 0.16 + hash3(b, 5, 9) * 0.22;
    const bx = (hash3(b, 1, 4) - 0.5) * 0.36;
    const ca = Math.cos(yaw);
    const sa = Math.sin(yaw);
    const w = 0.04;
    const P = (x: number, y: number, z: number) => [bx + x * ca + z * sa, y, -x * sa + z * ca];
    const rows = [
      [P(-w, 0, 0), P(w, 0, 0), base],
      [P(-w * 0.8, h * 0.4, -lean * 0.2), P(w * 0.8, h * 0.4, -lean * 0.2), mid],
      [P(-w * 0.5, h * 0.75, -lean * 0.6), P(w * 0.5, h * 0.75, -lean * 0.6), mid],
    ] as [number[], number[], number[]][];
    const push = (p: number[], c: number[]) => (pos.push(...p), col.push(...c), nrm.push(0, 1, 0));
    for (let r = 0; r < rows.length - 1; r++) {
      const [l0, r0, c0] = rows[r];
      const [l1, r1, c1] = rows[r + 1];
      push(l0, c0), push(r0, c0), push(r1, c1), push(l0, c0), push(r1, c1), push(l1, c1);
    }
    const [l2, r2, c2] = rows[2];
    push(l2, c2), push(r2, c2), push(P(0, h, -lean), tip);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

/** Kerikil kecil pipih. */
export function pebble(): THREE.BufferGeometry {
  return build([{ g: new THREE.IcosahedronGeometry(0.5, 0), c: 0x8d8f92, c2: 0xb9b6ad, s: [1, 0.5, 0.8], warp: 0.07, seed: 77 }]);
}

/** Sehelai daun gugur yang tergeletak di tanah (diwarnai lewat warna instance). */
export function fallenLeaf(): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(0.5, 4).rotateX(-Math.PI / 2).scale(1, 1, 0.55);
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

/** Daun teratai: lingkaran dengan satu takik. */
export function lilyPad(): THREE.BufferGeometry {
  return build([
    { g: new THREE.CircleGeometry(0.5, 12, 0.35, Math.PI * 2 - 0.7).rotateX(-Math.PI / 2), c: 0x2f6b34 },
    { g: new THREE.CircleGeometry(0.36, 10, 0.35, Math.PI * 2 - 0.7).rotateX(-Math.PI / 2).translate(0, 0.004, 0), c: 0x4b8f43 },
  ]);
}

/** Alang-alang tepi kolam: batang tinggi dengan bonggol cokelat. */
export function reed(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const stalks: [number, number, number, number][] = [
    [0, 0, 1.1, 0.05],
    [0.12, 0.06, 0.85, -0.12],
    [-0.1, 0.08, 0.95, 0.14],
    [0.04, -0.12, 0.7, -0.05],
  ];
  for (const [x, z, h, tilt] of stalks) {
    parts.push({ g: new THREE.CylinderGeometry(0.012, 0.02, h, 4), c: 0x35602c, c2: 0x6f9a4a, p: [x + tilt * h * 0.5, h / 2, z], r: [0, 0, -tilt] });
    parts.push({ g: new THREE.CylinderGeometry(0.035, 0.035, 0.2, 5), c: 0x5a3c22, p: [x + tilt * h, h + 0.06, z], r: [0, 0, -tilt] });
  }
  return build(parts);
}

/** Sepasang sayap (dua segitiga) untuk kupu-kupu; juga dipakai sebagai daun yang melayang. */
export function wings(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  // sayap kiri & kanan, engsel di sumbu Z (x = 0)
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.1, -0.2, 0, 0.16, -0.14, 0, -0.14, 0, 0, 0.1, 0.14, 0, -0.14, 0.2, 0, 0.16, 0, 0, 0.1, -0.14, 0, -0.14, 0, 0, -0.08, 0, 0, 0.1, 0, 0, -0.08, 0.14, 0, -0.14], 3));
  return g;
}

/** Tajuk pohon rindang versi detail tinggi: lebih banyak gumpalan, semuanya halus. */
export function leafCanopyDetailed(): THREE.BufferGeometry {
  const blobs: [number, number, number, number][] = [
    [0, 3.1, 0, 1.0],
    [0.85, 2.5, 0.15, 0.8],
    [-0.75, 2.45, 0.35, 0.78],
    [0.1, 2.4, -0.85, 0.76],
    [-0.2, 2.35, 0.9, 0.7],
    [0.55, 3.25, -0.5, 0.56],
    [-0.6, 3.2, -0.35, 0.6],
    [0.5, 3.0, 0.6, 0.55],
    [-0.9, 2.9, -0.2, 0.5],
    [1.05, 2.9, -0.3, 0.46],
    [0, 3.75, 0.1, 0.5],
  ];
  return build(
    blobs.map(
      ([x, y, z, r], i): Part => ({
        g: new THREE.IcosahedronGeometry(r, 1),
        c: gray(0.42),
        c2: gray(1),
        p: [x, y, z],
        s: [1, 0.82, 1],
        warp: r * 0.14,
        seed: i * 7 + 3,
      }),
    ),
  );
}

/** Cemara versi detail tinggi: tujuh tingkat dahan dengan gerigi lebih rapat. */
export function pineCanopyDetailed(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const tiers = 7;
  for (let t = 0; t < tiers; t++) {
    const k = t / (tiers - 1);
    const r = 1.32 * (1 - k * 0.72);
    parts.push({ g: skirt(r, 1.2 - k * 0.3, 14, 0.2, 0.16, t * 0.7), c: gray(0.8 + 0.2 * k), c2: gray(0.52 + 0.2 * k), p: [0, 0.6 + t * 0.44, 0] });
  }
  return build(parts);
}
