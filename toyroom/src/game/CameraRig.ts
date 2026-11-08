import * as THREE from 'three';
import { clamp, lerp } from './textures';

// It Takes Two を基準にした三人称カメラ。
// キャラは画面の高さの約1/3。移動方向にゆっくり回り込み、ドラッグで自由に回せる。

export interface CamTuning { dist: number; pitch: number; fov: number; follow: number }

export class CameraRig {
  yaw = 0; pitch = 0.3;
  tuning: CamTuning = { dist: 4.6, pitch: 0.3, fov: 50, follow: 1.4 };
  bounds = { minX: -19.3, maxX: 19.3, minZ: -11.3, maxZ: 17.3 };
  readonly target = new THREE.Vector3();
  private pos = new THREE.Vector3();
  private lastInput = -9;
  /** 最後に手でカメラを動かした時刻 */
  get lastInputTime() { return this.lastInput; }
  private cinematic = false;
  private shakeAmp = 0; private shakeT = 0;
  private fallLook = 0;
  /** 乗り物に乗っている間などに足す距離 */
  extraDist = 0;

  /** 着地の衝撃などでカメラを揺らす（0..1） */
  shake(strength: number) { this.shakeAmp = Math.max(this.shakeAmp, strength * 0.22); }

  constructor(readonly camera: THREE.PerspectiveCamera, start: THREE.Vector3) {
    this.pos.copy(start).add(new THREE.Vector3(0, 1.6, 4.6)); this.target.copy(start).add(new THREE.Vector3(0, 1, 0));
    camera.position.copy(this.pos);
  }

  /** 画面上の「前」方向（XZ、正規化） */
  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  right() { const f = this.forward(); return new THREE.Vector3(-f.z, 0, f.x); }

  input(dx: number, dy: number, stick: { x: number; y: number }, dt: number, time: number) {
    if (dx || dy) { this.yaw -= dx * 0.006; this.pitch = clamp(this.pitch + dy * 0.004, -0.15, 1.1); this.lastInput = time; }
    if (stick.x || stick.y) { this.yaw -= stick.x * 2.4 * dt; this.pitch = clamp(this.pitch + stick.y * 1.6 * dt, -0.15, 1.1); this.lastInput = time; }
  }

  update(dt: number, time: number, heroPos: THREE.Vector3, heroVel: THREE.Vector3, speedBoost: number, cine: { active: boolean; pos: THREE.Vector3; look: THREE.Vector3 }, falling = false) {
    const cam = this.camera;
    if (cine.active) {
      this.cinematic = true;
      cam.position.lerp(cine.pos, 1 - Math.exp(-3 * dt)); this.target.lerp(cine.look, 1 - Math.exp(-3 * dt));
      cam.lookAt(this.target); cam.fov = lerp(cam.fov, 38, 1 - Math.exp(-3 * dt)); cam.updateProjectionMatrix();
      return;
    }
    if (this.cinematic) { this.cinematic = false; this.pos.copy(cam.position); }

    const idle = time - this.lastInput > 1.0;
    const moving = Math.hypot(heroVel.x, heroVel.z) > 0.4;
    if (moving && idle && this.tuning.follow > 0) {
      const behind = Math.atan2(-heroVel.x, -heroVel.z);
      let d = behind - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-this.tuning.follow * 0.9 * dt));
    }
    if (idle) this.pitch = lerp(this.pitch, this.tuning.pitch, 1 - Math.exp(-0.8 * dt));
    // 落下中はカメラが少し上に残って見下ろし、着地点が見える
    this.fallLook = lerp(this.fallLook, falling ? 1 : 0, 1 - Math.exp(-(falling ? 4 : 2.5) * dt));

    const d = this.tuning.dist + this.fallLook * 1.2 + this.extraDist, p = this.pitch + this.fallLook * 0.35;
    const look = new THREE.Vector3(heroPos.x, heroPos.y + 1.0 - this.fallLook * 0.6, heroPos.z);
    const desired = new THREE.Vector3(look.x + Math.sin(this.yaw) * d * Math.cos(p), look.y + d * Math.sin(p), look.z + Math.cos(this.yaw) * d * Math.cos(p));
    desired.x = clamp(desired.x, this.bounds.minX, this.bounds.maxX); desired.z = clamp(desired.z, this.bounds.minZ, this.bounds.maxZ); desired.y = Math.max(desired.y, 0.25);
    this.pos.lerp(desired, 1 - Math.exp(-(falling ? 5 : 9) * dt)); this.target.lerp(look, 1 - Math.exp(-14 * dt));
    cam.position.copy(this.pos);
    if (this.shakeAmp > 0.001) {
      this.shakeT += dt * 40; const a = this.shakeAmp;
      cam.position.x += Math.sin(this.shakeT * 1.3) * a; cam.position.y += Math.sin(this.shakeT * 1.9 + 1) * a * 1.4; cam.position.z += Math.cos(this.shakeT * 1.1) * a * 0.6;
      this.shakeAmp *= Math.exp(-7 * dt);
    }
    cam.lookAt(this.target);
    cam.fov = lerp(cam.fov, this.tuning.fov + Math.min(6, speedBoost), 1 - Math.exp(-4 * dt)); cam.updateProjectionMatrix();
  }
}
