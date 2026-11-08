// dist-single/index.html から、Claude のアーティファクトに貼れる断片（doctype/html/head/body なし）を作る
// 使い方: npm run build:single && node scripts/artifact-fragment.mjs > ../toyroom-play.html
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../dist-single/index.html', import.meta.url), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? '';
const keep = [...head.matchAll(/<title>[\s\S]*?<\/title>|<link[^>]*fonts\.googleapis[^>]*>|<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi)].map(m => m[0]).join('\n');
// アーティファクトは .glb を配信しないので、モデルは models/*.glb.wasm という名前で置く
const modelExt = `<script>window.__TOYROOM_MODEL_EXT = '.glb.wasm';</script>`;
process.stdout.write(`${modelExt}\n${keep}\n<meta name="claude:viewport-fit-sides" content="cover">\n${body}`);
