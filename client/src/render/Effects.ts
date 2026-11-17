// Efek visual sementara yang dipicu event server: beam, ledakan cincin, jejak dash,
// tembakan, teks melayang, dan penanda klik.
import * as THREE from 'three';
import type { GameEvent } from '../../../shared/src';
import type { EntityViews } from './EntityViews';
import { TEAM_COLOR } from './models';
import type { SceneManager } from './SceneManager';

interface Fx {
  obj: THREE.Object3D;
  life: number;
  max: number;
  tick: (fx: Fx, t: number, dt: number) => void; // t: 0 (baru) -> 1 (habis)
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const RING = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
const DISC = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);

function glowMat(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export class Effects {
  private list: Fx[] = [];
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();

  constructor(
    private sm: SceneManager,
    private views: EntityViews,
  ) {}

  private add(obj: THREE.Object3D, life: number, tick: Fx['tick']): void {
    this.sm.scene.add(obj);
    this.list.push({ obj, life, max: life, tick });
  }

  /** Balok bercahaya dari titik a ke b. */
  private segment(a: THREE.Vector3, b: THREE.Vector3, width: number, color: number, life: number, opacity = 0.9): void {
    const len = a.distanceTo(b);
    if (len < 0.01) return;
    const m = new THREE.Mesh(BOX, glowMat(color, opacity));
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.lookAt(b);
    m.scale.set(width, width * 0.5, len);
    this.add(m, life, (fx, t) => {
      (m.material as THREE.MeshBasicMaterial).opacity = opacity * (1 - t);
      m.scale.x = width * (1 - t * 0.7);
    });
  }

  ring(x: number, z: number, r: number, color: number, life = 0.45): void {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(RING, glowMat(color, 1));
    const disc = new THREE.Mesh(DISC, glowMat(color, 0.35));
    g.add(ring, disc);
    g.position.set(x, 0.12, z);
    this.add(g, life, (_, t) => {
      const s = r * (0.25 + 0.75 * Math.min(1, t * 2.2));
      g.scale.set(s, 1, s);
      (ring.material as THREE.MeshBasicMaterial).opacity = 1 - t;
      (disc.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - t);
    });
  }

  text(x: number, z: number, s: string, color: number): void {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 40px Segoe UI, Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.strokeText(s, 128, 32, 250);
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.fillText(s, 128, 32, 250);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(4.4, 1.1, 1);
    sp.position.set(x, 3, z);
    sp.renderOrder = 20;
    this.add(sp, 1, (_, t, dt) => {
      sp.position.y += dt * 2.2;
      sp.material.opacity = 1 - t * t;
    });
  }

  /** Kepulan debu kecil di kaki hero yang berlari. */
  dust(x: number, z: number): void {
    const m = new THREE.Mesh(DISC, glowMat(0xcfd8c0, 0.22));
    m.material.blending = THREE.NormalBlending;
    m.position.set(x + (Math.random() - 0.5) * 0.5, 0.09, z + (Math.random() - 0.5) * 0.5);
    this.add(m, 0.55, (_, t) => {
      const s = 0.25 + t * 0.75;
      m.scale.set(s, 1, s);
      m.material.opacity = 0.22 * (1 - t);
    });
  }

  clickMarker(x: number, z: number, color: number): void {
    const m = new THREE.Mesh(RING, glowMat(color, 1));
    m.position.set(x, 0.1, z);
    this.add(m, 0.35, (_, t) => {
      const s = 1.3 * (1 - t) + 0.2;
      m.scale.set(s, 1, s);
    });
  }

  handle(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.k) {
        case 'atk': {
          const a = this.views.get(e.a);
          const b = this.views.get(e.b);
          if (!a) break;
          a.anim.atk = 1; // memicu animasi ayunan/tembakan pada rig
          if (e.r && b) {
            const tower = a.st.kind === 'tower';
            this.a.set(a.root.position.x, tower ? 6.5 : a.height * 0.55, a.root.position.z);
            this.b.set(b.root.position.x, Math.min(1.2, b.height * 0.5), b.root.position.z);
            const color = tower ? TEAM_COLOR[a.st.team] : a.st.kind === 'hero' ? 0x9af2ff : TEAM_COLOR[a.st.team];
            this.segment(this.a, this.b, tower ? 0.45 : 0.2, color, tower ? 0.22 : 0.14);
          }
          break;
        }
        case 'cast': {
          const caster = this.views.get(e.a);
          if (caster) caster.anim.cast = 1;
          break;
        }
        case 'beam': {
          this.a.set(e.x0, 1.3, e.z0);
          this.b.set(e.x1, 1.3, e.z1);
          if (e.warn) this.segment(this.a, this.b, e.w * 0.35, e.c, 0.5, 0.35);
          else {
            this.segment(this.a, this.b, e.w, e.c, 0.4, 0.95);
            this.sm.shake = Math.max(this.sm.shake, e.w > 2.5 ? 1.2 : 0.35);
          }
          break;
        }
        case 'ring':
          this.ring(e.x, e.z, e.r, e.c);
          if (e.r >= 6) this.sm.shake = Math.max(this.sm.shake, 0.9);
          break;
        case 'trail':
          this.a.set(e.x0, 0.9, e.z0);
          this.b.set(e.x1, 0.9, e.z1);
          this.segment(this.a, this.b, 0.7, e.c, 0.35, 0.7);
          break;
        case 'text':
          this.text(e.x, e.z, e.s, e.c);
          break;
      }
    }
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const fx = this.list[i];
      fx.life -= dt;
      if (fx.life <= 0) {
        this.sm.scene.remove(fx.obj);
        fx.obj.traverse((o) => {
          const mat = (o as THREE.Mesh).material as THREE.Material & { map?: THREE.Texture | null };
          if (mat) {
            mat.map?.dispose();
            mat.dispose();
          }
        });
        this.list.splice(i, 1);
      } else {
        fx.tick(fx, 1 - fx.life / fx.max, dt);
      }
    }
  }
}
