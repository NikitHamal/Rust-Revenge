import { CanvasTexture, ClampToEdgeWrapping, RepeatWrapping, SRGBColorSpace } from 'three';
import { mulberry32 } from './utils';

/* ------------------------------------------------------------------ */
/* Tileable value-noise helpers                                        */
/* ------------------------------------------------------------------ */
function hash2(x: number, y: number, s: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vn(x: number, y: number, px: number, py: number, s: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const m = (a: number, p: number) => ((a % p) + p) % p;
  const a = hash2(m(xi, px), m(yi, py), s);
  const b = hash2(m(xi + 1, px), m(yi, py), s);
  const c = hash2(m(xi, px), m(yi + 1, py), s);
  const d = hash2(m(xi + 1, px), m(yi + 1, py), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** tileable fbm; u,v in [0,1); fx,fy = base lattice frequency (integers) */
export function fbm2(u: number, v: number, fx: number, fy: number, oct: number, s: number) {
  let a = 0.5;
  let sum = 0;
  let norm = 0;
  let px = fx;
  let py = fy;
  for (let i = 0; i < oct; i++) {
    sum += a * vn(u * px, v * py, px, py, s + i * 31);
    norm += a;
    a *= 0.5;
    px *= 2;
    py *= 2;
  }
  return sum / norm;
}
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

type Painter = (u: number, v: number, out: number[]) => void;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')!, w, h };
}
function paintPixels(w: number, h: number, fn: Painter) {
  const { c, g } = canvas(w, h);
  const img = g.createImageData(w, h);
  const o = [0, 0, 0, 1];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      o[3] = 1;
      fn(i / w, j / h, o);
      const k = (j * w + i) * 4;
      img.data[k] = Math.max(0, Math.min(255, o[0] * 255));
      img.data[k + 1] = Math.max(0, Math.min(255, o[1] * 255));
      img.data[k + 2] = Math.max(0, Math.min(255, o[2] * 255));
      img.data[k + 3] = Math.max(0, Math.min(255, o[3] * 255));
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
function tex(c: HTMLCanvasElement, repeat = true, aniso = 8) {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  t.anisotropy = aniso;
  return t;
}
const cache = new Map<string, CanvasTexture>();
function cached(key: string, make: () => CanvasTexture) {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}
const hexRGB = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

/* ------------------------------------------------------------------ */
/* Ship / props                                                        */
/* ------------------------------------------------------------------ */
export function rustTexture() {
  return cached('rust', () => {
    const W = 512;
    const c = paintPixels(W, W, (u, v, o) => {
      const n1 = fbm2(u, v, 4, 4, 5, 1);
      const n2 = fbm2(u, v, 12, 12, 4, 2);
      const streak = fbm2(u, v, 28, 3, 3, 3);
      const paintN = fbm2(u, v, 5, 5, 5, 5);
      const rustA = sstep(0.4, 0.62, n1 * 0.7 + streak * 0.45 + n2 * 0.12 - 0.12);
      // base steel
      let r = 0.3 + n2 * 0.1;
      let g = 0.32 + n2 * 0.1;
      let b = 0.34 + n2 * 0.1;
      // paint remnants (faded teal)
      const paint = sstep(0.5, 0.58, paintN) * (1 - rustA * 0.7);
      r = mix(r, 0.2, paint);
      g = mix(g, 0.36, paint);
      b = mix(b, 0.4, paint);
      // rust
      const rr = mix(0.28, 0.72, n2);
      const rg = mix(0.11, 0.33, n2);
      const rb = mix(0.05, 0.13, n2);
      r = mix(r, rr, rustA);
      g = mix(g, rg, rustA);
      b = mix(b, rb, rustA);
      // plate seams
      const sy = Math.abs(((v * 4) % 1) - 0.5);
      const sx = Math.abs(((u * 2) % 1) - 0.5);
      const seam = Math.max(sstep(0.485, 0.5, sy), sstep(0.488, 0.5, sx));
      r *= 1 - seam * 0.6;
      g *= 1 - seam * 0.6;
      b *= 1 - seam * 0.6;
      const speck = hash2((u * W) | 0, (v * W) | 0, 9) > 0.992 ? 0.5 : 1;
      o[0] = r * speck;
      o[1] = g * speck;
      o[2] = b * speck;
    });
    const g = c.getContext('2d')!;
    const r = mulberry32(21);
    // rivets along seams
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 32; i++) {
        const y = ((row + 0.5) / 4) * W + (r() > 0.5 ? 5 : -5);
        const x = (i / 32) * W + 8;
        const gr = g.createRadialGradient(x - 1, y - 1, 0.5, x, y, 4);
        gr.addColorStop(0, 'rgba(210,150,100,0.9)');
        gr.addColorStop(1, 'rgba(40,18,8,0.8)');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, 3.4, 0, 7);
        g.fill();
      }
    }
    return tex(c);
  });
}

