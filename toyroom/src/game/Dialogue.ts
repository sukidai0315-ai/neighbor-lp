import * as THREE from 'three';

// 黒帯の会話。台詞は src/data/script.json。選択肢に正解はなく、どれを選んでも進む。

export type Line = { who: string; text: string; hold?: number } | { choices: { text: string; next: string }[] } | { goto: string } | { event: string } | { end: true };
export type Script = Record<string, Record<string, Line[]>>;

export interface DialogueUI { app: HTMLElement; subtitle: HTMLElement; who: HTMLElement; line: HTMLElement; choices: HTMLElement }

export class Dialogue {
  active = false;
  choicesOpen = false;
  readonly camPos = new THREE.Vector3();
  readonly camLook = new THREE.Vector3();
  private queue: Line[] = [];
  private current: Record<string, Line[]> | null = null;
  private timer = 0;
  private onEnd: (() => void) | null = null;
  /** {event} 行に来たときに呼ばれる。演出のフック */
  onEvent: ((name: string) => void) | null = null;

  constructor(private ui: DialogueUI, private script: Script) {}

  // speaker: 話し相手の位置、hero: 主人公の位置。カメラは2人の横からのツーショット
  start(actorKey: string, speakerPos: THREE.Vector3, heroPos: THREE.Vector3, onEnd?: () => void, cam?: { pos: THREE.Vector3; look: THREE.Vector3 }) {
    const tree = this.script[actorKey]; if (!tree || this.active) return false;
    this.active = true; this.current = tree; this.onEnd = onEnd ?? null;
    this.ui.app.classList.add('cine');
    if (cam) { this.camPos.copy(cam.pos); this.camLook.copy(cam.look); }
    else {
      const mid = heroPos.clone().add(speakerPos).multiplyScalar(0.5);
      const dir = speakerPos.clone().sub(heroPos).setY(0).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const dist = Math.max(4.5, heroPos.distanceTo(speakerPos) * 1.5);
      this.camPos.copy(mid).addScaledVector(side, dist).add(new THREE.Vector3(0, 1.8, 0));
      this.camLook.copy(mid).add(new THREE.Vector3(0, 1.4, 0));
    }
    this.run('start');
    return true;
  }
  /** 会話の途中でカメラを動かす */
  setCamera(pos: THREE.Vector3, look: THREE.Vector3) { this.camPos.copy(pos); this.camLook.copy(look); }

  private run(node: string) { this.queue = (this.current?.[node] ?? []).slice(); this.next(); }

  private next() {
    const item = this.queue.shift();
    if (item === undefined) { this.finish(); return; }
    if ('end' in item) { this.finish(); return; }
    if ('goto' in item) { this.run(item.goto); return; }
    if ('event' in item) { this.onEvent?.(item.event); this.next(); return; }
    if ('choices' in item) { this.showChoices(item.choices); return; }
    this.ui.who.textContent = item.who; this.ui.line.textContent = item.text;
    this.ui.subtitle.classList.toggle('show', item.text.length > 0);
    this.timer = item.hold ?? (1.6 + item.text.length * 0.1);
  }

  private showChoices(list: { text: string; next: string }[]) {
    this.ui.subtitle.classList.remove('show');
    this.ui.choices.innerHTML = ''; this.choicesOpen = true;
    list.forEach((c, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = `${i + 1}. ${c.text}`;
      b.addEventListener('click', () => this.pick(i, list)); this.ui.choices.appendChild(b);
    });
    this.ui.choices.classList.add('show');
    this.pending = list;
  }
  private pending: { text: string; next: string }[] | null = null;

  pick(i: number, list = this.pending) {
    if (!this.choicesOpen || !list || !list[i]) return;
    this.choicesOpen = false; this.pending = null; this.ui.choices.classList.remove('show');
    this.ui.who.textContent = 'パーカー'; this.ui.line.textContent = list[i].text; this.ui.subtitle.classList.add('show');
    this.timer = 1.3; this.queue.unshift({ goto: list[i].next });
  }

  /** デバッグ: 今の行を飛ばす */
  skip() { if (this.active && !this.choicesOpen) this.timer = 0; }

  update(dt: number) {
    if (!this.active || this.choicesOpen) return;
    this.timer -= dt; if (this.timer <= 0) this.next();
  }

  private finish() {
    this.active = false; this.choicesOpen = false; this.pending = null;
    this.ui.app.classList.remove('cine'); this.ui.subtitle.classList.remove('show'); this.ui.choices.classList.remove('show');
    const cb = this.onEnd; this.onEnd = null; cb?.();
  }
}
