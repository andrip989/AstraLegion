// Renderer, scene, pencahayaan, dan kamera MOBA (top-down miring, bisa zoom & geser).
import * as THREE from 'three';
import { MAP_SIZE, type Vec2 } from '../../../shared/src';
import { POINT_SCALE } from './particles';
import { daylightAt, newDaylight } from './daylight';
import { PostFx } from './PostFx';
import { AUTO_KEY, GFX, IS_TOUCH } from './quality';
import { configureTextures } from './textures';

export { IS_TOUCH };

/** Layer untuk HP bar & label: digambar setelah post-processing supaya tetap tajam. */
export const OVERLAY_LAYER = 1;

/** Warna kabut/latar: senja kebiruan. */
const HAZE = 0x1d2b3a;

/** Arah datangnya cahaya matahari (dari kiri-atas, sedikit dari arah kamera). */
export const SUN_DIR = new THREE.Vector3(-0.46, 0.72, 0.52).normalize();

/** Langit sederhana untuk pantulan (environment map): gradasi + bintik matahari. */
function buildEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const sky = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uSun: { value: SUN_DIR } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 zenith = vec3(0.16, 0.30, 0.62);
        vec3 horizon = vec3(0.95, 0.72, 0.52);
        vec3 ground = vec3(0.10, 0.16, 0.10);
        vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.55));
        col = mix(col, ground, smoothstep(0.02, -0.25, h));
        float s = max(dot(d, uSun), 0.0);
        col += vec3(1.0, 0.82, 0.55) * (pow(s, 24.0) * 1.2 + pow(s, 400.0) * 8.0);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  sky.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(sky, 0.03).texture;
  pmrem.dispose();
  mat.dispose();
  return env;
}

/** Hasil pengatur otomatis yang disimpan antar sesi (hanya berlaku untuk kualitas yang sama). */
interface Tuning {
  quality: string;
  scale: number;
  noPost: boolean;
  noShadow: boolean;
}

