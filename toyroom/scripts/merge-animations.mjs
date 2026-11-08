// 同じリグで作った複数の GLB（1本ずつアニメーションが入っている）を、1つの GLB にまとめる。
// 使い方: node scripts/merge-animations.mjs out.glb base.glb:idle walk.glb:walk jump.glb:jump ...
//   最初の GLB のメッシュと骨をそのまま使い、残りの GLB からはアニメーションだけを骨の名前で移し替える。
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [out, ...inputs] = process.argv.slice(2);
if (!out || inputs.length === 0) { console.error('usage: merge-animations.mjs out.glb a.glb:name b.glb:name ...'); process.exit(1); }

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const parse = s => { const i = s.lastIndexOf(':'); return i < 0 ? [s, s] : [s.slice(0, i), s.slice(i + 1)]; };
const [basePath, baseName] = parse(inputs[0]);
const base = await io.read(basePath);
const baseRoot = base.getRoot();
for (const a of baseRoot.listAnimations()) a.setName(baseName);
const nodeByName = new Map(baseRoot.listNodes().map(n => [n.getName(), n]));

for (const input of inputs.slice(1)) {
  const [path, name] = parse(input);
  const doc = await io.read(path);
  const anims = doc.getRoot().listAnimations();
  if (anims.length === 0) { console.warn(`${path}: アニメーションなし`); continue; }
  const src = anims[0];
  const dst = base.createAnimation(name);
  const buffer = baseRoot.listBuffers()[0];
  let missing = 0;
  for (const ch of src.listChannels()) {
    const target = ch.getTargetNode(); const tn = target && nodeByName.get(target.getName());
    if (!tn) { missing++; continue; }
    const s = ch.getSampler();
    const copyAcc = acc => base.createAccessor(acc.getName()).setType(acc.getType()).setArray(acc.getArray().slice()).setNormalized(acc.getNormalized()).setBuffer(buffer);
    const sampler = base.createAnimationSampler().setInput(copyAcc(s.getInput())).setOutput(copyAcc(s.getOutput())).setInterpolation(s.getInterpolation());
    const channel = base.createAnimationChannel().setTargetNode(tn).setTargetPath(ch.getTargetPath()).setSampler(sampler);
    dst.addSampler(sampler).addChannel(channel);
  }
  console.log(`${name}: ${dst.listChannels().length} channels${missing ? `, ${missing} 骨が見つからず` : ''}`);
}
await io.write(out, base);
console.log(`wrote ${out}: ${baseRoot.listAnimations().map(a => a.getName()).join(', ')}`);