export function paintTexture() {
  return cached('paint', () => {
    const c = paintPixels(256, 256, (u, v, o) => {
      const n = fbm2(u, v, 6, 6, 4, 7);
      const k = 0.88 + n * 0.1;
      const line = Math.abs(((v * 4) % 1) - 0.5) > 0.495 ? 0.82 : 1;
      o[0] = k * line;
      o[1] = k * line;
      o[2] = (k + 0.01) * line;
    });
    return tex(c);
  });
}

export function plankTexture(dark = false) {
  return cached(`plank${dark}`, () => {
    const W = 512;
    const N = 8;
    const rnd = mulberry32(dark ? 3 : 5);
    const base: number[][] = [];
    for (let i = 0; i < N; i++) {
      const l = 0.78 + rnd() * 0.4;
      base.push(dark ? [0.34 * l, 0.22 * l, 0.14 * l] : [0.58 * l, 0.42 * l, 0.26 * l]);
    }
    const jointU = Array.from({ length: N }, () => rnd());
    const c = paintPixels(W, W, (u, v, o) => {
      const idx = Math.min(N - 1, Math.floor(v * N));
      const loc = v * N - idx;
      const grain = fbm2(u, v, 4, 64, 4, 11 + idx);
      const fine = fbm2(u, v, 16, 160, 2, 17);
      const weather = fbm2(u, v, 5, 5, 4, 23);
      const k = 0.62 + grain * 0.7 + (fine - 0.5) * 0.25;
      const bc = base[idx];
      let r = bc[0] * k;
      let g = bc[1] * k;
      let b = bc[2] * k;
      const gray = sstep(0.5, 0.75, weather) * 0.5;
      r = mix(r, 0.5 * k, gray);
      g = mix(g, 0.48 * k, gray);
      b = mix(b, 0.45 * k, gray);
      const gap = sstep(0.05, 0.0, loc) + sstep(0.95, 1.0, loc);
      const jd = Math.abs(u - jointU[idx]);
      const joint = sstep(0.006, 0.0, Math.min(jd, 1 - jd));
      const dk = 1 - Math.min(1, gap * 0.85 + joint * 0.8);
      o[0] = r * dk;
      o[1] = g * dk;
      o[2] = b * dk;
    });
    const g = c.getContext('2d')!;
    const r2 = mulberry32(99);
    for (let i = 0; i < 7; i++) {
      const x = r2() * W;
      const y = ((Math.floor(r2() * N) + 0.5) / N) * W;
      const gr = g.createRadialGradient(x, y, 1, x, y, 11);
      gr.addColorStop(0, 'rgba(25,14,6,0.85)');
      gr.addColorStop(0.5, 'rgba(60,35,15,0.35)');
      gr.addColorStop(1, 'rgba(60,35,15,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(x, y, 14, 7, 0, 0, 7);
      g.fill();
    }
    for (let i = 0; i < N; i++) for (let k = 0; k < 2; k++) {
      g.fillStyle = 'rgba(20,20,22,0.8)';
      g.beginPath();
      g.arc(k === 0 ? 14 : W - 14, ((i + 0.5) / N) * W, 2.2, 0, 7);
      g.fill();
    }
    return tex(c);
  });
}

export function signTexture(lines: string[], bg = '#d94f8a', fg = '#fff') {
  const { c, g, w, h } = canvas(512, 192);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  // weathered wood-ish noise
  const r = mulberry32(lines.join('').length + 5);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(0,0,0,${r() * 0.06})`;
    g.fillRect(r() * w, r() * h, 30 + r() * 80, 1 + r() * 2);
  }
  g.strokeStyle = '#fff';
  g.lineWidth = 8;
  g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const fs = lines.length > 1 ? 56 : 70;
  g.font = `900 ${fs}px Arial Black, Impact, sans-serif`;
  lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (fs + 6)));
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(30,20,10,${r() * 0.35})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
  }
  return tex(c, false);
}

/* ------------------------------------------------------------------ */
/* Foliage cards (alpha-tested)                                        */
/* ------------------------------------------------------------------ */
export function pineCard(autumn = false) {
  return cached(`pine${autumn}`, () => {
    const { c, g, w, h } = canvas(256, 256);
    const r = mulberry32(31);
    g.clearRect(0, 0, w, h);
    // twigs radiating from bottom centre, needles along each
    const twigs = 11;
    for (let t = 0; t < twigs; t++) {
      const a = -Math.PI / 2 + (t / (twigs - 1) - 0.5) * 1.9;
      const len = 150 + r() * 80;
      const ox = w / 2;
      const oy = h - 6;
      g.strokeStyle = '#3b2a18';
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(ox, oy);
      g.lineTo(ox + Math.cos(a) * len, oy + Math.sin(a) * len);
      g.stroke();
      for (let k = 6; k < len; k += 2.4) {
        const px = ox + Math.cos(a) * k;
        const py = oy + Math.sin(a) * k;
        for (const side of [-1, 1]) {
          const na = a + side * (0.9 + r() * 0.35);
          const nl = (14 + r() * 12) * (1 - (k / len) * 0.55);
          const shade = 0.55 + r() * 0.45;
          g.strokeStyle = autumn
            ? `rgb(${Math.round(205 * shade)},${Math.round(150 * shade)},${Math.round(38 * shade)})`
            : `rgb(${Math.round(36 * shade)},${Math.round(92 * shade)},${Math.round(44 * shade)})`;
          g.lineWidth = 1.4;
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl);
          g.stroke();
        }
      }
    }
    return tex(c, false);
  });
}

export function broadCard(autumn = false) {
  return cached(`broad${autumn}`, () => {
    const { c, g, w, h } = canvas(256, 256);
    const r = mulberry32(autumn ? 61 : 41);
    g.clearRect(0, 0, w, h);
    const cols = autumn ? ['#8a4a14', '#a8651b', '#6e3a10', '#b98a2a'] : ['#2f6a22', '#3f8a2a', '#27561d', '#52972f', '#356f25'];
    for (let i = 0; i < 150; i++) {
      const x = 20 + r() * (w - 40);
      const y = 20 + r() * (h - 40);
      const d = Math.hypot(x - w / 2, y - h / 2) / (w / 2);
      if (d > 1) continue;
      g.save();
      g.translate(x, y);
      g.rotate(r() * 6.28);
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      g.beginPath();
      g.ellipse(0, 0, 12 + r() * 9, 6 + r() * 4, 0, 0, 7);
      g.fill();
      g.strokeStyle = 'rgba(15,40,10,0.45)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(-10, 0);
      g.lineTo(12, 0);
      g.stroke();
      g.restore();
    }
    return tex(c, false);
  });
}

export function grassCard() {
  return cached('grass', () => {
    const { c, g, w, h } = canvas(128, 128);
    const r = mulberry32(77);
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 34; i++) {
      const x0 = 8 + r() * (w - 16);
      const hh = 50 + r() * 74;
      const lean = (r() - 0.5) * 34;
      const wd = 2.2 + r() * 2.6;
      const grad = g.createLinearGradient(0, h, 0, h - hh);
      const dry = r() < 0.25;
      grad.addColorStop(0, dry ? '#4a4a1c' : '#1f3a12');
      grad.addColorStop(0.6, dry ? '#a79a46' : '#58942a');
      grad.addColorStop(1, dry ? '#cdbf68' : '#9bc944');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x0 - wd, h);
      g.quadraticCurveTo(x0 + lean * 0.3 - wd * 0.5, h - hh * 0.55, x0 + lean, h - hh);
      g.quadraticCurveTo(x0 + lean * 0.3 + wd * 0.5, h - hh * 0.55, x0 + wd, h);
      g.fill();
    }
    return tex(c, false);
  });
}

export function barkTexture() {
  return cached('bark', () => {
    const c = paintPixels(128, 256, (u, v, o) => {
      const n = fbm2(u, v, 6, 3, 4, 13);
      const crack = sstep(0.55, 0.3, Math.abs(fbm2(u, v, 5, 2, 3, 14) - 0.5) * 2);
      const k = 0.55 + n * 0.8 - crack * 0.35;
      o[0] = 0.36 * k;
      o[1] = 0.26 * k;
      o[2] = 0.17 * k;
    });
    return tex(c);
  });
}

export function groundDecal(kind: 'blood' | 'acid' | 'scorch') {
  return cached(`decal${kind}`, () => {
    const { c, g, w, h } = canvas(128, 128);
    const r = mulberry32(kind.length * 17);
    const col = kind === 'blood' ? '90,10,10' : kind === 'acid' ? '110,220,40' : '15,12,10';
    for (let i = 0; i < 38; i++) {
      const a = r() * 6.28;
      const d = r() * 40 * r();
      const x = w / 2 + Math.cos(a) * d;
      const y = h / 2 + Math.sin(a) * d;
      const rad = 3 + r() * 16 * (1 - d / 50);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${col},0.85)`);
      gr.addColorStop(0.7, `rgba(${col},0.55)`);
      gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, rad, 0, 7);
      g.fill();
    }
    return tex(c, false);
  });
}

