import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  RingGeometry,
  Scene,
  Shape,
  Vector3,
} from 'three';
import {
  DECK_Y,
  SHIP_LEVELS,
  SLOT_PAIR_X,
  buildingCost,
  clamp,
  ecoRate,
  slotLocal,
  turretStats,
  type BuildingType,
} from './config';
import { G, StaticBatch, stdMat } from './utils';
import { paintTexture, plankTexture, rustTexture } from './textures';
import { patchSurface } from './shading';
import type { Game } from './game';
import type { Zombie } from './zombies';

export interface Building {
  type: BuildingType;
  level: number;
  slot: number;
  group: Group;
  head: Object3D;
  muzzle: Vector3;
  cd: number;
  retarget: number;
  target: Zombie | null;
  acc: number;
  tick: number;
  lastFire: number;
}

const glowOrange = new MeshStandardMaterial({ color: 0x331100, emissive: 0xff7a1a, emissiveIntensity: 3, roughness: 0.4 });
const glowCyan = new MeshStandardMaterial({ color: 0x113344, emissive: 0x5ad6ff, emissiveIntensity: 3, roughness: 0.3 });
const glowGreen = new MeshStandardMaterial({ color: 0x113322, emissive: 0x4cf08a, emissiveIntensity: 2.4, roughness: 0.4 });
const ACCENT = [0x9aa5b1, 0x6ec27a, 0xf2c14e];

