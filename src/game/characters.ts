import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fabricTexture, faceTexture, hairTexture, skinTexture, zombieClothTexture, zombieSkinTexture } from './textures';

/* ------------------------------------------------------------------ */
/* Lofted anatomical geometry                                          */
/* ------------------------------------------------------------------ */
interface Ring {
  y: number;
  rx: number;
  rz: number;
  ox?: number;
  oz?: number;
}

/** Smooth swept surface through elliptical rings. u=0.5 faces +Z, v = height fraction (by y). */
export function loft(rings: Ring[], seg = 22): BufferGeometry {
  const n = rings.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const ys = rings.map((r) => r.y);
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  const asc = rings[n - 1].y > rings[0].y;
  for (let j = 0; j < n; j++) {
    const r = rings[j];
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2 - Math.PI;
      pos.push((r.ox ?? 0) + Math.sin(th) * r.rx, r.y, (r.oz ?? 0) + Math.cos(th) * r.rz);
      uv.push(i / seg, (r.y - ymin) / Math.max(1e-5, ymax - ymin));
    }
  }
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + 1;
      const c = a + seg + 1;
      const d = c + 1;
      if (asc) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  for (let j = 0; j < n; j++) {
    const a = j * (seg + 1);
    const b = a + seg;
    const x = nrm.getX(a) + nrm.getX(b);
    const y = nrm.getY(a) + nrm.getY(b);
    const z = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(a, x / l, y / l, z / l);
    nrm.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}

/** limb hanging down -Y from origin; r0 at top, r1 at bottom, optional muscle bulge */
function limb(r0: number, r1: number, len: number, bulge = 0, flat = 1, seg = 14): BufferGeometry {
  const rings: Ring[] = [{ y: 0.004, rx: r0 * 0.25, rz: r0 * 0.25 * flat }];
  const N = 7;
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    const r = r0 + (r1 - r0) * t + bulge * Math.sin(Math.PI * t);
    rings.push({ y: -t * len, rx: r, rz: r * flat });
  }
  rings.push({ y: -len - 0.004, rx: r1 * 0.3, rz: r1 * 0.3 * flat });
  return loft(rings, seg);
}

/** Resample a body table between y0..y1 (linear interpolation), optionally inflated. */
function slice(table: Ring[], y0: number, y1: number, grow = 0, n = 7, capEnds = true): Ring[] {
  const at = (y: number): Ring => {
    for (let i = 0; i < table.length - 1; i++) {
      const a = table[i];
      const b = table[i + 1];
      if (y >= a.y && y <= b.y) {
        const t = (y - a.y) / (b.y - a.y || 1);
        const L = (p: number, q: number) => p + (q - p) * t;
        return { y, rx: L(a.rx, b.rx), rz: L(a.rz, b.rz), ox: L(a.ox ?? 0, b.ox ?? 0), oz: L(a.oz ?? 0, b.oz ?? 0) };
      }
    }
    const e = y < table[0].y ? table[0] : table[table.length - 1];
    return { ...e, y };
  };
  const out: Ring[] = [];
  for (let k = 0; k < n; k++) {
    const r = at(y0 + ((y1 - y0) * k) / (n - 1));
    out.push({ ...r, rx: r.rx + grow, rz: r.rz + grow });
  }
  if (capEnds) {
    const f = out[0];
    const l = out[out.length - 1];
    out.unshift({ ...f, rx: f.rx * 0.9, rz: f.rz * 0.9, y: f.y - 0.002 });
    out.unshift({ ...f, rx: 0.01, rz: 0.01, y: f.y - 0.004 });
    out.push({ ...l, rx: l.rx * 0.5, rz: l.rz * 0.5, y: l.y + 0.004 });
    out.push({ ...l, rx: 0.01, rz: 0.01, y: l.y + 0.006 });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Body tables (y, half-width, half-depth, forward offset)             */
/* ------------------------------------------------------------------ */
const TORSO_FAT: Ring[] = [
  { y: 0.72, rx: 0.22, rz: 0.2 },
  { y: 0.82, rx: 0.4, rz: 0.34 },
  { y: 0.94, rx: 0.5, rz: 0.46, oz: 0.1 },
  { y: 1.08, rx: 0.53, rz: 0.5, oz: 0.14 },
  { y: 1.22, rx: 0.5, rz: 0.43, oz: 0.08 },
  { y: 1.36, rx: 0.48, rz: 0.3, oz: 0.02 },
  { y: 1.46, rx: 0.4, rz: 0.24 },
  { y: 1.54, rx: 0.2, rz: 0.17 },
  { y: 1.6, rx: 0.1, rz: 0.1 },
];
const TORSO_MALE: Ring[] = [
  { y: 0.74, rx: 0.17, rz: 0.12 },
  { y: 0.82, rx: 0.22, rz: 0.14 },
  { y: 1.0, rx: 0.2, rz: 0.125 },
  { y: 1.2, rx: 0.23, rz: 0.145 },
  { y: 1.38, rx: 0.26, rz: 0.14 },
  { y: 1.48, rx: 0.2, rz: 0.11 },
  { y: 1.55, rx: 0.1, rz: 0.08 },
  { y: 1.6, rx: 0.07, rz: 0.07 },
];
const TORSO_FEM: Ring[] = [
  { y: 0.74, rx: 0.15, rz: 0.11 },
  { y: 0.82, rx: 0.205, rz: 0.13 },
  { y: 0.94, rx: 0.145, rz: 0.1 },
  { y: 1.04, rx: 0.135, rz: 0.095 },
  { y: 1.2, rx: 0.17, rz: 0.125, oz: 0.01 },
  { y: 1.36, rx: 0.195, rz: 0.12 },
  { y: 1.46, rx: 0.175, rz: 0.1 },
  { y: 1.54, rx: 0.09, rz: 0.07 },
  { y: 1.6, rx: 0.055, rz: 0.055 },
];

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */
const matCache = new Map<string, MeshStandardMaterial>();
function fm(key: string, make: () => MeshStandardMaterial) {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    matCache.set(key, m);
  }
  return m;
}
const skinMat = (hex: number, zombie = false) =>
  fm(`s${hex}${zombie}`, () => {
    const map = skinTexture(hex, zombie);
    return new MeshStandardMaterial({ map, roughness: zombie ? 0.78 : 0.6, metalness: 0, bumpMap: map, bumpScale: 0.8 });
  });
const clothMat = (hex: number, kind: 'knit' | 'denim' | 'plain' | 'torn', rough = 0.9, hex2?: number) =>
  fm(`c${hex}${kind}${hex2 ?? 0}`, () => {
    const map = fabricTexture(hex, kind, hex2);
    return new MeshStandardMaterial({ map, roughness: rough, metalness: 0, bumpMap: map, bumpScale: 1.5 });
  });
const hairMat = (hex: number, rough = 0.5) =>
  fm(`h${hex}`, () => {
    const map = hairTexture(hex);
    return new MeshStandardMaterial({ map, roughness: rough, metalness: 0.05, bumpMap: map, bumpScale: 1 });
  });
const plain = (hex: number, rough = 0.6, metal = 0, key = '') =>
  fm(`p${hex}${rough}${metal}${key}`, () => new MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal }));
