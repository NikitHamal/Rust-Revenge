import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Group,
  IcosahedronGeometry,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Unit primitives, scaled via StaticBatch.add / mesh.scale. */
export const G = {
  box: new BoxGeometry(1, 1, 1),
  cyl: new CylinderGeometry(1, 1, 1, 14),
  cyl6: new CylinderGeometry(1, 1, 1, 6),
  sph: new SphereGeometry(1, 14, 10),
  sphLow: new SphereGeometry(1, 8, 6),
  cone: new ConeGeometry(1, 1, 8),
  cone4: new ConeGeometry(1, 1, 4),
  ico: new IcosahedronGeometry(1, 1),
};

const matCache = new Map<string, MeshStandardMaterial>();
export function stdMat(color: number, rough = 0.85, metal = 0.0): MeshStandardMaterial {
  const key = `${color}|${rough}|${metal}`;
  let m = matCache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    matCache.set(key, m);
  }
  return m;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();

/** Collects many static primitives and merges them per material into very few draw calls. */
export class StaticBatch {
  private map = new Map<Material, BufferGeometry[]>();

  add(
    geo: BufferGeometry,
    mat: Material,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
    rx = 0,
    ry = 0,
    rz = 0,
  ) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    const arr = this.map.get(mat);
    if (arr) arr.push(g);
    else this.map.set(mat, [g]);
    return this;
  }

  build(cast = true, receive = true): Group {
    const grp = new Group();
    this.map.forEach((geos, mat) => {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) return;
      const mesh = new Mesh(merged, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      grp.add(mesh);
    });
    this.map.clear();
    return grp;
  }
}

/* ------------------------------------------------------------------ */
/* Procedural canvas textures                                          */
/* ------------------------------------------------------------------ */
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g, w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = RepeatWrapping;
  }
  t.anisotropy = 4;
  return t;
}

export function rustTexture() {
  const r = mulberry32(7);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b8794f';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = r() * w;
      const y = r() * h;
      const rad = 4 + r() * 28;
      const hue = r();
      g.fillStyle = hue < 0.4 ? 'rgba(110,52,24,0.22)' : hue < 0.7 ? 'rgba(210,140,80,0.2)' : 'rgba(70,60,55,0.16)';
      g.beginPath();
      g.arc(x, y, rad, 0, 7);
      g.fill();
    }
    g.strokeStyle = 'rgba(60,30,15,0.28)';
    for (let i = 0; i < 30; i++) {
      const x = r() * w;
      g.lineWidth = 1 + r() * 2;
      g.beginPath();
      g.moveTo(x, r() * h);
      g.lineTo(x + (r() - 0.5) * 6, r() * h);
      g.stroke();
    }
    g.strokeStyle = 'rgba(40,20,10,0.5)';
    g.lineWidth = 2;
    for (let y = 0; y < h; y += 64) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    for (let i = 0; i < 90; i++) {
      g.fillStyle = 'rgba(30,15,8,0.55)';
      g.fillRect(r() * w, r() * h, 2, 2);
    }
  });
}

export function paintTexture() {
  const r = mulberry32(11);
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#e6e6e6';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 80; i++) {
      g.fillStyle = `rgba(0,0,0,${r() * 0.04})`;
      g.fillRect(r() * w, r() * h, 20 + r() * 40, 2 + r() * 6);
    }
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
  });
}

export function plankTexture(dark = false) {
  const r = mulberry32(dark ? 3 : 5);
  return canvasTex(256, 256, (g, w, h) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const l = (dark ? 28 : 40) + r() * 12;
      g.fillStyle = `hsl(${dark ? 22 : 28}, ${dark ? 35 : 45}%, ${l}%)`;
      g.fillRect(0, (i * h) / n, w, h / n);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, (i * h) / n, w, 2);
      for (let k = 0; k < 14; k++) {
        g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.06})`;
        g.fillRect(r() * w, (i * h) / n + r() * (h / n), 10 + r() * 60, 1);
      }
      const jx = r() * w;
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(jx, (i * h) / n, 2, h / n);
    }
  });
}

export function signTexture(lines: string[], bg = '#d94f8a', fg = '#fff') {
  return canvasTex(
    512,
    192,
    (g, w, h) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#fff';
      g.lineWidth = 8;
      g.strokeRect(10, 10, w - 20, h - 20);
      g.fillStyle = fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const fs = lines.length > 1 ? 56 : 70;
      g.font = `900 ${fs}px Arial Black, Impact, sans-serif`;
      lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (fs + 6)));
    },
    false,
  );
}
