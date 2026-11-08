import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './textures';
import { scanned } from './assets';
import type { Frame } from './Input';
import type { CameraRig } from './CameraRig';
import type { Ramp } from './Room';

// 主人公「パーカー」。20歳くらいのスケーター青年のプラスチックフィギュア、身長 12cm。
// 仮モデル（手続き生成）と、歩き／スケボーの移動、手続きアニメーション。

const WALK_SPEED = 2.8, SKATE_MAX = 8.5, JUMP_V = 7.8, G_UP = 19, G_DOWN = 27;
const CAR_MAX = 11, CAR_ACCEL = 12, CAR_REVERSE = 4;
const PUSH_IMPULSE = 2.6, PUSH_INTERVAL = 0.42;
const { lerp, clamp } = T;

export interface HeroEvents { onLand?: (impact: number, pos: THREE.Vector3) => void; onPush?: () => void }

export class Hero {
  readonly root = new THREE.Group();
  readonly board = new THREE.Group();
  readonly vel = new THREE.Vector3();
  yaw = Math.PI;
  skate = false;
  onGround = false;
  speed = 0;
  events: HeroEvents = {};
  /** 乗っているラジコン。前が +x のモデル */
  ride: THREE.Group | null = null;
  private get radius() { return this.ride ? 0.95 : 0.22; }
  private get height() { return this.ride ? 1.5 : 1.75; }
  private steer = 0; private phase = 0; private kick = 0; private groundY = 0;
  private body = new THREE.Group(); private lean = new THREE.Group(); private hips = new THREE.Group();
  private legL = new THREE.Group(); private legR = new THREE.Group(); private armL = new THREE.Group(); private armR = new THREE.Group(); private head = new THREE.Group();
  private time = 0;
  private coyote = 0; private jumpBuffer = 0; private pushCooldown = 0;
  private squash = 0; private airTime = 0; private peakFall = 0;