const metal = (hex: number, rough = 0.35) => plain(hex, rough, 0.85, 'm');
const glowRed = new MeshBasicMaterial({ color: new Color(3, 0.45, 0.3), toneMapped: false });

/* ------------------------------------------------------------------ */
/* Articulated humanoids (hero, NPCs, cinematic zombies)               */
/* ------------------------------------------------------------------ */
export type HumanKind = 'bruno' | 'chloe' | 'karen' | 'zombie';
export type Pose =
  | 'idle' | 'walk' | 'run' | 'zombie' | 'panic' | 'kick' | 'aim' | 'swing' | 'fall' | 'cheer' | 'crouch' | 'point' | 'laugh';

export interface Humanoid {
  root: Group;
  rig: Group;
  head: Group;
  armL: Group;
  armR: Group;
  foreL: Group;
  foreR: Group;
  legL: Group;
  legR: Group;
  shinL: Group;
  shinR: Group;
  weapon: Group;
  kind: HumanKind;
}

function mesh(parent: Object3D, geo: BufferGeometry, mat: Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, shadow = true) {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const sphG = new SphereGeometry(1, 18, 14);
const boxG = new BoxGeometry(1, 1, 1);
const cylG = new CylinderGeometry(1, 1, 1, 14);
const sph = (p: Object3D, mat: Material, r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) =>
  mesh(p, sphG, mat, x, y, z, r * sx, r * sy, r * sz);

interface Cfg {
  skin: number;
  table: Ring[];
  fat: boolean;
  armX: number;
  armR: number; // upper arm radius
  legX: number;
  legR: number;
  scale: number;
  headS: [number, number, number];
}
const CFG: Record<HumanKind, Cfg> = {
  bruno: { skin: 0xe0a07f, table: TORSO_FAT, fat: true, armX: 0.58, armR: 0.105, legX: 0.18, legR: 0.15, scale: 1.0, headS: [1.1, 1.0, 1.08] },
  chloe: { skin: 0xf6cdb0, table: TORSO_FEM, fat: false, armX: 0.235, armR: 0.042, legX: 0.1, legR: 0.075, scale: 0.97, headS: [0.92, 0.98, 0.94] },
  karen: { skin: 0xeab894, table: TORSO_FEM, fat: false, armX: 0.24, armR: 0.048, legX: 0.1, legR: 0.08, scale: 0.98, headS: [0.95, 1.0, 0.97] },
  zombie: { skin: 0xa9bd8c, table: TORSO_MALE, fat: false, armX: 0.31, armR: 0.052, legX: 0.1, legR: 0.082, scale: 1.0, headS: [0.98, 1.0, 1.0] },
};

const HEAD_RINGS: Ring[] = [
  { y: -0.265, rx: 0.01, rz: 0.01, oz: 0.03 },
  { y: -0.25, rx: 0.06, rz: 0.06, oz: 0.04 },
  { y: -0.21, rx: 0.115, rz: 0.115, oz: 0.035 },
  { y: -0.15, rx: 0.16, rz: 0.17, oz: 0.02 },
  { y: -0.07, rx: 0.188, rz: 0.2, oz: 0.0 },
  { y: 0.03, rx: 0.2, rz: 0.215, oz: -0.005 },
  { y: 0.12, rx: 0.2, rz: 0.21, oz: -0.012 },
  { y: 0.2, rx: 0.175, rz: 0.19, oz: -0.02 },
  { y: 0.25, rx: 0.11, rz: 0.12, oz: -0.02 },
  { y: 0.275, rx: 0.02, rz: 0.02, oz: -0.02 },
];
const headGeo = loft(HEAD_RINGS, 36);

function shell(y0: number, y1: number, grow: number, oz: number, rxMul = 1) {
  const rings = HEAD_RINGS.filter((r) => r.y >= y0 && r.y <= y1).map((r) => ({
    ...r,
    rx: r.rx * rxMul + grow,
    rz: r.rz + grow,
    oz: (r.oz ?? 0) + oz,
  }));
  const f = rings[0];
  rings.unshift({ ...f, y: f.y - 0.02, rx: f.rx * 0.98, rz: f.rz * 0.98 });
  return loft(rings, 30);
}

export function makeHumanoid(kind: HumanKind): Humanoid {
  const c = CFG[kind];
  const root = new Group();
  const rig = new Group();
  root.add(rig);
  const zom = kind === 'zombie';
  const skin = skinMat(c.skin, zom);
  const fem = kind === 'chloe' || kind === 'karen';

  const topMat =
    kind === 'bruno' ? clothMat(0xc9352b, 'knit', 0.95)
    : kind === 'chloe' ? clothMat(0xff6fa8, 'knit', 0.85)
    : kind === 'karen' ? clothMat(0x8e4cbd, 'plain', 0.55)
    : clothMat(0xa89a86, 'torn', 0.95, 0x6b5a4a);
  const pantMat =
    kind === 'bruno' ? clothMat(0x2f4258, 'denim', 0.85)
    : kind === 'chloe' ? clothMat(0x6b4fd1, 'knit', 0.7)
    : kind === 'karen' ? clothMat(0x2c3340, 'plain', 0.7)
    : clothMat(0x4a4f58, 'torn', 0.95, 0x30343a);
  const shoeMat = kind === 'chloe' ? plain(0xf4f4f4, 0.5) : kind === 'bruno' ? plain(0x2a2018, 0.6) : plain(0x1d1d1f, 0.45);

  /* ---- legs ---- */
  const thighLen = 0.4;
  const shinLen = 0.37;
  const mkLeg = (side: number) => {
    const g = new Group();
    g.position.set(side * c.legX, 0.8, 0);
    const lr = c.legR;
    mesh(g, limb(lr, lr * 0.78, thighLen, lr * 0.12, 1.05), pantMat);
    const shin = new Group();
    shin.position.set(0, -thighLen, 0);
    g.add(shin);
    sph(shin, pantMat, lr * 0.8, 0, 0, 0);
    mesh(shin, limb(lr * 0.78, lr * 0.52, shinLen, lr * 0.1, 1.0), pantMat);
    // shoe
    sph(shin, shoeMat, 1, 0, -shinLen - 0.005, 0.06, lr * 0.62, 0.052, 0.15);
    if (kind === 'chloe') mesh(shin, boxG, plain(0x777, 0.8), 0, -shinLen - 0.035, 0.06, lr * 1.2, 0.012, 0.29, false);
    rig.add(g);
    return { g, shin };
  };
  const { g: legL, shin: shinL } = mkLeg(-1);
  const { g: legR, shin: shinR } = mkLeg(1);

  /* ---- torso ---- */
  const T = c.table;
  const full = loft(slice(T, T[0].y + 0.02, T[T.length - 2].y, 0, 11), 28);
  if (kind === 'bruno') {
    // skin belly visible under a too-short shirt
    mesh(rig, loft(slice(T, 0.74, 1.04, -0.006, 6), 28), skin);
    mesh(rig, loft(slice(T, 1.0, 1.56, 0.012, 9), 28), topMat);
    // jeans waistband riding under the belly
    mesh(rig, loft(slice(T, 0.72, 0.9, 0.012, 4), 28), pantMat);
    // mustard stain & belly button
    sph(rig, plain(0xd9bf4a, 0.7), 0.07, 0.1, 1.12, 0.62, 1, 0.6, 0.12);
    sph(rig, plain(0x8a5a48, 0.9), 0.03, 0, 0.95, 0.575, 1, 1.3, 0.35);
    // man boobs & double-chin vibes are in the loft; add a belt
    mesh(rig, loft(slice(T, 0.72, 0.76, 0.02, 3), 28), plain(0x1b1511, 0.5));
  } else if (kind === 'chloe') {
    mesh(rig, loft(slice(T, 0.74, 1.12, -0.004, 6), 28), skin);
    mesh(rig, loft(slice(T, 0.74, 0.92, 0.006, 4), 28), pantMat); // low waistband
    mesh(rig, loft(slice(T, 1.1, 1.56, 0.01, 8), 28), topMat);
    // tiny bag strap & necklace
    mesh(rig, new TorusGeometry(0.075, 0.005, 6, 20), metal(0xe3b347, 0.25), 0, 1.5, 0.045, 1, 1, 1, false).rotation.x = 1.2;
  } else if (kind === 'karen') {
    mesh(rig, loft(slice(T, 0.74, 0.95, 0.006, 4), 28), pantMat);
    mesh(rig, loft(slice(T, 0.92, 1.58, 0.012, 9), 28), topMat);
    mesh(rig, new TorusGeometry(0.09, 0.012, 8, 24), metal(0xe8e8e8, 0.2), 0, 1.5, 0.05, 1, 1, 1, false).rotation.x = 1.25; // pearls
    // pussy-bow collar
    sph(rig, topMat, 0.04, 0, 1.46, 0.12, 1.4, 1, 0.6);
  } else {
    mesh(rig, full, topMat);
    mesh(rig, loft(slice(T, 0.74, 0.9, 0.012, 4), 28), pantMat);
  }
  // neck
  const neckR = kind === 'bruno' ? 0.12 : kind === 'zombie' ? 0.07 : 0.055;
  mesh(rig, cylG, skin, 0, 1.58, 0.01, neckR, 0.11, neckR, true);

  /* ---- head ---- */
  const head = new Group();
  head.position.set(0, 1.74 - (kind === 'bruno' ? 0.02 : 0), 0.0);
  rig.add(head);
  const faceMat = fm(`f${kind}`, () => {
    const map = faceTexture(kind);
    return new MeshStandardMaterial({ map, roughness: zom ? 0.75 : 0.55, metalness: 0, bumpMap: map, bumpScale: 0.35 });
  });
  const hs = c.headS;
  const hg = new Group();
  hg.scale.set(hs[0], hs[1], hs[2]);
  head.add(hg);
  mesh(hg, headGeo, faceMat);
  // nose, ears, chin
  const nose = kind === 'bruno' ? [0.036, 0.04, 0.05] : zom ? [0.022, 0.03, 0.035] : [0.022, 0.03, 0.038];
  sph(hg, skin, 1, 0, -0.045, 0.225, nose[0], nose[1], nose[2]);
  for (const s of [-1, 1]) {
    sph(hg, skin, 1, s * 0.198, 0.0, -0.01, 0.022, 0.05, 0.036);
    if (kind === 'chloe') sph(hg, metal(0xf0d070, 0.2), 0.012, s * 0.204, -0.05, -0.01);
  }
  if (kind === 'bruno') {
    sph(hg, skin, 1, 0, -0.2, 0.08, 0.15, 0.07, 0.13); // double chin
    sph(hg, skin, 1, 0.12, -0.08, 0.17, 0.07, 0.07, 0.05); // cheeks
    sph(hg, skin, 1, -0.12, -0.08, 0.17, 0.07, 0.07, 0.05);
  }
  // hair
  if (kind === 'bruno') {
    mesh(hg, shell(0.06, 0.28, 0.008, -0.05), hairMat(0x2a1c12, 0.7));
    sph(hg, hairMat(0x2a1c12, 0.7), 1, 0.185, 0.04, -0.02, 0.025, 0.06, 0.07);
    sph(hg, hairMat(0x2a1c12, 0.7), 1, -0.185, 0.04, -0.02, 0.025, 0.06, 0.07);
    // sweat sheen
    sph(hg, plain(0xffffff, 0.2), 0.01, 0.1, 0.18, 0.15, 1, 1, 0.5).material = plain(0xe8d0c0, 0.25);
  } else if (kind === 'chloe') {
    const hm = hairMat(0xf2d24a, 0.4);
    mesh(hg, shell(-0.02, 0.28, 0.014, -0.012), hm);
    // fringe
    mesh(hg, boxG, hm, 0.03, 0.17, 0.2, 0.22, 0.04, 0.05);
    // loose side locks + ponytail
    for (const s of [-1, 1]) mesh(hg, limb(0.035, 0.02, 0.28, 0.01), hm, s * 0.2, 0.0, 0.0);
    const pony = new Group();
    pony.position.set(0, 0.12, -0.2);
    pony.rotation.x = 0.55;
    hg.add(pony);
    mesh(pony, limb(0.055, 0.025, 0.46, 0.02), hm);
    mesh(pony, new TorusGeometry(0.052, 0.012, 6, 14), plain(0xff3d8b, 0.6), 0, -0.02, 0, 1, 1, 1, false).rotation.x = Math.PI / 2;
  } else if (kind === 'karen') {
    const hm = hairMat(0xc9c9cc, 0.45);
    mesh(hg, shell(-0.02, 0.28, 0.018, -0.015), hm);
    // bob falling to jaw
    const bob = loft([
      { y: -0.14, rx: 0.1, rz: 0.1, oz: -0.05 },
      { y: -0.08, rx: 0.225, rz: 0.235, oz: -0.03 },
      { y: 0.0, rx: 0.235, rz: 0.24, oz: -0.025 },
      { y: 0.1, rx: 0.215, rz: 0.225, oz: -0.025 },
    ], 28);
    mesh(hg, bob, hm);
    sph(hg, hm, 1, 0, 0.3, -0.1, 0.1, 0.07, 0.09);
    // glasses
    for (const s of [-1, 1]) {
      mesh(hg, new TorusGeometry(0.052, 0.007, 8, 20), plain(0x1a1a1c, 0.3), s * 0.075, 0.034, 0.2, 1, 0.85, 1, false);
      mesh(hg, new CylinderGeometry(0.05, 0.05, 0.004, 16).rotateX(Math.PI / 2), fm('glass', () => new MeshStandardMaterial({ color: 0xaaccdd, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25 })), s * 0.075, 0.034, 0.2, 1, 0.85, 1, false);
    }
    mesh(hg, boxG, plain(0x1a1a1c, 0.3), 0, 0.045, 0.205, 0.04, 0.007, 0.007, false);
  } else {
    const hm = hairMat(0x1a1612, 0.9);
    mesh(hg, shell(0.1, 0.28, 0.006, -0.06), hm);
    sph(hg, hm, 1, 0.1, 0.2, -0.05, 0.06, 0.04, 0.08);
  }

  /* ---- arms ---- */
  const upLen = 0.3;
  const foLen = 0.27;
  const sleeveHex = kind === 'chloe' ? null : topMat;
  const mkArm = (side: number) => {
    const g = new Group();
    g.position.set(side * c.armX, kind === 'bruno' ? 1.46 : 1.47, 0);
    const ar = c.armR;
    sph(g, sleeveHex ?? skin, ar * 1.15, 0, 0, 0);
    mesh(g, limb(ar, ar * 0.8, upLen, ar * 0.12), skin);
    if (sleeveHex) mesh(g, limb(ar * 1.12, ar * 0.98, upLen * (kind === 'karen' ? 0.45 : 0.62), 0.004), sleeveHex);
    const fore = new Group();
    fore.position.set(0, -upLen, 0);
    g.add(fore);
    sph(fore, skin, ar * 0.82, 0, 0, 0);
    mesh(fore, limb(ar * 0.8, ar * 0.58, foLen, ar * 0.08), skin);
    // hand
    const hand = new Group();
    hand.position.set(0, -foLen - 0.02, 0.01);
    fore.add(hand);
    mesh(hand, boxG, skin, 0, 0, 0, ar * 1.3, 0.075, ar * 0.7);
    for (let f = 0; f < 4; f++) mesh(hand, cylG, skin, (f - 1.5) * ar * 0.32, -0.065, 0.005, ar * 0.15, 0.045, ar * 0.15);
    mesh(hand, cylG, skin, side * -ar * 0.7, -0.015, 0.04, ar * 0.16, 0.04, ar * 0.16).rotation.z = side * 0.5;
    if (kind === 'karen') mesh(hand, cylG, plain(0xc0273d, 0.3), 0, -0.1, 0.0, ar * 0.12, 0.01, ar * 0.12);
    if (zom) for (let f = 0; f < 4; f++) mesh(hand, cylG, plain(0x3a3326, 0.7), (f - 1.5) * ar * 0.32, -0.095, 0.005, ar * 0.1, 0.02, ar * 0.1);
    rig.add(g);
    return { g, fore };
  };
  const { g: armL, fore: foreL } = mkArm(-1);
  const { g: armR, fore: foreR } = mkArm(1);
  const weapon = new Group();
  weapon.position.set(0, -foLen - 0.08, 0.02);
  foreR.add(weapon);

  root.scale.setScalar(c.scale);
  void fem;
  return { root, rig, head, armL, armR, foreL, foreR, legL, legR, shinL, shinR, weapon, kind };
}

/** Procedural pose animation. phase = running clock, amp = intensity, k = 0..1 progress for one-shot poses. */
export function animate(h: Humanoid, pose: Pose, phase: number, amp = 1, k = 0) {
  const { rig, armL, armR, legL, legR, head, foreL, foreR, shinL, shinR } = h;
  rig.position.set(0, 0, 0);
  rig.rotation.set(0, 0, 0);
  armL.rotation.set(0, 0, 0);
  armR.rotation.set(0, 0, 0);
  legL.rotation.set(0, 0, 0);
  legR.rotation.set(0, 0, 0);
  head.rotation.set(0, 0, 0);
  foreL.rotation.set(-0.2, 0, 0);
  foreR.rotation.set(-0.2, 0, 0);
  shinL.rotation.set(0.04, 0, 0);
  shinR.rotation.set(0.04, 0, 0);
  const s = Math.sin(phase);
  const co = Math.cos(phase);
  const gait = (a: number) => {
    // knee flexes while the leg swings forward
    shinL.rotation.x = 0.08 + Math.max(0, -co) * 1.0 * a * amp;
    shinR.rotation.x = 0.08 + Math.max(0, co) * 1.0 * a * amp;
  };
  switch (pose) {
    case 'idle':
      rig.position.y = Math.sin(phase * 0.4) * 0.012;
      rig.rotation.x = Math.sin(phase * 0.4) * 0.008;
      armL.rotation.z = -0.07 - Math.sin(phase * 0.4) * 0.02;
      armR.rotation.z = 0.07 + Math.sin(phase * 0.4) * 0.02;
      head.rotation.y = Math.sin(phase * 0.23) * 0.12;
      head.rotation.x = Math.sin(phase * 0.31) * 0.04;
      break;
    case 'walk':
    case 'run': {
      const run = pose === 'run';
      const a = run ? 1.0 : 0.7;
      legL.rotation.x = s * a * amp;
      legR.rotation.x = -s * a * amp;
      armL.rotation.x = -s * a * 0.9 * amp;
      armR.rotation.x = s * a * 0.9 * amp;
      foreL.rotation.x = -(run ? 0.9 : 0.35) * amp + Math.min(0, armL.rotation.x) * 0.5;
      foreR.rotation.x = -(run ? 0.9 : 0.35) * amp + Math.min(0, armR.rotation.x) * 0.5;
      gait(run ? 1.1 : 0.7);
      rig.position.y = Math.abs(Math.cos(phase)) * 0.06 * amp;
      rig.rotation.z = s * 0.04 * amp;
      rig.rotation.y = s * 0.07 * amp;
      if (run) rig.rotation.x = 0.2 * amp;
      head.rotation.x = -(run ? 0.16 : 0.04) * amp;
      break;
    }
    case 'zombie':
      armL.rotation.x = -1.45 + Math.sin(phase * 0.5) * 0.1;
      armR.rotation.x = -1.4 + Math.cos(phase * 0.5) * 0.1;
      foreL.rotation.x = -0.12;
      foreR.rotation.x = -0.12;
      legL.rotation.x = s * 0.5 * amp;
      legR.rotation.x = -s * 0.5 * amp;
      gait(0.5);
      rig.rotation.x = 0.15;
      rig.rotation.z = s * 0.06 * amp;
      head.rotation.z = Math.sin(phase * 0.7) * 0.2;
      head.rotation.x = 0.2;
      rig.position.y = Math.abs(Math.cos(phase)) * 0.03;
      break;
    case 'panic':
      armL.rotation.x = -2.7 + Math.sin(phase * 3) * 0.35;
      armR.rotation.x = -2.7 + Math.cos(phase * 3) * 0.35;
      armL.rotation.z = -0.4;
      armR.rotation.z = 0.4;
      foreL.rotation.x = -0.5 + Math.sin(phase * 3) * 0.3;
      foreR.rotation.x = -0.5 + Math.cos(phase * 3) * 0.3;
      legL.rotation.x = s * 1.1 * amp;
      legR.rotation.x = -s * 1.1 * amp;
      gait(1.2);
      rig.position.y = Math.abs(Math.cos(phase)) * 0.09 * amp;
      rig.rotation.x = 0.12;
      head.rotation.z = Math.sin(phase * 2) * 0.1;
      break;
    case 'kick':
      legR.rotation.x = -1.35 * k;
      shinR.rotation.x = 1.2 * (1 - k) + 0.05;
      legL.rotation.x = 0.15 * k;
      shinL.rotation.x = 0.3 * k;
      armL.rotation.x = -0.6 * k;
      armR.rotation.x = 0.5 * k;
      rig.rotation.x = -0.18 * k;
      break;
    case 'aim':
      armR.rotation.x = -1.5;
      armL.rotation.x = -1.2;
      armL.rotation.z = 0.25;
      foreR.rotation.x = -0.05;
      foreL.rotation.x = -0.5;
      legL.rotation.x = s * 0.7 * amp;
      legR.rotation.x = -s * 0.7 * amp;
      gait(0.6);
      rig.position.y = Math.abs(Math.cos(phase)) * 0.05 * amp;
      break;
    case 'swing':
      armR.rotation.x = -2.7 + k * 3.4;
      armR.rotation.z = 0.2;
      foreR.rotation.x = -0.3 - (1 - k) * 0.5;
      armL.rotation.x = -0.4;
      rig.rotation.y = 0.7 - k * 1.4;
      legL.rotation.x = s * 0.6 * amp;
      legR.rotation.x = -s * 0.6 * amp;
      gait(0.5);
      break;
    case 'fall':
      armL.rotation.x = -2.5 + Math.sin(phase * 4) * 0.5;
      armR.rotation.x = -2.5 + Math.cos(phase * 4) * 0.5;
      foreL.rotation.x = -0.4;
      foreR.rotation.x = -0.4;
      legL.rotation.x = Math.sin(phase * 4) * 0.8;
      legR.rotation.x = -Math.sin(phase * 4) * 0.8;
      shinL.rotation.x = 0.6;
      shinR.rotation.x = 0.6;
      break;
    case 'cheer':
      armL.rotation.x = -2.8;
      armR.rotation.x = -2.8 + Math.sin(phase * 4) * 0.3;
      armL.rotation.z = -0.3;
      armR.rotation.z = 0.3;
      foreL.rotation.x = -0.1;
      foreR.rotation.x = -0.1;
      rig.position.y = Math.abs(Math.sin(phase * 2)) * 0.12;
      head.rotation.x = -0.2;
      break;
    case 'crouch':
      rig.position.y = -0.38;
      legL.rotation.x = -0.9;
      legR.rotation.x = -0.9;
      shinL.rotation.x = 1.8;
      shinR.rotation.x = 1.8;
      break;
    case 'point':
      armR.rotation.x = -1.55;
      armR.rotation.z = -0.1;
      armL.rotation.z = -0.1;
      foreR.rotation.x = -0.05;
      head.rotation.y = Math.sin(phase * 0.5) * 0.2;
      rig.position.y = Math.sin(phase * 0.5) * 0.01;
      break;
    case 'laugh':
      rig.rotation.x = -0.18 + Math.sin(phase * 7) * 0.08;
      rig.position.y = Math.abs(Math.sin(phase * 7)) * 0.04;
      armL.rotation.x = -0.6;
      armR.rotation.x = -0.6;
      armL.rotation.z = -0.3;
      armR.rotation.z = 0.3;
      foreL.rotation.x = -0.9;
      foreR.rotation.x = -0.9;
      head.rotation.x = -0.25;
      break;
  }
}

/** Held-weapon models. They extend along local -Y (the arm axis, forward when armR.x = -PI/2). */
export function setWeaponModel(h: Humanoid, id: string) {
  const w = h.weapon;
  while (w.children.length) w.remove(w.children[0]);
  const steel = metal(0x4a4f57, 0.38);
  const dark = metal(0x23262b, 0.5);
  const bright = metal(0xb8bec6, 0.25);
  const wood = plain(0x7a4b25, 0.7);
  const grip = plain(0x1b1b1d, 0.8);
  const cyl = (p: Object3D, mat: Material, r: number, l: number, y: number, x = 0, z = 0) => mesh(p, cylG, mat, x, y, z, r, l, r);
  const box = (p: Object3D, mat: Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) => mesh(p, boxG, mat, x, y, z, sx, sy, sz);
  switch (id) {
    case 'bat': {
      const tp = loft([
        { y: 0.1, rx: 0.025, rz: 0.025 },
        { y: 0.0, rx: 0.026, rz: 0.026 },
        { y: -0.3, rx: 0.032, rz: 0.032 },
        { y: -0.55, rx: 0.05, rz: 0.05 },
        { y: -0.78, rx: 0.062, rz: 0.062 },
        { y: -0.84, rx: 0.04, rz: 0.04 },
        { y: -0.85, rx: 0.005, rz: 0.005 },
      ], 12);
      mesh(w, tp, wood);
      cyl(w, plain(0x1a1a1a, 0.9), 0.029, 0.2, -0.04);
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4;
        const sp = mesh(w, new CylinderGeometry(0.0, 0.012, 0.09, 5), bright, Math.cos(a) * 0.065, -0.5 - (i % 5) * 0.06, Math.sin(a) * 0.065);
        sp.rotation.set(Math.sin(a) * 1.57, 0, -Math.cos(a) * 1.57);
      }
      break;
    }
    case 'pistol':
      box(w, steel, 0.05, 0.2, 0.045, 0, -0.14, 0.04);
      box(w, dark, 0.055, 0.1, 0.055, 0, -0.02, 0.0);
      box(w, grip, 0.045, 0.1, 0.05, 0, 0.0, -0.01).rotation.x = -0.25;
      cyl(w, bright, 0.014, 0.05, -0.26, 0, 0.04).rotation.x = 0;
      break;
    case 'smg':
      box(w, steel, 0.07, 0.34, 0.07, 0, -0.17, 0.02);
      box(w, dark, 0.045, 0.2, 0.05, 0, -0.1, -0.09); // magazine
      box(w, grip, 0.05, 0.1, 0.05, 0, 0.0, -0.01);
      cyl(w, bright, 0.014, 0.2, -0.45, 0, 0.02);
      box(w, dark, 0.05, 0.1, 0.02, 0, -0.34, 0.06);
      break;
    case 'shotgun':
      mesh(w, loft([{ y: 0.05, rx: 0.04, rz: 0.04 }, { y: -0.1, rx: 0.045, rz: 0.05 }, { y: -0.28, rx: 0.035, rz: 0.04 }], 10), wood);
      cyl(w, steel, 0.02, 0.62, -0.6, 0, 0.03);
      cyl(w, steel, 0.02, 0.55, -0.58, 0, 0.0);
      box(w, wood, 0.06, 0.16, 0.07, 0, -0.42, 0.01); // pump
      box(w, dark, 0.05, 0.06, 0.05, 0, -0.62, 0.05);
      break;
    case 'minigun': {
      box(w, dark, 0.14, 0.26, 0.14, 0, -0.1, 0);
      const barrels = new Group();
      barrels.position.set(0, -0.28, 0.0);
      w.add(barrels);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        cyl(barrels, bright, 0.014, 0.52, -0.26, Math.cos(a) * 0.05, Math.sin(a) * 0.05);
      }
      mesh(barrels, new CylinderGeometry(0.075, 0.075, 0.03, 14), steel, 0, -0.1, 0);
      mesh(barrels, new CylinderGeometry(0.075, 0.075, 0.03, 14), steel, 0, -0.5, 0);
      box(w, metal(0xe0a23a, 0.4), 0.17, 0.07, 0.17, 0, -0.04, 0);
      box(w, plain(0x6a5a2a, 0.6), 0.1, 0.18, 0.2, 0.1, -0.12, -0.1);
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Instanced zombie horde: 12 draw calls for up to MAX zombies         */
/* ------------------------------------------------------------------ */
export interface ZombieVisual {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  phase: number;
  moving: number; // 0..1
  atk: number; // attack anim timer (>0 while swinging)
  dead: boolean;
  deathT: number;
  flash: number;
  skin: Color;
  cloth: Color;
  /** body width multiplier (bloaters) */
  fat: number;
  /** 0 normal, 1 spitter (hunched, glowing sac), 2 bloater (swollen, glowing boils) */
  variant: number;
}

const ZT = {
  torso: loft(slice(TORSO_MALE, 0.76, 1.6, 0.012, 12), 20),
  thighL: limb(0.085, 0.066, 0.4, 0.012),
  shin: limb(0.066, 0.045, 0.37, 0.008),
  upper: limb(0.054, 0.044, 0.3, 0.006),
  fore: (() => {
    const f = limb(0.044, 0.034, 0.27, 0.005);
    const hand = new BoxGeometry(0.075, 0.085, 0.04).translate(0, -0.3, 0.01);
    const fingers = mergeGeometries([0, 1, 2, 3].map((i) => new CylinderGeometry(0.009, 0.007, 0.07, 4).translate((i - 1.5) * 0.02, -0.38, 0.01)).map((g) => g.toNonIndexed()))!;
    return mergeGeometries([f.toNonIndexed(), hand.toNonIndexed(), fingers])!;
  })(),
};

export class ZombieSwarm {
  private torso: InstancedMesh;
  private headM: InstancedMesh;
  private upL: InstancedMesh;
  private upR: InstancedMesh;
  private foL: InstancedMesh;
  private foR: InstancedMesh;
  private thL: InstancedMesh;
  private thR: InstancedMesh;
  private shL: InstancedMesh;
  private shR: InstancedMesh;
  private eyes: InstancedMesh;
  private sac: InstancedMesh;
  private all: InstancedMesh[];
  private max: number;
  private rootM = new Matrix4();
  private jM = new Matrix4();
  private cM = new Matrix4();
  private outM = new Matrix4();
  private rq = new Quaternion();
  private fq = new Quaternion();
  private pq = new Quaternion();
  private eu = new Euler();
  private v1 = new Vector3();
  private vs = new Vector3();
  private ax = new Vector3(1, 0, 0);
  private ay = new Vector3(0, 1, 0);
  private white = new Color(1, 1, 1);
  private tc = new Color();
  private dark = new Color();
  private sacC = new Color();
  private zeroS = new Vector3(0, 0, 0);

  constructor(scene: Scene, max: number) {
    this.max = max;
    const skinM = () => {
      const map = zombieSkinTexture();
      return new MeshStandardMaterial({ map, roughness: 0.78, metalness: 0, bumpMap: map, bumpScale: 1.0 });
    };
    const clothM = () => {
      const map = zombieClothTexture();
      return new MeshStandardMaterial({ map, roughness: 0.95, metalness: 0, bumpMap: map, bumpScale: 2.0 });
    };
    const pantsM = () => {
      const map = fabricTexture(0xc9c9c9, 'torn', 0x888888);
      return new MeshStandardMaterial({ map, roughness: 0.95, metalness: 0, bumpMap: map, bumpScale: 2.0 });
    };
    const faceM = () => {
      const map = faceTexture('zombie');
      return new MeshStandardMaterial({ map, roughness: 0.72, metalness: 0, bumpMap: map, bumpScale: 0.4 });
    };
    const sacM = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const mk = (g: BufferGeometry, m: Material, shadow = true) => {
      const im = new InstancedMesh(g, m, max);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = shadow;
      im.receiveShadow = false;
      im.setColorAt(0, this.white);
      scene.add(im);
      return im;
    };
    const head = headGeo.clone();
    head.translate(0, 0, 0);
    this.torso = mk(ZT.torso, clothM());
    this.headM = mk(head, faceM());
    this.upL = mk(ZT.upper, skinM());
    this.upR = mk(ZT.upper, skinM());
    this.foL = mk(ZT.fore, skinM());
    this.foR = mk(ZT.fore, skinM());
    this.thL = mk(ZT.thighL, pantsM());
    this.thR = mk(ZT.thighL, pantsM());
    this.shL = mk(ZT.shin, pantsM());
    this.shR = mk(ZT.shin, pantsM());
    this.eyes = mk(new BoxGeometry(0.2, 0.03, 0.03), glowRed, false);
    this.sac = mk(new SphereGeometry(0.1, 10, 8), sacM, false);
    this.all = [this.torso, this.headM, this.upL, this.upR, this.foL, this.foR, this.thL, this.thR, this.shL, this.shR, this.eyes, this.sac];
  }

  setShadows(on: boolean) {
    this.all.forEach((m, i) => (m.castShadow = on && i < 10 && i !== 4 && i !== 5));
  }

  private place(mesh: InstancedMesh, i: number, parent: Matrix4, px: number, py: number, pz: number, rx: number, rz: number, sx = 1, sy = 1, sz = 1) {
    this.eu.set(rx, 0, rz);
    this.pq.setFromEuler(this.eu);
    this.cM.compose(this.v1.set(px, py, pz), this.pq, this.vs.set(sx, sy, sz));
    this.outM.multiplyMatrices(parent, this.cM);
    mesh.setMatrixAt(i, this.outM);
  }

  update(list: ZombieVisual[]) {
    const n = Math.min(list.length, this.max);
    for (let i = 0; i < n; i++) {
      const z = list[i];
      let fall = 0;
      let sink = 0;
      if (z.dead) {
        fall = Math.min(1, z.deathT / 0.45);
        sink = Math.max(0, z.deathT - 1.0) * 0.6;
      }
      this.rq.setFromAxisAngle(this.ay, z.yaw);
      this.fq.setFromAxisAngle(this.ax, -fall * 1.5);
      this.rq.multiply(this.fq);
      const s = z.scale;
      this.rootM.compose(this.v1.set(z.x, z.y - sink, z.z), this.rq, this.vs.set(s, s, s));
      const alive = !z.dead;
      const mv = z.moving;
      const sw = alive ? Math.sin(z.phase) * 0.7 * mv : 0;
      const co = Math.cos(z.phase);
      const bob = alive ? Math.abs(co) * 0.035 * mv : 0;
      const aSw = z.atk > 0 ? Math.sin((z.atk / 0.35) * Math.PI) * 0.9 : 0;
      const armBase = alive ? -1.35 : -0.4;
      const fat = z.fat;
      const hunch = z.variant === 1 ? 0.55 : z.variant === 2 ? 0.1 : 0.16 + Math.sin(z.phase * 0.5) * 0.03;
      const sway = alive ? Math.sin(z.phase) * 0.05 * mv : 0;
      const armX = 0.31 + (fat - 1) * 0.3;
      const hy = 1.6 + bob - hunch * 0.15;

      // legs
      const lkL = alive ? 0.12 + Math.max(0, -co) * 0.9 * mv : 0.2;
      const lkR = alive ? 0.12 + Math.max(0, co) * 0.9 * mv : 0.2;
      this.place(this.thL, i, this.rootM, -0.1 * fat, 0.8, 0, sw, 0, fat * 0.95, 1, fat * 0.95);
      this.jM.copy(this.outM);
      this.place(this.shL, i, this.jM, 0, -0.4, 0, lkL, 0);
      this.place(this.thR, i, this.rootM, 0.1 * fat, 0.8, 0, -sw, 0, fat * 0.95, 1, fat * 0.95);
      this.jM.copy(this.outM);
      this.place(this.shR, i, this.jM, 0, -0.4, 0, lkR, 0);
      // torso (+ fat)
      this.place(this.torso, i, this.rootM, 0, bob, 0, hunch, sway, fat, 1, fat * 0.92);
      // head
      const hx = Math.sin(z.phase * 0.7) * 0.15 * (alive ? 1 : 0);
      const hsc = 1 / (1 + (fat - 1) * 0.35);
      const hz = 0.04 + hunch * 0.22;
      this.eu.set(0.15 + hunch * 0.5, hx, hx * 0.8);
      this.pq.setFromEuler(this.eu);
      this.cM.compose(this.v1.set(0, hy + 0.1, hz), this.pq, this.vs.set(1, 1, 1));
      this.jM.multiplyMatrices(this.rootM, this.cM); // head frame
      this.cM.compose(this.v1.set(0, 0, 0), this.fq.identity(), this.vs.set(hsc, hsc, hsc));
      this.outM.multiplyMatrices(this.jM, this.cM);
      this.headM.setMatrixAt(i, this.outM);
      this.cM.compose(this.v1.set(0, 0.04 * hsc, 0.205 * hsc), this.fq.identity(), this.vs.set(hsc, hsc, hsc));
      this.outM.multiplyMatrices(this.jM, this.cM);
      this.eyes.setMatrixAt(i, this.outM);
      // arms
      const aL = armBase + Math.sin(z.phase * 0.5) * 0.1 - aSw;
      const aR = armBase + Math.cos(z.phase * 0.5) * 0.1 - aSw;
      this.place(this.upL, i, this.rootM, -armX, 1.45 + bob - hunch * 0.08, 0.02, aL, -0.06 * fat);
      this.jM.copy(this.outM);
      this.place(this.foL, i, this.jM, 0, -0.3, 0, -0.15 - (alive ? 0 : 0.5), 0);
      this.place(this.upR, i, this.rootM, armX, 1.45 + bob - hunch * 0.08, 0.02, aR, 0.06 * fat);
      this.jM.copy(this.outM);
      this.place(this.foR, i, this.jM, 0, -0.3, 0, -0.15 - (alive ? 0 : 0.5), 0);
      // glowing sac (spitter throat / bloater boils)
      if (z.variant && alive) {
        const pulse = 1 + Math.sin(z.phase * 2.2) * 0.15;
        if (z.variant === 1) this.place(this.sac, i, this.rootM, 0, 1.5 + bob - hunch * 0.1, 0.17 + hunch * 0.18, 0, 0, 0.9 * pulse, 1.2 * pulse, 0.9 * pulse);
        else this.place(this.sac, i, this.rootM, 0.18 * fat, 1.15, 0.38 * fat, 0, 0, 1.4 * pulse, 1.4 * pulse, 1.0 * pulse);
        this.sacC.set(z.variant === 1 ? 0x58ff30 : 0xffc23a).multiplyScalar(1.6 + pulse);
        this.sac.setColorAt(i, this.sacC);
      } else {
        this.cM.compose(this.v1.set(0, 0, 0), this.fq.identity(), this.zeroS);
        this.sac.setMatrixAt(i, this.cM);
      }

      const f = z.flash;
      this.tc.copy(z.skin);
      if (f > 0) this.tc.lerp(this.white, Math.min(1, f * 4)).multiplyScalar(1 + f * 2);
      this.headM.setColorAt(i, this.tc);
      this.upL.setColorAt(i, this.tc);
      this.upR.setColorAt(i, this.tc);
      this.foL.setColorAt(i, this.tc);
      this.foR.setColorAt(i, this.tc);
      this.tc.copy(z.cloth);
      if (f > 0) this.tc.lerp(this.white, Math.min(1, f * 4)).multiplyScalar(1 + f * 2);
      this.torso.setColorAt(i, this.tc);
      this.dark.copy(this.tc).multiplyScalar(0.62);
      this.thL.setColorAt(i, this.dark);
      this.thR.setColorAt(i, this.dark);
      this.shL.setColorAt(i, this.dark);
      this.shR.setColorAt(i, this.dark);
      this.eyes.setColorAt(i, z.dead ? this.dark.setRGB(0, 0, 0) : this.white);
    }
    for (const m of this.all) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
