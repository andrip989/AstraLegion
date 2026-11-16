// Grid navigasi (sel 1x1 unit) + pathfinding A* dengan penghalusan jalur.
// Murni TypeScript (tanpa API Node) supaya bisa dipakai juga oleh mode offline di browser.
import { MAP_MARGIN, MAP_SIZE, OBSTACLES, type Vec2 } from '../../../shared/src';

const N = MAP_SIZE;
const SQRT2 = Math.SQRT2;

export interface Circle {
  x: number;
  z: number;
  r: number;
}

export class NavGrid {
  private base = new Uint8Array(N * N); // dinding statis
  private grid = new Uint8Array(N * N); // dinding statis + bangunan
  private g = new Float32Array(N * N);
  private parent = new Int32Array(N * N);
  private opened = new Uint32Array(N * N);
  private closed = new Uint32Array(N * N);
  private searchId = 0;
  private heapIdx: number[] = [];
  private heapF: number[] = [];

  constructor(private pad = 0.7) {
    for (let cz = 0; cz < N; cz++) {
      for (let cx = 0; cx < N; cx++) {
        const px = cx + 0.5;
        const pz = cz + 0.5;
        let blocked =
          px < MAP_MARGIN || pz < MAP_MARGIN || px > N - MAP_MARGIN || pz > N - MAP_MARGIN;
        if (!blocked) {
          for (const r of OBSTACLES) {
            if (px > r.x0 - pad && px < r.x1 + pad && pz > r.z0 - pad && pz < r.z1 + pad) {
              blocked = true;
              break;
            }
          }
        }
        this.base[cz * N + cx] = blocked ? 1 : 0;
      }
    }
    this.grid.set(this.base);
  }

