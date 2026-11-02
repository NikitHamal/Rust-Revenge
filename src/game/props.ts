import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  Scene,
  Vector3,
  Euler,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WORLD, riverCenter, riverDist, riverHalfWidth, terrainHeight } from './config';
import { G, StaticBatch, mulberry32, stdMat } from './utils';
import { barkTexture, broadCard, grassCard, pineCard, plankTexture, signTexture } from './textures';
import { patchSurface, patchWind } from './shading';
import type { Quality } from './store';

export interface TreeNode {
  x: number;
  z: number;
  scale: number;
  hp: number;
  felled: boolean;
  shake: number;
  rot: number;
}
export interface Crate {
  x: number;
  z: number;
  active: boolean;
  kind: 'scrap' | 'wood' | 'med';
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();

function compose(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number) {
  return _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(sx, sy, sz));
}

function bufMerge(parts: BufferGeometry[]) {
  return mergeGeometries(parts)!;
}
function setNormals(g: BufferGeometry, f: (x: number, y: number, z: number, o: Vector3) => void) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const o = new Vector3();
  for (let i = 0; i < p.count; i++) {
    f(p.getX(i), p.getY(i), p.getZ(i), o);
    o.normalize();
    n.setXYZ(i, o.x, o.y, o.z);
  }
}
function branch(from: Vector3, to: Vector3, r0: number, r1: number, seg = 6) {
  const dir = to.clone().sub(from);
  const len = dir.length();
  const g = new CylinderGeometry(r1, r0, len, seg, 1).translate(0, len / 2, 0);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()));
  g.translate(from.x, from.y, from.z);
  return g;
}
const upV = new Vector3(0, 1, 0);

/** Layered drooping conifer branches as alpha-tested needle cards. */
function pineCardsGeo(rng: () => number) {
  const parts: BufferGeometry[] = [];
  const tiers = 8;
  for (let t = 0; t < tiers; t++) {
    const k = t / (tiers - 1);
    const y = 1.45 + t * 0.86;
    const R = 2.55 * Math.pow(1 - k, 0.85) + 0.6;
    const n = Math.round(10 - k * 4);
    const layers = k < 0.6 ? 2 : 1;
    for (let l = 0; l < layers; l++) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + l * 0.55 + rng() * 0.35;
        const droop = 0.5 - k * 0.15 + l * 0.22 + rng() * 0.1;
        const g = new PlaneGeometry(R * 1.0, R * 1.15);
        g.translate(0, R * 0.575, 0);
        g.rotateY((rng() - 0.5) * 0.4);
        g.rotateX(Math.PI / 2 + droop);
        g.rotateY(a);
        g.translate(0, y - l * 0.16, 0);
        const sa = Math.sin(a);
        const ca = Math.cos(a);
        setNormals(g, (_x, _y, _z, o) => o.set(sa * 0.5, 0.9, ca * 0.5));
        parts.push(g);
      }
    }
  }
  return bufMerge(parts);
}
const pineCoreGeo = () => new ConeGeometry(1.2, 6.6, 9).translate(0, 4.5, 0);
const pineTrunkGeo = () => new CylinderGeometry(0.07, 0.27, 7.8, 8, 3).translate(0, 3.9, 0);

