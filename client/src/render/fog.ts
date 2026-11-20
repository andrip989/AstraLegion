/**
 * Kabut perang di layar. Server hanya mengirim lawan yang berada dalam jarak pandang tim sendiri;
 * lapisan ini menggelapkan bagian peta di luar jarak pandang itu supaya pemain tahu mana yang
 * sedang "terlihat". Kabut digambar ke kanvas kecil (dipakai juga oleh minimap), lalu ditempel di
 * atas seluruh arena tanpa uji kedalaman, sehingga pohon dan dinding di dalam kabut ikut meredup.
 */
import * as THREE from 'three';
import { MAP_SIZE } from '../../../shared/src';

/** Resolusi kanvas kabut: kira-kira satu texel per unit peta, tepinya dihaluskan gradasi. */
const RES = 128;
/** Seberapa gelap daerah yang tidak terlihat (0..1). */
const DARKNESS = 0.62;

export class FogOfWar {
  /** Kanvas kabut: alpha 1 = tidak terlihat, 0 = terlihat. Minimap menggambarnya di atas latarnya. */
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** Cakram bertepi lembut yang "melubangi" kabut di sekitar tiap sumber penglihatan. */
  private hole = document.createElement('canvas');
  private acc = 1;
  private on = false;

  constructor(scene: THREE.Scene) {
    this.canvas.width = this.canvas.height = RES;
    this.ctx = this.canvas.getContext('2d')!;
    this.hole.width = this.hole.height = 64;
    const h = this.hole.getContext('2d')!;
    const g = h.createRadialGradient(32, 32, 32 * 0.7, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    h.fillStyle = g;
    h.fillRect(0, 0, 64, 64);

    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.generateMipmaps = false;
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, opacity: DARKNESS, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
    // bidang datar seluas peta; baris atas kanvas = z kecil (lihat rotateX), kolom kiri = x kecil
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE).rotateX(-Math.PI / 2), mat);
    this.mesh.position.set(MAP_SIZE / 2, 0.2, MAP_SIZE / 2);
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  get enabled(): boolean {
    return this.on;
  }

  /** Hanya dinyalakan bila server memakai kabut perang; server lama mengirim semua unit, jadi tidak ada yang perlu digelapkan. */
  setEnabled(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    this.mesh.visible = on;
    this.acc = 1;
  }

  /**
   * `sources` = deret [x, z, radius, ...] sumber penglihatan tim sendiri. Kanvas digambar ulang
   * paling sering sepuluh kali per detik: kabut tidak perlu lebih halus dari itu.
   */
  update(dt: number, sources: number[]): void {
    if (!this.on) return;
    this.acc += dt;
    if (this.acc < 0.1) return;
    this.acc = 0;
    const c = this.ctx;
    const k = RES / MAP_SIZE;
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#060a16';
    c.fillRect(0, 0, RES, RES);
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < sources.length; i += 3) {
      const r = sources[i + 2] * k;
      c.drawImage(this.hole, sources[i] * k - r, sources[i + 1] * k - r, r * 2, r * 2);
    }
    this.tex.needsUpdate = true;
  }
}
