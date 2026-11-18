// Post-processing (kualitas sedang & tinggi): scene dirender ke buffer HDR, bagian yang sangat
// terang (kristal, energi, lampu) diberi bloom, lalu tone mapping + gradasi warna + vignette.
// Kualitas tinggi menambah ambient occlusion (bayangan lembut di sudut & kaki objek) dan penajaman.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GFX } from './quality';

/** Pass terakhir: penajaman, ACES tone mapping, saturasi, kontras, vignette, lalu konversi ke sRGB. */
class GradePass extends Pass {
  private uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    toneMappingExposure: { value: 1 },
    uSaturation: { value: 1.05 },
    uContrast: { value: 1.07 },
    uVignette: { value: 0.34 },
    uSharpen: { value: 0 },
    uTexel: { value: new THREE.Vector2(1, 1) },
  };
  private quad = new FullScreenQuad(
    new THREE.RawShaderMaterial({
      name: 'AstraGrade',
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        precision highp float;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        attribute vec3 position;
        attribute vec2 uv;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform float uSaturation;
        uniform float uContrast;
        uniform float uVignette;
        uniform float uSharpen;
        uniform vec2 uTexel;
        #include <tonemapping_pars_fragment>
        #include <colorspace_pars_fragment>
        varying vec2 vUv;
        void main() {
          vec3 hdr = texture2D(tDiffuse, vUv).rgb;
          if (uSharpen > 0.0) {
            // unsharp mask; selisihnya dibatasi supaya tidak muncul lingkaran gelap di sekitar cahaya
            vec3 around = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb
              + texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb;
            hdr = max(vec3(0.0), hdr + clamp(hdr - around * 0.25, -0.12, 0.12) * uSharpen);
          }
          vec3 c = ACESFilmicToneMapping(hdr);
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, uSaturation);
          c = (c - 0.5) * uContrast + 0.5;
          vec2 q = vUv - 0.5;
          c *= 1.0 - uVignette * smoothstep(0.18, 0.62, dot(q, q));
          gl_FragColor = sRGBTransferOETF(vec4(clamp(c, 0.0, 1.0), 1.0));
        }`,
    }),
  );

  constructor(sharpen: number) {
    super();
    this.uniforms.uSharpen.value = sharpen;
  }

  override setSize(width: number, height: number): void {
    this.uniforms.uTexel.value.set(1 / width, 1 / height);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.quad.material.dispose();
    this.quad.dispose();
  }
}

/**
 * Ambient occlusion dari depth buffer scene (tanpa merender ulang scene), dihitung pada setengah
 * resolusi. Depth diambil dari buffer yang baru saja diisi RenderPass.
 */
class AoPass extends GTAOPass {
  override setSize(width: number, height: number): void {
    super.setSize(Math.ceil(width / 2), Math.ceil(height / 2));
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    const self = this as unknown as { gtaoMaterial: THREE.ShaderMaterial; pdMaterial: THREE.ShaderMaterial };
    self.gtaoMaterial.uniforms.tDepth.value = readBuffer.depthTexture;
    self.pdMaterial.uniforms.tDepth.value = readBuffer.depthTexture;
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}

export class PostFx {
  private composer: EffectComposer;
  private ao: AoPass | null = null;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    // MSAA di buffer HDR: tepi objek tetap halus walau lewat post-processing
    // (di HP tanpa MSAA: buffer HDR ber-MSAA terlalu mahal untuk GPU mobile)
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: GFX.mobile ? 0 : 4 });
    if (GFX.high) target.depthTexture = new THREE.DepthTexture(size.x, size.y);
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    if (GFX.high) {
      const ao = (this.ao = new AoPass(scene, camera, size.x, size.y, { depthTexture: target.depthTexture! }));
      ao.blendIntensity = 0.78;
      ao.updateGtaoMaterial({ radius: 1.1, distanceExponent: 1.4, thickness: 1.2, scale: 1.25, samples: 10, screenSpaceRadius: false });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, radiusExponent: 1.2, rings: 2, samples: 8 });
      this.composer.addPass(ao);
    }
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.42, 0.5, 0.98));
    this.composer.addPass(new GradePass(GFX.high ? 0.55 : 0));
  }

  /** Dipakai pengatur performa: AO adalah pass termahal, dimatikan bila frame rate tetap rendah. */
  disableAo(): boolean {
    if (!this.ao || !this.ao.enabled) return false;
    this.ao.enabled = false;
    return true;
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
