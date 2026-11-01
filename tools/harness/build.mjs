// Headless logic harness: bundles the game with a stub WebGLRenderer + stub DOM, so the whole
// simulation (intro, waves, sieges, endings, save/load) can run in plain Node with no GPU.
//   node tools/harness/build.mjs logic    && node tools/harness/.out/logic.mjs
//   node tools/harness/build.mjs balance  && node tools/harness/.out/balance.mjs
import path from 'node:path';
import esbuild from 'esbuild';

const root = path.resolve(import.meta.dirname, '../..');
const here = import.meta.dirname;
const which = process.argv[2] ?? 'logic';
const realThree = path.join(root, 'node_modules/three/build/three.module.js');

await esbuild.build({
  entryPoints: [path.join(here, `${which}.ts`)],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(here, `.out/${which}.mjs`),
  logLevel: 'error',
  nodePaths: [path.join(root, 'node_modules')],
  plugins: [
    {
      name: 'shim-three',
      setup(b) {
        b.onResolve({ filter: /^three$/ }, (a) => (a.importer.includes('shim-three') ? { path: realThree } : { path: path.join(here, 'shim-three.ts') }));
        b.onResolve({ filter: /^three-real$/ }, () => ({ path: realThree }));
      },
    },
  ],
  banner: {
    js: `
const ctx2d = new Proxy({}, { get: (t, k) => k === 'createImageData' ? (w,h)=>({data:new Uint8ClampedArray(w*h*4)}) : k==='getImageData'?(...a)=>({data:new Uint8ClampedArray(4)}): (()=>{}), set: () => true });
class FakeEl { style={}; children=[]; clientWidth=1280; clientHeight=720; width=0; height=0; className=''; textContent='';
  appendChild(c){this.children.push(c);return c;} remove(){} getContext(){return ctx2d;} addEventListener(){} removeEventListener(){} getBoundingClientRect(){return {left:0,top:0,width:1280,height:720}} }
globalThis.FakeEl = FakeEl;
globalThis.document = { createElement: () => new FakeEl() };
globalThis.window = { devicePixelRatio: 1, addEventListener(){}, removeEventListener(){}, setInterval: ()=>0, innerWidth:1280, innerHeight:720 };
globalThis.ResizeObserver = class { observe(){} disconnect(){} };
const store = {}; globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k,v) => { store[k]=v; } };
Object.defineProperty(globalThis, 'navigator', { value: { maxTouchPoints: 0 }, configurable: true });
`,
  },
});
console.log('built', which);
