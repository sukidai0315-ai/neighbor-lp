import * as THREE from 'three';

// コード生成の素材。本番モデルが入るまでの仮だが、床・壁・ラグは本番でも使える品質を目指す。

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export function hash(x: number, y: number) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
}
export function fbm(x: number, y: number, oct = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); n += a; a *= 0.5; f *= 2.1; } return s / n; }
function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function hex(c: number): [number, number, number] { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }

type Pix = [number, number, number, number]; // r g b height(0..1)
export interface Pair { col: HTMLCanvasElement; hgt: HTMLCanvasElement }

export function genPair(size: number, fn: (x: number, y: number) => Pix): Pair {
  const col = canvas(size, size), hgt = canvas(size, size);
  const cc = col.getContext('2d')!, hc = hgt.getContext('2d')!;
  const ci = cc.createImageData(size, size), hi = hc.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = fn(x, y), i = (y * size + x) * 4;
    ci.data[i] = r[0]; ci.data[i + 1] = r[1]; ci.data[i + 2] = r[2]; ci.data[i + 3] = 255;
    const h = clamp(r[3] * 255, 0, 255); hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = h; hi.data[i + 3] = 255;
  }
  cc.putImageData(ci, 0, 0); hc.putImageData(hi, 0, 0);
  return { col, hgt };
}

export function normalFromHeight(hc: HTMLCanvasElement, strength: number) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const out = canvas(w, h), ctx = out.getContext('2d')!, img = ctx.createImageData(w, h), d = img.data;
  const H = (x: number, y: number) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return out;
}

