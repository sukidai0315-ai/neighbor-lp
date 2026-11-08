import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// 本番モデル（public/models/*.glb）。画像→3D生成したものを gltf-transform で圧縮してある。
// 読み込めない間は仮モデルのまま動くので、ゲームは止まらない。

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const base = `${import.meta.env.BASE_URL}models/`;
// 配信先が .glb を置けないとき（Claude のアーティファクトなど）は拡張子を差し替えられる
const ext = (globalThis as { __TOYROOM_MODEL_EXT?: string }).__TOYROOM_MODEL_EXT ?? '.glb';

export interface LoadedModel { root: THREE.Group; height: number }

/** name.glb を読み、足元を原点、指定の高さに揃えて返す */
export async function loadModel(name: string, targetHeight: number, opts: { faceZ?: number; fitAxis?: 'x' | 'y' | 'z' } = {}): Promise<LoadedModel | null> {
  try {
    const gltf = await loader.loadAsync(`${base}${name}${ext}`);
    const root = gltf.scene;
    root.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true; m.receiveShadow = true;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat && 'roughness' in mat) { mat.roughness = Math.min(1, mat.roughness + 0.05); }
      }
    });
    // 向き: 生成モデルは +z を正面にしているものが多い。faceZ で補正できる
    if (opts.faceZ) root.rotation.y = opts.faceZ;
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const s = targetHeight / size[opts.fitAxis ?? 'y']; // ラジコンはアンテナで背が高いので長さで合わせる
    root.scale.setScalar(s);
    box.setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    root.position.set(-c.x, -box.min.y, -c.z); // 足元を原点に
    const wrap = new THREE.Group(); wrap.add(root);
    return { root: wrap, height: targetHeight };
  } catch (e) {
    console.warn(`model ${name} not loaded`, e);
    return null;
  }
}