function loadTuning(): Tuning | null {
  try {
    const t = JSON.parse(localStorage.getItem(AUTO_KEY) ?? 'null') as Tuning | null;
    if (t && t.quality === GFX.quality && typeof t.scale === 'number') return { ...t, scale: Math.min(1, Math.max(0.5, t.scale)) };
  } catch {
    /* data rusak / penyimpanan tidak tersedia */
  }
  return null;
}

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 1, 400);
  /** Titik di tanah yang dilihat kamera. */
  readonly target = new THREE.Vector3(MAP_SIZE / 2, 0, MAP_SIZE / 2);
  zoom = IS_TOUCH ? 30 : 36;
  shake = 0;
  /** Kamera bebas untuk memeriksa model dari konsol: sudut (radian) dan tinggi titik pandang. */
  debugView: { pitch: number; yaw: number; lift: number } | null = null;
  /** Lampu titik untuk efek sesaat (hanya ada di kualitas tinggi). */
  readonly fxLights: THREE.PointLight[] = [];
  /** Guncangan kamera boleh dimatikan lewat pengaturan. */
  shakeEnabled = true;
  /** Rata-rata fps terakhir (untuk penghitung FPS di HUD). */
  fps = 0;

  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ndc = new THREE.Vector2();
  private hit = new THREE.Vector3();
  private post: PostFx | null = null;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private rim: THREE.DirectionalLight;
  private haze = new THREE.Color(HAZE);
  private daylight = newDaylight();
  private dayStamp = -1;
  private sunRight = new THREE.Vector3();
  private sunUp = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  /** Skala resolusi dinamis: turun otomatis bila frame rate rendah. */
  private resScale = 1;
  private slowTime = 0;
  private slowFrames = 0;
  private warmup = 3;
  private goodWindows = 0;
  private badWindows = 0;
  private raised = false;
  private raiseBudget = 2;
  /** Pemberitahuan singkat untuk pemain saat pengatur otomatis melepas sebuah fitur grafis. */
  onNotice: ((text: string) => void) | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    const low = GFX.low;
    // Hasil pengatur otomatis dari sesi sebelumnya (kualitas yang sama): langsung mulai dari sana,
    // supaya tidak ada beberapa detik pertama yang tersendat selagi resolusi diturunkan lagi.
    const tuned = loadTuning();
    if (tuned) this.resScale = tuned.scale;
    // di mode tinggi anti-aliasing dilakukan oleh buffer MSAA milik post-processing
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: low && !IS_TOUCH, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = !low && !tuned?.noShadow; // tanpa shadow map di mode ringan demi performa
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false; // statistik dihitung per frame penuh (semua pass)
    configureTextures(this.renderer);

    // latar dan kabut berbagi satu objek warna, supaya siklus siang-malam cukup mengubah satu nilai
    this.scene.background = this.haze;
    this.scene.fog = new THREE.Fog(HAZE, 100, 235);
    this.scene.fog.color = this.haze;
    this.scene.environment = buildEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.45;

    // langit kebiruan dari atas, pantulan hijau dari tanah
    this.hemi = new THREE.HemisphereLight(0xc4d8f8, 0x5a6248, 1.25);
    this.scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xffe4bd, 3.0));
    sun.castShadow = this.renderer.shadowMap.enabled;
    const shadowSize = GFX.mobile ? 1024 : GFX.high ? 4096 : 2048;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 320;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun, sun.target);
    // cahaya tepi dingin dari arah berlawanan, supaya siluet tidak tenggelam
    const rim = (this.rim = new THREE.DirectionalLight(0xa9c6ff, 0.8));
    rim.position.set(0.6, 0.5, -0.65);
    this.scene.add(rim);

    this.sunRight.crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize();
    this.sunUp.crossVectors(SUN_DIR, this.sunRight).normalize();

    if (!low && !tuned?.noPost) this.post = new PostFx(this.renderer, this.scene, this.camera);

    // kualitas tinggi: beberapa lampu titik yang dipinjam efek skill (ledakan menerangi sekitarnya).
    // Jumlahnya tetap supaya shader tidak perlu dikompilasi ulang; saat tidak dipakai intensitasnya 0.
    if (GFX.high) {
      for (let i = 0; i < 3; i++) {
        const light = new THREE.PointLight(0xffffff, 0, 16, 1.6);
        light.position.set(MAP_SIZE / 2, -50, MAP_SIZE / 2);
        this.scene.add(light);
        this.fxLights.push(light);
      }
    }

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize(): void {
    const w = innerWidth;
    const h = innerHeight;
    // Batasi jumlah piksel yang dirender: layar 4K/retina tidak perlu resolusi penuh. Di HP dan
    // tablet anggarannya jauh lebih kecil (layarnya rapat, GPU-nya lemah); pilihan "Tinggi" di sana
    // memberi gambar lebih tajam, bukan efek lebih berat.
    const q = GFX.quality;
    const budget = GFX.mobile ? (q === 'low' ? 0.8e6 : q === 'medium' ? 1.05e6 : 1.4e6) : GFX.low ? 1.7e6 : GFX.high ? 5.2e6 : 3.7e6;
    const cap = GFX.mobile ? (q === 'high' ? 2 : 1.5) : GFX.low ? 1.5 : 2;
    const ratio = Math.min(devicePixelRatio, cap, Math.sqrt(budget / (w * h))) * this.resScale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h, ratio);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    POINT_SCALE.value = (h * ratio) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
  }

  /**
   * Suasana mengikuti waktu pertandingan: siang, senja, malam, fajar (lihat daylight.ts).
   * Cukup dihitung ulang dua kali per detik; perubahannya sangat pelan.
   */
  setMatchTime(t: number): void {
    const stamp = Math.floor(t * 2);
    if (stamp === this.dayStamp) return;
    this.dayStamp = stamp;
    const d = daylightAt(t, this.daylight);
    this.sun.color.copy(d.sun);
    this.sun.intensity = d.sunI;
    this.hemi.color.copy(d.sky);
    this.hemi.groundColor.copy(d.ground);
    this.hemi.intensity = d.hemiI;
    this.rim.color.copy(d.rim);
    this.rim.intensity = d.rimI;
    this.haze.copy(d.haze);
    this.scene.environmentIntensity = d.env;
  }

  clampZoom(): void {
    this.zoom = Math.min(80, Math.max(20, this.zoom));
  }

  /** Frustum bayangan mengikuti kamera, digeser per-texel supaya bayangan tidak berkedip. */
  private updateSun(): void {
    const sun = this.sun;
    const ext = Math.max(30, this.zoom * 0.95);
    const cam = sun.shadow.camera;
    if (cam.right !== ext) {
      cam.left = cam.bottom = -ext;
      cam.right = cam.top = ext;
      cam.updateProjectionMatrix();
    }
    // pusat frustum agak di depan titik fokus: bagian atas layar memperlihatkan area lebih luas
    const c = this.tmp.set(this.target.x, 0, this.target.z - this.zoom * 0.12);
    const texel = (2 * ext) / sun.shadow.mapSize.x;
    const px = c.dot(this.sunRight);
    const py = c.dot(this.sunUp);
    c.addScaledVector(this.sunRight, Math.round(px / texel) * texel - px);
    c.addScaledVector(this.sunUp, Math.round(py / texel) * texel - py);
    sun.target.position.copy(c);
    sun.position.copy(c).addScaledVector(SUN_DIR, 150);
  }

  /**
   * Pengatur performa. Tiap 1,5 detik: bila frame rate di bawah sasaran, matikan ambient occlusion
   * dulu, lalu turunkan resolusi render (lebih tajam turunnya bila sangat lambat). Kalau resolusi
   * sudah minimum dan masih di bawah 30 fps, fitur mahal dilepas satu per satu: efek layar (bloom),
   * lalu bayangan. Hasilnya disimpan, jadi sesi berikutnya langsung mulai dari pengaturan itu.
   */
  private govern(dt: number): void {
    if (this.warmup > 0) {
      this.warmup -= dt;
      return;
    }
    this.slowTime += dt;
    this.slowFrames++;
    if (this.slowTime < 1.5) return;
    const avg = this.slowTime / this.slowFrames;
    this.slowTime = 0;
    this.slowFrames = 0;
    this.fps = Math.round(1 / avg);
    if (!document.hasFocus() || document.hidden) return;
    const minScale = GFX.mobile ? 0.5 : 0.6;
    const slow = avg > 1 / (GFX.mobile ? 42 : 38);
    if (slow) {
      this.goodWindows = 0;
      // terlalu lambat: lebih dulu matikan ambient occlusion (pass termahal) sebelum menurunkan resolusi
      if (this.post?.disableAo()) return;
      if (this.resScale > minScale) {
        this.resScale = Math.max(minScale, this.resScale * (avg > 1 / 26 ? 0.72 : 0.86));
        // kalau baru saja dinaikkan lalu langsung lambat lagi, jangan terlalu sering mencoba naik
        if (this.raised) this.raiseBudget--;
        this.raised = false;
        this.resize();
        this.saveTuning();
      } else if (avg > 1 / 30 && ++this.badWindows >= 2) {
        this.badWindows = 0;
        this.shed();
      }
    } else if (avg < 1 / 56 && this.resScale < 1 && this.raiseBudget > 0) {
      this.badWindows = 0;
      // lancar cukup lama (~12 dtk): coba kembalikan resolusi satu tingkat
      if (++this.goodWindows >= 8) {
        this.resScale = Math.min(1, this.resScale / 0.86);
        this.raised = true;
        this.goodWindows = 0;
        this.resize();
        this.saveTuning();
      }
    } else {
      this.goodWindows = 0;
      this.badWindows = 0;
    }
  }

  /** Lepas satu fitur mahal (dipanggil bila resolusi minimum pun masih terlalu lambat). */
  private shed(): void {
    if (this.post) {
      this.post.dispose();
      this.post = null;
      this.onNotice?.('Grafik disesuaikan otomatis agar lancar: efek cahaya dimatikan.');
    } else if (this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.enabled = false;
      this.sun.castShadow = false;
      this.onNotice?.('Grafik disesuaikan otomatis agar lancar: bayangan dimatikan.');
    } else {
      return;
    }
    // beban baru saja berkurang banyak: beri kesempatan resolusi naik lagi
    this.raiseBudget = Math.max(this.raiseBudget, 1);
    this.warmup = 2;
    this.saveTuning();
  }

  private saveTuning(): void {
    try {
      const data: Tuning = { quality: GFX.quality, scale: Math.round(this.resScale * 100) / 100, noPost: !GFX.low && !this.post, noShadow: !GFX.low && !this.renderer.shadowMap.enabled };
      localStorage.setItem(AUTO_KEY, JSON.stringify(data));
    } catch {
      /* penyimpanan tidak tersedia */
    }
  }

  render(dt: number): void {
    this.govern(dt);
    this.target.x = Math.min(MAP_SIZE, Math.max(0, this.target.x));
    this.target.z = Math.min(MAP_SIZE, Math.max(0, this.target.z));
    let sx = 0;
    let sz = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      if (this.shakeEnabled) {
        sx = (Math.random() - 0.5) * this.shake;
        sz = (Math.random() - 0.5) * this.shake;
      }
    }
    this.camera.position.set(this.target.x + sx, this.zoom * 0.82, this.target.z + this.zoom * 0.57 + sz);
    this.camera.lookAt(this.target.x + sx, 0, this.target.z + sz);
    const dv = this.debugView;
    if (dv) {
      const flat = Math.cos(dv.pitch) * this.zoom;
      this.camera.position.set(this.target.x + Math.sin(dv.yaw) * flat, dv.lift + Math.sin(dv.pitch) * this.zoom, this.target.z + Math.cos(dv.yaw) * flat);
      this.camera.lookAt(this.target.x, dv.lift, this.target.z);
    }
    this.updateSun();

    this.renderer.info.reset();
    this.camera.layers.set(0);
    if (this.post) this.post.render(dt);
    else this.renderer.render(this.scene, this.camera);

    // HP bar & label nama di atas segalanya, tanpa bloom maupun tone mapping
    // (latar berupa Color memaksa layar dibersihkan, jadi dilepas sementara)
    const background = this.scene.background;
    this.scene.background = null;
    this.camera.layers.set(OVERLAY_LAYER);
    this.renderer.autoClear = false;
    this.renderer.render(this.scene, this.camera);
    this.renderer.autoClear = true;
    this.scene.background = background;
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
