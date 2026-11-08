import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// 画質の段階。スマホ優先なので low でも成立する見た目にし、余裕がある端末だけ効果を足す。
export type Tier = 'low' | 'mid' | 'high';

export function detectTier(): Tier {
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod/i.test(ua) || matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  if (!mobile && cores >= 6) return 'high';
  if (mobile && (cores <= 4 || mem <= 3)) return 'low';
  return 'mid';
}

export class Post {
  composer: EffectComposer;
  bokeh: BokehPass | null = null;
  bloom: UnrealBloomPass | null = null;
  tier: Tier;
  maxRatio: number;
  ratio: number;
  private frameTimes: number[] = [];

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, tier: Tier) {
    this.tier = tier;
    this.maxRatio = tier === 'high' ? Math.min(devicePixelRatio, 2) : tier === 'mid' ? Math.min(devicePixelRatio, 1.5) : 1;
    this.ratio = this.maxRatio;
    renderer.setPixelRatio(this.ratio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = tier === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    if (tier !== 'low') {
      this.bokeh = new BokehPass(scene, camera, { focus: 5, aperture: 0.00006, maxblur: 0.006 });
      this.composer.addPass(this.bokeh);
    }
    if (tier !== 'low') {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.7, 0.9);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number) { this.renderer.setSize(w, h, false); this.composer.setSize(w, h); }

  setFocus(dist: number, strength: number) {
    if (!this.bokeh) return;
    (this.bokeh.uniforms as Record<string, { value: number }>)['focus'].value = dist;
    (this.bokeh.uniforms as Record<string, { value: number }>)['aperture'].value = 0.00006 * strength;
  }

  // 負荷に応じて解像度を上下させる（30fps を下限に）
  adapt(frameMs: number, w: number, h: number) {
    this.frameTimes.push(frameMs); if (this.frameTimes.length < 45) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length; this.frameTimes.length = 0;
    let r = this.ratio;
    if (avg > 36) r = Math.max(0.6, r - 0.15); else if (avg < 20) r = Math.min(this.maxRatio, r + 0.1);
    if (r !== this.ratio) { this.ratio = r; this.renderer.setPixelRatio(r); this.setSize(w, h); }
  }

  render(dt: number) { this.composer.render(dt); }
}
