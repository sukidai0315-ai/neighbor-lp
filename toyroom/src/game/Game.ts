import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Room } from './Room';
import { Hero } from './Hero';
import { CameraRig } from './CameraRig';
import { Input } from './Input';
import { Dialogue, type Script } from './Dialogue';
import { Post, detectTier } from './Post';
import script from '../data/script.json';

interface Interactable { id: string; pos: THREE.Vector3; radius: number; label: string; done?: boolean; onUse: () => void }

export class Game {
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 200);
  private room!: Room; private hero!: Hero; private rig!: CameraRig; private input!: Input; private dialogue!: Dialogue; private post!: Post;
  private clock = new THREE.Clock();
  private started = false;
  private interactables: Interactable[] = [];
  private flags = { metBear: false, hasAward: false };
  private $ = (id: string) => document.getElementById(id) as HTMLElement;

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
    this.input = new Input(canvas, { stick: this.$('stick'), knob: this.$('knob'), jump: this.$('tJump'), skate: this.$('tSkate'), talk: this.$('tTalk') });
    this.dialogue = new Dialogue({ app: this.app, subtitle: this.$('subtitle'), who: this.$('who'), line: this.$('line'), choices: this.$('choices') }, script as Script);
    this.post = new Post(this.renderer, this.scene, this.camera, tier);
    if (this.input.isTouch) this.$('touch').classList.add('show');

    this.setupInteractables();
    this.setupDebug();

    this.$('startBtn').addEventListener('click', () => { this.started = true; this.$('title').remove(); this.app.classList.remove('pre'); canvas.focus(); });
    window.addEventListener('resize', () => this.resize()); this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private setupInteractables() {
    const { points } = this.room;
    this.interactables.push({
      id: 'bear', pos: points.bear, radius: 2.0, label: 'はなす',
      onUse: () => {
        const key = this.flags.metBear ? 'bear_again' : 'bear';
        this.hero.stop(); this.hero.faceTowards(points.bear);
        this.room.bear.rotation.y = Math.atan2(this.hero.pos.x - points.bear.x, this.hero.pos.z - points.bear.z);
        this.dialogue.start(key, points.bear.clone().setY(1.2), this.hero.pos.clone(), () => { this.flags.metBear = true; });
      },
    });
    this.interactables.push({
      id: 'award', pos: points.award, radius: 1.4, label: 'ひろう',
      onUse: () => {
        const it = this.interactables.find(i => i.id === 'award')!; it.done = true;
        this.hero.stop(); this.hero.faceTowards(points.award);
        this.dialogue.start('award', points.award.clone().setY(0.6), this.hero.pos.clone(), () => { this.flags.hasAward = true; this.room.awardBall.visible = false; });
      },
    });
  }

  private setupDebug() {
    if (!location.search.includes('debug')) return;
    const dbg = this.$('debug'); dbg.hidden = false;
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
    const dt = Math.min(this.clock.getDelta(), 0.033), t = this.clock.elapsedTime;
    const f = this.input.poll();

    if (this.started && this.dialogue.choicesOpen && f.choice) this.dialogue.pick(f.choice - 1);
    const controlling = this.started && !this.dialogue.active;
    this.rig.input(controlling ? f.camDX : 0, controlling ? f.camDY : 0, controlling ? f.camStick : { x: 0, y: 0 }, dt, t);
    this.hero.update(dt, controlling ? f : null, this.rig, this.room.colliders, this.rig.bounds);
    this.$('modeTag').textContent = this.hero.skate ? 'スケボー' : 'あるく';

    // 近くのインタラクト
    let near: Interactable | null = null;
    if (controlling) for (const it of this.interactables) if (!it.done && this.hero.pos.distanceTo(it.pos) < it.radius) { near = it; break; }
    const prompt = this.$('prompt'); prompt.classList.toggle('show', !!near);
    if (near) this.$('promptText').textContent = near.label;
    this.$('tTalk').classList.toggle('hiddenBtn', !near);
    if (near && f.interact) near.onUse();

    this.dialogue.update(dt);
    this.room.update(dt, t);
    this.rig.update(dt, t, this.hero.pos, this.hero.vel, this.hero.speed * 0.7, { active: this.dialogue.active, pos: this.dialogue.camPos, look: this.dialogue.camLook });
    this.post.setFocus(this.camera.position.distanceTo(this.rig.target), this.dialogue.active ? 2.4 : 1);
    this.post.render(dt);

    const ms = performance.now() - t0;
    this.post.adapt(ms, this.app.clientWidth, this.app.clientHeight);
    if (!this.$('debug').hidden) this.$('dbgStats').textContent = `${ms.toFixed(1)}ms  x${this.post.ratio.toFixed(2)}  ${this.post.tier}`;
  }
}