function lerpAngle(a: number, b: number, t: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function angDiff(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

function mesh(geo: import('three').BufferGeometry, mat: Material, parent: Object3D, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function makeBuildingMesh(type: BuildingType, level: number) {
  const g = new Group();
  const acc = stdMat(ACCENT[level - 1], 0.45, 0.6);
  const dark = stdMat(0x2a2e34, 0.6, 0.5);
  mesh(G.cyl, dark, g, 0, 0.12, 0, 0.62, 0.24, 0.62);
  for (let i = 0; i < level; i++) mesh(G.sphLow, stdMat(0xf2c14e, 0.3, 0.8), g, -0.2 + i * 0.2, 0.28, 0.6, 0.06, 0.06, 0.06);
  let head: Object3D = new Group();
  g.add(head);
  const muzzle = new Vector3(0, 0.9, 1.0);
  switch (type) {
    case 'gun': {
      head.position.y = 0.55;
      mesh(G.box, acc, head, 0, 0, 0, 0.55, 0.38, 0.6);
      mesh(G.box, dark, head, 0, 0.26, -0.05, 0.3, 0.18, 0.35);
      const bars = level >= 2 ? [-0.14, 0.14] : [0];
      for (const bxo of bars) mesh(G.cyl6, dark, head, bxo, 0.02, 0.8, 0.065, 0.9, 0.065, Math.PI / 2);
      if (level === 3) mesh(G.box, stdMat(0x7a5b2e, 0.6), head, 0, -0.05, -0.45, 0.4, 0.3, 0.3);
      muzzle.set(0, 0.57, 1.3);
      break;
    }
    case 'flame': {
      head.position.y = 0.55;
      mesh(G.cyl, stdMat(0xc0392b, 0.5, 0.3), head, 0, 0.05, -0.3, 0.26, 0.7, 0.26, Math.PI / 2);
      mesh(G.box, dark, head, 0, 0, 0.1, 0.4, 0.32, 0.5);
      mesh(G.cone, acc, head, 0, 0, 0.62, 0.17, 0.5, 0.17, Math.PI / 2);
      mesh(G.sphLow, glowOrange, head, 0, 0, 0.9, 0.08, 0.08, 0.08);
      muzzle.set(0, 0.55, 1.5);
      break;
    }
    case 'tesla': {
      mesh(G.cyl, dark, g, 0, 0.5, 0, 0.3, 0.6, 0.3);
      const rings = 2 + level;
      for (let i = 0; i < rings; i++) mesh(G.cyl, acc, g, 0, 0.8 + i * 0.3, 0, 0.42 - i * 0.04, 0.07, 0.42 - i * 0.04);
      head = new Group();
      head.position.y = 0.95 + rings * 0.3;
      g.add(head);
      mesh(G.sph, glowCyan, head, 0, 0.1, 0, 0.26, 0.26, 0.26);
      muzzle.set(0, 1.05 + rings * 0.3, 0);
      break;
    }
    case 'press': {
      mesh(G.box, acc, g, 0, 0.6, 0, 0.95, 0.8, 0.95);
      mesh(G.box, dark, g, 0, 1.05, 0, 1.0, 0.12, 1.0);
      head = new Group();
      head.position.set(0, 1.25, 0);
      g.add(head);
      mesh(G.box, stdMat(0xc0a060, 0.4, 0.7), head, 0, 0.1, 0, 0.5, 0.3, 0.5);
      mesh(G.cyl, dark, g, 0.55, 0.6, 0, 0.3, 0.12, 0.3, 0, 0, Math.PI / 2);
      break;
    }
    case 'sawmill': {
      mesh(G.box, stdMat(0x7a5128, 0.9), g, 0, 0.45, 0, 1.1, 0.45, 0.8);
      for (let i = 0; i < 3; i++) mesh(G.cyl, stdMat(0xb5793f, 0.9), g, -0.35 + i * 0.35, 0.82, 0.1, 0.15, 0.9, 0.15, 0, 0, Math.PI / 2);
      head = new Group();
      head.position.set(0, 0.95, -0.45);
      g.add(head);
      mesh(G.cyl, stdMat(0xcfd3d8, 0.3, 0.9), head, 0, 0, 0, 0.45, 0.04, 0.45, Math.PI / 2);
      break;
    }
    case 'repair': {
      mesh(G.box, stdMat(0xf2f2f2, 0.5, 0.2), g, 0, 0.55, 0, 0.9, 0.7, 0.9);
      mesh(G.box, glowGreen, g, 0, 0.6, 0.46, 0.5, 0.14, 0.04);
      mesh(G.box, glowGreen, g, 0, 0.6, 0.46, 0.14, 0.5, 0.04);
      head = new Group();
      head.position.set(0, 1.2, 0);
      g.add(head);
      mesh(G.box, stdMat(0xb5b5b5, 0.3, 0.9), head, 0, 0, 0, 0.7, 0.08, 0.14);
      mesh(G.sphLow, glowGreen, head, 0, 0.06, 0, 0.1, 0.1, 0.1);
      break;
    }
  }
  g.scale.setScalar(1 + (level - 1) * 0.1);
  return { group: g, head, muzzle };
}

export class Ship {
  group = new Group();
  level = 1;
  buildings: (Building | null)[] = new Array(12).fill(null);
  rect = { minX: -8, maxX: 6.4, minZ: -3, maxZ: 3 };
  bobY = 0;
  private hull = new Group();
  private pads: { root: Group; ring: Mesh; plus: Group; hit: Mesh }[] = [];
  hitboxes: Mesh[] = [];
  private lampMat = new MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffcc55, emissiveIntensity: 0, roughness: 0.5 });
  private winMat = new MeshStandardMaterial({ color: 0x1b3a52, emissive: 0xffd88a, emissiveIntensity: 0, roughness: 0.2, metalness: 0.5 });
  private lights: PointLight[] = [];
  private rustTex = (() => { const t = rustTexture().clone(); t.repeat.set(0.16, 0.2); t.needsUpdate = true; return t; })();
  private paintTex = (() => { const t = paintTexture().clone(); t.repeat.set(0.2, 0.2); t.needsUpdate = true; return t; })();
  private plank = (() => { const t = plankTexture(true).clone(); t.repeat.set(0.3, 0.3); t.needsUpdate = true; return t; })();
  private plankLight = (() => { const t = plankTexture(false).clone(); t.repeat.set(0.3, 0.3); t.needsUpdate = true; return t; })();
  private selected = -1;
  private flameAcc = 0;
  private padsOn = true;

  constructor(scene: Scene) {
    scene.add(this.group);
    this.group.add(this.hull);
    this.rustTex.repeat.set(0.22, 0.22);
    this.paintTex.repeat.set(0.3, 0.3);
    this.plank.repeat.set(0.3, 0.3);
    this.plankLight.repeat.set(0.3, 0.3);
    // slot pads
    const ringGeo = new RingGeometry(0.62, 0.8, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const hitGeo = new CylinderGeometry(1, 1, 1.6, 12);
    for (let i = 0; i < 12; i++) {
      const root = new Group();
      const p = slotLocal(i);
      root.position.set(p.x, DECK_Y + 0.04, p.z);
      const ring = new Mesh(ringGeo, new MeshBasicMaterial({ color: new Color(2.2, 1.7, 0.4), transparent: true, opacity: 0.85, toneMapped: false, blending: AdditiveBlending, depthWrite: false }));
      const plus = new Group();
      const pm = new MeshBasicMaterial({ color: new Color(2.2, 1.7, 0.4), toneMapped: false, transparent: true, opacity: 0.85, depthWrite: false });
      const a = new Mesh(new BoxGeometry(0.4, 0.02, 0.08), pm);
      const b = new Mesh(new BoxGeometry(0.08, 0.02, 0.4), pm);
      plus.add(a, b);
      const hit = new Mesh(hitGeo, new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.position.y = 0.6;
      hit.userData.slot = i;
      root.add(ring, plus, hit);
      root.visible = false;
      this.group.add(root);
      this.pads.push({ root, ring, plus, hit });
      this.hitboxes.push(hit);
    }
    this.lights = [new PointLight(0xffc070, 0, 22, 2), new PointLight(0xffc070, 0, 22, 2)];
    this.lights[0].position.set(-5, 4, 0);
    this.lights[1].position.set(5, 4, 0);
    this.group.add(...this.lights);
    this.setLevel(1);
  }

  get def() {
    return SHIP_LEVELS[this.level - 1];
  }

  setLevel(level: number) {
    this.level = clamp(level, 1, 5);
    this.rebuildHull();
    const unlocked = this.def.slots;
    this.pads.forEach((p, i) => {
      p.root.visible = this.padsOn && i < unlocked;
    });
    // move existing buildings onto (unchanged) slot positions — they stay put by design
    this.refreshPads();
  }

  private disposeHull() {
    while (this.hull.children.length) {
      const c = this.hull.children[0] as Mesh;
      this.hull.remove(c);
      c.geometry?.dispose();
    }
  }

  private rebuildHull() {
    this.disposeHull();
    const lv = this.level;
    const { L, W } = this.def;
    this.rect = { minX: -L, maxX: L - 1.6, minZ: -W, maxZ: W };
    const shape = new Shape();
    shape.moveTo(-L, -W);
    shape.lineTo(L - 3.4, -W);
    shape.quadraticCurveTo(L - 0.5, -W * 0.95, L, 0);
    shape.quadraticCurveTo(L - 0.5, W * 0.95, L - 3.4, W);
    shape.lineTo(-L, W);
    shape.lineTo(-L, -W);
    const geo = new ExtrudeGeometry(shape, { depth: 2.6, bevelEnabled: false, curveSegments: 10 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, DECK_Y - 2.6, 0);

    // materials per level
    const rustMat = patchSurface(new MeshStandardMaterial({ map: this.rustTex, bumpMap: this.rustTex, bumpScale: 4, roughness: 0.78, metalness: 0.4, color: lv === 2 ? 0xd8c4b0 : 0xffffff }), { scale: 2.2, grime: 0.35, bump: 0.8, cloud: false });
    const steel = patchSurface(new MeshStandardMaterial({ color: lv === 3 ? 0x7d8895 : 0x2c4d73, roughness: 0.38, metalness: 0.75 }), { scale: 3, grime: 0.2, bump: 0.5, rough: 0.3 });
    const paint = patchSurface(new MeshStandardMaterial({ map: this.paintTex, roughness: 0.22, metalness: 0.25 }), { scale: 4, grime: 0.08, bump: 0.2, rough: 0.1 });
    const hullMat = lv <= 2 ? rustMat : lv === 5 ? paint : steel;
    const deckMat = new MeshStandardMaterial({
      map: lv <= 2 ? this.plankLight : lv === 5 ? this.plankLight : null,
      bumpMap: lv <= 2 ? this.plankLight : lv === 5 ? this.plankLight : null,
      bumpScale: 2.5,
      color: lv === 3 ? 0x59606a : lv === 4 ? 0x7e8791 : lv <= 2 ? 0xd6bfa8 : 0xffffff,
      roughness: 0.85,
      metalness: lv === 3 || lv === 4 ? 0.3 : 0,
    });
    const hullMesh = new Mesh(geo, [deckMat, hullMat]);
    hullMesh.castShadow = true;
    hullMesh.receiveShadow = true;
    this.hull.add(hullMesh);

    const b = new StaticBatch();
    const rust = stdMat(0x8a4b2a, 0.9, 0.4);
    const rustD = stdMat(0x5a2f1c, 0.95, 0.3);
    const ply = stdMat(0xb99a62, 0.9);
    const white = stdMat(0xf4f4f0, 0.35, 0.15);
    const gold = stdMat(0xe3b347, 0.25, 0.9);
    const chrome = stdMat(0xd8dde2, 0.2, 0.9);
    const navy = stdMat(0x1f3a5c, 0.5, 0.4);
    const grey = stdMat(0x6c7681, 0.55, 0.5);
    const black = stdMat(0x181a1d, 0.8);
    const solar = stdMat(0x1a2a52, 0.3, 0.6);
    const railMat = lv <= 2 ? rustD : lv === 5 ? gold : chrome;
    const cabMat = lv <= 2 ? rust : lv === 3 ? grey : lv === 4 ? navy : white;
    const y0 = DECK_Y;

    // railings
    const rl = L - 3.6;
    for (const s of [-1, 1]) {
      const posts = Math.floor((rl + L) / 1.6);
      for (let i = 0; i <= posts; i++) {
        if (lv === 1 && (i + (s > 0 ? 1 : 0)) % 3 === 0) continue; // broken rail
        const x = -L + 0.15 + i * ((rl + L - 0.15) / posts);
        b.add(G.cyl6, railMat, x, y0 + 0.3, s * (W - 0.1), 0.045, 0.6, 0.045);
      }
      if (lv > 1) b.add(G.box, railMat, (rl - L) / 2, y0 + 0.6, s * (W - 0.1), rl + L, 0.05, 0.05);
      else b.add(G.box, railMat, (rl - L) / 2 - 1.5, y0 + 0.6, s * (W - 0.1), (rl + L) * 0.6, 0.05, 0.05);
    }
    if (lv > 1) b.add(G.box, railMat, -L + 0.1, y0 + 0.6, 0, 0.05, 0.05, W * 2);

    // wheelhouse
    const cx = lv === 5 ? -L + 2.3 : -L + 2.3;
    const cw = lv === 5 ? 1.45 : 1.3;
    const cl = lv === 5 ? 3.4 : lv === 4 ? 3.4 : 3.0;
    const ch = lv >= 4 ? 2.0 : 1.7;
    b.add(G.box, cabMat, cx, y0 + ch / 2, 0, cl, ch, cw * 2, 0, 0, lv === 1 ? 0.03 : 0);
    b.add(G.box, lv <= 2 ? rustD : lv === 5 ? gold : black, cx, y0 + ch + 0.06, 0, cl + 0.2, 0.12, cw * 2 + 0.2);
    // windows
    for (const s of [-1, 1]) b.add(G.box, this.winMat, cx + cl / 2 + 0.01, y0 + ch * 0.62, s * 0.7, 0.04, 0.5, 0.7);
    b.add(G.box, this.winMat, cx + cl / 2 + 0.01, y0 + ch * 0.62, 0, 0.04, 0.5, 0.7);
    if (lv >= 4) {
      b.add(G.box, cabMat, cx, y0 + ch + 0.7, 0, cl - 0.8, 1.2, cw * 2 - 0.5);
      b.add(G.box, this.winMat, cx + (cl - 0.8) / 2 + 0.01, y0 + ch + 0.75, 0, 0.04, 0.55, cw * 2 - 0.9);
      b.add(G.box, lv === 5 ? gold : black, cx, y0 + ch + 1.36, 0, cl - 0.6, 0.1, cw * 2 - 0.3);
    }
    // funnel
    const fy = y0 + ch + (lv >= 4 ? 1.4 : 0.2);
    b.add(G.cyl, lv === 5 ? white : lv <= 2 ? rustD : grey, cx - 1.0, fy + 0.6, 0, 0.42, 1.2, 0.42);
    b.add(G.cyl, lv === 5 ? stdMat(0xc0392b, 0.4) : black, cx - 1.0, fy + 1.25, 0, 0.45, 0.2, 0.45);

    // mast
    const mx = 1.0;
    if (lv === 1) {
      b.add(G.cyl6, rustD, mx, y0 + 1.9, 0, 0.07, 3.8, 0.07, 0, 0, 0.22);
      b.add(G.box, stdMat(0x9a2f2f, 0.9), mx + 0.5, y0 + 3.3, 0, 0.7, 0.45, 0.02, 0, 0, -0.25);
    } else {
      b.add(G.cyl6, lv <= 2 ? rustD : chrome, mx, y0 + 2.3, 0, 0.07, 4.6, 0.07);
      b.add(G.box, lv <= 2 ? rustD : chrome, mx, y0 + 3.5, 0, 0.05, 0.05, 1.3);
      const flag = lv === 5 ? 0xe3b347 : lv >= 3 ? 0x2c8fc9 : 0xc0392b;
      b.add(G.box, stdMat(flag, 0.9), mx + 0.55, y0 + 4.2, 0, 1.0, 0.55, 0.02);
    }

    // hull add-ons
    if (lv === 1) {
      for (let i = 0; i < 6; i++) for (const s of [-1, 1]) b.add(G.cyl, black, -4.5 + i * 2.1, y0 - 0.65, s * (W + 0.12), 0.34, 0.26, 0.34, Math.PI / 2);
      b.add(G.box, rustD, -3, y0 + 0.05, 1.2, 0.8, 0.02, 0.5); // holes in the deck
      b.add(G.box, black, 3.2, y0 + 0.03, -0.8, 0.9, 0.02, 0.6);
    }
    if (lv === 2) {
      for (let i = 0; i < 5; i++) for (const s of [-1, 1]) b.add(G.box, ply, -5 + i * 2.5, y0 - 0.6, s * (W + 0.05), 1.3, 0.9, 0.06);
      b.add(G.box, stdMat(0x2c6fa8, 0.9), -1.6, y0 + 0.9, 0, 2.2, 0.05, 1.4, 0, 0, 0.12);
      for (let i = 0; i < 5; i++) for (const s of [-1, 1]) b.add(G.cyl, black, -4 + i * 2.2, y0 - 0.65, s * (W + 0.22), 0.32, 0.24, 0.32, Math.PI / 2);
    }
    if (lv === 3 || lv === 4) {
      for (let i = 0; i < 7; i++) for (const s of [-1, 1]) b.add(G.box, lv === 3 ? stdMat(0x7b838c, 0.5, 0.6) : navy, -L + 2 + i * ((2 * L - 5) / 6), y0 - 0.55, s * (W + 0.05), 2.0, 1.2, 0.08);
      for (let i = 0; i < 4; i++) b.add(G.box, stdMat(0xcdbb8a, 1), L - 3.2 + i * 0.5, y0 + 0.2, (i % 2 ? 1 : -1) * 0.5, 0.7, 0.4, 0.45); // sandbags
      b.add(G.cyl6, black, cx, y0 + ch + 0.5, 0.0, 0.08, 0.7, 0.08);
      b.add(G.box, stdMat(0xfff4c4, 0.3), cx + 0.15, y0 + ch + 0.9, 0, 0.35, 0.22, 0.22); // searchlight
    }
    if (lv === 4) {
      b.add(G.cone, grey, L + 0.1, y0 - 0.3, 0, 0.3, 1.3, 0.3, 0, 0, -Math.PI / 2); // ram spike
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) b.add(G.cone, stdMat(0x9aa5b1, 0.4, 0.8), -2 + i * 2.5, y0 + 0.65, s * (W + 0.1), 0.12, 0.45, 0.12);
      b.add(G.cyl, grey, cx + 0.2, y0 + ch + 1.75, 0, 0.5, 0.06, 0.5); // radar dish
      b.add(G.box, solar, cx - 0.9, y0 + ch + 1.42, 0.5, 1.0, 0.04, 0.8, 0, 0, 0.0);
      b.add(G.box, solar, cx - 0.9, y0 + ch + 1.42, -0.5, 1.0, 0.04, 0.8);
    }
    if (lv === 5) {
      // gold trim along hull
      b.add(G.box, gold, (rl - L) / 2 + 0.2, y0 - 0.1, W + 0.02, rl + L, 0.12, 0.03);
      b.add(G.box, gold, (rl - L) / 2 + 0.2, y0 - 0.1, -W - 0.02, rl + L, 0.12, 0.03);
      // hot tub
      b.add(G.cyl, white, -4.6, y0 + 0.3, 0, 1.15, 0.6, 1.15);
      b.add(G.cyl, glowCyan, -4.6, y0 + 0.58, 0, 0.95, 0.04, 0.95);
      // loungers
      for (const s of [-1, 1]) {
        b.add(G.box, white, 1.8, y0 + 0.25, s * 0.45, 1.8, 0.2, 0.6);
        b.add(G.box, white, 0.9, y0 + 0.45, s * 0.45, 0.06, 0.55, 0.6, 0, 0, -0.5);
      }
      // palm trees
      for (const s of [-1, 1]) {
        const px = L - 2.6;
        b.add(G.cyl, stdMat(0xffffff, 0.5), px, y0 + 0.2, s * 1.1, 0.3, 0.4, 0.3);
        b.add(G.cyl6, stdMat(0x8a6a3f, 0.9), px, y0 + 1.2, s * 1.1, 0.07, 2.0, 0.07);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          b.add(G.cone, stdMat(0x2f9e44, 0.8), px + Math.cos(a) * 0.55, y0 + 2.15, s * 1.1 + Math.sin(a) * 0.55, 0.14, 1.2, 0.14, Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
        }
      }
      // helipad ring (decorative)
      b.add(G.cyl, stdMat(0x2a2a2a, 0.9), L - 7.0, y0 + 0.02, 0, 0.0001, 0.0001, 0.0001);
    }
    // string lights (lv>=2) along rails
    if (lv >= 2) {
      for (let i = 0; i < 9; i++) for (const s of [-1, 1]) b.add(G.sphLow, this.lampMat, -L + 1 + i * ((2 * L - 6) / 8), y0 + 0.72, s * (W - 0.1), 0.07, 0.07, 0.07);
    }
    b.add(G.sphLow, this.lampMat, cx + cl / 2 + 0.15, y0 + ch + 0.05, 0, 0.12, 0.12, 0.12);
    b.add(G.sphLow, this.lampMat, L - 1.0, y0 + 0.9, 0, 0.12, 0.12, 0.12);
    // anchor/capstan
    b.add(G.cyl, lv <= 2 ? rustD : chrome, L - 2.6, y0 + 0.2, 0, 0.3, 0.4, 0.3);
    this.hull.add(b.build());
    this.lights[0].position.set(cx + 1.5, y0 + 3, 0);
    this.lights[1].position.set(L - 3, y0 + 3, 0);
  }

  /* ------------------------ slots & buildings ------------------------ */
  showPads(v: boolean) {
    this.padsOn = v;
    this.pads.forEach((p, i) => {
      p.root.visible = v && i < this.def.slots;
    });
  }

  setSelected(i: number) {
    this.selected = i;
  }

  refreshPads() {
    this.pads.forEach((p, i) => {
      const occupied = !!this.buildings[i];
      p.ring.visible = true;
      p.plus.visible = !occupied;
    });
  }

  build(slot: number, type: BuildingType, level = 1) {
    this.remove(slot);
    const m = makeBuildingMesh(type, level);
    const p = slotLocal(slot);
    m.group.position.set(p.x, DECK_Y, p.z);
    m.group.rotation.y = p.z > 0 ? 0.5 : -0.5 + Math.PI * 0; // slight outward yaw
    this.group.add(m.group);
    const b: Building = {
      type, level, slot, group: m.group, head: m.head, muzzle: m.muzzle,
      cd: 0, retarget: 0, target: null, acc: 0, tick: 0, lastFire: 0,
    };
    this.buildings[slot] = b;
    this.refreshPads();
    return b;
  }

  upgrade(slot: number) {
    const b = this.buildings[slot];
    if (!b) return;
    this.build(slot, b.type, b.level + 1);
  }

  remove(slot: number) {
    const b = this.buildings[slot];
    if (b) {
      this.group.remove(b.group);
      this.buildings[slot] = null;
    }
    this.refreshPads();
  }

  /* ------------------------ geometry helpers ------------------------ */
  onDeck(x: number, z: number) {
    const r = this.rect;
    if (x < r.minX || x > r.maxX + 0.6) return false;
    return Math.abs(z) <= r.maxZ - (x > r.maxX - 1.2 ? (x - (r.maxX - 1.2)) * 1.1 : 0);
  }

  /** closest point on the hull rectangle */
  nearest(x: number, z: number, out: { x: number; z: number }) {
    const r = this.rect;
    out.x = clamp(x, r.minX, r.maxX);
    out.z = clamp(z, r.minZ, r.maxZ);
    return out;
  }

  incomes() {
    let scrap = 0, wood = 0, repair = 0;
    for (const b of this.buildings) {
      if (!b) continue;
      if (b.type === 'press') scrap += ecoRate('press', b.level);
      if (b.type === 'sawmill') wood += ecoRate('sawmill', b.level);
      if (b.type === 'repair') repair += ecoRate('repair', b.level);
    }
    return { scrap, wood, repair };
  }

  sellValue(b: Building) {
    let s = 0, w = 0;
    for (let l = 1; l <= b.level; l++) {
      const c = buildingCost(b.type, l);
      s += c.scrap;
      w += c.wood;
    }
    return { scrap: Math.floor(s * 0.5), wood: Math.floor(w * 0.5) };
  }

  /* ------------------------ per-frame ------------------------ */
  update(dt: number, t: number, game: Game) {
    const lamp = game.light.lamp;
    this.bobY = Math.sin(t * 0.9) * 0.05;
    this.group.position.y = this.bobY;
    this.group.rotation.z = Math.sin(t * 0.7) * 0.012;
    this.group.rotation.x = Math.sin(t * 0.5) * 0.008;
    this.lampMat.emissiveIntensity = lamp * 2.6;
    this.winMat.emissiveIntensity = lamp * 1.4 + 0.05;
    this.lights[0].intensity = lamp * 30;
    this.lights[1].intensity = lamp * 24;

    // pads
    this.pads.forEach((p, i) => {
      if (!p.root.visible) return;
      const occupied = !!this.buildings[i];
      const sel = this.selected === i;
      const pulse = 1 + Math.sin(t * 3 + i) * 0.08;
      p.ring.scale.setScalar(sel ? 1.25 : pulse);
      const mat = p.ring.material as MeshBasicMaterial;
      if (sel) mat.color.setRGB(0.4, 2.2, 0.9);
      else mat.color.setRGB(2.2, 1.7, 0.4);
      mat.opacity = occupied && !sel ? 0.28 : 0.85;
      p.plus.rotation.y = t * 0.8;
    });

    const live = game.running;
    for (const b of this.buildings) {
      if (!b) continue;
      const lx = SLOT_PAIR_X[Math.floor(b.slot / 2)];
      const wx = lx;
      const wz = slotLocal(b.slot).z;
      if (b.type === 'press') {
        b.head.position.y = 1.25 + Math.abs(Math.sin(t * 3 + b.slot)) * 0.12;
        if (live) this.eco(b, dt, game, 'scrap', ecoRate('press', b.level), wx, wz);
      } else if (b.type === 'sawmill') {
        b.head.rotation.z += dt * 8;
        if (live) this.eco(b, dt, game, 'wood', ecoRate('sawmill', b.level), wx, wz);
      } else if (b.type === 'repair') {
        b.head.rotation.y += dt * 2;
        if (live && game.run.hull < game.run.hullMax) game.healHull(ecoRate('repair', b.level) * dt);
      } else if (live) {
        this.turret(b, dt, t, game, wx, wz);
      } else if (b.type === 'tesla') {
        b.head.scale.setScalar(1 + Math.sin(t * 4) * 0.05);
      }
    }
  }

  private eco(b: Building, dt: number, game: Game, kind: 'scrap' | 'wood', rate: number, wx: number, wz: number) {
    b.acc += rate * dt;
    if (b.acc >= 1) {
      const n = Math.floor(b.acc);
      b.acc -= n;
      game.addResource(kind, n);
      game.fx.particles.burst(wx, DECK_Y + 1.6, wz, 3, 1.2, kind === 'scrap' ? 0xffd45a : 0xc98a4a, 0.09, 0.5, 2.5);
    }
  }

  private turret(b: Building, dt: number, t: number, game: Game, wx: number, wz: number) {
    const st = turretStats(b.type, b.level);
    const zm = game.zm;
    const by = DECK_Y + 0.9;
    b.retarget -= dt;
    if (b.retarget <= 0 || (b.target && (b.target.dead || b.target.hp <= 0))) {
      b.target = zm.nearest(wx, wz, st.range);
      b.retarget = 0.18;
    }
    const tg = b.target;
    if (b.type === 'tesla') b.head.scale.setScalar(1 + Math.sin(t * 6) * 0.08 + (tg ? 0.1 : 0));
    if (!tg) return;
    const dx = tg.x - wx;
    const dz = tg.z - wz;
    const dist = Math.hypot(dx, dz);
    if (dist > st.range + 1.5) {
      b.target = null;
      return;
    }
    const yaw = Math.atan2(dx, dz) - b.group.rotation.y;
    if (b.type !== 'tesla') b.head.rotation.y = lerpAngle(b.head.rotation.y, yaw, 1 - Math.exp(-14 * dt));
    const aligned = b.type === 'tesla' || angDiff(b.head.rotation.y, yaw) < 0.25;
    b.cd -= dt;
    const mx = wx + dx / (dist || 1) * 1.3;
    const mz = wz + dz / (dist || 1) * 1.3;
    const muzzle = new Vector3(mx, by + 0.45, mz);
    if (b.type === 'gun') {
      if (b.cd <= 0 && aligned) {
        b.cd = 1 / st.rate;
        game.fx.tracers.add(muzzle, tg.x, tg.y + 1.1 * tg.scale, tg.z, new Color(3, 2.4, 0.9), 0.07, 0.07);
        game.fx.particles.emit(muzzle.x, muzzle.y, muzzle.z, 0, 0.5, 0, 0.08, 0.35, new Color(4, 3, 1), 0, 0);
        zm.damage(tg, st.dmg, dx / dist, dz / dist, 0.5);
        game.audio.play('pistol', 0.35);
      }
    } else if (b.type === 'flame') {
      if (aligned && dist < st.range) {
        const dirx = dx / dist;
        const dirz = dz / dist;
        this.flameAcc += dt * 60;
        while (this.flameAcc >= 1) {
          this.flameAcc -= 1;
          const sp = 7 + Math.random() * 3;
          const ang = (Math.random() - 0.5) * 0.45;
          const cx = Math.cos(ang);
          const sx = Math.sin(ang);
          const vx = dirx * cx - dirz * sx;
          const vz = dirx * sx + dirz * cx;
          const hot = Math.random();
          game.fx.particles.emit(muzzle.x, muzzle.y, muzzle.z, vx * sp, 0.2 + Math.random() * 0.6, vz * sp, 0.35 + Math.random() * 0.2, 0.22, hot < 0.5 ? new Color(4, 1.6, 0.3) : new Color(3, 0.7, 0.1), -1.5, 1, 1.6);
        }
        b.tick -= dt;
        if (b.tick <= 0) {
          b.tick = 0.1;
          const dmg = st.dmg * 0.1;
          zm.each((z) => {
            const ddx = z.x - wx;
            const ddz = z.z - wz;
            const d = Math.hypot(ddx, ddz);
            if (d > st.range || d < 0.01) return;
            const a = Math.acos(clamp((ddx * dirx + ddz * dirz) / d, -1, 1));
            if (a < 0.5) zm.damage(z, dmg, dirx, dirz, 0.1, true);
          });
          game.audio.play('flame', 0.5);
        }
      }
    } else if (b.type === 'tesla') {
      if (b.cd <= 0) {
        b.cd = 1 / st.rate;
        game.audio.play('tesla', 0.6);
        const hits: Zombie[] = [tg];
        let prevX = muzzle.x, prevY = muzzle.y, prevZ = muzzle.z;
        let cur: Zombie = tg;
        let dmg = st.dmg;
        const col = new Color(1.2, 3, 4);
        for (let k = 0; k < st.chain; k++) {
          const ty = cur.y + 1.1 * cur.scale;
          const mxp = (prevX + cur.x) / 2 + (Math.random() - 0.5) * 0.8;
          const myp = (prevY + ty) / 2 + (Math.random() - 0.5) * 0.8;
          const mzp = (prevZ + cur.z) / 2 + (Math.random() - 0.5) * 0.8;
          game.fx.tracers.add(new Vector3(prevX, prevY, prevZ), mxp, myp, mzp, col, 0.09, 0.14);
          game.fx.tracers.add(new Vector3(mxp, myp, mzp), cur.x, ty, cur.z, col, 0.09, 0.14);
          zm.damage(cur, dmg, 0, 0, 0.2);
          game.fx.particles.burst(cur.x, ty, cur.z, 4, 2.5, new Color(1.5, 3, 4), 0.07, 0.3, 2);
          dmg *= 0.85;
          prevX = cur.x; prevY = ty; prevZ = cur.z;
          const nxt = zm.nearestExcluding(cur.x, cur.z, 5.5, hits);
          if (!nxt) break;
          hits.push(nxt);
          cur = nxt;
        }
      }
    }
  }
}
