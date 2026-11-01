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
  Scene,
  Vector3,
  Euler,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WORLD, riverCenter, riverDist, riverHalfWidth, terrainHeight } from './config';
import { G, StaticBatch, mulberry32, plankTexture, signTexture, stdMat } from './utils';
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

function pineGeo() {
  const parts: BufferGeometry[] = [];
  const add = (r: number, h: number, y: number) => parts.push(new ConeGeometry(r, h, 7).translate(0, y, 0));
  add(1.35, 2.3, 2.0);
  add(1.05, 1.9, 3.2);
  add(0.7, 1.5, 4.2);
  return mergeGeometries(parts)!;
}
function leafyGeo() {
  const parts: BufferGeometry[] = [];
  const add = (r: number, x: number, y: number, z: number) => parts.push(new IcosahedronGeometry(r, 1).translate(x, y, z));
  add(1.2, 0, 2.5, 0);
  add(0.9, 0.7, 3.1, 0.3);
  add(0.85, -0.6, 3.0, -0.4);
  return mergeGeometries(parts)!;
}
const trunkGeo = () => new CylinderGeometry(0.16, 0.27, 1.8, 6).translate(0, 0.9, 0);

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
    const pts: { x: number; z: number; s: number; r: number; leafy: boolean }[] = [];
    const target = Math.round(520 * qf);
    let tries = 0;
    while (pts.length < target && tries++ < 9000) {
      const x = (rng() * 2 - 1) * (WORLD.playX + 9);
      const z = (rng() * 2 - 1) * (WORLD.playZ + 8);
      if (riverDist(x, z) < 6.5 || nearTH(x, z, 11)) continue;
      const edge = Math.max(Math.abs(x) / WORLD.playX, Math.abs(z) / WORLD.playZ);
      if (rng() > 0.1 + 0.9 * Math.pow(Math.min(1, edge), 2.6)) continue;
      pts.push({ x, z, s: 0.8 + rng() * 0.9, r: rng() * 6.28, leafy: rng() < 0.28 });
    }
    const pines = pts.filter((p) => !p.leafy);
    const leafy = pts.filter((p) => p.leafy);
    const trunkMat = new MeshStandardMaterial({ color: 0x5a3b22, roughness: 1 });
    const mkInst = (geo: BufferGeometry, mat: MeshStandardMaterial, list: typeof pts, colors: number[][], lift = 0, cast = true) => {
      const im = new InstancedMesh(geo, mat, Math.max(1, list.length));
      im.count = list.length;
      list.forEach((p, i) => {
        im.setMatrixAt(i, compose(p.x, terrainHeight(p.x, p.z) + lift, p.z, p.s, p.s * (0.9 + (p.r % 1) * 0.35), p.s, p.r));
        const c = colors[Math.floor(rng() * colors.length)];
        im.setColorAt(i, _c.setRGB(c[0], c[1], c[2]));
      });
      im.castShadow = cast;
      im.receiveShadow = false;
      this.group.add(im);
      return im;
    };
    const pineCols = [[0.05, 0.26, 0.1], [0.07, 0.32, 0.12], [0.04, 0.22, 0.12], [0.1, 0.3, 0.1]];
    const leafCols = [[0.18, 0.42, 0.1], [0.24, 0.48, 0.12], [0.3, 0.45, 0.1], [0.14, 0.36, 0.1]];
    mkInst(trunkGeo(), trunkMat, pts, [[1, 1, 1]]);
    // note: trunk instance colors multiply the material color, so keep them white
    mkInst(pineGeo(), new MeshStandardMaterial({ roughness: 0.95, flatShading: true }), pines, pineCols);
    mkInst(leafyGeo(), new MeshStandardMaterial({ roughness: 0.95, flatShading: true }), leafy, leafCols);

    /* ----- rocks ----- */
    const rocks: typeof pts = [];
    tries = 0;
    while (rocks.length < Math.round(110 * qf) && tries++ < 3000) {
      const x = (rng() * 2 - 1) * WORLD.playX;
      const z = (rng() * 2 - 1) * WORLD.playZ;
      if (Math.abs(x) < 10 && Math.abs(z) < 8) continue;
      if (nearTH(x, z, 5)) continue;
      rocks.push({ x, z, s: 0.4 + rng() * 1.3, r: rng() * 6.28, leafy: false });
    }
    const rockIm = new InstancedMesh(new IcosahedronGeometry(1, 0), new MeshStandardMaterial({ roughness: 1, flatShading: true }), rocks.length);
    rocks.forEach((p, i) => {
      const h = terrainHeight(p.x, p.z);
      rockIm.setMatrixAt(i, compose(p.x, h + p.s * 0.2, p.z, p.s * 1.2, p.s * 0.7, p.s, p.r));
      const g = 0.32 + rng() * 0.2;
      rockIm.setColorAt(i, _c.setRGB(g, g * 0.98, g * 0.92));
    });
    rockIm.castShadow = true;
    rockIm.receiveShadow = true;
    this.group.add(rockIm);

    /* ----- grass tufts ----- */
    const tuftGeo = mergeGeometries([
      new ConeGeometry(0.07, 0.6, 3).translate(0, 0.3, 0),
      new ConeGeometry(0.06, 0.45, 3).rotateZ(0.35).translate(0.08, 0.22, 0),
      new ConeGeometry(0.06, 0.5, 3).rotateZ(-0.35).translate(-0.08, 0.24, 0.03),
    ])!;
    const gN = Math.round(1700 * qf);
    const tufts = new InstancedMesh(tuftGeo, new MeshStandardMaterial({ roughness: 1, side: DoubleSide }), gN);
    let gi = 0;
    tries = 0;
    while (gi < gN && tries++ < gN * 6) {
      const x = (rng() * 2 - 1) * WORLD.playX;
      const z = (rng() * 2 - 1) * WORLD.playZ;
      const h = terrainHeight(x, z);
      if (h < 0.35 || riverDist(x, z) < 4 || h > 3) continue;
      const s = 0.8 + rng() * 1.1;
      tufts.setMatrixAt(gi, compose(x, h - 0.02, z, s, s * (0.8 + rng() * 0.6), s, rng() * 6.28));
      tufts.setColorAt(gi, _c.setRGB(0.18 + rng() * 0.2, 0.38 + rng() * 0.2, 0.08 + rng() * 0.08));
      gi++;
    }
    tufts.count = gi;
    this.group.add(tufts);

    /* ----- reeds along the banks ----- */
    const reedN = Math.round(260 * qf);
    const reeds = new InstancedMesh(new CylinderGeometry(0.025, 0.04, 1.8, 4).translate(0, 0.9, 0), new MeshStandardMaterial({ color: 0xb7b36a, roughness: 1 }), reedN);
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
    this.group.add(reeds);

    /* ----- wrecks, barrels, tents (merged) ----- */
    this.buildClutter(rng, tx, tz);

    /* ----- choppable trees ----- */
    const chopN = 26;
    const chopGeoT = trunkGeo();
    tries = 0;
    while (this.trees.length < chopN && tries++ < 4000) {
      const x = (rng() * 2 - 1) * (WORLD.playX - 8);
      const z = (rng() * 2 - 1) * (WORLD.playZ - 8);
      const d = Math.hypot(x, z);
      if (riverDist(x, z) < 5 || d < 14 || d > 50 || nearTH(x, z, 9)) continue;
      if (this.trees.some((t) => Math.hypot(t.x - x, t.z - z) < 6)) continue;
      this.trees.push({ x, z, scale: 1.05 + rng() * 0.45, hp: 1, felled: false, shake: 0, rot: rng() * 6.28 });
    }
    this.chopTrunk = new InstancedMesh(chopGeoT, new MeshStandardMaterial({ color: 0x8a5a30, roughness: 1 }), this.trees.length);
    this.chopLeaf = new InstancedMesh(pineGeo(), new MeshStandardMaterial({ roughness: 0.9, flatShading: true }), this.trees.length);
    this.chopTrunk.castShadow = this.chopLeaf.castShadow = true;
    this.trees.forEach((_t, i) => this.chopLeaf.setColorAt(i, _c.setRGB(0.85 + (i % 3) * 0.05, 0.5 + (i % 4) * 0.08, 0.08)));
    this.group.add(this.chopTrunk, this.chopLeaf);
    this.refreshTrees();

    /* ----- loot crates ----- */
    const CN = 18;
    this.crateMesh = new InstancedMesh(new BoxGeometry(0.8, 0.6, 0.8), new MeshStandardMaterial({ roughness: 0.7, metalness: 0.2 }), CN);
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
    const plank = new MeshStandardMaterial({ map: plankTexture(), roughness: 0.9 });
    const darkPlank = new MeshStandardMaterial({ map: plankTexture(true), roughness: 0.9 });
    const trunk = stdMat(0x5a3b22, 1);
    const leaf = new MeshStandardMaterial({ color: 0x1f6b2f, roughness: 0.95, flatShading: true });
    const leaf2 = new MeshStandardMaterial({ color: 0x2f8a3a, roughness: 0.95, flatShading: true });
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
    // canopy (kept off the camera sight line so the platform stays visible from above)
    const canopy: [number, number, number, number, MeshStandardMaterial][] = [
      [-3.2, 9.4, -3.2, 3.0, leaf],
      [3.4, 9.0, -3.0, 2.6, leaf2],
      [-3.4, 9.2, 3.0, 2.7, leaf2],
      [0, 11, 0, 2.8, leaf],
      [-4.6, 8.0, 0, 2.2, leaf],
    ];
    for (const [ox, oy, oz, r, m] of canopy) b.add(G.ico, m, tx + ox, gy + oy, tz + oz, r, r * 0.85, r);
    // string lights
    for (let i = -2; i <= 2; i++) {
      b.add(G.sphLow, this.lampMat, tx + i * 1.2, PY + 0.95, tz + 2.6, 0.09, 0.09, 0.09);
      b.add(G.sphLow, this.lampMat, tx + i * 1.2, PY + 0.95, tz - 2.6, 0.09, 0.09, 0.09);
      b.add(G.sphLow, this.lampMat, tx - 2.6, PY + 0.95, tz + i * 1.2, 0.09, 0.09, 0.09);
    }
    const root = new Group();
    root.add(b.build());
    // sign
    const sign = new Mesh(new PlaneGeometry(2.4, 0.9), new MeshStandardMaterial({ map: signTexture(['NO FATTIES', 'ALLOWED'], '#d94f8a'), roughness: 0.8, side: DoubleSide }));
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
      this.chopLeaf.setMatrixAt(i, compose(t.x + sh, gy, t.z, t.felled ? 0 : t.scale, t.felled ? 0 : t.scale * (0.6 + 0.4 * (t.hp * 0.5 + 0.5)), t.felled ? 0 : t.scale, t.rot));
    });
    this.chopTrunk.instanceMatrix.needsUpdate = true;
    this.chopLeaf.instanceMatrix.needsUpdate = true;
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

