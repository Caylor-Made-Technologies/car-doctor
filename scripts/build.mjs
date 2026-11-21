// Builds the two generated parts of app/ (both are committed, because app/ is published as-is):
//   app/3d/engine-bay.js   the lazy 3D chunk (three.js tree-shaken in), loaded after first paint
//   app/ui/                caylor-ui styles and the 3D gate, copied from caylor-ui/ (do not edit there)
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

mkdirSync('app/3d', { recursive: true });
mkdirSync('app/ui', { recursive: true });
await build({
  entryPoints: ['src3d/engine-bay.js'], bundle: true, format: 'esm', minify: true, target: 'es2020',
  outfile: 'app/3d/engine-bay.js', legalComments: 'none', logLevel: 'warning',
});
const banner = (f) => `/* Generated from caylor-ui/${f} (caylor-ui ${readFileSync('caylor-ui/VERSION', 'utf8').trim()}). Edit the source, then npm run build. */\n`;
writeFileSync('app/ui/caylor-ui.css', banner('tokens.css + base.css') + readFileSync('caylor-ui/tokens.css', 'utf8') + '\n' + readFileSync('caylor-ui/base.css', 'utf8'));
writeFileSync('app/ui/support.js', banner('three/support.js') + readFileSync('caylor-ui/three/support.js', 'utf8'));
const kb = (f) => (gzipSync(readFileSync(f)).length / 1024).toFixed(1);
console.log(`3D chunk: ${kb('app/3d/engine-bay.js')} KB gzip`);