export function tex(c: HTMLCanvasElement, { srgb = false, repeat = 1, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function pbr(pair: Pair, { repeat = 1, normalStrength = 2, aniso = 8 } = {}) {
  return { map: tex(pair.col, { srgb: true, repeat, aniso }), normalMap: tex(normalFromHeight(pair.hgt, normalStrength), { repeat, aniso }) };
}

// ---- generators ----
export const wood = () => genPair(512, (x, y) => {
  const row = Math.floor(y / 64), off = Math.floor(hash(row, 3) * 512), px = (x + off) % 256, yy = y % 64;
  const seam = yy < 2 || px < 2;
  const base = [0xb5895a, 0xa97d50, 0xc29666, 0x9f7449][Math.floor(hash(row, 9 + Math.floor((x + off) / 256)) * 4)];
  const g = fbm(px * 0.012 + row * 11, y * 0.11 + hash(row, 1) * 10, 4);
  const knot = Math.exp(-Math.pow(Math.hypot(px - 128 - hash(row, 5) * 60, yy - 32 - hash(row, 6) * 20) / 9, 2));
  const [r, gg, b] = hex(base), m = (0.78 + 0.42 * g) * (1 - knot * 0.35) * (seam ? 0.45 : 1);
  return [r * m, gg * m, b * m, seam ? 0.1 : 0.45 + 0.4 * g - knot * 0.2];
});
export const rug = () => genPair(256, (x, y) => {
  const weave = 0.5 + 0.5 * Math.sin(x * 0.9) * Math.sin(y * 0.9), fuzz = fbm(x * 0.15, y * 0.15, 3), stripe = Math.floor(y / 32) % 2;
  const base = stripe ? [0xd27f6c, 0xc26e5c] : [0xe3b087, 0xd6a27a];
  const [r, g, b] = hex(base[Math.floor(hash(Math.floor(x / 8), Math.floor(y / 8)) * 2)]), m = 0.8 + 0.25 * weave + 0.15 * fuzz;
  return [r * m, g * m, b * m, 0.3 + 0.5 * weave + 0.2 * fuzz];
});
export const fur = (ca0: number, cb0: number) => genPair(256, (x, y) => {
  const streak = fbm(x * 0.08, y * 0.35, 4), tuft = fbm(x * 0.3, y * 0.3, 2), ca = hex(ca0), cb = hex(cb0), t = clamp(streak * 1.3 - 0.1, 0, 1), m = 0.85 + 0.3 * tuft;
  return [lerp(ca[0], cb[0], t) * m, lerp(ca[1], cb[1], t) * m, lerp(ca[2], cb[2], t) * m, 0.3 + 0.6 * streak];
});
export const denim = () => genPair(256, (x, y) => {
  const twill = ((x + y) % 6) < 3 ? 1 : 0.72, n = fbm(x * 0.1, y * 0.1, 3), fade = fbm(x * 0.01, y * 0.01, 2), m = twill * (0.85 + 0.25 * n) * (0.9 + 0.3 * fade);
  return [78 * m + 10, 104 * m + 10, 150 * m + 10, twill > 0.9 ? 0.7 : 0.3];
});
export const jersey = () => genPair(128, (x, y) => { const k = 0.5 + 0.5 * Math.sin(x * 1.6) * Math.cos(y * 0.8), m = 0.9 + 0.1 * k; return [238 * m, 236 * m, 228 * m, 0.4 + 0.3 * k]; });
export const wallpaper = () => genPair(256, (x, y) => {
  const n = fbm(x * 0.05, y * 0.05, 3), cx = (x % 64) - 32, cy = (y % 64) - 32;
  const star = Math.abs(cx) + Math.abs(cy) < 5 && hash(Math.floor(x / 64), Math.floor(y / 64)) > 0.4 ? 1 : 0, m = 0.93 + 0.07 * n;
  return [lerp(214, 190, star) * m, lerp(226, 215, star) * m, lerp(232, 235, star) * m, 0.5 + 0.1 * n];
});
export const quilt = () => genPair(256, (x, y) => {
  const px = Math.floor(x / 64), py = Math.floor(y / 64);
  const pal = [0xbfd3e6, 0xe6c7b8, 0xd8dcc0, 0xf1e3c6, 0xc9c2dc];
  const [r, g, b] = hex(pal[Math.floor(hash(px, py) * pal.length)]);
  const seam = (x % 64) < 2 || (y % 64) < 2, weave = 0.5 + 0.5 * Math.sin(x * 1.3) * Math.sin(y * 1.3), n = fbm(x * 0.12, y * 0.12, 3);
  const m = (seam ? 0.7 : 1) * (0.86 + 0.14 * weave + 0.1 * n);
  return [r * m, g * m, b * m, seam ? 0.1 : 0.5 + 0.3 * weave];
});

export function blockFace(letter: string, color: number) {
  const c = canvas(256, 256), ctx = c.getContext('2d')!, img = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const i = (y * 256 + x) * 4, g = fbm(x * 0.01, y * 0.07, 3), m = 0.82 + 0.36 * g; img.data[i] = 222 * m; img.data[i + 1] = 190 * m; img.data[i + 2] = 140 * m; img.data[i + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0'); ctx.globalAlpha = 0.9; ctx.fillRect(22, 22, 212, 212); ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(250,240,220,0.95)'; ctx.font = 'bold 150px "Zen Maru Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(letter, 128, 136);
  for (let i = 0; i < 1400; i++) { ctx.fillStyle = `rgba(222,190,140,${0.25 + Math.random() * 0.5})`; ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  return c;
}

// 子どもが描いた「がんばったで賞」。丸められる前の状態
export function awardPaper() {
  const c = canvas(512, 384), ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f7f1e3'; ctx.fillRect(0, 0, 512, 384);
  for (let i = 0; i < 6000; i++) { ctx.fillStyle = 'rgba(120,100,70,0.05)'; ctx.fillRect(Math.random() * 512, Math.random() * 384, 1, 1); }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const wob = (pts: number[][], color: string, w: number) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); pts.forEach((p, i) => { const jx = (Math.random() - .5) * 3, jy = (Math.random() - .5) * 3; i ? ctx.lineTo(p[0] + jx, p[1] + jy) : ctx.moveTo(p[0] + jx, p[1] + jy); }); ctx.stroke(); };
  const circ: number[][] = []; for (let a = 0; a <= Math.PI * 2 + .2; a += .15) circ.push([256 + Math.cos(a) * 85, 190 + Math.sin(a) * 85]); wob(circ, '#e3a21a', 14);
  wob([[215, 260], [195, 356]], '#d8443a', 12); wob([[297, 260], [317, 356]], '#3b6fc4', 12);
  const star: number[][] = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 22 : 52; star.push([256 + Math.cos(a) * r, 190 + Math.sin(a) * r]); } wob(star, '#e3a21a', 9);
  ctx.fillStyle = '#d8443a'; ctx.font = '700 44px "Zen Maru Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('がんばったで しょう', 256, 62);
  return c;
}
