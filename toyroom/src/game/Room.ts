import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './textures';
import { scanned } from './assets';

// 子供部屋（仮モデル）。単位 1 = 10cm。
// ゾーン: 机の上(出発) / ラグ / 窓の下 / 机の下 / ベッドの上 / 枕元(ゴール)

export type Preset = 'night' | 'evening';

export interface RoomPoints {
  heroStart: THREE.Vector3;
  bear: THREE.Vector3;
  award: THREE.Vector3;
  pillow: THREE.Vector3;
  robot: THREE.Vector3;
  rabbit: THREE.Vector3;
}

/** 斜面。x 方向に高さが変わる長方形の板 */
export interface Ramp { minX: number; maxX: number; minZ: number; maxZ: number; hAtMinX: number; hAtMaxX: number }

/** 部屋の倍率。主人公は等倍のまま部屋だけ大きくして「自分が小さい」感じを出す */
export const S = 2;

export class Room {
  readonly group = new THREE.Group();
  readonly colliders: THREE.Box3[] = [];
  readonly ramps: Ramp[] = [];
  readonly points: RoomPoints;
  readonly bear = new THREE.Group();
  readonly robot = new THREE.Group();
  readonly rabbit = new THREE.Group();
  readonly car = new THREE.Group();
  readonly wheels: THREE.Mesh[] = [];
  readonly headlights: THREE.SpotLight[] = [];
  fragments: THREE.Mesh[] = [];
  private headlampMat!: THREE.MeshStandardMaterial;
  private robotEyes!: THREE.MeshStandardMaterial;
  private carColliderIndex = -1;
  readonly awardBall: THREE.Mesh;
  private bearHead!: THREE.Mesh;
  private dustGeo: THREE.BufferGeometry;
  private dustVel: Float32Array;
  private sun: THREE.DirectionalLight;
  private sky: THREE.HemisphereLight;
  private nightLight: THREE.PointLight;
  private fill: THREE.PointLight;
  private moon: THREE.DirectionalLight;
  private glass: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private bulbMat: THREE.MeshStandardMaterial;
  preset: Preset = 'night';