/* ------------------------------------------------------------------ */
/* Characters                                                          */
/* ------------------------------------------------------------------ */
export function skinTexture(hex: number, zombie = false) {
  return cached(`skin${hex}${zombie}`, () => {
    const [br, bg, bb] = hexRGB(hex);
    const c = paintPixels(128, 128, (u, v, o) => {
      const n = fbm2(u, v, 6, 6, 4, 3);
      const pores = hash2((u * 128) | 0, (v * 128) | 0, 5) > 0.9 ? 0.96 : 1;
      let k = (0.9 + n * 0.22) * pores;
      let r = br * k;
      let g = bg * k;
      let b = bb * k;
      const blush = sstep(0.55, 0.8, fbm2(u, v, 3, 3, 3, 8));
      r += blush * 0.06;
      g -= blush * 0.015;
      if (zombie) {
        const veins = sstep(0.06, 0.0, Math.abs(fbm2(u, v, 5, 5, 4, 12) - 0.5));
        const bruise = sstep(0.62, 0.78, fbm2(u, v, 3, 3, 3, 15));
        const rot = sstep(0.58, 0.75, fbm2(u, v, 4, 4, 3, 18));
        r = mix(r, 0.3, veins * 0.6);
        g = mix(g, 0.38, veins * 0.6);
        b = mix(b, 0.42, veins * 0.6);
        r = mix(r, 0.35, bruise * 0.6);
        g = mix(g, 0.25, bruise * 0.6);
        b = mix(b, 0.42, bruise * 0.6);
        r = mix(r, 0.28, rot * 0.5);
        g = mix(g, 0.22, rot * 0.5);
        b = mix(b, 0.1, rot * 0.5);
        const wound = sstep(0.8, 0.9, fbm2(u, v, 4, 4, 3, 21));
        r = mix(r, 0.42, wound);
        g = mix(g, 0.04, wound);
        b = mix(b, 0.05, wound);
        k = 1;
      }
      o[0] = r;
      o[1] = g;
      o[2] = b;
    });
    return tex(c);
  });
}

