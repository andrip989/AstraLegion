// Renderer, scene, pencahayaan, dan kamera MOBA (top-down miring, bisa zoom & geser).
import * as THREE from 'three';
import { MAP_SIZE, type Vec2 } from '../../../shared/src';

export const IS_TOUCH = matchMedia('(pointer: coarse)').matches;

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 1, 400);
  /** Titik di tanah yang dilihat kamera. */
  readonly target = new THREE.Vector3(MAP_SIZE / 2, 0, MAP_SIZE / 2);
  zoom = IS_TOUCH ? 30 : 36;
  shake = 0;

  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ndc = new THREE.Vector2();
  private hit = new THREE.Vector3();

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_TOUCH, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.5 : 2));
    this.renderer.shadowMap.enabled = !IS_TOUCH; // bayangan dimatikan di HP demi performa
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color(0x070b16);
    this.scene.fog = new THREE.Fog(0x070b16, 110, 240);

    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x3a4566, 1.9));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    sun.position.set(MAP_SIZE / 2 - 40, 90, MAP_SIZE / 2 + 50);
    sun.target.position.set(MAP_SIZE / 2, 0, MAP_SIZE / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -85;
    sc.right = sc.top = 85;
    sc.near = 10;
    sc.far = 220;
    sun.shadow.bias = -0.0008;
    this.scene.add(sun, sun.target);

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize(): void {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  clampZoom(): void {
    this.zoom = Math.min(80, Math.max(20, this.zoom));
  }

  render(dt: number): void {
    this.target.x = Math.min(MAP_SIZE, Math.max(0, this.target.x));
    this.target.z = Math.min(MAP_SIZE, Math.max(0, this.target.z));
    let sx = 0;
    let sz = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      sx = (Math.random() - 0.5) * this.shake;
      sz = (Math.random() - 0.5) * this.shake;
    }
    this.camera.position.set(this.target.x + sx, this.zoom * 0.82, this.target.z + this.zoom * 0.57 + sz);
    this.camera.lookAt(this.target.x + sx, 0, this.target.z + sz);
    this.renderer.render(this.scene, this.camera);
  }

  /** Titik tanah (y=0) di bawah koordinat layar. */
  groundPoint(clientX: number, clientY: number): Vec2 | null {
    this.ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.ground, this.hit)) return null;
    return { x: this.hit.x, z: this.hit.z };
  }

  /** Lebar dunia (unit) per piksel layar pada jarak fokus; dipakai untuk menggeser kamera. */
  worldPerPixel(): number {
    const dist = this.zoom; // |(0, .82, .57)| ~ 1
    return (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / innerHeight;
  }
}
