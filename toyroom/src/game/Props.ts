import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './textures';
import { scanned } from './assets';

// 散らかった小物。座標はすべて部屋のローカル単位（拡大前、1 = 10cm）。
// 通り道（スロープの入口、机の下の口、ラジコンの周り、机の下の落下地点）には置かない。

function mulberry(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const KEEP_CLEAR: { x: number; z: number; r: number }[] = [
  { x: -3.5, z: 10, r: 6.5 },   // スロープとその入口
  { x: 13, z: -3, r: 4.5 },     // 机の下の口
  { x: 8.5, z: 3, r: 3.5 },     // ラジコン
  { x: 3.6, z: -1.4, r: 2.6 },  // ボロ
  { x: -1.2, z: -10.6, r: 2.2 },// 丸めた賞
  { x: 12, z: 15, r: 4 },       // ドアの前
  { x: 8, z: -8.5, r: 3 },      // 机から飛び降りる所
];
const ROOM = { minX: -19, maxX: 19, minZ: -11, maxZ: 17 };
const BED = { minX: -20, maxX: -6, minZ: -4, maxZ: 17.5 };
const DESK = { minX: 7.5, maxX: 18.5, minZ: -11.5, maxZ: -5.5 };

export function scatterProps(group: THREE.Group, colliders: THREE.Box3[], S: number, aniso: number, lowTier: boolean) {
  const rnd = mulberry(20261108);
  const placed: { x: number; z: number; r: number }[] = [];
  const free = (x: number, z: number, r: number) => {
    if (x < ROOM.minX || x > ROOM.maxX || z < ROOM.minZ || z > ROOM.maxZ) return false;
    if (x > BED.minX - r && x < BED.maxX + r && z > BED.minZ - r && z < BED.maxZ + r) return false;
    if (x > DESK.minX - r && x < DESK.maxX + r && z > DESK.minZ - r && z < DESK.maxZ + r) return false;
    for (const k of KEEP_CLEAR) if (Math.hypot(x - k.x, z - k.z) < k.r + r) return false;
    for (const p of placed) if (Math.hypot(x - p.x, z - p.z) < p.r + r) return false;
    return true;
  };
  const spot = (r: number, tries = 40) => { for (let i = 0; i < tries; i++) { const x = ROOM.minX + rnd() * (ROOM.maxX - ROOM.minX), z = ROOM.minZ + rnd() * (ROOM.maxZ - ROOM.minZ); if (free(x, z, r)) { placed.push({ x, z, r }); return [x, z] as [number, number]; } } return null; };
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], rot?: [number, number, number], o: { shadow?: boolean; solid?: boolean } = {}) => {
    const m = new THREE.Mesh(geo, mat); m.castShadow = o.shadow !== false; m.receiveShadow = true;
    m.position.set(...pos); if (rot) m.rotation.set(...rot); group.add(m);
    if (o.solid) { m.updateMatrixWorld(true); colliders.push(new THREE.Box3().setFromObject(m)); }
    return m;
  };

  const woodP = T.wood();
  const woodMat = new THREE.MeshPhysicalMaterial({ ...T.pbr(woodP, { repeat: 1, normalStrength: 1, aniso }), color: 0xdcbf96, roughness: .5, clearcoat: .3 });
  const plastic = (c: number) => new THREE.MeshPhysicalMaterial({ color: c, roughness: .45, clearcoat: .5, clearcoatRoughness: .25 });
  const fabric = (c: number) => new THREE.MeshPhysicalMaterial({ ...scanned('cotton_jersey', { repeat: [2, 2], aniso }), color: c, roughness: 1, sheen: .8, sheenRoughness: .8 });
  const fleece = (c: number) => new THREE.MeshPhysicalMaterial({ ...scanned('knitted_fleece', { repeat: [1.5, 1.5], aniso }), color: c, roughness: 1, sheen: 1, sheenRoughness: .7 });
  const cardMat = new THREE.MeshStandardMaterial({ ...T.pbr(T.cardboard(), { repeat: 2, normalStrength: .8, aniso }), roughness: 1 });
  const pageMat = new THREE.MeshStandardMaterial({ color: 0xf1ebdd, roughness: .9 });
  const palette = [0xd8443a, 0x3b6fc4, 0x3da36b, 0xe3a21a, 0x8b4bb8, 0xf07c3a, 0x2fa3b8, 0xe36fa0];

  // ---- 積み木（文字）: 散らばりと、崩れかけの塔 ----
  const blockGeo = new RoundedBoxGeometry(.44, .44, .44, 3, .03);
  const letters = 'ABCDEFGHJKLMNOPRSTUY';
  const blockMats = letters.split('').map((l, i) => new THREE.MeshPhysicalMaterial({ map: T.tex(T.blockFace(l, palette[i % palette.length]), { srgb: true, aniso }), roughness: .45, clearcoat: .4, clearcoatRoughness: .3 }));
  for (let i = 0; i < 22; i++) { const p = spot(.45); if (!p) break; add(blockGeo, blockMats[i % blockMats.length], [p[0], .22, p[1]], [0, rnd() * Math.PI, 0], { solid: true }); }
  const tower = spot(1.2);
  if (tower) for (let i = 0; i < 4; i++) add(blockGeo, blockMats[(i * 3) % blockMats.length], [tower[0] + (rnd() - .5) * .12, .22 + i * .44, tower[1] + (rnd() - .5) * .12], [0, rnd() * .6, 0], { solid: i === 0 });

  // ---- クレヨン（インスタンス） ----
  const crayonGeo = new THREE.CylinderGeometry(.06, .06, .9, 10);
  const crayons = new THREE.InstancedMesh(crayonGeo, new THREE.MeshStandardMaterial({ roughness: .8 }), 40);
  crayons.castShadow = true; crayons.receiveShadow = true;
  const mtx = new THREE.Matrix4(), col = new THREE.Color();
  let ci = 0;
  for (let i = 0; i < 40; i++) {
    const p = spot(.4, 20); if (!p) continue;
    mtx.makeRotationFromEuler(new THREE.Euler(Math.PI / 2, 0, rnd() * Math.PI)); mtx.setPosition(p[0], .06, p[1]);
    crayons.setMatrixAt(ci, mtx); crayons.setColorAt(ci, col.set(palette[i % palette.length])); ci++;
  }
  crayons.count = ci; crayons.instanceMatrix.needsUpdate = true; if (crayons.instanceColor) crayons.instanceColor.needsUpdate = true; group.add(crayons);

  // ---- 本（ばらばら、何冊かは重なる） ----
  for (let i = 0; i < 10; i++) {
    const p = spot(1.5); if (!p) break;
    const w = 2.0 + rnd() * .9, d = 1.5 + rnd() * .6, h = .35 + rnd() * .3, ry = rnd() * Math.PI;
    add(new RoundedBoxGeometry(w, h, d, 2, .03), plastic(palette[(i * 5) % palette.length]), [p[0], h / 2, p[1]], [0, ry, 0], { solid: true });
    add(new THREE.BoxGeometry(w - .15, h - .08, d - .1), pageMat, [p[0], h / 2, p[1]], [0, ry, 0]);
    if (rnd() > .5) { const h2 = .3 + rnd() * .2; add(new RoundedBoxGeometry(w - .3, h2, d - .2, 2, .03), plastic(palette[(i * 3 + 1) % palette.length]), [p[0] + (rnd() - .5) * .4, h + h2 / 2, p[1] + (rnd() - .5) * .4], [0, ry + (rnd() - .5) * .5, 0], { solid: true }); }
  }

  // ---- ボール ----
  for (let i = 0; i < 6; i++) {
    const r = .35 + rnd() * .5, p = spot(r + .1); if (!p) break;
    add(new THREE.SphereGeometry(r, 24, 18), plastic(palette[(i * 7 + 2) % palette.length]), [p[0], r, p[1]], undefined, { solid: true });
    add(new THREE.TorusGeometry(r, .03, 8, 36), plastic(0xf6f1e6), [p[0], r, p[1]], [rnd() * 2, rnd() * 2, 0]);
  }

  // ---- 靴下（脱ぎ捨て） ----
  const sockMat = fabric(0xf2f0ea), sockStripe = fabric(0xd8443a);
  for (let i = 0; i < 6; i++) {
    const p = spot(1.0); if (!p) break; const ry = rnd() * Math.PI;
    const g = new THREE.Group(); g.position.set(p[0], 0, p[1]); g.rotation.y = ry;
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(.28, 1.3, 6, 12), sockMat); a.rotation.z = Math.PI / 2; a.position.set(0, .28, 0); a.castShadow = a.receiveShadow = true;
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(.27, .7, 6, 12), sockMat); b.rotation.set(0, 0, Math.PI / 2 + 1.1); b.position.set(.75, .3, .15); b.castShadow = true;
    const c = new THREE.Mesh(new THREE.TorusGeometry(.29, .05, 8, 24), sockStripe); c.rotation.y = Math.PI / 2; c.position.set(-.55, .28, 0);
    g.add(a, b, c); group.add(g);
  }

  // ---- クッション ----
  for (let i = 0; i < 4; i++) {
    const p = spot(2.2); if (!p) break;
    add(new RoundedBoxGeometry(3.6, 1.1, 3.6, 4, .5), fleece([0xf0b7a4, 0xbfd3e6, 0xf1e3c6, 0xc9d8b6][i]), [p[0], .55, p[1]], [0, rnd() * Math.PI, 0], { solid: true });
  }

  // ---- 段ボール箱（1つは開いていて中に積み木） ----
  for (let i = 0; i < 3; i++) {
    const p = spot(2.4); if (!p) break; const w = 3 + rnd() * 1.5, h = 2 + rnd(), ry = rnd() * Math.PI;
    add(new THREE.BoxGeometry(w, h, w * .8), cardMat, [p[0], h / 2, p[1]], [0, ry, 0], { solid: true });
    if (i === 0) { add(new THREE.BoxGeometry(w * .5, .08, w * .8), cardMat, [p[0] - w * .4, h + .3, p[1]], [0, ry, 1.2]); add(new THREE.BoxGeometry(w * .5, .08, w * .8), cardMat, [p[0] + w * .4, h + .3, p[1]], [0, ry, -1.2]); }
  }

  // ---- 落書きの紙 ----
  for (let i = 0; i < 6; i++) {
    const p = spot(1.3); if (!p) break;
    add(new THREE.PlaneGeometry(2.1, 1.5), new THREE.MeshStandardMaterial({ map: T.tex(T.doodlePaper(i), { srgb: true, aniso }), roughness: .95, side: THREE.DoubleSide }), [p[0], .025, p[1]], [-Math.PI / 2, 0, rnd() * Math.PI], { shadow: false });
  }

  // ---- おもちゃの汽車（線路なし、床に置いてある） ----
  const trainSpot = spot(3.2);
  if (trainSpot) {
    const g = new THREE.Group(); g.position.set(trainSpot[0], 0, trainSpot[1]); g.rotation.y = rnd() * Math.PI;
    const tk = (geo: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number], r?: [number, number, number]) => { const o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = true; o.position.set(...p); if (r) o.rotation.set(...r); g.add(o); return o; };
    const carColors = [0xd8443a, 0x3b6fc4, 0x3da36b];
    for (let i = 0; i < 4; i++) {
      const x = i * -1.6;
      if (i === 0) { tk(new THREE.CylinderGeometry(.42, .42, 1.3, 16), plastic(0x2b2b2e), [x + .1, .7, 0], [0, 0, Math.PI / 2]); tk(new RoundedBoxGeometry(.7, .9, .9, 2, .08), plastic(0xd8443a), [x - .55, .85, 0]); tk(new THREE.CylinderGeometry(.14, .2, .5, 10), plastic(0x2b2b2e), [x + .45, 1.45, 0]); }
      else tk(new RoundedBoxGeometry(1.3, .6, .8, 2, .06), plastic(carColors[i % 3]), [x, .65, 0]);
      tk(new RoundedBoxGeometry(1.4, .25, .9, 2, .04), woodMat, [x, .25, 0]);
      for (const z of [-.45, .45]) for (const dx of [-.45, .45]) tk(new THREE.CylinderGeometry(.18, .18, .12, 12), plastic(0x2b2b2e), [x + dx, .18, z], [Math.PI / 2, 0, 0]);
      if (i > 0) tk(new THREE.CylinderGeometry(.04, .04, .5, 6), plastic(0x2b2b2e), [x + .8, .3, 0], [0, 0, Math.PI / 2]);
    }
    group.add(g); g.updateMatrixWorld(true); colliders.push(new THREE.Box3().setFromObject(g));
  }

  // ---- 本棚（右の壁ぎわ、ドアの手前） ----
  const shelfMat = new THREE.MeshPhysicalMaterial({ ...T.pbr(woodP, { repeat: 1.5, normalStrength: 1, aniso }), color: 0xf0e6d6, roughness: .5, clearcoat: .2 });
  const sx = 17.4, sz = 6, sw = 7, sd = 2.2, sh = 12;
  add(new THREE.BoxGeometry(sd, sh, sw), shelfMat, [sx + sd / 2 - 0.3, sh / 2, sz], undefined, { solid: true });
  for (let r = 0; r < 4; r++) {
    const y = 0.6 + r * 2.9;
    add(new THREE.BoxGeometry(sd - .3, .18, sw - .3), shelfMat, [sx + sd / 2 - .3, y, sz]);
    let zz = sz - sw / 2 + .4;
    for (let b = 0; b < 12 && zz < sz + sw / 2 - .6; b++) { const t = .25 + rnd() * .35, hb = 1.6 + rnd() * .9; add(new THREE.BoxGeometry(sd - .9, hb, t), plastic(palette[(b + r) % palette.length]), [sx + sd / 2 - .3, y + .09 + hb / 2, zz + t / 2], [0, 0, rnd() > .85 ? .15 : 0]); zz += t + .06; }
  }
  // 棚の上の小物
  add(new THREE.SphereGeometry(.6, 20, 14), plastic(0x3da36b), [sx + .8, sh + .6, sz - 2]);
  add(new RoundedBoxGeometry(1.2, 1.6, 1.0, 2, .1), cardMat, [sx + .8, sh + .8, sz + 2], [0, .3, 0]);

  // ---- おもちゃ入れのバケツ（倒れている） ----
  const bucket = spot(2.0);
  if (bucket) {
    const bm = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.1, 2.4, 20, 1, true), new THREE.MeshPhysicalMaterial({ color: 0x3b6fc4, roughness: .4, clearcoat: .5, side: THREE.DoubleSide })); bm.position.set(bucket[0], 1.2, bucket[1]); bm.rotation.set(0, rnd() * Math.PI, Math.PI / 2 - .2); bm.castShadow = bm.receiveShadow = true; group.add(bm);
    bm.updateMatrixWorld(true); colliders.push(new THREE.Box3().setFromObject(bm));
    for (let i = 0; i < 5; i++) add(blockGeo, blockMats[(i * 4) % blockMats.length], [bucket[0] + 1.6 + i * .5, .22, bucket[1] + (rnd() - .5) * 1.6], [0, rnd() * 3, 0]);
  }

  void lowTier; void S;
}