export function fabricTexture(hex: number, kind: 'knit' | 'denim' | 'plain' | 'torn' = 'plain', hex2?: number) {
  return cached(`fab${hex}${kind}${hex2 ?? 0}`, () => {
    const [br, bg, bb] = hexRGB(hex);
    const [cr, cg, cb] = hexRGB(hex2 ?? hex);
    const W = 256;
    const c = paintPixels(W, W, (u, v, o) => {
      const n = fbm2(u, v, 5, 5, 4, 4);
      let k = 0.82 + n * 0.36;
      if (kind === 'knit') k *= 0.9 + 0.1 * Math.sin(u * W * 0.9) * Math.sin(v * W * 0.45);
      else if (kind === 'denim') k *= 0.88 + 0.12 * (Math.sin(u * W * 1.6) > 0 ? 1 : 0.4) * (0.7 + 0.3 * Math.sin(v * W * 1.1));
      else k *= 0.94 + 0.06 * Math.sin(u * W * 1.2) * Math.sin(v * W * 1.2);
      // wrinkles / folds
      const wr = sstep(0.04, 0.0, Math.abs(fbm2(u, v, 3, 6, 3, 9) - 0.5));
      k *= 1 - wr * 0.25;
      let r = br * k;
      let g = bg * k;
      let b = bb * k;
      if (kind === 'torn') {
        const stripe = sstep(0.45, 0.55, fbm2(u, v, 2, 8, 2, 33));
        r = mix(r, cr * k, stripe);
        g = mix(g, cg * k, stripe);
        b = mix(b, cb * k, stripe);
        const dirt = sstep(0.5, 0.75, fbm2(u, v, 4, 4, 4, 35));
        r *= 1 - dirt * 0.55;
        g *= 1 - dirt * 0.55;
        b *= 1 - dirt * 0.55;
        const blood = sstep(0.68, 0.8, fbm2(u, v, 3, 3, 4, 37));
        r = mix(r, 0.33, blood);
        g = mix(g, 0.03, blood);
        b = mix(b, 0.03, blood);
        const hole = sstep(0.76, 0.8, fbm2(u, v, 5, 5, 3, 39));
        r = mix(r, 0.26, hole * 0.8);
        g = mix(g, 0.15, hole * 0.8);
        b = mix(b, 0.12, hole * 0.8);
      }
      o[0] = r;
      o[1] = g;
      o[2] = b;
    });
    return tex(c);
  });
}

