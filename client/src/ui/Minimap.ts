// Minimap: lane & dinding (digambar sekali) + titik unit. Klik/seret untuk memindahkan kamera.
import { MAP_SIZE } from '../../../shared/src';
import type { EntityViews } from '../render/EntityViews';
import { paintMap } from '../render/MapView';
import type { SceneManager } from '../render/SceneManager';

const SIZE = 200;
const S = SIZE / MAP_SIZE;
const COLORS = ['#4f9bff', '#ff5c5c', '#f2c744'];

export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private bg = document.createElement('canvas');
  private acc = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private sm: SceneManager,
    private views: EntityViews,
    onPan: () => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.bg.width = this.bg.height = SIZE;
    paintMap(this.bg.getContext('2d')!, SIZE, true);

    const jump = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      sm.target.x = ((e.clientX - r.left) / r.width) * MAP_SIZE;
      sm.target.z = ((e.clientY - r.top) / r.height) * MAP_SIZE;
      onPan();
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      jump(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (canvas.hasPointerCapture(e.pointerId)) jump(e);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  update(dt: number): void {
    this.acc += dt;
    if (this.acc < 0.1) return;
    this.acc = 0;
    const c = this.ctx;
    c.drawImage(this.bg, 0, 0);
    const selfId = this.views.selfId;

    for (const v of this.views.views.values()) {
      const x = v.x * S;
      const y = v.z * S;
      c.fillStyle = COLORS[v.st.team];
      switch (v.st.kind) {
        case 'tower':
          c.fillRect(x - 3, y - 3, 6, 6);
          break;
        case 'core':
          c.fillRect(x - 5, y - 5, 10, 10);
          c.strokeStyle = '#fff';
          c.lineWidth = 1;
          c.strokeRect(x - 5, y - 5, 10, 10);
          break;
        case 'minion':
          c.fillRect(x - 1, y - 1, 2.5, 2.5);
          break;
        case 'monster':
          c.beginPath();
          c.arc(x, y, 2, 0, Math.PI * 2);
          c.fill();
          break;
        case 'hero':
          c.beginPath();
          c.arc(x, y, 4.5, 0, Math.PI * 2);
          c.fill();
          c.lineWidth = 1.5;
          c.strokeStyle = v.st.id === selfId ? '#ffffff' : '#0a0f1f';
          c.stroke();
          break;
      }
    }

    // bingkai area pandang kamera (perkiraan)
    const w = this.sm.zoom * 1.25 * this.sm.camera.aspect * 0.72 * S;
    const h = this.sm.zoom * 0.95 * S;
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 1;
    c.strokeRect(this.sm.target.x * S - w / 2, this.sm.target.z * S - h / 2, w, h);
  }
}