  constructor(scene: THREE.Scene, aniso: number) {
    const denimMat = new THREE.MeshStandardMaterial({ ...scanned('denim_fabric', { repeat: [2, 2], aniso }), color: 0x7d9bd0, roughness: 1 });
    const jerseyMat = new THREE.MeshPhysicalMaterial({ ...scanned('cotton_jersey', { repeat: [2, 2], aniso }), color: 0xf4f1ea, roughness: 1, sheen: .6, sheenRoughness: .8, sheenColor: new THREE.Color(0xffffff) });
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

  /** 足元の位置。見た目の root とは別に持つ（乗り物の上では root がずれるため） */
  readonly pos = new THREE.Vector3();
  get falling() { return !this.onGround && this.vel.y < -3; }

  place(p: THREE.Vector3, yaw = Math.PI) { this.pos.copy(p); this.yaw = yaw; this.vel.set(0, 0, 0); this.speed = 0; this.groundY = p.y; }

  toggleSkate() { if (this.ride) return; this.skate = !this.skate; if (!this.skate) this.speed = 0; }
  mount(car: THREE.Group) {
    if (this.skate) this.toggleSkate();
    this.ride = car; this.pos.copy(car.position); this.yaw = car.rotation.y + Math.PI / 2; this.vel.set(0, 0, 0); this.speed = 0;
  }
  dismount() {
    if (!this.ride) return;
    const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); // 進行方向の右
    this.ride = null; this.pos.addScaledVector(side, 1.5); this.vel.set(0, 0, 0); this.speed = 0;
  }
  stop() { this.vel.set(0, 0, 0); this.speed = 0; if (this.skate) this.toggleSkate(); }
  faceTowards(p: THREE.Vector3) { this.yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z); }

  private resolve(colliders: THREE.Box3[], ramps: Ramp[], bounds: { minX: number; maxX: number; minZ: number; maxZ: number }) {
    const p = this.pos; let ground = 0; const RADIUS = this.radius, HEIGHT = this.height;
    for (const r of ramps) {
      if (p.x < r.minX - RADIUS * .5 || p.x > r.maxX + RADIUS * .5 || p.z < r.minZ || p.z > r.maxZ) continue;
      const t = clamp((p.x - r.minX) / (r.maxX - r.minX), 0, 1), h = lerp(r.hAtMinX, r.hAtMaxX, t);
      if (p.y >= h - 0.45) ground = Math.max(ground, h);
    }
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

  /** 物理の1ステップ。Game 側が固定刻みで複数回呼ぶ */
  step(dt: number, f: Frame | null, cam: CameraRig, colliders: THREE.Box3[], ramps: Ramp[], bounds: { minX: number; maxX: number; minZ: number; maxZ: number }) {
    this.time += dt;
    const inp = f ? f.move : { x: 0, z: 0, l: 0 };
    const fwd = cam.forward(), right = cam.right();
    const wish = new THREE.Vector3().addScaledVector(fwd, -inp.z).addScaledVector(right, inp.x);
    if (f?.jump) this.jumpBuffer = 0.12; else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (f?.skate && !this.ride) this.toggleSkate();
    this.pushCooldown = Math.max(0, this.pushCooldown - dt);

    if (this.ride) {
      // ラジコン: 前に倒すと加速、後ろでバック、左右でハンドル。速いほど曲がりにくい
      const face = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const pressing = inp.l > .05, along = pressing ? wish.dot(face) : 0;
      const steerIn = pressing ? clamp(wish.dot(new THREE.Vector3(-face.z, 0, face.x)) * 1.8, -1, 1) : 0; // 右手方向との内積。正 = スティックが右
      this.steer = lerp(this.steer, steerIn, 1 - Math.exp(-8 * dt));
      if (along > 0.1) this.speed += CAR_ACCEL * along * dt; else if (along < -0.1) this.speed += CAR_REVERSE * along * dt;
      this.speed -= (this.speed * 0.5 + Math.sign(this.speed) * 0.5) * dt; this.speed = clamp(this.speed, -4, CAR_MAX);
      if (Math.abs(this.speed) > 0.2) this.yaw -= this.steer * (2.6 - 1.2 * Math.min(1, Math.abs(this.speed) / CAR_MAX)) * dt * Math.sign(this.speed);
      const nf = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.vel.x = nf.x * this.speed; this.vel.z = nf.z * this.speed;
      this.jumpBuffer = 0;
    } else if (!this.skate) {
      const k = 1 - Math.exp(-(this.onGround ? 16 : 5) * dt);
      this.vel.x = lerp(this.vel.x, wish.x * WALK_SPEED * inp.l, k); this.vel.z = lerp(this.vel.z, wish.z * WALK_SPEED * inp.l, k);
      if (inp.l > .05) { const ty = Math.atan2(wish.x, wish.z); let d = ty - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * (1 - Math.exp(-14 * dt)); }
      this.steer = lerp(this.steer, 0, 1 - Math.exp(-8 * dt)); this.speed = Math.hypot(this.vel.x, this.vel.z);
    } else {
      const face = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const pressing = inp.l > .05;
      const along = pressing ? wish.dot(face) : 0;
      const steerIn = pressing ? clamp(wish.dot(new THREE.Vector3(-face.z, 0, face.x)) * 1.8, -1, 1) : 0; // 右手方向との内積。正 = スティックが右
      this.steer = lerp(this.steer, steerIn, 1 - Math.exp(-9 * dt));
      // 止まっている／遅いときは、スティックの方向へ素早く向き直る
      if (pressing && this.speed < 1.2) { const ty = Math.atan2(wish.x, wish.z); let d = ty - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * (1 - Math.exp(-10 * dt)); }
      // 押し出し: 前に倒している間、一定間隔で蹴って加速する（最初の一蹴りで歩きより速くなる）
      if (pressing && along > -0.2 && this.onGround) {
        if (this.pushCooldown <= 0) { this.speed += PUSH_IMPULSE * (0.6 + 0.4 * Math.max(0, along)); this.pushCooldown = PUSH_INTERVAL; this.kick = 1; this.events.onPush?.(); }
        this.speed += 2.2 * Math.max(0, along) * dt;
      }
      this.kick = Math.max(0, this.kick - dt * 2.4);
      if (pressing && along < -0.5) this.speed -= 7 * dt; // 後ろに倒すとブレーキ
      this.speed -= (this.speed * 0.22 + 0.25) * dt; this.speed = clamp(this.speed, 0, SKATE_MAX);
      if (this.speed > .2) this.yaw -= this.steer * (1.6 + 1.4 * Math.min(1, this.speed / 5)) * dt;
      const nf = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.vel.x = nf.x * this.speed; this.vel.z = nf.z * this.speed;
    }

    // ジャンプ（コヨーテタイムと先行入力つき、上りは軽く下りは重い）
    if (this.onGround) this.coyote = 0.1; else this.coyote = Math.max(0, this.coyote - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0) { this.vel.y = JUMP_V * (this.skate ? 1.08 : 1); this.onGround = false; this.coyote = 0; this.jumpBuffer = 0; this.squash = -0.5; }
    this.vel.y -= (this.vel.y > 0 ? G_UP : G_DOWN) * dt;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.pos.y += this.vel.y * dt;
    this.resolve(colliders, ramps, bounds);

    const wasAir = !this.onGround;
    if (!this.onGround) { this.airTime += dt; this.peakFall = Math.min(this.peakFall, this.vel.y); }
    if (this.pos.y <= this.groundY + .001 && this.vel.y <= 0) {
      this.pos.y = this.groundY; this.vel.y = 0; this.onGround = true;
      if (wasAir) {
        const impact = clamp((-this.peakFall - 4) / 9, 0, 1); // 小さなジャンプは0、机からの落下で1
        if (impact > 0) { this.squash = 0.35 + impact * 0.5; this.events.onLand?.(impact, this.pos.clone()); }
        this.airTime = 0; this.peakFall = 0;
      }
    } else if (this.pos.y > this.groundY + .05) this.onGround = false;
  }

  /** 見た目の更新（フレームごとに1回） */
  animate(dt: number) {
    this.root.rotation.y = this.yaw;
    const sp = Math.hypot(this.vel.x, this.vel.z), e = (k: number) => 1 - Math.exp(-k * dt);
    const { legL, legR, armL, armR, hips, lean, body, head, board } = this;
    this.squash = lerp(this.squash, 0, e(9));
    const sq = this.squash; hips.scale.set(1 + sq * 0.35, 1 - sq * 0.45, 1 + sq * 0.35);
    this.root.position.copy(this.pos);
    if (this.ride) {
      const car = this.ride; car.position.copy(this.pos); car.rotation.set(0, this.yaw - Math.PI / 2, lerp(car.rotation.z, -this.steer * 0.06 * Math.min(1, Math.abs(this.speed) / 6), e(8)));
      const face = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.root.position.addScaledVector(face, -0.25).y += 1.15; // キャビンの上に座る
      body.rotation.y = lerp(body.rotation.y, 0, e(10)); lean.rotation.z = lerp(lean.rotation.z, -this.steer * 0.15, e(8)); lean.rotation.x = lerp(lean.rotation.x, 0.1, e(8));
      legL.position.set(-.16, .72, 0); legR.position.set(.16, .72, 0); legL.rotation.set(-1.35, 0, 0); legR.rotation.set(-1.35, 0, 0);
      armL.rotation.set(-1.0, 0, .25); armR.rotation.set(-1.0, 0, -.25); hips.position.y = -0.1;
      head.rotation.y = lerp(head.rotation.y, this.steer * 0.3, e(6));
      board.position.copy(this.root.position).add(new THREE.Vector3(Math.cos(this.yaw) * .36, .9, -Math.sin(this.yaw) * .36)); board.rotation.set(0, this.yaw, Math.PI / 2 - .2);
      return;
    }
    if (!this.skate) {
      this.phase += sp * dt * 5.2; const sw = Math.sin(this.phase), w = clamp(sp / WALK_SPEED, 0, 1);
      body.rotation.y = lerp(body.rotation.y, 0, e(10)); lean.rotation.z = lerp(lean.rotation.z, 0, e(10)); lean.rotation.x = lerp(lean.rotation.x, w * .12, e(10));
      legL.rotation.x = sw * .75 * w; legR.rotation.x = -sw * .75 * w; legL.rotation.z = 0; legL.position.x = -.13; legR.position.x = .13;
      armL.rotation.x = -sw * .6 * w; armR.rotation.x = sw * .6 * w; armL.rotation.z = .1; armR.rotation.z = -.1;
      hips.position.y = Math.abs(Math.sin(this.phase)) * .05 * w + (this.onGround ? 0 : .08);
      if (!this.onGround) { const fall = clamp(-this.vel.y / 8, 0, 1); legL.rotation.x = .5 - fall * .3; legR.rotation.x = -.2 + fall * .4; armL.rotation.z = .1 + fall * 1.2; armR.rotation.z = -.1 - fall * 1.2; }
      head.rotation.y = lerp(head.rotation.y, 0, e(6));
      board.position.copy(this.pos).add(new THREE.Vector3(Math.cos(this.yaw) * .36, .95 + hips.position.y, -Math.sin(this.yaw) * .36));
      board.rotation.set(0, this.yaw, Math.PI / 2 - .2);
    } else {
      body.rotation.y = lerp(body.rotation.y, -1.15, e(8));
      lean.rotation.z = lerp(lean.rotation.z, this.steer * .4, e(8)); lean.rotation.x = lerp(lean.rotation.x, .05 + Math.min(.22, this.speed * .03), e(8));
      legL.position.set(-.28, .72, 0); legR.position.set(.28, .72, 0);
      const kickSwing = Math.sin(this.kick * Math.PI) * this.kick;
      legL.rotation.x = -.15 + kickSwing * .9; legR.rotation.x = .1; legL.rotation.z = .3 * this.kick;
      armL.rotation.x = -.4 - this.steer * .3; armR.rotation.x = -.4 + this.steer * .3; armL.rotation.z = .5; armR.rotation.z = -.5;
      hips.position.y = .17 + (this.onGround ? 0 : .12);
      if (!this.onGround) { legL.rotation.x = .6; legR.rotation.x = .6; }
      head.rotation.y = lerp(head.rotation.y, .9, e(6));
      board.position.copy(this.pos); board.position.y = this.pos.y + (this.onGround ? 0 : .1); board.rotation.set(0, this.yaw, lean.rotation.z * .5);
    }
  }
}