/** Greyscale-ish zombie cloth (tinted per-instance by instanceColor). */
export function zombieClothTexture() {
  return fabricTexture(0xd8d4cc, 'torn', 0x9a968c);
}
export function zombieSkinTexture() {
  return skinTexture(0xe6eadc, true);
}

export type FaceKind = 'bruno' | 'chloe' | 'karen' | 'zombie';
/** Head loft UV: u=0.5 front centre, v=0 chin → 1 crown. */
export function faceTexture(kind: FaceKind) {
  return cached(`face${kind}`, () => {
    const W = 512;
    const skin: Record<FaceKind, number> = { bruno: 0xe2a487, chloe: 0xf6cdb0, karen: 0xeab894, zombie: 0xe3e8d6 };
    const base = skinTexture(skin[kind], kind === 'zombie').image as HTMLCanvasElement;
    const { c, g } = canvas(W, W);
    g.drawImage(base, 0, 0, W, W);
    const X = (dx: number) => W / 2 + dx * W; // dx in u units
    const Y = (v: number) => (1 - v) * W;
    const eyeY = Y(0.555);
    const rnd = mulberry32(kind.length * 13);
    // soft cheek / nose shading
    const blob = (x: number, y: number, rx: number, ry: number, rgba: string) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, rx);
      gr.addColorStop(0, rgba);
      gr.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)'));
      g.save();
      g.translate(x, y);
      g.scale(1, ry / rx);
      g.translate(-x, -y);
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, rx, 0, 7);
      g.fill();
      g.restore();
    };
    const eye = (side: number) => {
      const x = X(side * 0.072);
      if (kind === 'zombie') {
        blob(x, eyeY, 22, 15, 'rgba(30,8,10,0.85)');
        g.fillStyle = '#e8f0a0';
        g.beginPath();
        g.ellipse(x, eyeY, 8, 5.5, 0, 0, 7);
        g.fill();
        g.fillStyle = '#7a0d0d';
        g.beginPath();
        g.arc(x, eyeY, 3.2, 0, 7);
        g.fill();
        return;
      }
      blob(x, eyeY - 6, 24, 14, 'rgba(120,70,60,0.22)');
      g.fillStyle = '#f4f1ec';
      g.beginPath();
      g.ellipse(x, eyeY, 12, 7, 0, 0, 7);
      g.fill();
      const iris = kind === 'chloe' ? '#3e7fb0' : kind === 'karen' ? '#4a6a3a' : '#4a3020';
      g.fillStyle = iris;
      g.beginPath();
      g.arc(x, eyeY, 6, 0, 7);
      g.fill();
      g.fillStyle = '#080808';
      g.beginPath();
      g.arc(x, eyeY, 2.8, 0, 7);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      g.arc(x + 2, eyeY - 2, 1.4, 0, 7);
      g.fill();
      // lids / lashes
      g.strokeStyle = kind === 'chloe' ? '#1a1010' : 'rgba(60,35,25,0.8)';
      g.lineWidth = kind === 'chloe' ? 3 : 2;
      g.beginPath();
      g.ellipse(x, eyeY, 12.5, 7.5, 0, Math.PI * 1.05, Math.PI * 1.95);
      g.stroke();
      if (kind === 'chloe') {
        g.strokeStyle = '#5a2a6a';
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(x, eyeY - 3, 13, 8, 0, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      }
    };
    eye(-1);
    eye(1);
    // brows
    const brow = (side: number) => {
      const x = X(side * 0.075);
      const y = Y(0.655);
      g.strokeStyle = kind === 'bruno' ? '#241710' : kind === 'chloe' ? '#b8963a' : kind === 'karen' ? '#8a8a8a' : '#2a3020';
      g.lineWidth = kind === 'bruno' ? 8 : 4.5;
      g.lineCap = 'round';
      g.beginPath();
      const tilt = kind === 'bruno' ? 6 : kind === 'zombie' ? -4 : 2;
      g.moveTo(x - side * 16, y + tilt * side * -0.5 + 3);
      g.quadraticCurveTo(x, y - 5, x + side * 15, y + tilt * 0.5 + (kind === 'bruno' ? -4 : 3));
      g.stroke();
    };
    brow(-1);
    brow(1);
    // mouth
    const my = Y(0.265);
    if (kind === 'zombie') {
      g.fillStyle = '#240606';
      g.beginPath();
      g.ellipse(X(0), my, 20, 12, 0, 0, 7);
      g.fill();
      g.fillStyle = '#d7d0a0';
      for (let i = -3; i <= 3; i++) g.fillRect(X(0) + i * 5 - 2, my - 11, 4, 6 + rnd() * 4);
      g.fillStyle = 'rgba(110,8,8,0.85)';
      g.beginPath();
      g.ellipse(X(0), my + 14, 15, 24, 0, 0, 7);
      g.fill();
    } else if (kind === 'bruno') {
      // grumpy flat/downturned mouth + stubble
      g.strokeStyle = '#6a2a24';
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(X(-0.05), my + 4);
      g.quadraticCurveTo(X(0), my - 4, X(0.05), my + 4);
      g.stroke();
      for (let i = 0; i < 700; i++) {
        const x = X((rnd() - 0.5) * 0.3);
        const y = Y(0.08 + rnd() * 0.3);
        g.fillStyle = `rgba(40,28,22,${0.2 + rnd() * 0.3})`;
        g.fillRect(x, y, 1.5, 2);
      }
    } else {
      g.fillStyle = kind === 'chloe' ? '#e04a6a' : '#b8203a';
      g.beginPath();
      g.ellipse(X(0), my, 17, 6.5, 0, 0, 7);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.ellipse(X(0) - 4, my - 2, 6, 2, 0, 0, 7);
      g.fill();
      g.strokeStyle = 'rgba(80,10,20,0.6)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(X(-0.032), my);
      g.lineTo(X(0.032), my);
      g.stroke();
      blob(X(-0.1), Y(0.37), 28, 18, 'rgba(255,100,110,0.2)');
      blob(X(0.1), Y(0.37), 28, 18, 'rgba(255,100,110,0.2)');
    }
    // nostrils
    g.fillStyle = 'rgba(60,20,15,0.6)';
    g.beginPath();
    g.ellipse(X(-0.016), Y(0.385), 3.5, 2.4, 0, 0, 7);
    g.ellipse(X(0.016), Y(0.385), 3.5, 2.4, 0, 0, 7);
    g.fill();
    if (kind === 'zombie') {
      for (let i = 0; i < 6; i++) {
        g.strokeStyle = 'rgba(120,10,10,0.7)';
        g.lineWidth = 2;
        g.beginPath();
        const x = X((rnd() - 0.5) * 0.25);
        const y = Y(0.3 + rnd() * 0.4);
        g.moveTo(x, y);
        g.lineTo(x + (rnd() - 0.5) * 30, y + 10 + rnd() * 24);
        g.stroke();
      }
    }
    return tex(c, true, 4);
  });
}

export function hairTexture(hex: number) {
  return cached(`hair${hex}`, () => {
    const [br, bg, bb] = hexRGB(hex);
    const c = paintPixels(128, 128, (u, v, o) => {
      const s = fbm2(u, v, 3, 48, 3, 9);
      const k = 0.55 + s * 0.9;
      const hl = sstep(0.62, 0.75, fbm2(u, v, 2, 8, 2, 4)) * 0.25;
      o[0] = Math.min(1, br * k + hl);
      o[1] = Math.min(1, bg * k + hl);
      o[2] = Math.min(1, bb * k + hl);
    });
    return tex(c);
  });
}