  /** Tandai bangunan (tower/core yang masih berdiri) sebagai penghalang. */
  setStructures(circles: Circle[]): void {
    this.grid.set(this.base);
    for (const c of circles) {
      const rr = c.r + this.pad;
      const x0 = Math.max(0, Math.floor(c.x - rr));
      const x1 = Math.min(N - 1, Math.floor(c.x + rr));
      const z0 = Math.max(0, Math.floor(c.z - rr));
      const z1 = Math.min(N - 1, Math.floor(c.z + rr));
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          const dx = cx + 0.5 - c.x;
          const dz = cz + 0.5 - c.z;
          if (dx * dx + dz * dz < rr * rr) this.grid[cz * N + cx] = 1;
        }
      }
    }
  }

  isWalkable(x: number, z: number): boolean {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (cx < 0 || cz < 0 || cx >= N || cz >= N) return false;
    return this.grid[cz * N + cx] === 0;
  }

  lineClear(x0: number, z0: number, x1: number, z1: number): boolean {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const steps = Math.ceil(Math.hypot(dx, dz) / 0.35);
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      if (!this.isWalkable(x0 + dx * t, z0 + dz * t)) return false;
    }
    return true;
  }

  /** Titik terjauh yang masih bisa dilewati di sepanjang garis (untuk dash/blink). */
  clampLine(x0: number, z0: number, x1: number, z1: number): Vec2 {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.25));
    let bx = x0;
    let bz = z0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = x0 + dx * t;
      const pz = z0 + dz * t;
      if (this.isWalkable(px, pz)) {
        bx = px;
        bz = pz;
      }
    }
    return { x: bx, z: bz };
  }

  private nearestFreeCell(cx: number, cz: number): number {
    cx = Math.min(N - 1, Math.max(0, cx));
    cz = Math.min(N - 1, Math.max(0, cz));
    if (this.grid[cz * N + cx] === 0) return cz * N + cx;
    for (let r = 1; r < 40; r++) {
      let best = -1;
      let bestD = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= N || z >= N) continue;
          if (this.grid[z * N + x] !== 0) continue;
          const d = dx * dx + dz * dz;
          if (d < bestD) {
            bestD = d;
            best = z * N + x;
          }
        }
      }
      if (best >= 0) return best;
    }
    return cz * N + cx;
  }

  // --- binary heap ---
  private push(idx: number, f: number): void {
    const hi = this.heapIdx;
    const hf = this.heapF;
    let i = hi.length;
    hi.push(idx);
    hf.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hf[p] <= f) break;
      hi[i] = hi[p];
      hf[i] = hf[p];
      i = p;
    }
    hi[i] = idx;
    hf[i] = f;
  }

  private pop(): number {
    const hi = this.heapIdx;
    const hf = this.heapF;
    const top = hi[0];
    const lastIdx = hi.pop()!;
    const lastF = hf.pop()!;
    const n = hi.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && hf[c + 1] < hf[c]) c++;
        if (hf[c] >= lastF) break;
        hi[i] = hi[c];
        hf[i] = hf[c];
        i = c;
      }
      hi[i] = lastIdx;
      hf[i] = lastF;
    }
    return top;
  }

  /** Jalur dari (sx,sz) ke (tx,tz) sebagai daftar titik yang harus dilalui. */
  findPath(sx: number, sz: number, tx: number, tz: number): Vec2[] {
    const targetFree = this.isWalkable(tx, tz);
    const start = this.nearestFreeCell(Math.floor(sx), Math.floor(sz));
    const goal = this.nearestFreeCell(Math.floor(tx), Math.floor(tz));
    const gx = goal % N;
    const gz = (goal / N) | 0;
    const end: Vec2 = targetFree ? { x: tx, z: tz } : { x: gx + 0.5, z: gz + 0.5 };
    if (start === goal) return [end];
    if (this.isWalkable(sx, sz) && this.lineClear(sx, sz, end.x, end.z)) return [end];

    const id = ++this.searchId;
    const { g, parent, opened, closed, grid } = this;
    this.heapIdx.length = 0;
    this.heapF.length = 0;
    g[start] = 0;
    parent[start] = -1;
    opened[start] = id;
    this.push(start, 0);
    let found = false;

    while (this.heapIdx.length > 0) {
      const cur = this.pop();
      if (closed[cur] === id) continue;
      closed[cur] = id;
      if (cur === goal) {
        found = true;
        break;
      }
      const cx = cur % N;
      const cz = (cur / N) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
          const ni = nz * N + nx;
          if (grid[ni] !== 0 || closed[ni] === id) continue;
          // jangan memotong sudut dinding
          if (dx !== 0 && dz !== 0 && (grid[cz * N + nx] !== 0 || grid[nz * N + cx] !== 0)) continue;
          const ng = g[cur] + (dx !== 0 && dz !== 0 ? SQRT2 : 1);
          if (opened[ni] === id && ng >= g[ni]) continue;
          g[ni] = ng;
          parent[ni] = cur;
          opened[ni] = id;
          const hx = Math.abs(nx - gx);
          const hz = Math.abs(nz - gz);
          const h = Math.max(hx, hz) + (SQRT2 - 1) * Math.min(hx, hz);
          this.push(ni, ng + h);
        }
      }
    }
    if (!found) return [];

    const cells: Vec2[] = [];
    for (let c = goal; c !== -1 && c !== start; c = parent[c]) {
      cells.push({ x: (c % N) + 0.5, z: ((c / N) | 0) + 0.5 });
    }
    cells.reverse();
    cells[cells.length - 1] = end;

    // Penghalusan: lompati titik selama garis lurusnya bebas hambatan.
    const out: Vec2[] = [];
    let px = sx;
    let pz = sz;
    let i = 0;
    while (i < cells.length) {
      let j = Math.min(cells.length - 1, i + 60);
      while (j > i && !this.lineClear(px, pz, cells[j].x, cells[j].z)) j--;
      out.push(cells[j]);
      px = cells[j].x;
      pz = cells[j].z;
      i = j + 1;
    }
    return out;
  }
}