  constructor(private scene: THREE.Scene, aniso: number, lowTier: boolean) {
    this.group.scale.setScalar(S); scene.add(this.group); this.group.updateMatrixWorld(true); // 当たり判定を倍率込みで計算するため先に更新
    const woodP = T.wood();

    // 床・壁・布はスキャン素材（public/textures、CC0）。小物や仮キャラはコード生成のまま
    const floorMat = new THREE.MeshPhysicalMaterial({ ...scanned('wood_floor', { repeat: [2.2, 1.8], aniso }), roughness: 1, clearcoat: 0.3, clearcoatRoughness: 0.3 });
    floorMat.normalScale.set(1.1, 1.1);
    const rugMat = new THREE.MeshPhysicalMaterial({ ...scanned('knitted_fleece', { repeat: [3.5, 3.5], aniso }), color: 0xe0a07e, roughness: 1, sheen: 1, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffd7b8) });
    rugMat.normalScale.set(1.4, 1.4);
    const wallMat = new THREE.MeshStandardMaterial({ ...scanned('plastered_wall_04', { repeat: [5, 3.2], aniso }), color: 0xffffff, roughness: 1 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.5 });
    const deskMat = new THREE.MeshPhysicalMaterial({ ...T.pbr(woodP, { repeat: 2, normalStrength: 1.0, aniso }), color: 0xd9b98f, roughness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.3 });
    const quiltMat = new THREE.MeshPhysicalMaterial({ ...scanned('gingham_check', { repeat: [4.4, 6.8], aniso }), color: 0xd6e2f0, roughness: 1, sheen: 0.9, sheenRoughness: 0.8 });
    const sheetMat = new THREE.MeshPhysicalMaterial({ ...scanned('cotton_jersey', { repeat: [3, 3], aniso }), color: 0xf6f1e6, roughness: 1, sheen: 0.8 });
    const bearMat = new THREE.MeshPhysicalMaterial({ ...scanned('curly_teddy_natural', { repeat: [1.6, 1.6], aniso }), color: 0xc48a52, roughness: 1, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffe0b8) });
    const bellyMat = new THREE.MeshPhysicalMaterial({ ...scanned('curly_teddy_natural', { repeat: [1.6, 1.6], aniso }), color: 0xf1dcc0, roughness: 1, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xfff2dc) });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x2b2725, roughness: 0.85 });
    const whitePlastic = new THREE.MeshPhysicalMaterial({ color: 0xf3efe6, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    const carPaint = new THREE.MeshPhysicalMaterial({ color: 0xd63a2b, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 });
    const ballMat = new THREE.MeshPhysicalMaterial({ color: 0xf0c24a, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4 });
    const paperMat = new THREE.MeshStandardMaterial({ map: T.tex(T.awardPaper(), { srgb: true, aniso }), roughness: 0.95 });

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], rot?: [number, number, number], o: { shadow?: boolean; solid?: boolean } = {}) => {
      const m = new THREE.Mesh(geo, mat); m.castShadow = o.shadow !== false; m.receiveShadow = true;
      m.position.set(...pos); if (rot) m.rotation.set(...rot); this.group.add(m);
      if (o.solid) { m.updateMatrixWorld(true); this.colliders.push(new THREE.Box3().setFromObject(m)); }
      return m;
    };

    // ---- 床・壁 ----
    add(new THREE.PlaneGeometry(40, 32), floorMat, [0, 0, 2], [-Math.PI / 2, 0, 0], { shadow: false });
    add(new THREE.PlaneGeometry(40, 26), wallMat, [0, 13, -12], undefined, { shadow: false });
    add(new THREE.PlaneGeometry(36, 26), wallMat, [-20, 13, 6], [0, Math.PI / 2, 0], { shadow: false });
    add(new THREE.PlaneGeometry(36, 26), wallMat, [20, 13, 6], [0, -Math.PI / 2, 0], { shadow: false });
    add(new THREE.PlaneGeometry(40, 26), wallMat, [0, 13, 18], [0, Math.PI, 0], { shadow: false });
    add(new THREE.BoxGeometry(40, 0.9, 0.18), trimMat, [0, 0.45, -11.92]);
    add(new THREE.BoxGeometry(0.18, 0.9, 36), trimMat, [-19.92, 0.45, 6]);
    add(new THREE.BoxGeometry(0.18, 0.9, 36), trimMat, [19.92, 0.45, 6]);
    add(new THREE.CircleGeometry(6.5, 64), rugMat, [0.5, 0.02, 1.5], [-Math.PI / 2, 0, 0], { shadow: false });

    // ---- 窓（奥の壁、左寄り） ----
    const winX = -3, winY = 12.5, winW = 9, winH = 10;
    this.glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), new THREE.MeshBasicMaterial({ color: 0x8fa6cc }));
    this.glass.position.set(winX, winY, -11.95); this.group.add(this.glass);
    ([[winX, winY + winH / 2 + .3, winW + 1.2, .6], [winX, winY - winH / 2 - .3, winW + 1.2, .6], [winX - winW / 2 - .3, winY, .6, winH], [winX + winW / 2 + .3, winY, .6, winH], [winX, winY, .35, winH], [winX, winY, winW, .35]] as number[][])
      .forEach(([x, y, w, h]) => add(new THREE.BoxGeometry(w, h, .5), trimMat, [x, y, -11.75]));
    add(new THREE.BoxGeometry(winW + 2.4, .5, 1.6), trimMat, [winX, winY - winH / 2 - .85, -11.2]);
    const curtainMat = new THREE.MeshPhysicalMaterial({ color: 0xcfe0d8, roughness: 1, sheen: .8, sheenRoughness: .9, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) add(new THREE.CylinderGeometry(.35, .4, winH + 3, 12, 1, true), curtainMat, [winX + winW / 2 + 1.4 + i * .5, winY + .5, -11.1 + (i % 2) * .3]);

    // ---- 机（右奥、出発点） ----
    const deskTop = 7.2;
    add(new RoundedBoxGeometry(10, 0.4, 6, 3, 0.05), deskMat, [13, deskTop - 0.2, -8.5], undefined, { solid: true });
    [[8.3, -11.2], [17.7, -11.2], [8.3, -5.8], [17.7, -5.8]].forEach(([x, z]) => add(new THREE.BoxGeometry(0.5, deskTop - 0.4, 0.5), deskMat, [x, (deskTop - 0.4) / 2, z], undefined, { solid: true }));
    add(new THREE.BoxGeometry(9.4, 1.2, 5.4), deskMat, [13, deskTop - 1.0, -8.5]); // 引き出し部
    add(new THREE.BoxGeometry(3.2, 0.6, 0.1), whitePlastic, [13, deskTop - 1.0, -5.75]);
    // 机の上の小物: 鉛筆立て、本
    add(new THREE.CylinderGeometry(0.6, 0.55, 1.8, 20), new THREE.MeshStandardMaterial({ color: 0x3b6fc4, roughness: 0.5 }), [16.5, deskTop + 0.9, -10], undefined, { solid: true });
    [0xd8443a, 0xe3a21a, 0x3da36b].forEach((c, i) => add(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 10), new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }), [16.3 + i * 0.15, deskTop + 1.9, -10.1 + i * 0.1], [0.1 * i, 0, 0.15 - 0.1 * i]));
    add(new RoundedBoxGeometry(2.4, 0.5, 1.8, 2, 0.03), new THREE.MeshStandardMaterial({ color: 0x8b4bb8, roughness: 0.6 }), [10, deskTop + 0.25, -10], [0, 0.2, 0], { solid: true });
    // 机のランプ（つけっぱなし）。出発点の光だまり
    const lampMat = new THREE.MeshPhysicalMaterial({ color: 0x3f8f7a, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    add(new THREE.CylinderGeometry(1.1, 1.3, 0.3, 24), lampMat, [16.6, deskTop + 0.15, -6.8], undefined, { solid: true });
    add(new THREE.CylinderGeometry(0.12, 0.12, 5.5, 10), lampMat, [16.6, deskTop + 3.0, -6.8], [0, 0, 0.1]);
    add(new THREE.CylinderGeometry(0.9, 2.2, 2.2, 24, 1, true), new THREE.MeshPhysicalMaterial({ color: 0x3f8f7a, roughness: 0.4, clearcoat: 0.8, side: THREE.DoubleSide }), [15.4, deskTop + 5.6, -6.9], [0.25, 0, 0.6]);
    const deskBulb = new THREE.MeshStandardMaterial({ color: 0xffe9c0, emissive: 0xffc070, emissiveIntensity: 3 });
    add(new THREE.SphereGeometry(0.45, 16, 12), deskBulb, [15.0, deskTop + 5.0, -6.6], undefined, { shadow: false });
    const deskLight = new THREE.PointLight(0xffc98a, 70 * S * S, 24 * S, 2); deskLight.position.set(14.8, deskTop + 4.6, -6.4); deskLight.castShadow = !lowTier; deskLight.shadow.mapSize.set(1024, 1024); deskLight.shadow.bias = -0.002; this.group.add(deskLight);

    // ---- ベッド（左、丘） ----
    add(new RoundedBoxGeometry(13, 4.5, 20, 4, .8), quiltMat, [-13, 2.25, 7], undefined, { solid: true });
    add(new RoundedBoxGeometry(5, 1.3, 3.6, 4, .6), sheetMat, [-15.5, 5.1, -1.2], undefined, { solid: true }); // 枕
    add(new THREE.BoxGeometry(13.4, 6.5, .5), deskMat, [-13, 3.2, -3.3], undefined, { solid: true }); // ヘッドボード
    add(new THREE.BoxGeometry(13.4, 1.2, .5), deskMat, [-13, 0.6, 17.3], undefined, { solid: true });

    // ---- おもちゃ ----
    const blockGeo = new RoundedBoxGeometry(.44, .44, .44, 3, .03);
    ([['A', 0xd8443a, -2.0, .22, -0.6, .3], ['B', 0x3b6fc4, -1.95, .66, -0.55, -.2], ['K', 0x3da36b, -1.2, .22, -1.3, .8], ['E', 0xe3a21a, 2.9, .22, -1.0, 1.4], ['O', 0xd8443a, -3.1, .22, 2.9, 2.3], ['T', 0x3b6fc4, 4.6, .22, 5.2, .4], ['Y', 0x3da36b, 5.1, .22, 5.0, -.3]] as [string, number, number, number, number, number][])
      .forEach(([l, col, x, y, z, ry]) => add(blockGeo, new THREE.MeshPhysicalMaterial({ map: T.tex(T.blockFace(l, col), { srgb: true, aniso }), roughness: .45, clearcoat: .4, clearcoatRoughness: .3 }), [x, y, z], [0, ry, 0], { solid: true }));
    add(new THREE.SphereGeometry(.75, 32, 24), ballMat, [-2.8, .75, -5.2], undefined, { solid: true });
    add(new THREE.TorusGeometry(.75, .04, 10, 48), new THREE.MeshPhysicalMaterial({ color: 0xd8443a, roughness: .5, clearcoat: .3 }), [-2.8, .75, -5.2], [.4, .3, 0]);

    // 本（窓の下へ登る階段、ラグ脇、机の下の入口）
    ([[0x3b6fc4, -3.6, .25, -8.9, .2, 2.2, .5, 1.7], [0xd8443a, -3.5, .7, -8.8, -.15, 2.0, .4, 1.5], [0x3da36b, 6.4, .3, 1.8, 1.2, 2.4, .6, 1.9], [0xe3a21a, 1.5, .3, 5.6, .1, 2.6, .6, 2.0], [0x8b4bb8, 1.6, .85, 5.5, -.25, 2.2, .5, 1.7], [0xd27f6c, 7.2, .3, -3.2, 0.5, 2.6, .6, 2.0]] as number[][])
      .forEach(([col, x, y, z, ry, w, h, d]) => { add(new RoundedBoxGeometry(w, h, d, 2, .03), new THREE.MeshStandardMaterial({ color: col, roughness: .6 }), [x, y, z], [0, ry, 0], { solid: true }); add(new THREE.BoxGeometry(w - .15, h - .08, d - .1), new THREE.MeshStandardMaterial({ color: 0xf1ebdd, roughness: .9 }), [x, y, z], [0, ry, 0]); });
    [0xd8443a, 0x3b6fc4, 0x3da36b, 0xe3a21a, 0x8b4bb8, 0xf07c3a].forEach((col, i) => { const a = .3 + i * .9 + T.hash(i, 2); add(new THREE.CylinderGeometry(.06, .06, .9, 10), new THREE.MeshStandardMaterial({ color: col, roughness: .8 }), [-.5 + Math.cos(a) * 1.4, .06, -0.2 + Math.sin(a) * 1.0], [Math.PI / 2, 0, a]); });

    // ---- ラジコン「ダッシュ」（乗れる。前が +x） ----
    const car = this.car;
    const ck = (g: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number], r?: [number, number, number]) => { const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; o.position.set(...p); if (r) o.rotation.set(...r); car.add(o); return o; };
    ck(new RoundedBoxGeometry(2.6, .55, 1.3, 4, .12), carPaint, [0, .62, 0]); ck(new RoundedBoxGeometry(1.2, .55, 1.1, 4, .15), whitePlastic, [-.2, 1.12, 0]);
    ck(new RoundedBoxGeometry(.9, .08, 1.0, 2, .03), new THREE.MeshPhysicalMaterial({ color: 0x1b2a3a, roughness: .1, metalness: .2, clearcoat: 1 }), [.45, 1.3, 0], [0, 0, -.35]);
    ck(new THREE.CylinderGeometry(.03, .03, 1.6, 8), rubber, [-.75, 1.9, -.4]); ck(new THREE.SphereGeometry(.07, 12, 8), rubber, [-.75, 2.7, -.4]);
    ([[-.85, .72], [.85, .72], [-.85, -.72], [.85, -.72]] as number[][]).forEach(([x, z]) => { const w = ck(new THREE.CylinderGeometry(.42, .42, .34, 20), rubber, [x, .42, z], [Math.PI / 2, 0, 0]); this.wheels.push(w); ck(new THREE.CylinderGeometry(.22, .22, .36, 16), whitePlastic, [x, .42, z], [Math.PI / 2, 0, 0]); });
    this.headlampMat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xfff0c0, emissiveIntensity: 0 });
    [-.42, .42].forEach(z => {
      ck(new THREE.CylinderGeometry(.14, .14, .1, 14), this.headlampMat, [1.32, .68, z], [0, 0, Math.PI / 2]);
      const s = new THREE.SpotLight(0xfff0c8, 0, 22 * S, 0.55, 0.5, 1.5); s.position.set(1.3, .7, z); s.target.position.set(8, 0, z * 1.5); car.add(s, s.target); this.headlights.push(s);
    });
    car.scale.setScalar(S); car.position.set(4.5 * S, 0, 9.5 * S); car.rotation.y = 2.3; scene.add(car); car.updateMatrixWorld(true);
    this.carColliderIndex = this.colliders.length; this.colliders.push(new THREE.Box3().setFromObject(car));

    // ---- 机の下の暗がり: 段ボール箱の洞窟（口は部屋側 +z） ----
    const cardMat = new THREE.MeshStandardMaterial({ ...T.pbr(T.cardboard(), { repeat: 2, normalStrength: 0.8, aniso }), roughness: 1 });
    const cave = { x: 13, z: -8.6, w: 8, h: 4.6, d: 5 };
    add(new THREE.BoxGeometry(cave.w, cave.h, .12), cardMat, [cave.x, cave.h / 2, cave.z - cave.d / 2], undefined, { solid: true }); // 奥
    add(new THREE.BoxGeometry(.12, cave.h, cave.d), cardMat, [cave.x - cave.w / 2, cave.h / 2, cave.z], undefined, { solid: true });
    add(new THREE.BoxGeometry(.12, cave.h, cave.d), cardMat, [cave.x + cave.w / 2, cave.h / 2, cave.z], undefined, { solid: true });
    add(new THREE.BoxGeometry(cave.w + .2, .12, cave.d + .2), cardMat, [cave.x, cave.h, cave.z], undefined, { solid: true }); // 天井
    add(new THREE.BoxGeometry(cave.w, cave.h * 0.45, .12), cardMat, [cave.x, cave.h * 0.78, cave.z + cave.d / 2], [0.9, 0, 0]); // 垂れたフタで入口が暗い
    add(new THREE.BoxGeometry(cave.w, .02, cave.d), new THREE.MeshStandardMaterial({ color: 0x8d6f4e, roughness: 1 }), [cave.x, 0.011, cave.z], undefined, { shadow: false });

    // ロボット「ガチャ」（腕が片方ない）
    const botPaint = new THREE.MeshPhysicalMaterial({ color: 0x8fb3c7, roughness: .35, metalness: .3, clearcoat: .8, clearcoatRoughness: .2 });
    const botDark = new THREE.MeshStandardMaterial({ color: 0x3b3f46, roughness: .6, metalness: .4 });
    const bk = (g: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number], r?: [number, number, number]) => { const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; o.position.set(...p); if (r) o.rotation.set(...r); this.robot.add(o); return o; };
    bk(new RoundedBoxGeometry(1.6, 1.8, 1.1, 3, .12), botPaint, [0, 1.25, 0]); bk(new RoundedBoxGeometry(1.2, 1.0, 1.0, 3, .12), botPaint, [0, 2.75, 0]);
    bk(new THREE.CylinderGeometry(.04, .04, .9, 8), botDark, [0, 3.6, 0]); bk(new THREE.SphereGeometry(.12, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff5a3c, emissive: 0xff5a3c, emissiveIntensity: 1.2 }), [0, 4.05, 0]);
    this.robotEyes = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x6fd8ff, emissiveIntensity: 1.6 });
    bk(new THREE.BoxGeometry(.26, .18, .05), this.robotEyes, [-.28, 2.8, .52]); bk(new THREE.BoxGeometry(.26, .18, .05), this.robotEyes, [.28, 2.8, .52]);
    bk(new THREE.BoxGeometry(.5, .08, .05), botDark, [0, 2.45, .52]);
    bk(new THREE.CylinderGeometry(.16, .16, 1.3, 10), botDark, [1.0, 1.4, 0], [0, 0, -.25]); // 右腕だけ
    bk(new THREE.CylinderGeometry(.22, .22, .5, 10), botDark, [-.45, .25, 0]); bk(new THREE.CylinderGeometry(.22, .22, .5, 10), botDark, [.45, .25, 0]);
    this.robot.position.set(cave.x - 1.2, 0, cave.z - 1.2); this.robot.rotation.y = 0.5; this.group.add(this.robot);
    add(new THREE.CylinderGeometry(.16, .16, 1.3, 10), botDark, [cave.x + 1.8, .16, cave.z - 1.6], [Math.PI / 2, 0, 0.4]); // 取れた左腕が床に
    this.colliders.push(new THREE.Box3(new THREE.Vector3(cave.x - 2.1, 0, cave.z - 2.0).multiplyScalar(S), new THREE.Vector3(cave.x - 0.3, 3.4, cave.z - 0.4).multiplyScalar(S)));

    // ---- 本のスロープ（ベッドへ） ----
    const rampMat = new THREE.MeshStandardMaterial({ color: 0x2f6b9a, roughness: .55 });
    const ramp = { x0: -0.2, x1: -6.4, z0: 8.2, z1: 11.4, h0: 0.0, h1: 4.0 };
    const len = Math.hypot(ramp.x1 - ramp.x0, ramp.h1 - ramp.h0), ang = Math.atan2(ramp.h1 - ramp.h0, ramp.x0 - ramp.x1);
    const rampMesh = add(new RoundedBoxGeometry(len + 0.4, 0.5, ramp.z1 - ramp.z0, 2, .05), rampMat, [(ramp.x0 + ramp.x1) / 2, (ramp.h0 + ramp.h1) / 2 - 0.22, (ramp.z0 + ramp.z1) / 2], [0, 0, ang]);
    const pages = new THREE.Mesh(new THREE.BoxGeometry(len + 0.25, 0.42, ramp.z1 - ramp.z0 - 0.15), new THREE.MeshStandardMaterial({ color: 0xf1ebdd, roughness: .9 })); pages.position.copy(rampMesh.position); pages.rotation.copy(rampMesh.rotation); pages.receiveShadow = true; this.group.add(pages);
    this.ramps.push({ minX: Math.min(ramp.x0, ramp.x1) * S, maxX: Math.max(ramp.x0, ramp.x1) * S, minZ: ramp.z0 * S, maxZ: ramp.z1 * S, hAtMinX: ramp.h1 * S, hAtMaxX: ramp.h0 * S });
    add(new RoundedBoxGeometry(2.6, 0.5, 2.0, 2, .03), new THREE.MeshStandardMaterial({ color: 0xd8443a, roughness: .6 }), [-5.6, 3.4, 9.8], [0, 0.1, 0]); // 支えの本（見た目）

    // ---- ウサギ「ミミ」（ベッドの上、枕のそば） ----
    const bunnyMat = new THREE.MeshPhysicalMaterial({ ...scanned('cotton_jersey', { repeat: [2, 2], aniso }), color: 0xf0c9c9, roughness: 1, sheen: 1, sheenRoughness: .7 });
    const bunnyInner = new THREE.MeshPhysicalMaterial({ color: 0xf6e7e2, roughness: 1, sheen: 1 });
    const rk = (g: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number], s?: [number, number, number], r?: [number, number, number]) => { const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; o.position.set(...p); if (s) o.scale.set(...s); if (r) o.rotation.set(...r); this.rabbit.add(o); return o; };
    rk(new THREE.SphereGeometry(.7, 24, 18), bunnyMat, [0, .7, 0], [1, 1.15, .9]); rk(new THREE.SphereGeometry(.42, 20, 16), bunnyInner, [0, .65, .5], [1, 1.2, .4]);
    rk(new THREE.SphereGeometry(.52, 24, 18), bunnyMat, [0, 1.75, .05]);
    [-1, 1].forEach(s => { rk(new THREE.CapsuleGeometry(.14, 1.1, 4, 10), bunnyMat, [s * .28, 2.75, -.05], undefined, [0, 0, -s * .18]); rk(new THREE.CapsuleGeometry(.07, .9, 4, 8), bunnyInner, [s * .28, 2.75, .05], undefined, [0, 0, -s * .18]);
      rk(new THREE.SphereGeometry(.055, 10, 8), rubber, [s * .18, 1.85, .46]); rk(new THREE.SphereGeometry(.3, 16, 12), bunnyMat, [s * .55, .35, .35], [.9, .6, 1.2]); rk(new THREE.SphereGeometry(.2, 14, 10), bunnyMat, [s * .7, .95, .1], [.7, 1.3, .7], [0, 0, -s * .6]); });
    rk(new THREE.SphereGeometry(.08, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd86a7a, roughness: .7 }), [0, 1.66, .5], [1, .7, .8]);
    this.rabbit.position.set(-11.2, 4.5, 0.6); this.rabbit.rotation.y = 2.4; this.group.add(this.rabbit);
    this.colliders.push(new THREE.Box3(new THREE.Vector3(-11.9, 4.5, -0.1).multiplyScalar(S), new THREE.Vector3(-10.5, 7.2, 1.3).multiplyScalar(S)));

    // ---- 賞の欠片（2つ） ----
    const fragMat = new THREE.MeshStandardMaterial({ map: T.tex(T.awardPaper(), { srgb: true, aniso }), roughness: .95, side: THREE.DoubleSide });
    const fragGeo = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(.9, .1), new THREE.Vector2(1.0, .7), new THREE.Vector2(.55, .95), new THREE.Vector2(.1, .8)]);
    const fg = new THREE.ShapeGeometry(fragGeo); fg.center();
    this.fragments = [
      add(fg, fragMat, [cave.x + 2.2, 0.03, cave.z - 0.2], [-Math.PI / 2, 0, 0.8], { shadow: false }),
      add(fg, fragMat, [-14.6, 4.52, 6.4], [-Math.PI / 2, 0, -0.5], { shadow: false }),
    ];

    // ---- クマ「ボロ」 ----
    const mk = (g: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number], s?: [number, number, number], r?: [number, number, number]) => { const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; o.position.set(...p); if (s) o.scale.set(...s); if (r) o.rotation.set(...r); this.bear.add(o); return o; };
    mk(new THREE.SphereGeometry(.95, 32, 24), bearMat, [0, .95, 0], [1, 1.08, .9]); mk(new THREE.SphereGeometry(.6, 24, 18), bellyMat, [0, .9, .62], [1, 1.2, .45]);
    this.bearHead = mk(new THREE.SphereGeometry(.7, 32, 24), bearMat, [0, 2.35, .05]);
    mk(new THREE.SphereGeometry(.32, 24, 18), bellyMat, [0, 2.2, .62], [1.2, .85, .8]); mk(new THREE.SphereGeometry(.1, 12, 10), rubber, [0, 2.3, .9]);
    [-1, 1].forEach(s => { mk(new THREE.SphereGeometry(.26, 18, 14), bearMat, [s * .52, 2.92, 0]); mk(new THREE.SphereGeometry(.14, 12, 10), bellyMat, [s * .52, 2.92, .12], [1, 1, .5]); mk(new THREE.SphereGeometry(.07, 12, 10), rubber, [s * .25, 2.48, .62]);
      mk(new THREE.SphereGeometry(.32, 18, 14), bearMat, [s * 1.0, 1.2, .15], [.75, 1.5, .75], [0, 0, -s * .5]); mk(new THREE.SphereGeometry(.38, 18, 14), bearMat, [s * .58, .36, .65], [.85, .7, 1.3]); mk(new THREE.SphereGeometry(.2, 18, 14), bellyMat, [s * .58, .3, 1.12], [1, .7, .5]); });
    this.bear.position.set(3.6, 0, -1.4); this.bear.rotation.y = -0.9; this.group.add(this.bear);
    this.colliders.push(new THREE.Box3(new THREE.Vector3(2.7, 0, -2.3).multiplyScalar(S), new THREE.Vector3(4.5, 3.2, -0.5).multiplyScalar(S)));

    // ---- 丸められた賞（窓の下） ----
    const ballGeo = new THREE.IcosahedronGeometry(0.55, 2);
    const pos = ballGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) { const k = 0.8 + T.fbm(pos.getX(i) * 4 + 7, pos.getZ(i) * 4 + 3, 3) * 0.5; pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k); }
    ballGeo.computeVertexNormals();
    this.awardBall = add(ballGeo, paperMat, [-1.2, 0.5, -10.6], [0.4, 1.2, 0.3]);

    // ---- 常夜灯（左の壁） ----
    add(new THREE.CylinderGeometry(.4, .5, .25, 20), whitePlastic, [-19.6, 2.4, 12], [0, 0, Math.PI / 2]);
    this.bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe6b8, emissive: 0xffb354, emissiveIntensity: 2.4 });
    add(new THREE.SphereGeometry(.33, 20, 14), this.bulbMat, [-19.3, 2.4, 12], undefined, { shadow: false });

    // ---- 埃 ----
    const N = lowTier ? 160 : 360; this.dustGeo = new THREE.BufferGeometry();
    const dp = new Float32Array(N * 3); this.dustVel = new Float32Array(N);
    for (let i = 0; i < N; i++) { dp[i * 3] = -8 + Math.random() * 20; dp[i * 3 + 1] = Math.random() * 9; dp[i * 3 + 2] = -10 + Math.random() * 20; this.dustVel[i] = .2 + Math.random(); }
    this.dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.group.add(new THREE.Points(this.dustGeo, new THREE.PointsMaterial({ color: 0xffe9c4, size: .045, transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending })));

    // ---- ライト ----
    this.sun = new THREE.DirectionalLight(0xffd3a1, 0); this.sun.position.set((winX - 7) * S, 26 * S, -34 * S); this.sun.target.position.set(0, 0, S); scene.add(this.sun, this.sun.target);
    this.moon = new THREE.DirectionalLight(0xa9bfe8, 0.5); this.moon.position.set((winX - 4) * S, 24 * S, -30 * S); this.moon.target.position.set(0, 0, 0); scene.add(this.moon, this.moon.target);
    for (const l of [this.sun, this.moon]) {
      l.castShadow = true; l.shadow.mapSize.set(lowTier ? 1024 : 4096, lowTier ? 1024 : 4096); l.shadow.bias = -.0006; l.shadow.normalBias = .02; l.shadow.radius = 4;
      Object.assign(l.shadow.camera, { left: -22 * S, right: 22 * S, top: 20 * S, bottom: -14 * S, near: 10, far: 90 * S }); l.shadow.camera.updateProjectionMatrix();
    }
    this.sun.castShadow = false; // 夜が基本。夕方は影を月から借りる
    this.sky = new THREE.HemisphereLight(0xdfe9ff, 0x7a5a3c, .2); this.group.add(this.sky);
    this.nightLight = new THREE.PointLight(0xffb060, 110 * S * S, 40 * S, 2); this.nightLight.position.set(-18.6, 2.6, 12); this.nightLight.castShadow = !lowTier; this.nightLight.shadow.mapSize.set(1024, 1024); this.nightLight.shadow.bias = -.002; this.group.add(this.nightLight);
    this.fill = new THREE.PointLight(0xffe2c0, 10 * S * S, 40 * S, 2); this.fill.position.set(4, 9, 6); this.group.add(this.fill);
    this.applyPreset('night');

    this.points = {
      heroStart: new THREE.Vector3(12.5, deskTop, -7.5).multiplyScalar(S),
      bear: new THREE.Vector3(3.6, 0, -1.4).multiplyScalar(S),
      award: new THREE.Vector3(-1.2, 0, -10.6).multiplyScalar(S),
      pillow: new THREE.Vector3(-15.5, 5.75, -1.2).multiplyScalar(S),
      robot: this.robot.position.clone().multiplyScalar(S),
      rabbit: this.rabbit.position.clone().multiplyScalar(S),
    };
  }

  /** ラジコンに乗っている間は車の当たり判定を外し、ライトをつける */
  setRiding(on: boolean) {
    const b = this.colliders[this.carColliderIndex];
    if (on) { b.min.set(0, 0, 0); b.max.set(0, 0, 0); } else { this.car.updateMatrixWorld(true); b.setFromObject(this.car); }
    for (const s of this.headlights) s.intensity = on ? 140 * S * S : 0;
    this.headlampMat.emissiveIntensity = on ? 2.5 : 0;
  }
  fragmentWorld(i: number) { return this.fragments[i].getWorldPosition(new THREE.Vector3()); }
  spinWheels(dist: number) { for (const w of this.wheels) w.rotation.y -= dist / 0.42; }

  applyPreset(p: Preset) {
    this.preset = p;
    const night = p === 'night';
    this.sun.intensity = night ? 0 : 3.0; this.moon.intensity = night ? 0.55 : 0.25;
    this.sky.intensity = night ? 0.32 : 0.55; this.nightLight.intensity = night ? 110 * S * S : 0; this.fill.intensity = night ? 16 * S * S : 0;
    this.scene.environmentIntensity = night ? 0.2 : 0.45;
    this.glass.material.color.set(night ? 0x8fa6cc : 0xfff1d2);
    const bg = night ? 0x262838 : 0xf0d7b8;
    this.scene.background = new THREE.Color(bg); this.scene.fog = new THREE.FogExp2(bg, (night ? 0.016 : 0.013) / S);
    this.bulbMat.emissiveIntensity = night ? 2.4 : 0;
  }

  // 着地や押し出しの埃。短命のパーティクル
  private puffs: { pts: THREE.Points; vel: Float32Array; life: number; max: number }[] = [];
  private _puffTex: THREE.Texture | null = null;
  private puffTex() {
    if (this._puffTex) return this._puffTex;
    const c = document.createElement('canvas'); c.width = c.height = 64; const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    this._puffTex = new THREE.CanvasTexture(c); return this._puffTex;
  }
  puff(at: THREE.Vector3, strength: number) {
    const n = Math.round(10 + strength * 26), geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3), v = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.4;
      p[i * 3] = at.x + Math.cos(a) * r * 0.5; p[i * 3 + 1] = at.y + 0.05; p[i * 3 + 2] = at.z + Math.sin(a) * r * 0.5;
      const s = (0.8 + Math.random() * 1.4) * (0.5 + strength);
      v[i * 3] = Math.cos(a) * s; v[i * 3 + 1] = 0.6 + Math.random() * 0.8 * strength; v[i * 3 + 2] = Math.sin(a) * s;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd9c7a8, size: 0.14 + strength * 0.12, map: this.puffTex(), transparent: true, opacity: 0.7, depthWrite: false }));
    this.scene.add(pts); this.puffs.push({ pts, vel: v, life: 0, max: 0.45 + strength * 0.35 });
  }

  update(dt: number, t: number) {
    for (let k = this.puffs.length - 1; k >= 0; k--) {
      const q = this.puffs[k]; q.life += dt;
      const arr = (q.pts.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < q.vel.length / 3; i++) { arr[i * 3] += q.vel[i * 3] * dt; arr[i * 3 + 1] += q.vel[i * 3 + 1] * dt; arr[i * 3 + 2] += q.vel[i * 3 + 2] * dt; q.vel[i * 3 + 1] -= 2.5 * dt; q.vel[i * 3] *= 0.92; q.vel[i * 3 + 2] *= 0.92; }
      (q.pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (q.pts.material as THREE.PointsMaterial).opacity = 0.7 * (1 - q.life / q.max);
      if (q.life >= q.max) { this.scene.remove(q.pts); q.pts.geometry.dispose(); (q.pts.material as THREE.Material).dispose(); this.puffs.splice(k, 1); }
    }
    const pos = this.dustGeo.attributes.position as THREE.BufferAttribute; const a = pos.array as Float32Array;
    for (let i = 0; i < this.dustVel.length; i++) { a[i * 3 + 1] += Math.sin(t * .3 + i) * .002 - .0025 * this.dustVel[i]; if (a[i * 3 + 1] < .05) a[i * 3 + 1] = 9; }
    pos.needsUpdate = true;
    this.bearHead.rotation.y = Math.sin(t * .5) * .08;
    this.robotEyes.emissiveIntensity = 1.2 + Math.max(0, Math.sin(t * 3.7)) * 0.8;
    this.rabbit.rotation.z = Math.sin(t * 0.9) * 0.02;
    for (let i = 0; i < this.fragments.length; i++) if (this.fragments[i].visible) this.fragments[i].position.y = (i === 0 ? 0.03 : 4.52) + 0.04 + Math.sin(t * 2 + i) * 0.03;
    if (this.preset === 'night') this.nightLight.intensity = (110 + Math.sin(t * 7.3) * 3 + Math.sin(t * 2.1) * 2) * S * S;
    void dt;
  }
}
