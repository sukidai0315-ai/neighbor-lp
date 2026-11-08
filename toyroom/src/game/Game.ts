import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Room } from './Room';
import { Hero } from './Hero';
import { CameraRig } from './CameraRig';
import { Input } from './Input';
import { Dialogue, type Script } from './Dialogue';
import { Post, detectTier } from './Post';
import script from '../data/script.json';

interface Interactable { id: string; pos: THREE.Vector3; radius: number; label: string; done?: boolean; onUse: () => void; marker?: THREE.Sprite; markerY?: number; show?: () => boolean }

export class Game {
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 200);
  private room!: Room; private hero!: Hero; private rig!: CameraRig; private input!: Input; private dialogue!: Dialogue; private post!: Post;
  private clock = new THREE.Clock();
  private acc = 0;
  private moveYaw = 0; private stickHeld = false;
  private started = false;
  private interactables: Interactable[] = [];
  private flags = { metBear: false, hasAward: false, metDash: false, metRobot: false, metRabbit: false, frag1: false, frag2: false, repaired: false };
  private ending = false; private endingT = 0;
  private hintedDesk = false;
  private toastTimer: number | null = null;
  private flights: { mesh: THREE.Mesh; from: THREE.Vector3; t: number; onDone: () => void }[] = [];
  private $ = (id: string) => document.getElementById(id) as HTMLElement;
  /** デバッグ: 位置とカメラ向きを直接指定 */
  teleport(x: number, y: number, z: number, camYaw: number) { this.hero.place(new THREE.Vector3(x, y, z), camYaw + Math.PI); this.rig.yaw = camYaw; }
  get debugState() { return { pos: this.hero.pos.clone(), ride: !!this.hero.ride, skate: this.hero.skate, dialog: this.dialogue.active, flags: { ...this.flags } }; }
  skipLine() { this.dialogue.skip(); }

  constructor(private app: HTMLElement) {}

  boot() {
    const canvas = this.$('view') as HTMLCanvasElement;
    const tier = detectTier();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: tier === 'low', powerPreference: 'high-performance' });
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.scene.environment = new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(this.renderer), 0.04).texture;

    this.room = new Room(this.scene, aniso, tier === 'low');
    this.hero = new Hero(this.scene, aniso);
    // 机の上で目を覚ます。机の縁（部屋側）を向いて立つ
    this.hero.place(this.room.points.heroStart, -Math.PI / 2);
    this.rig = new CameraRig(this.camera, this.hero.pos);
    this.rig.yaw = Math.PI / 2;
    this.hero.events = {
      onLand: (impact, pos) => { this.rig.shake(impact); this.room.puff(pos, impact); },
      onPush: () => { if (this.hero.onGround) this.room.puff(this.hero.pos, 0.15); },
    };
    this.input = new Input(canvas, { stick: this.$('stick'), knob: this.$('knob'), jump: this.$('tJump'), skate: this.$('tSkate'), talk: this.$('tTalk') });
    this.dialogue = new Dialogue({ app: this.app, subtitle: this.$('subtitle'), who: this.$('who'), line: this.$('line'), choices: this.$('choices') }, script as Script);
    this.post = new Post(this.renderer, this.scene, this.camera, tier);
    if (this.input.isTouch) this.$('touch').classList.add('show');

    this.setupInteractables();
    for (const it of this.interactables) {
      const kind = it.label === 'はなす' ? 'talk' : it.label === 'のる' ? 'ride' : 'item';
      if (it.id === 'vent') it.show = () => this.hero.pos.y > 30 || this.hero.pos.distanceTo(it.pos) < 30; // 机の上に立つと見える
      if (it.id === 'photo') it.show = () => this.hero.pos.distanceTo(it.pos) < 24; // 棚の裏は近くまで来たときだけ
      it.marker = this.makeMarker(kind); it.marker.visible = false; this.scene.add(it.marker);
    }
    this.setObjective('ラグの クマ（ボロ）に はなす');
    this.setupDebug();

    this.$('startBtn').addEventListener('click', () => { this.started = true; this.$('title').remove(); this.app.classList.remove('pre'); canvas.focus(); this.playIntro(); });
    this.$('againBtn').addEventListener('click', () => location.reload());
    this.dialogue.onEvent = (name) => this.onEvent(name);
    window.addEventListener('resize', () => this.resize()); this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private setupInteractables() {
    const { points } = this.room;
    this.interactables.push({
      id: 'bear', pos: points.bear, radius: 5, label: 'はなす', markerY: 9,
      onUse: () => {
        const key = this.flags.metBear ? 'bear_again' : 'bear';
        this.hero.stop(); this.hero.faceTowards(points.bear);
        this.room.bear.rotation.y = Math.atan2(this.hero.pos.x - points.bear.x, this.hero.pos.z - points.bear.z);
        this.dialogue.start(key, points.bear.clone().setY(6), this.hero.pos.clone(), () => { if (!this.flags.metBear) { this.flags.metBear = true; this.setObjective('まどの したの、まるめた かみを さがす'); } });
      },
    });
    // 会話の終わりに欠片が飛んでくる（拾う操作を別にすると、もらえたのか分からないため）
    const talk = (id: string, pos: THREE.Vector3, radius: number, actor: THREE.Group, first: string, again: string, flag: 'metRobot' | 'metRabbit', frag: 'frag1' | 'frag2', fragIndex: number, markerY: number) => this.interactables.push({
      id, pos, radius, label: 'はなす', markerY,
      onUse: () => {
        this.hero.stop(); this.hero.faceTowards(pos);
        actor.rotation.y = Math.atan2(this.hero.pos.x - pos.x, this.hero.pos.z - pos.z);
        const firstTime = !this.flags[flag];
        this.dialogue.start(firstTime ? first : again, pos.clone().setY(pos.y + 6.5), this.hero.pos.clone(), () => {
          this.flags[flag] = true;
          if (firstTime && !this.flags[frag]) this.flyFragment(fragIndex, () => { this.flags[frag] = true; this.gotFragment(frag); });
        });
      },
    });
    talk('robot', points.robot, 6, this.room.robot, 'gacha', 'gacha_again', 'metRobot', 'frag1', 0, 11);
    talk('rabbit', points.rabbit, 5.5, this.room.rabbit, 'mimi', 'mimi_again', 'metRabbit', 'frag2', 1, 10);
    this.interactables.push({
      id: 'car', pos: this.room.car.position, radius: 7, label: 'のる', markerY: 8.5,
      onUse: () => {
        const mount = () => { this.hero.mount(this.room.car); this.room.setRiding(true); };
        if (this.flags.metDash) { mount(); return; }
        this.hero.stop(); this.hero.faceTowards(this.room.car.position);
        this.dialogue.start('dash', this.room.car.position.clone().setY(4), this.hero.pos.clone(), () => { this.flags.metDash = true; mount(); });
      },
    });
    this.interactables.push({
      id: 'pillow', pos: points.repairSpot, radius: 6, label: 'なおす', markerY: 4, show: () => this.flags.hasAward && this.flags.frag1 && this.flags.frag2,
      onUse: () => {
        this.hero.stop(); this.hero.faceTowards(points.repairSpot);
        const spot = points.repairSpot, look = spot.clone().add(new THREE.Vector3(0, 0.6, 0));
        const cam = { pos: spot.clone().add(new THREE.Vector3(5.5, 4.2, 6.5)), look };
        if (!this.flags.hasAward) { this.dialogue.start('pillow_noaward', spot, this.hero.pos.clone()); return; }
        if (!(this.flags.frag1 && this.flags.frag2)) { this.dialogue.start('pillow_wait', spot, this.hero.pos.clone()); return; }
        const it = this.interactables.find(i => i.id === 'pillow')!; it.done = true;
        this.dialogue.start('repair', spot, this.hero.pos.clone(), () => this.finish(), cam);
      },
    });
    this.interactables.push({
      id: 'switch', pos: points.lightSwitch, radius: 6.5, label: 'おす', markerY: 6,
      onUse: () => { this.room.toggleCeiling(); this.toast(this.room.ceilingOn ? 'でんきが ついた' : 'でんきを けした'); },
    });
    const look = (id: string, pos: THREE.Vector3, radius: number, first: string, again: string, label: string, markerY: number) => {
      let seen = false;
      this.interactables.push({ id, pos, radius, label, markerY, onUse: () => { this.hero.stop(); const key = seen ? again : first; seen = true; this.dialogue.start(key, pos.clone().add(new THREE.Vector3(0, 0.5, 0)), this.hero.pos.clone()); } });
    };
    look('vent', points.vent, 3.5, 'vent', 'vent_again', 'のぞく', 5);
    look('photo', points.photo, 2.6, 'photo', 'photo_again', 'みる', 4);
    this.interactables.push({
      id: 'award', pos: points.award, radius: 3, label: 'ひろう', markerY: 4,
      onUse: () => {
        const it = this.interactables.find(i => i.id === 'award')!; it.done = true;
        this.hero.stop(); this.hero.faceTowards(points.award);
        this.dialogue.start('award', points.award.clone().setY(0.6), this.hero.pos.clone(), () => {
          this.flags.hasAward = true; this.room.awardBall.visible = false;
          this.markSlot('slotAward'); this.toast('しょうを ひろった。かけらが ふたつ たりない');
          this.setObjective('かけらを ふたつ あつめる（つくえの した ／ ベッドの うえ）');
        });
      },
    });
  }

  /** 頭上の目印: 吹き出し（はなす）／ 矢印（のる）／ 星（ひろう・なおす） */
  private makeMarker(kind: 'talk' | 'ride' | 'item') {
    const c = document.createElement('canvas'); c.width = c.height = 128; const ctx = c.getContext('2d')!;
    ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = '#3a2416';
    if (kind === 'talk') {
      ctx.fillStyle = '#fff6e6'; ctx.beginPath(); ctx.roundRect(14, 14, 100, 72, 24); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(52, 84); ctx.lineTo(44, 112); ctx.lineTo(76, 86); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3a2416'; for (const x of [40, 64, 88]) { ctx.beginPath(); ctx.arc(x, 50, 7, 0, Math.PI * 2); ctx.fill(); }
    } else if (kind === 'ride') {
      ctx.fillStyle = '#ffd25a'; ctx.beginPath(); ctx.moveTo(64, 108); ctx.lineTo(18, 56); ctx.lineTo(44, 56); ctx.lineTo(44, 16); ctx.lineTo(84, 16); ctx.lineTo(84, 56); ctx.lineTo(110, 56); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = '#ffd25a'; ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 22 : 50; ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    sp.renderOrder = 10; sp.scale.set(2.6, 2.6, 1); return sp;
  }

  private setObjective(text: string) {
    const el = this.$('objective'); this.$('objText').textContent = text;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }
  private toast(text: string) {
    const el = this.$('toast'); el.textContent = text; el.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), 3200);
  }
  private markSlot(id: string) { const el = this.$(id); el.classList.add('got'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  private gotFragment(which: 'frag1' | 'frag2') {
    const n = (this.flags.frag1 ? 1 : 0) + (this.flags.frag2 ? 1 : 0);
    this.markSlot(which === 'frag1' ? 'slotFrag1' : 'slotFrag2');
    if (n === 2) { this.toast('かけらが そろった。まくらもとへ'); this.setObjective(this.flags.hasAward ? 'ベッドの まくらもとで、しょうを なおす' : 'まどの したの しょうを ひろって、まくらもとへ'); }
    else { this.toast(`かけらを もらった（${n} / 2）`); this.setObjective(this.flags.frag1 ? 'もうひとつの かけらは ベッドの うえ（ミミ）' : 'もうひとつの かけらは つくえの した（ガチャ）'); }
  }
  /** 欠片が相手の足元から主人公へ飛んでくる */
  private flyFragment(index: number, onDone: () => void) {
    const src = this.room.fragments[index]; const from = this.room.fragmentWorld(index); src.visible = false;
    const mesh = new THREE.Mesh(src.geometry, src.material); mesh.scale.setScalar(5); mesh.position.copy(from); mesh.rotation.x = -Math.PI / 2; this.scene.add(mesh);
    this.flights.push({ mesh, from, t: 0, onDone });
  }

  /** オープニング: 寝ている子どもと、窓の下の紙を見せてから主人公へ */
  private playIntro() {
    const p = this.room.points;
    const head = p.childHead;
    const cam = { pos: head.clone().add(new THREE.Vector3(15, 9, 20)), look: head.clone().add(new THREE.Vector3(-1, -1.5, 2)) };
    this.dialogue.start('intro', head, this.hero.pos.clone(), undefined, cam);
    this.rig.snapTo(cam.pos, cam.look); // 最初のカットは飛ばずに切り替える
  }

  private onEvent(name: string) {
    const p = this.room.points;
    switch (name) {
      case 'intro:paper': this.dialogue.setCamera(p.award.clone().add(new THREE.Vector3(6, 4, 9)), p.award.clone().add(new THREE.Vector3(0, 1.2, 0))); break;
      case 'intro:hero': this.dialogue.setCamera(this.hero.pos.clone().add(new THREE.Vector3(-3.5, 2.2, 4.5)), this.hero.pos.clone().add(new THREE.Vector3(0, 1.0, 0))); break;
      case 'repair:place': this.room.showRepairPaper(); this.dialogue.setCamera(p.repairSpot.clone().add(new THREE.Vector3(1.5, 4.5, 2.5)), p.repairSpot.clone()); break;
      case 'repair:tape': this.room.awardTape(); break;
      case 'repair:gather': this.room.gatherToys(); this.dialogue.setCamera(p.repairSpot.clone().add(new THREE.Vector3(7, 6, 9)), p.repairSpot.clone().add(new THREE.Vector3(0.5, 1.0, 0.5))); break;
      case 'repair:morning': this.room.startMorning(); this.dialogue.setCamera(p.repairSpot.clone().add(new THREE.Vector3(-4, 18, 26)), p.childHead.clone().add(new THREE.Vector3(0, -2, 4))); break;
      case 'repair:ending': this.ending = true; this.endingT = 0; this.dialogue.setCamera(new THREE.Vector3(10, 70, 80), new THREE.Vector3(-30, 10, 0)); break;
      default: if (name.startsWith('repair:stroke:')) this.room.awardStroke(name.split(':')[2]);
    }
  }

  private finish() {
    this.flags.repaired = true;
    this.$('fade').classList.add('show');
    setTimeout(() => { const e = this.$('ending'); e.hidden = false; requestAnimationFrame(() => e.classList.add('show')); }, 1300);
  }

  private setupDebug() {
    if (!location.search.includes('debug')) return;
    const dbg = this.$('debug'); dbg.hidden = false;
    (window as unknown as { __game: Game; __THREE: typeof THREE }).__game = this; // デバッグ用（テレポートなど）
    (window as unknown as { __THREE: typeof THREE }).__THREE = THREE;
    const bind = (id: string, key: 'dist' | 'pitch' | 'fov' | 'follow') => { const el = this.$(id) as HTMLInputElement; el.addEventListener('input', () => { this.rig.tuning[key] = parseFloat(el.value); }); };
    bind('dbgDist', 'dist'); bind('dbgPitch', 'pitch'); bind('dbgFov', 'fov'); bind('dbgFollow', 'follow');
    window.addEventListener('keydown', e => { if (e.code === 'KeyL') this.room.applyPreset(this.room.preset === 'night' ? 'evening' : 'night'); });
  }

  private resize() {
    const w = this.app.clientWidth, h = this.app.clientHeight; if (!w || !h) return;
    this.post.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  private frame() {
    const t0 = performance.now();
    // 重い端末でもゲーム速度が落ちないよう、物理は固定刻み（最大 1/60 秒）で回す
    const dt = Math.min(this.clock.getDelta(), 0.1), t = this.clock.elapsedTime;
    const f = this.input.poll();

    if (this.started && this.dialogue.choicesOpen && f.choice) this.dialogue.pick(f.choice - 1);
    const controlling = this.started && !this.dialogue.active;
    this.rig.input(controlling ? f.camDX : 0, controlling ? f.camDY : 0, controlling ? f.camStick : { x: 0, y: 0 }, dt, t);
    // スティックの「前」は倒し始めたときのカメラ向きで固定する（回り込み中に進路が曲がらないように）。
    // 自分でカメラを動かしたときはその向きに追従する
    const held = controlling && f.move.l > 0.1;
    if (held && (!this.stickHeld || t - this.rig.lastInputTime < 0.3)) this.moveYaw = this.rig.yaw;
    if (!held) this.moveYaw = this.rig.yaw;
    this.stickHeld = held;
    this.acc += dt;
    let stepInput = controlling ? f : null;
    while (this.acc > 0) {
      const h = Math.min(this.acc, 1 / 60); this.acc -= h;
      this.hero.step(h, stepInput, this.moveYaw, this.room.colliders, this.room.ramps, this.rig.bounds);
      if (stepInput) stepInput = { ...stepInput, jump: false, skate: false }; // 押した瞬間の入力は最初の刻みだけ
      if (this.acc < 1e-4) this.acc = 0;
    }
    this.hero.animate(dt);
    this.$('modeTag').textContent = this.hero.ride ? 'ラジコン' : this.hero.skate ? 'スケボー' : 'あるく';
    this.rig.extraDist = this.hero.ride ? 4 : 0;
    if (this.hero.ride) this.room.spinWheels(this.hero.speed * dt);

    // 近くのインタラクト
    let near: Interactable | null = null;
    // 水平距離を主に見る（枕やベッドの上など高さのずれが大きい相手も拾えるように）
    const near2 = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z) + Math.abs(a.y - b.y) * 0.3;
    if (controlling) for (const it of this.interactables) if (!it.done && !(this.hero.ride && it.id === 'car') && near2(this.hero.pos, it.pos) < it.radius) { near = it; break; }
    const riding = !!this.hero.ride;
    const label = near ? near.label : riding ? 'おりる' : '';
    const prompt = this.$('prompt'); prompt.classList.toggle('show', controlling && !!label);
    if (label) this.$('promptText').textContent = label;
    this.$('tTalk').classList.toggle('hiddenBtn', !label);
    if (controlling && f.interact) {
      if (near) near.onUse();
      else if (riding) { this.hero.dismount(); this.room.setRiding(false); }
    }

    // 机の上に戻ってきたとき、上の壁に目を向けさせる一言（オープニング中は出さない）
    if (controlling && !this.hintedDesk && this.hero.pos.y > 34 && this.hero.pos.x > 40 && this.hero.pos.z < -27 && t > 20) { this.hintedDesk = true; this.toast('パーカー「うえの かべ、なにか ひかってる……」'); }
    // 目印: 対象の頭上で上下に揺れ、近いと少し大きく
    for (const it of this.interactables) {
      const m = it.marker; if (!m) continue;
      const on = this.started && !this.dialogue.active && !it.done && (it.show ? it.show() : true) && !(this.hero.ride && it.id === 'car');
      m.visible = on; if (!on) continue;
      const p = it.id === 'car' ? this.room.car.position : it.pos;
      m.position.set(p.x, p.y + (it.markerY ?? 6) + Math.sin(t * 2.2 + p.x) * 0.25, p.z);
      const k = (near === it ? 1.25 : 1) * (it.id === 'vent' ? 1.5 : 1); m.scale.set(2.6 * k, 2.6 * k, 1);
    }
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const fl = this.flights[i]; fl.t += dt / 0.9; const k = Math.min(1, fl.t), e = k * k * (3 - 2 * k);
      const to = this.hero.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
      fl.mesh.position.lerpVectors(fl.from, to, e); fl.mesh.position.y += Math.sin(k * Math.PI) * 3; fl.mesh.rotation.y += dt * 6; fl.mesh.scale.setScalar(5 * (1 - e * 0.85));
      if (k >= 1) { this.scene.remove(fl.mesh); this.flights.splice(i, 1); fl.onDone(); }
    }
    this.dialogue.update(dt);
    if (this.ending) { this.endingT += dt; this.dialogue.camPos.x += dt * 0.8; this.dialogue.camPos.y += dt * 0.6; }
    this.room.update(dt, t);
    this.rig.update(dt, t, this.hero.pos, this.hero.vel, this.hero.speed * 0.7, { active: this.dialogue.active, pos: this.dialogue.camPos, look: this.dialogue.camLook }, this.hero.falling);
    this.post.setFocus(this.camera.position.distanceTo(this.rig.target), this.dialogue.active ? 2.4 : 1);
    this.post.render(dt);

    const ms = performance.now() - t0;
    this.post.adapt(ms, this.app.clientWidth, this.app.clientHeight);
    if (!this.$('debug').hidden) this.$('dbgStats').textContent = `${ms.toFixed(1)}ms  x${this.post.ratio.toFixed(2)}  ${this.post.tier}`;
  }
}
