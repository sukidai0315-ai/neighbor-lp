// 音。外部ファイルは使わず WebAudio で合成する（足音、スケボー、ラジコン、着地、紙、チャイム、時計、部屋の空気）。
// 最初のタップ／クリックで unlock() を呼ぶ。

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;
  private skateGain!: GainNode; private skateFilter!: BiquadFilterNode;
  private carGain!: GainNode; private carOsc!: OscillatorNode; private carOsc2!: OscillatorNode; private carFilter!: BiquadFilterNode;
  private roomGain!: GainNode;
  private tickTimer = 0;
  muted = false;

  get ready() { return !!this.ctx; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const C = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(ctx.destination);
    // ノイズ素材（2秒）
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    // スケボーの車輪: ノイズをバンドパスで、速度でゲイン
    const sk = ctx.createBufferSource(); sk.buffer = buf; sk.loop = true;
    this.skateFilter = ctx.createBiquadFilter(); this.skateFilter.type = 'bandpass'; this.skateFilter.frequency.value = 900; this.skateFilter.Q.value = 0.7;
    this.skateGain = ctx.createGain(); this.skateGain.gain.value = 0;
    sk.connect(this.skateFilter).connect(this.skateGain).connect(this.master); sk.start();
    // ラジコンのモーター: 2つの矩形波をローパスで
    this.carOsc = ctx.createOscillator(); this.carOsc.type = 'square'; this.carOsc.frequency.value = 80;
    this.carOsc2 = ctx.createOscillator(); this.carOsc2.type = 'sawtooth'; this.carOsc2.frequency.value = 161;
    this.carFilter = ctx.createBiquadFilter(); this.carFilter.type = 'lowpass'; this.carFilter.frequency.value = 600;
    this.carGain = ctx.createGain(); this.carGain.gain.value = 0;
    this.carOsc.connect(this.carFilter); this.carOsc2.connect(this.carFilter); this.carFilter.connect(this.carGain).connect(this.master);
    this.carOsc.start(); this.carOsc2.start();
    // 部屋の空気: ごく低いノイズ
    const rm = ctx.createBufferSource(); rm.buffer = buf; rm.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 220;
    this.roomGain = ctx.createGain(); this.roomGain.gain.value = 0.035;
    rm.connect(rf).connect(this.roomGain).connect(this.master); rm.start();
  }

  setMuted(m: boolean) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx!.currentTime, 0.05); try { localStorage.setItem('toyroom.muted', m ? '1' : '0'); } catch { /* 保存できなくても動く */ } }

  private noise(dur: number, filterType: BiquadFilterType, freq: number, q: number, gain: number, attack = 0.002) {
    if (!this.ctx) return;
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master); src.start(t); src.stop(t + dur + 0.05);
  }
  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + delay;
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }

  /** 足音（プラスチックの足が木の床を叩く） */
  footstep(onWood = true) { this.noise(0.07, 'bandpass', onWood ? 1400 + Math.random() * 400 : 500, 1.2, 0.18); this.tone(onWood ? 180 : 120, 0.06, 0.05, 'triangle'); }
  /** スケボーの蹴り */
  push() { this.noise(0.12, 'bandpass', 700, 0.8, 0.22, 0.01); }
  /** 着地。impact 0..1 */
  land(impact: number) { this.tone(70 + impact * 20, 0.18 + impact * 0.2, 0.25 + impact * 0.4, 'sine'); this.noise(0.08 + impact * 0.12, 'lowpass', 900, 0.5, 0.25 + impact * 0.4); }
  /** よじ登り */
  mantle() { this.noise(0.12, 'bandpass', 1100, 1, 0.14, 0.02); }
  /** 紙 */
  paper() { for (let i = 0; i < 4; i++) setTimeout(() => this.noise(0.05, 'highpass', 2200, 0.6, 0.12), i * 45 + Math.random() * 30); }
  /** 入手のチャイム */
  chime() { this.tone(880, 0.25, 0.12); this.tone(1320, 0.35, 0.1, 'sine', 0.09); }
  /** 会話の1行 */
  blip() { this.tone(640 + Math.random() * 80, 0.05, 0.05, 'triangle'); }
  /** スイッチ */
  click() { this.noise(0.03, 'highpass', 3000, 1, 0.2); this.tone(1800, 0.03, 0.06, 'square'); }
  /** 朝の鳥（短く） */
  birds() { for (let i = 0; i < 5; i++) { const f = 2200 + Math.random() * 900; this.tone(f, 0.12, 0.05, 'sine', i * 0.16 + Math.random() * 0.05); this.tone(f * 1.25, 0.08, 0.03, 'sine', i * 0.16 + 0.05); } }

  /** 毎フレーム: 速度に応じたループ音と時計 */
  update(dt: number, s: { skating: boolean; skateSpeed: number; riding: boolean; carSpeed: number; onGround: boolean; clock: boolean }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const sg = s.skating && s.onGround ? Math.min(0.35, s.skateSpeed * 0.04) : 0;
    this.skateGain.gain.setTargetAtTime(sg, t, 0.08); this.skateFilter.frequency.setTargetAtTime(700 + s.skateSpeed * 60, t, 0.1);
    const cs = Math.abs(s.carSpeed);
    this.carGain.gain.setTargetAtTime(s.riding ? 0.06 + Math.min(0.14, cs * 0.012) : 0, t, 0.1);
    this.carOsc.frequency.setTargetAtTime(70 + cs * 9, t, 0.1); this.carOsc2.frequency.setTargetAtTime(141 + cs * 18, t, 0.1); this.carFilter.frequency.setTargetAtTime(500 + cs * 60, t, 0.1);
    if (s.clock) { this.tickTimer += dt; if (this.tickTimer >= 1) { this.tickTimer -= 1; this.noise(0.02, 'highpass', 2600, 1, 0.05); } }
  }
}