function leafCluster(rng: () => number, centers: Vector3[], radius: number, canopy: Vector3, cards = 6) {
  const parts: BufferGeometry[] = [];
  for (const c of centers) {
    for (let k = 0; k < cards; k++) {
      const g = new PlaneGeometry(radius * 2, radius * 2);
      g.rotateX(rng() * Math.PI);
      g.rotateY(rng() * Math.PI);
      g.rotateZ(rng() * Math.PI);
      g.translate(c.x + (rng() - 0.5) * 0.5, c.y + (rng() - 0.5) * 0.5, c.z + (rng() - 0.5) * 0.5);
      setNormals(g, (x, y, z, o) => o.set(x - canopy.x, (y - canopy.y) * 0.9 + 0.35, z - canopy.z));
      parts.push(g);
    }
  }
  return bufMerge(parts);
}
function broadTree(rng: () => number) {
  const canopy = new Vector3(0, 4.9, 0);
  const centers: Vector3[] = [];
  for (let i = 0; i < 12; i++) {
    const a = rng() * 6.283;
    const r = Math.sqrt(rng()) * 2.1;
    centers.push(new Vector3(Math.cos(a) * r, 4.9 + (rng() - 0.4) * 2.3, Math.sin(a) * r));
  }
  const foliage = leafCluster(rng, centers, 1.35, canopy, 5);
  const wood: BufferGeometry[] = [new CylinderGeometry(0.2, 0.36, 3.4, 8, 3).translate(0, 1.7, 0)];
  const top = new Vector3(0, 3.3, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 6.283 + rng();
    wood.push(branch(top, new Vector3(Math.cos(a) * 1.6, 5.0 + rng() * 0.9, Math.sin(a) * 1.6), 0.16, 0.05, 5));
  }
  return { foliage, trunk: bufMerge(wood) };
}
function deadTree(rng: () => number) {
  const parts: BufferGeometry[] = [];
  const grow = (from: Vector3, dir: Vector3, len: number, rad: number, depth: number) => {
    const to = from.clone().addScaledVector(dir, len);
    parts.push(branch(from, to, rad, rad * 0.62, 5));
    if (depth <= 0) return;
    const kids = depth > 2 ? 2 : 2 + (rng() < 0.5 ? 1 : 0);
    for (let i = 0; i < kids; i++) {
      const d = dir.clone().add(new Vector3(rng() - 0.5, rng() * 0.3, rng() - 0.5).multiplyScalar(1.5)).normalize();
      grow(to, d, len * (0.62 + rng() * 0.2), rad * 0.6, depth - 1);
    }
  };
  grow(new Vector3(0, 0, 0), upV.clone(), 3.4, 0.28, 3);
  return bufMerge(parts);
}
function rockGeo(seed: number) {
  const rng = mulberry32(seed);
  const g = new IcosahedronGeometry(1, 3);
  const p = g.attributes.position;
  const v = new Vector3();
  const o = [rng() * 10, rng() * 10, rng() * 10];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 2.3 + o[0]) * Math.cos(v.y * 2.1 + o[1]) + Math.sin(v.z * 2.7 + o[2]) * 0.6 + Math.sin(v.x * 6 + v.z * 5 + o[1]) * 0.18;
    const s = 1 + n * 0.17;
    v.multiplyScalar(s);
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.2; // flat bottom
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export class Props {
  group = new Group();
  trees: TreeNode[] = [];
  crates: Crate[] = [];
  treehouse!: {
    x: number;
    z: number;
    platformY: number;
    ladderX: number;
    girl: Vector3;
    mom: Vector3;
    root: Group;
    base: Vector3;
  };
  private lampMat = new MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffcc55, emissiveIntensity: 0, roughness: 0.5 });
  private chopTrunk!: InstancedMesh;
  private chopLeaf!: InstancedMesh;
  private chopCore!: InstancedMesh;
  private crateMesh!: InstancedMesh;
  private crateGlow!: InstancedMesh;
  private shake = 0;
  private rng = mulberry32(1337);

  constructor(scene: Scene, quality: Quality) {
    const qf = quality === 'low' ? 0.45 : quality === 'medium' ? 0.8 : 1;
    scene.add(this.group);
    const rng = mulberry32(42);

    // treehouse placement first so the forest avoids it
    const tx = -24;
    const tz = riverCenter(tx) + riverHalfWidth(tx) + 10;
    this.buildTreehouse(tx, tz);

    const nearTH = (x: number, z: number, r: number) => Math.hypot(x - tx, z - tz) < r;

    /* ----- forest ----- */
    const pts: { x: number; z: number; s: number; r: number; kind: number }[] = [];
    const target = Math.round(500 * qf);
    let tries = 0;
    while (pts.length < target && tries++ < 9000) {
      const x = (rng() * 2 - 1) * (WORLD.playX + 9);
      const z = (rng() * 2 - 1) * (WORLD.playZ + 8);
      if (riverDist(x, z) < 6.5 || nearTH(x, z, 11)) continue;
      const edge = Math.max(Math.abs(x) / WORLD.playX, Math.abs(z) / WORLD.playZ);
      if (rng() > 0.1 + 0.9 * Math.pow(Math.min(1, edge), 2.6)) continue;
      const kr = rng();
      pts.push({ x, z, s: 0.8 + rng() * 0.8, r: rng() * 6.28, kind: kr < 0.56 ? 0 : kr < 0.76 ? 1 : kr < 0.85 ? 2 : 3 });
    }
    const barkMap = barkTexture();
    barkMap.wrapS = barkMap.wrapT = RepeatWrapping;
    const barkMat = patchSurface(new MeshStandardMaterial({ map: barkMap, roughness: 0.95, bumpMap: barkMap, bumpScale: 3 }), { scale: 2.5, grime: 0.3, bump: 0.5, cloud: true });
    const deadMat = patchSurface(new MeshStandardMaterial({ color: 0x6d6258, roughness: 1 }), { scale: 3, grime: 0.5, bump: 0.8, cloud: true });
    const mkFoliage = (map: MeshStandardMaterial['map'], rough = 0.82) =>
      patchWind(
        patchSurface(new MeshStandardMaterial({ map, alphaTest: 0.42, side: DoubleSide, roughness: rough, metalness: 0 }), { scale: 0.6, grime: 0.16, bump: 0.12, grain: 0.1, cloud: true, hue: 0.12 }),
        0.3,
        1.3,
        'y',
        0.13,
      );
    const pineMat = mkFoliage(pineCard());
    const broadMat = mkFoliage(broadCard(false));
    const autumnMat = mkFoliage(broadCard(true));
    const mkInst = (geo: BufferGeometry, mat: MeshStandardMaterial, list: typeof pts, tint: () => number[], cast = true, lift = 0) => {
      const im = new InstancedMesh(geo, mat, Math.max(1, list.length));
      im.count = list.length;
      list.forEach((p, i) => {
        im.setMatrixAt(i, compose(p.x, terrainHeight(p.x, p.z) + lift, p.z, p.s, p.s * (0.9 + (p.r % 1) * 0.35), p.s, p.r));
        const c = tint();
        im.setColorAt(i, _c.setRGB(c[0], c[1], c[2]));
      });
      im.castShadow = cast;
      im.receiveShadow = true;
      this.group.add(im);
      return im;
    };
    const white = () => [1, 1, 1];
    const pines = pts.filter((p) => p.kind === 0);
    const greens = pts.filter((p) => p.kind === 1);
    const autumns = pts.filter((p) => p.kind === 2);
    const dead = pts.filter((p) => p.kind === 3);
    const pineTint = () => {
      const k = 0.7 + rng() * 0.45;
      const dry = rng() < 0.18 ? 0.35 : 0;
      return [k * (1 + dry), k * (1 - dry * 0.3), k * (1 - dry)];
    };
    mkInst(pineTrunkGeo(), barkMat, pines, white);
    mkInst(pineCoreGeo(), patchSurface(new MeshStandardMaterial({ color: 0x14301a, roughness: 1 }), { scale: 1, grime: 0.3, bump: 0.2 }), pines, () => { const k = 0.7 + rng() * 0.5; return [k, k, k]; }, false);
    mkInst(pineCardsGeo(rng), pineMat, pines, pineTint);
    const bt = broadTree(rng);
    const bTint = () => { const k = 0.75 + rng() * 0.5; return [k * (0.9 + rng() * 0.2), k, k * 0.85]; };
    mkInst(bt.trunk, barkMat, [...greens, ...autumns], white);
    mkInst(bt.foliage, broadMat, greens, bTint);
    mkInst(bt.foliage, autumnMat, autumns, bTint);
    mkInst(deadTree(rng), deadMat, dead, () => { const k = 0.7 + rng() * 0.5; return [k, k, k]; });

    /* ----- rocks ----- */
    const rocks: typeof pts = [];
    tries = 0;
    while (rocks.length < Math.round(120 * qf) && tries++ < 3000) {
      const x = (rng() * 2 - 1) * WORLD.playX;
      const z = (rng() * 2 - 1) * WORLD.playZ;
      if (Math.abs(x) < 10 && Math.abs(z) < 8) continue;
      if (nearTH(x, z, 5)) continue;
      rocks.push({ x, z, s: 0.4 + rng() * 1.3, r: rng() * 6.28, kind: Math.floor(rng() * 3) });
    }
    const rockMat = patchSurface(new MeshStandardMaterial({ color: 0x8a8780, roughness: 0.92, metalness: 0.02 }), { scale: 1.7, grime: 0.6, bump: 2.2, grain: 0.5, cloud: true, hue: 0.1 });
    for (let kind = 0; kind < 3; kind++) {
      const list = rocks.filter((q) => q.kind === kind);
      const im = new InstancedMesh(rockGeo(100 + kind * 17), rockMat, Math.max(1, list.length));
      im.count = list.length;
      list.forEach((p, i) => {
        const h = terrainHeight(p.x, p.z);
        im.setMatrixAt(i, compose(p.x, h + p.s * 0.12, p.z, p.s * 1.15, p.s * (0.65 + (p.r % 1) * 0.3), p.s, p.r));
        const g = 0.62 + rng() * 0.5;
        im.setColorAt(i, _c.setRGB(g, g * 0.98, g * (0.9 + rng() * 0.12)));
      });
      im.castShadow = true;
      im.receiveShadow = true;
      this.group.add(im);
    }

    /* ----- grass (crossed alpha cards, wind-animated) ----- */
    const patch = bufMerge(
      [0, 1, 2].map((i) => {
        const g = new PlaneGeometry(1.3, 1.0);
        g.translate(0, 0.5, 0);
        g.rotateY((i * Math.PI) / 3);
        setNormals(g, () => {}); // placeholder; overwritten below
        return g;
      }),
    );
    setNormals(patch, (_x, _y, _z, o) => o.set(0, 1, 0));
    const grassMat = patchWind(
      patchSurface(new MeshStandardMaterial({ map: grassCard(), alphaTest: 0.4, side: DoubleSide, roughness: 1, metalness: 0 }), { scale: 0.7, grime: 0.2, bump: 0, grain: 0.1, cloud: true, hue: 0.2 }),
      0.38,
      2.1,
      'uv',
    );
    const gN = Math.round(9000 * qf);
    const tufts = new InstancedMesh(patch, grassMat, gN);
    let gi = 0;
    tries = 0;
    while (gi < gN && tries++ < gN * 5) {
      const x = (rng() * 2 - 1) * (WORLD.playX + 4);
      const z = (rng() * 2 - 1) * (WORLD.playZ + 4);
      const h = terrainHeight(x, z);
      if (h < 0.3 || riverDist(x, z) < 3.2 || h > 3.4) continue;
      const s = 0.7 + rng() * 1.0;
      tufts.setMatrixAt(gi, compose(x, h - 0.03, z, s, s * (0.7 + rng() * 0.7), s, rng() * 6.28));
      const k = 0.65 + rng() * 0.5;
      tufts.setColorAt(gi, _c.setRGB(k * (0.95 + rng() * 0.2), k, k * 0.8));
      gi++;
    }
    tufts.count = gi;
    tufts.receiveShadow = true;
    this.group.add(tufts);

    /* ----- reeds along the banks ----- */
    const reedN = Math.round(300 * qf);
    const reedMat = patchWind(new MeshStandardMaterial({ color: 0xb7b36a, roughness: 0.9 }), 0.3, 1.8, 'y', 0.5);
    const reedGeo = bufMerge([
      new CylinderGeometry(0.018, 0.035, 1.9, 4).translate(0, 0.95, 0),
      new CylinderGeometry(0.05, 0.05, 0.28, 6).translate(0, 1.75, 0),
    ]);
    const reeds = new InstancedMesh(reedGeo, reedMat, reedN);
    let ri = 0;
    tries = 0;
    while (ri < reedN && tries++ < reedN * 40) {
      const x = (rng() * 2 - 1) * WORLD.playX;
      const side = rng() < 0.5 ? 1 : -1;
      const z = riverCenter(x) + side * (riverHalfWidth(x) + 0.6 + (rng() - 0.5) * 3.2);
      const h = terrainHeight(x, z);
      if (h > 0.25 || h < -0.7) continue;
      const s = 0.7 + rng() * 0.9;
      reeds.setMatrixAt(ri, compose(x, h, z, 1, s, 1, 0));
      reeds.setColorAt(ri, _c.setRGB(0.55 + rng() * 0.4, 0.6 + rng() * 0.3, 0.3 + rng() * 0.2));
      ri++;
    }
    reeds.count = ri;
    reeds.castShadow = true;
    this.group.add(reeds);

    /* ----- wrecks, barrels, tents (merged) ----- */
    this.buildClutter(rng, tx, tz);

    /* ----- choppable trees (autumn gold pines) ----- */
    const chopN = 26;
    tries = 0;
    while (this.trees.length < chopN && tries++ < 4000) {
      const x = (rng() * 2 - 1) * (WORLD.playX - 8);
      const z = (rng() * 2 - 1) * (WORLD.playZ - 8);
      const d = Math.hypot(x, z);
      if (riverDist(x, z) < 5 || d < 14 || d > 50 || nearTH(x, z, 9)) continue;
      if (this.trees.some((t) => Math.hypot(t.x - x, t.z - z) < 6)) continue;
      this.trees.push({ x, z, scale: 0.75 + rng() * 0.3, hp: 1, felled: false, shake: 0, rot: rng() * 6.28 });
    }
    this.chopTrunk = new InstancedMesh(pineTrunkGeo(), barkMat, this.trees.length);
    this.chopLeaf = new InstancedMesh(pineCardsGeo(rng), mkFoliage(pineCard(true)), this.trees.length);
    this.chopCore = new InstancedMesh(pineCoreGeo(), patchSurface(new MeshStandardMaterial({ color: 0x5a3414, roughness: 1 }), { scale: 1, grime: 0.3, bump: 0.2 }), this.trees.length);
    this.chopTrunk.castShadow = this.chopLeaf.castShadow = true;
    this.trees.forEach((_t, i) => {
      this.chopLeaf.setColorAt(i, _c.setRGB(1.1 + (i % 3) * 0.08, 0.95 + (i % 4) * 0.05, 0.8));
      this.chopCore.setColorAt(i, _c.setRGB(1, 1, 1));
      this.chopTrunk.setColorAt(i, _c.setRGB(1, 1, 1));
    });
    this.group.add(this.chopTrunk, this.chopLeaf, this.chopCore);
    this.refreshTrees();

    /* ----- loot crates ----- */
    const CN = 18;
    const crateMap = plankTexture(false);
    const crateMat = patchSurface(new MeshStandardMaterial({ map: crateMap, bumpMap: crateMap, bumpScale: 2, roughness: 0.75, metalness: 0.1 }), { scale: 6, grime: 0.2, bump: 0.3 });
    this.crateMesh = new InstancedMesh(new BoxGeometry(0.8, 0.6, 0.8), crateMat, CN);
    this.crateMesh.castShadow = true;
    const glowGeo = new CircleGeometry(1.1, 20);
    glowGeo.rotateX(-Math.PI / 2);
    this.crateGlow = new InstancedMesh(
      glowGeo,
      new MeshBasicMaterial({ color: new Color(1.4, 1.1, 0.4), transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
      CN,
    );
    this.group.add(this.crateMesh, this.crateGlow);
    for (let i = 0; i < CN; i++) this.crates.push({ x: 0, z: 0, active: false, kind: 'scrap' });
    this.respawnCrates();
  }

  /* --------------------------------------------------------------- */
  private part(b: StaticBatch, geo: BufferGeometry, mat: MeshStandardMaterial, cx: number, cz: number, yaw: number, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, rx = 0, rz = 0) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const wx = cx + lx * c + lz * s;
    const wz = cz - lx * s + lz * c;
    const gy = terrainHeight(cx, cz);
    b.add(geo, mat, wx, gy + ly, wz, sx, sy, sz, rx, yaw, rz);
  }

  private buildClutter(rng: () => number, tx: number, tz: number) {
    const b = new StaticBatch();
    const glass = stdMat(0x1c2a33, 0.2, 0.6);
    const tyre = stdMat(0x151515, 1);
    const carCols = [0x8a2f25, 0x2f4a73, 0x8b8b82, 0x6a6f3a, 0x9b7a2a];
    let cars = 0;
    let tries = 0;
    while (cars < 7 && tries++ < 400) {
      const x = (rng() * 2 - 1) * (WORLD.playX - 10);
      const z = (rng() * 2 - 1) * (WORLD.playZ - 10);
      if (riverDist(x, z) < 6 || Math.hypot(x, z) < 16 || Math.hypot(x - tx, z - tz) < 10) continue;
      const yaw = rng() * 6.28;
      const body = stdMat(carCols[cars % carCols.length], 0.6, 0.35);
      this.part(b, G.box, body, x, z, yaw, 0, 0.62, 0, 4.2, 0.7, 1.9);
      this.part(b, G.box, body, x, z, yaw, -0.2, 1.22, 0, 2.2, 0.55, 1.7);
      this.part(b, G.box, glass, x, z, yaw, -0.2, 1.24, 0, 2.25, 0.35, 1.75);
      for (const wx of [-1.3, 1.3]) for (const wz of [-0.95, 0.95]) this.part(b, G.cyl, tyre, x, z, yaw, wx, 0.38, wz, 0.38, 0.28, 0.38, Math.PI / 2);
      cars++;
    }
    const barrelCols = [0xa83a2a, 0x2a5da8, 0xc79b2a, 0x3c7a3c];
    for (let k = 0; k < 6; k++) {
      const cx = (rng() * 2 - 1) * (WORLD.playX - 10);
      const cz = (rng() * 2 - 1) * (WORLD.playZ - 10);
      if (riverDist(cx, cz) < 6 || Math.hypot(cx, cz) < 14 || Math.hypot(cx - tx, cz - tz) < 8) continue;
      for (let i = 0; i < 3; i++) {
        const m = stdMat(barrelCols[(k + i) % 4], 0.5, 0.4);
        const ox = cx + (rng() - 0.5) * 2;
        const oz = cz + (rng() - 0.5) * 2;
        b.add(G.cyl, m, ox, terrainHeight(ox, oz) + 0.45, oz, 0.34, 0.9, 0.34);
      }
    }
    const tentCols = [0xd9822b, 0x3f7ac0, 0x7ca046];
    for (let k = 0; k < 3; k++) {
      const x = (rng() * 2 - 1) * (WORLD.playX - 12);
      const z = (rng() * 2 - 1) * (WORLD.playZ - 12);
      if (riverDist(x, z) < 7 || Math.hypot(x, z) < 18 || Math.hypot(x - tx, z - tz) < 9) continue;
      b.add(G.cone4, stdMat(tentCols[k], 0.9), x, terrainHeight(x, z) + 0.8, z, 1.9, 1.6, 1.9, 0, rng() * 3, 0);
    }
    this.group.add(b.build());
  }

  private buildTreehouse(tx: number, tz: number) {
    const b = new StaticBatch();
    const pm = plankTexture();
    const dm = plankTexture(true);
    const plank = patchSurface(new MeshStandardMaterial({ map: pm, bumpMap: pm, bumpScale: 2.5, roughness: 0.85 }), { scale: 4, grime: 0.25, bump: 0.3, cloud: true });
    const darkPlank = patchSurface(new MeshStandardMaterial({ map: dm, bumpMap: dm, bumpScale: 2.5, roughness: 0.85 }), { scale: 4, grime: 0.25, bump: 0.3, cloud: true });
    const bk = barkTexture();
    const trunk = patchSurface(new MeshStandardMaterial({ map: bk, bumpMap: bk, bumpScale: 3, roughness: 0.95 }), { scale: 2.5, grime: 0.3, bump: 0.5, cloud: true });
    const roof = stdMat(0xe0508a, 0.7);
    const wall = stdMat(0x59c9c0, 0.8);
    const gy = terrainHeight(tx, tz);
    const PY = gy + 4.5;
    // trunk + supports
    b.add(G.cyl, trunk, tx, gy + 5, tz, 0.95, 10, 0.95);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const px = tx + sx * 2.4;
      const pz = tz + sz * 2.4;
      b.add(G.cyl6, trunk, px, terrainHeight(px, pz) + 2.3, pz, 0.12, 5, 0.12);
    }
    // platform + railings
    b.add(G.box, plank, tx, PY, tz, 5.4, 0.25, 5.4);
    for (const sz of [-1, 1]) b.add(G.box, darkPlank, tx, PY + 0.55, tz + sz * 2.6, 5.4, 0.1, 0.1);
    b.add(G.box, darkPlank, tx - 2.6, PY + 0.55, tz, 0.1, 0.1, 5.4);
    b.add(G.box, darkPlank, tx + 2.6, PY + 0.55, tz, 0.1, 0.1, 5.4);
    for (let i = -2; i <= 2; i++) {
      b.add(G.box, darkPlank, tx + i * 1.3, PY + 0.3, tz + 2.6, 0.08, 0.55, 0.08);
      b.add(G.box, darkPlank, tx + i * 1.3, PY + 0.3, tz - 2.6, 0.08, 0.55, 0.08);
      b.add(G.box, darkPlank, tx - 2.6, PY + 0.3, tz + i * 1.3, 0.08, 0.55, 0.08);
    }
    // hut (east half)
    b.add(G.box, wall, tx + 1.55, PY + 1.35, tz, 2.1, 2.5, 3.6);
    b.add(G.cone4, roof, tx + 1.55, PY + 3.35, tz, 3.1, 1.6, 3.1, 0, Math.PI / 4, 0);
    b.add(G.box, stdMat(0xfff3c4, 0.5), tx + 0.48, PY + 1.4, tz + 0.7, 0.05, 0.8, 0.8); // window
    // ladder (west side)
    const lx = tx - 2.95;
    for (const s of [-1, 1]) b.add(G.box, trunk, lx, gy + 2.3, tz + s * 0.38, 0.09, 4.8, 0.09);
    for (let i = 0; i < 9; i++) b.add(G.box, trunk, lx, gy + 0.35 + i * 0.52, tz, 0.07, 0.07, 0.8);
    // canopy built later from leaf cards (kept off the camera sight line so the platform stays visible)
    // string lights
    for (let i = -2; i <= 2; i++) {
      b.add(G.sphLow, this.lampMat, tx + i * 1.2, PY + 0.95, tz + 2.6, 0.09, 0.09, 0.09);
      b.add(G.sphLow, this.lampMat, tx + i * 1.2, PY + 0.95, tz - 2.6, 0.09, 0.09, 0.09);
      b.add(G.sphLow, this.lampMat, tx - 2.6, PY + 0.95, tz + i * 1.2, 0.09, 0.09, 0.09);
    }
    const root = new Group();
    root.add(b.build());
    const crng = mulberry32(5);
    const cen = [[-3.2, 9.4, -3.2], [3.4, 9.0, -3.0], [-3.4, 9.2, 3.0], [0, 11, 0], [-4.6, 8.0, 0], [2.2, 10.2, 2.4], [-1.5, 10.4, -1.2], [3.8, 8.4, 2.6]].map((c) => new Vector3(c[0], gy + c[1], c[2] + 0 + 0));
    cen.forEach((c) => c.set(c.x + tx, c.y, c.z + tz));
    const canopyGeo = leafCluster(crng, cen, 2.3, new Vector3(tx, gy + 10, tz), 6);
    const canopyMat = patchWind(
      patchSurface(new MeshStandardMaterial({ map: broadCard(false), alphaTest: 0.42, side: DoubleSide, roughness: 0.82 }), { scale: 0.6, grime: 0.16, bump: 0.1, cloud: true }),
      0.25, 1.2, 'y', 0.05,
    );
    const canopy = new Mesh(canopyGeo, canopyMat);
    canopy.castShadow = true;
    root.add(canopy);
    const trunkBranches = new Mesh(
      bufMerge(cen.slice(0, 5).map((c) => branch(new Vector3(tx, gy + 7.5, tz), new Vector3(c.x, c.y - 0.8, c.z), 0.22, 0.07, 5))),
      trunk,
    );
    trunkBranches.castShadow = true;
    root.add(trunkBranches);
    // sign
    const sign = new Mesh(new PlaneGeometry(2.4, 0.9), new MeshStandardMaterial({ map: signTexture(['NO FATTIES', 'ALLOWED'], '#d94f8a'), roughness: 0.75, side: DoubleSide }));
    sign.position.set(tx - 2.68, PY + 0.62, tz);
    sign.rotation.y = -Math.PI / 2;
    sign.castShadow = true;
    root.add(sign);
    this.group.add(root);
    this.treehouse = {
      x: tx,
      z: tz,
      platformY: PY + 0.125,
      ladderX: lx,
      girl: new Vector3(tx - 1.7, PY + 0.125, tz + 0.95),
      mom: new Vector3(tx - 1.7, PY + 0.125, tz - 0.95),
      root,
      base: new Vector3(tx, gy, tz),
    };
  }

  /* --------------------------------------------------------------- */
  refreshTrees() {
    this.trees.forEach((t, i) => {
      const gy = terrainHeight(t.x, t.z);
      const sh = t.shake > 0 ? Math.sin(t.shake * 60) * t.shake * 0.4 : 0;
      const ts = t.felled ? 0.22 : t.scale;
      this.chopTrunk.setMatrixAt(i, compose(t.x + sh, gy, t.z, t.scale * (t.felled ? 1.1 : 1), ts, t.scale * (t.felled ? 1.1 : 1), t.rot));
      const lm = compose(t.x + sh, gy, t.z, t.felled ? 0 : t.scale, t.felled ? 0 : t.scale * (0.6 + 0.4 * (t.hp * 0.5 + 0.5)), t.felled ? 0 : t.scale, t.rot);
      this.chopLeaf.setMatrixAt(i, lm);
      this.chopCore.setMatrixAt(i, lm);
    });
    this.chopTrunk.instanceMatrix.needsUpdate = true;
    this.chopLeaf.instanceMatrix.needsUpdate = true;
    this.chopCore.instanceMatrix.needsUpdate = true;
    if (this.chopLeaf.instanceColor) this.chopLeaf.instanceColor.needsUpdate = true;
  }

  nearestTree(x: number, z: number, r: number): TreeNode | null {
    let best: TreeNode | null = null;
    let bd = r * r;
    for (const t of this.trees) {
      if (t.felled) continue;
      const d = (t.x - x) ** 2 + (t.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  regrowTrees() {
    this.trees.forEach((t) => {
      t.felled = false;
      t.hp = 1;
    });
    this.refreshTrees();
  }

  respawnCrates() {
    const rng = this.rng;
    const colors = { scrap: [0.5, 0.55, 0.62], wood: [0.6, 0.4, 0.2], med: [0.95, 0.95, 0.95] };
    this.crates.forEach((c, i) => {
      let tries = 0;
      do {
        c.x = (rng() * 2 - 1) * (WORLD.playX - 6);
        c.z = (rng() * 2 - 1) * (WORLD.playZ - 6);
        tries++;
      } while (tries < 60 && (terrainHeight(c.x, c.z) < 0.25 || Math.hypot(c.x, c.z) < 16 || Math.hypot(c.x - this.treehouse.x, c.z - this.treehouse.z) < 7));
      const r = rng();
      c.kind = r < 0.68 ? 'scrap' : r < 0.92 ? 'wood' : 'med';
      c.active = true;
      const col = colors[c.kind];
      this.crateMesh.setColorAt(i, _c.setRGB(col[0], col[1], col[2]));
    });
    if (this.crateMesh.instanceColor) this.crateMesh.instanceColor.needsUpdate = true;
  }

  shakeTreehouse(a = 0.5) {
    this.shake = Math.max(this.shake, a);
  }

  update(dt: number, t: number, lamp: number) {
    this.lampMat.emissiveIntensity = lamp * 2.4;
    // crates
    for (let i = 0; i < this.crates.length; i++) {
      const c = this.crates[i];
      if (!c.active) {
        this.crateMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        this.crateGlow.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      const gy = terrainHeight(c.x, c.z);
      this.crateMesh.setMatrixAt(i, compose(c.x, gy + 0.55 + Math.sin(t * 2 + i) * 0.1, c.z, 1, 1, 1, t * 0.8 + i));
      const gs = 1 + Math.sin(t * 3 + i) * 0.12;
      this.crateGlow.setMatrixAt(i, compose(c.x, gy + 0.08, c.z, gs, 1, gs, 0));
    }
    this.crateMesh.instanceMatrix.needsUpdate = true;
    this.crateGlow.instanceMatrix.needsUpdate = true;
    // trees shaking
    let dirty = false;
    for (const tr of this.trees) {
      if (tr.shake > 0) {
        tr.shake = Math.max(0, tr.shake - dt);
        dirty = true;
      }
    }
    if (dirty) this.refreshTrees();
    // treehouse shake
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.5);
      this.treehouse.root.position.x = Math.sin(t * 55) * this.shake * 0.08;
      this.treehouse.root.position.z = Math.cos(t * 47) * this.shake * 0.08;
    } else {
      this.treehouse.root.position.set(0, 0, 0);
    }
  }
}

