import * as THREE from 'three';

// public/textures 以下のスキャン素材（Poly Haven, CC0）を読む。
// diff=色、nor=法線(OpenGL)、arm=R:AO G:粗さ B:金属 の3枚組。

const loader = new THREE.TextureLoader();
const base = `${import.meta.env.BASE_URL}textures/`;

export interface Scanned { map: THREE.Texture; normalMap: THREE.Texture; aoMap: THREE.Texture; roughnessMap: THREE.Texture }

export function scanned(id: string, { repeat = [1, 1] as [number, number], aniso = 8 } = {}): Scanned {
  const load = (name: string, srgb = false) => {
    const t = loader.load(`${base}${id}/${name}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const arm = load('arm');
  arm.channel = 0; // aoMap は既定で2つ目のUVを見るので、1つ目に向ける
  return { map: load('diff', true), normalMap: load('nor'), aoMap: arm, roughnessMap: arm };
}
