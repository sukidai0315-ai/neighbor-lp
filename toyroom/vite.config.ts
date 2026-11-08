import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE=1 のときは1枚のHTMLに全部を埋め込む（Claude のアーティファクトや単体配布用）
const single = !!process.env.SINGLE;

export default defineConfig({
  base: './',
  plugins: single ? [viteSingleFile()] : [],
  build: {
    target: 'es2020',
    outDir: single ? 'dist-single' : 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
  server: { port: 5173 },
});
