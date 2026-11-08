import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './textures';
import type { Frame } from './Input';
import type { CameraRig } from './CameraRig';

// 主人公「パーカー」。20歳くらいのスケーター青年のプラスチックフィギュア、身長 12cm。
// 仮モデル（手続き生成）と、歩き／スケボーの移動、手続きアニメーション。

const WALK_SPEED = 2.6, SKATE_MAX = 7.5, JUMP_V = 7.2, GRAVITY = 22, RADIUS = 0.22, HEIGHT = 1.75;
const { lerp, clamp } = T;

export class Hero {
  readonly root = new THREE.Group();
  readonly board = new THREE.Group();
  readonly vel = new THREE.Vector3();
  yaw = Math.PI;
  skate = false;
  onGround = false;
  speed = 0;
  private steer = 0; private phase = 0; private kick = 0; private groundY = 0;
  private body = new THREE.Group(); private lean = new THREE.Group(); private hips = new THREE.Group();
  private legL = new THREE.Group(); private legR = new THREE.Group(); private armL = new THREE.Group(); private armR = new THREE.Group(); private head = new THREE.Group();
  private time = 0;
  private coyote = 0; private jumpBuffer = 0;

  constructor(scene: THREE.Scene, aniso: number) {
    const denimMat = new THREE.MeshStandardMaterial({ ...T.pbr(T.denim(), { repeat: 4, normalStrength: 1.6, aniso }), roughness: .95 });
    const jerseyMat = new THREE.MeshPhysicalMaterial({ ...T.pbr(T.jersey(), { repeat: 6, normalStrength: 1.2, aniso }), roughness: .9, sheen: .6, sheenRoughness: .8, sheenColor: new THREE.Color(0xffffff) });
    // プラスチックのフィギュアなので肌は少しつやがある
    const skinMat = new THREE.MeshPhysicalMaterial({ color: 0xe7b58d, roughness: .45, clearcoat: .35, clearcoatRoughness: .4 });
    const hairMat = new THREE.MeshPhysicalMaterial({ color: 0x4a2f1f, roughness: .5, clearcoat: .3 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: .7 });
    const boardMat = new THREE.MeshPhysicalMaterial({ ...T.pbr(T.wood(), { repeat: 1.5, normalStrength: 1.2, aniso }), color: 0xe6a35c, roughness: .5, clearcoat: .5 });
    const whitePlastic = new THREE.MeshPhysicalMaterial({ color: 0xf3efe6, roughness: .4, clearcoat: .6, clearcoatRoughness: .2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2725, roughness: .85 });

    const hk = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number], r?: [number, number, number]) => { const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; o.position.set(...p); if (r) o.rotation.set(...r); parent.add(o); return o; };

    this.root.add(this.body); this.body.add(this.lean); this.lean.add(this.hips);
    this.legL.position.set(-.13, .72, 0); this.legR.position.set(.13, .72, 0); this.hips.add(this.legL, this.legR);
    for (const l of [this.legL, this.legR]) { hk(l, new THREE.CapsuleGeometry(.085, .4, 4, 12), denimMat, [0, -.24, 0]); hk(l, new RoundedBoxGeometry(.2, .1, .3, 2, .04), shoeMat, [0, -.48, .04]); }
    const torso = new THREE.Group(); torso.position.y = .72; this.hips.add(torso);
    hk(torso, new RoundedBoxGeometry(.42, .5, .24, 3, .08), jerseyMat, [0, .3, 0]);
    this.armL.position.set(-.26, .5, 0); this.armR.position.set(.26, .5, 0); torso.add(this.armL, this.armR);
    [this.armL, this.armR].forEach((a, i) => { const s = i ? 1 : -1; hk(a, new THREE.CylinderGeometry(.1, .1, .16, 12), jerseyMat, [s * .03, -.02, 0], [0, 0, s * .3]); hk(a, new THREE.CapsuleGeometry(.055, .36, 4, 10), skinMat, [s * .07, -.26, 0], [0, 0, s * .15]); });
    hk(torso, new THREE.CylinderGeometry(.06, .07, .1, 12), skinMat, [0, .6, 0]);
    this.head.position.y = .82; torso.add(this.head);
    hk(this.head, new THREE.SphereGeometry(.22, 24, 18), skinMat, [0, 0, 0]);
    hk(this.head, new THREE.SphereGeometry(.235, 24, 18, 0, Math.PI * 2, 0, Math.PI * .55), hairMat, [0, .04, -.02], [-.25, 0, 0]);
    hk(this.head, new THREE.SphereGeometry(.03, 10, 8), dark, [-.08, .02, .19]); hk(this.head, new THREE.SphereGeometry(.03, 10, 8), dark, [.08, .02, .19]);

    hk(this.board, new RoundedBoxGeometry(1.0, .06, .3, 2, .03), boardMat, [0, .17, 0]);
    ([[-.33, .13], [.33, .13], [-.33, -.13], [.33, -.13]] as number[][]).forEach(([x, z]) => hk(this.board, new THREE.CylinderGeometry(.06, .06, .07, 14), whitePlastic, [x, .07, z], [Math.PI / 2, 0, 0]));
    scene.add(this.root, this.board);
  }

  get pos() { return this.root.position; }

  place(p: THREE.Vector3, yaw = Math.PI) { this.pos.copy(p); this.yaw = yaw; this.vel.set(0, 0, 0); this.speed = 0; this.groundY = p.y; }

  toggleSkate() { this.skate = !this.skate; if (!this.skate) this.speed = 0; }
  stop() { this.vel.set(0, 0, 0); this.speed = 0; if (this.skate) this.toggleSkate(); }
  faceTowards(p: THREE.Vector3) { this.yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z); }

  private resolve(colliders: THREE.Box3[], bounds: { minX: number; maxX: number; minZ: number; maxZ: number }) {
    const p = this.pos; let ground = 0;
    for (const b of colliders) {
      const inX = p.x > b.min.x - RADIUS && p.x < b.max.x + RADIUS, inZ = p.z > b.min.z - RADIUS && p.z < b.max.z + RADIUS;
      if (!inX || !inZ) continue;
      const feet = p.y, headY = p.y + HEIGHT;
      if (headY <= b.min.y || feet >= b.max.y - .01) {
        if (feet >= b.max.y - .01 && p.x > b.min.x - RADIUS * .4 && p.x < b.max.x + RADIUS * .4 && p.z > b.min.z - RADIUS * .4 && p.z < b.max.z + RADIUS * .4) ground = Math.max(ground, b.max.y);
        continue;
      }
      if (b.max.y - feet < .32 && this.vel.y <= 0) { ground = Math.max(ground, b.max.y); continue; } // 低い段差は乗る
      const px = Math.min(p.x - (b.min.x - RADIUS), (b.max.x + RADIUS) - p.x), pz = Math.min(p.z - (b.min.z - RADIUS), (b.max.z + RADIUS) - p.z);
      if (px < pz) { p.x += (p.x < (b.min.x + b.max.x) / 2 ? -px : px); this.vel.x = 0; } else { p.z += (p.z < (b.min.z + b.max.z) / 2 ? -pz : pz); this.vel.z = 0; }
      if (this.skate) this.speed *= .3;
    }
    p.x = clamp(p.x, bounds.minX + RADIUS, bounds.maxX - RADIUS); p.z = clamp(p.z, bounds.minZ + RADIUS, bounds.maxZ - RADIUS);
    this.groundY = ground;
  }

  update(dt: number, f: Frame | null, cam: CameraRig, colliders: THREE.Box3[], bounds: { minX: number; maxX: number; minZ: number; maxZ: number }) {
    this.time += dt;
    const inp = f ? f.move : { x: 0, z: 0, l: 0 };
    const fwd = cam.forward(), right = cam.right();
    const wish = new THREE.Vector3().addScaledVector(fwd, -inp.z).addScaledVector(right, inp.x);
    if (f?.jump) this.jumpBuffer = 0.12; else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (f?.skate) this.toggleSkate();

    if (!this.skate) {
      const k = 1 - Math.exp(-14 * dt);
      this.vel.x = lerp(this.vel.x, wish.x * WALK_SPEED * inp.l, k); this.vel.z = lerp(this.vel.z, wish.z * WALK_SPEED * inp.l, k);
      if (inp.l > .05) { const ty = Math.atan2(wish.x, wish.z); let d = ty - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * (1 - Math.exp(-12 * dt)); }
      this.steer = lerp(this.steer, 0, 1 - Math.exp(-8 * dt)); this.speed = Math.hypot(this.vel.x, this.vel.z);
    } else {
      const face = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const along = inp.l > .05 ? wish.dot(face) : 0;
      const steerIn = inp.l > .05 ? clamp(wish.dot(new THREE.Vector3(-face.z, 0, face.x)) * 1.6, -1, 1) : 0;
      this.steer = lerp(this.steer, steerIn, 1 - Math.exp(-7 * dt));
      if (along > .2) { this.speed += 3.8 * along * dt; this.kick = Math.min(1, this.kick + dt * 3); } else this.kick = Math.max(0, this.kick - dt * 2);
      if (along < -.3) this.speed -= 6 * dt;
      // 止まっているときはスティックの方向を向く（押し出し前に向きを変えられる）
      if (this.speed < .4 && inp.l > .05) { const ty = Math.atan2(wish.x, wish.z); let d = ty - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * (1 - Math.exp(-6 * dt)); }
      this.speed -= this.speed * .45 * dt; this.speed = clamp(this.speed, 0, SKATE_MAX);
      if (this.speed > .3) this.yaw += this.steer * (1.2 + 1.6 * Math.min(1, this.speed / 4)) * dt;
      const nf = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.vel.x = nf.x * this.speed; this.vel.z = nf.z * this.speed;
    }

    // ジャンプ（コヨーテタイムと先行入力つき）
    if (this.onGround) this.coyote = 0.1; else this.coyote = Math.max(0, this.coyote - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0) { this.vel.y = JUMP_V * (this.skate ? 1.08 : 1); this.onGround = false; this.coyote = 0; this.jumpBuffer = 0; }
    this.vel.y -= GRAVITY * dt;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.pos.y += this.vel.y * dt;
    this.resolve(colliders, bounds);
    if (this.pos.y <= this.groundY + .001 && this.vel.y <= 0) { this.pos.y = this.groundY; this.vel.y = 0; this.onGround = true; }
    else if (this.pos.y > this.groundY + .05) this.onGround = false;

    this.animate(dt);
  }

  private animate(dt: number) {
    this.root.rotation.y = this.yaw;
    const sp = Math.hypot(this.vel.x, this.vel.z), e = (k: number) => 1 - Math.exp(-k * dt);
    const { legL, legR, armL, armR, hips, lean, body, head, board } = this;
    if (!this.skate) {
      this.phase += sp * dt * 5.2; const sw = Math.sin(this.phase), w = clamp(sp / WALK_SPEED, 0, 1);
      body.rotation.y = lerp(body.rotation.y, 0, e(10)); lean.rotation.z = lerp(lean.rotation.z, 0, e(10)); lean.rotation.x = lerp(lean.rotation.x, w * .12, e(10));
      legL.rotation.x = sw * .75 * w; legR.rotation.x = -sw * .75 * w; legL.rotation.z = 0; legL.position.x = -.13; legR.position.x = .13;
      armL.rotation.x = -sw * .6 * w; armR.rotation.x = sw * .6 * w; armL.rotation.z = .1; armR.rotation.z = -.1;
      hips.position.y = Math.abs(Math.sin(this.phase)) * .05 * w + (this.onGround ? 0 : .08);
      if (!this.onGround) { legL.rotation.x = .5; legR.rotation.x = -.2; }
      head.rotation.y = lerp(head.rotation.y, 0, e(6));
      board.position.copy(this.pos).add(new THREE.Vector3(Math.cos(this.yaw) * .36, .95 + hips.position.y, -Math.sin(this.yaw) * .36));
      board.rotation.set(0, this.yaw, Math.PI / 2 - .2);
    } else {
      body.rotation.y = lerp(body.rotation.y, -1.15, e(8));
      lean.rotation.z = lerp(lean.rotation.z, this.steer * .35, e(8)); lean.rotation.x = lerp(lean.rotation.x, .05 + Math.min(.2, this.speed * .03), e(8));
      legL.position.set(-.28, .72, 0); legR.position.set(.28, .72, 0);
      const kickSwing = Math.sin(this.time * 9) * this.kick;
      legL.rotation.x = -.15 + kickSwing * .5; legR.rotation.x = .1; legL.rotation.z = .25 * this.kick;
      armL.rotation.x = -.4 - this.steer * .3; armR.rotation.x = -.4 + this.steer * .3; armL.rotation.z = .5; armR.rotation.z = -.5;
      hips.position.y = .17 + (this.onGround ? 0 : .12);
      if (!this.onGround) { legL.rotation.x = .6; legR.rotation.x = .6; }
      head.rotation.y = lerp(head.rotation.y, .9, e(6));
      board.position.copy(this.pos); board.position.y = this.pos.y + (this.onGround ? 0 : .1); board.rotation.set(0, this.yaw, lean.rotation.z * .5);
    }
  }
}
