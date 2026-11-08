// キーボード、タッチ（仮想スティック＋ボタン）、ゲームパッドをひとつの入力にまとめる

export interface Frame {
  move: { x: number; z: number; l: number }; // 画面基準。z<0 が前
  jump: boolean;      // 押した瞬間
  skate: boolean;     // 押した瞬間
  interact: boolean;  // 押した瞬間
  choice: number;     // 1 or 2、なければ 0
  camDX: number; camDY: number; // ドラッグ量（px）
  camStick: { x: number; y: number }; // ゲームパッド右スティック
}

export class Input {
  private keys = new Set<string>();
  private edges = new Set<string>();
  private stick = { x: 0, y: 0, id: -1 };
  private drag: { id: number; x: number; y: number } | null = null;
  private camDX = 0; private camDY = 0;
  readonly isTouch = matchMedia('(pointer: coarse)').matches;

  constructor(canvas: HTMLCanvasElement, els: { stick: HTMLElement; knob: HTMLElement; jump: HTMLElement; skate: HTMLElement; talk: HTMLElement }) {
    window.addEventListener('keydown', e => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.edges.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // カメラのドラッグ。タッチのときは画面右側だけ（左はスティック）
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' && e.clientX < window.innerWidth * 0.45) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      this.camDX += e.clientX - this.drag.x; this.camDY += e.clientY - this.drag.y; this.drag.x = e.clientX; this.drag.y = e.clientY;
    });
    const endDrag = (e: PointerEvent) => { if (this.drag && this.drag.id === e.pointerId) this.drag = null; };
    canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);

    // 仮想スティック
    const move = (e: PointerEvent) => {
      const r = els.stick.getBoundingClientRect();
      let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      this.stick.x = x; this.stick.y = y; els.knob.style.transform = `translate(${x * 38}px, ${y * 38}px)`;
    };
    els.stick.addEventListener('pointerdown', e => { this.stick.id = e.pointerId; els.stick.setPointerCapture(e.pointerId); move(e); });
    els.stick.addEventListener('pointermove', e => { if (this.stick.id === e.pointerId) move(e); });
    const endStick = (e: PointerEvent) => { if (this.stick.id === e.pointerId) { this.stick = { x: 0, y: 0, id: -1 }; els.knob.style.transform = ''; } };
    els.stick.addEventListener('pointerup', endStick); els.stick.addEventListener('pointercancel', endStick);

    const btn = (el: HTMLElement, code: string) => el.addEventListener('pointerdown', e => { e.preventDefault(); this.edges.add(code); });
    btn(els.jump, 'T_JUMP'); btn(els.skate, 'T_SKATE'); btn(els.talk, 'T_TALK');
  }

  private pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }
  private padEdges = new Set<number>();

  poll(): Frame {
    let x = 0, z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    x += this.stick.x; z += this.stick.y;

    const camStick = { x: 0, y: 0 };
    const p = this.pad();
    if (p) {
      const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
      x += dz(p.axes[0] ?? 0); z += dz(p.axes[1] ?? 0);
      camStick.x = dz(p.axes[2] ?? 0); camStick.y = dz(p.axes[3] ?? 0);
      const map: [number, string][] = [[0, 'P_JUMP'], [2, 'P_TALK'], [1, 'P_SKATE'], [3, 'P_SKATE']];
      for (const [i, code] of map) {
        const pressed = !!p.buttons[i]?.pressed;
        if (pressed && !this.padEdges.has(i)) { this.edges.add(code); this.padEdges.add(i); }
        if (!pressed) this.padEdges.delete(i);
      }
    }
    const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; }

    const has = (...codes: string[]) => codes.some(c => this.edges.has(c));
    const f: Frame = {
      move: { x, z, l: Math.min(1, l) },
      jump: has('Space', 'T_JUMP', 'P_JUMP'),
      skate: has('ShiftLeft', 'ShiftRight', 'T_SKATE', 'P_SKATE'),
      interact: has('KeyE', 'Enter', 'T_TALK', 'P_TALK'),
      choice: this.edges.has('Digit1') ? 1 : this.edges.has('Digit2') ? 2 : this.edges.has('Digit3') ? 3 : 0,
      camDX: this.camDX, camDY: this.camDY, camStick,
    };
    this.edges.clear(); this.camDX = 0; this.camDY = 0;
    return f;
  }

  get jumpHeld() { return this.keys.has('Space'); }
}
