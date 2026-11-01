import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { G, stdMat } from './utils';

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
  legL: Group;
  legR: Group;
  weapon: Group;
  kind: HumanKind;
}

function bx(parent: Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, rough = 0.85) {
  const m = new Mesh(G.box, stdMat(color, rough));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function sp(parent: Object3D, sx: number, sy: number, sz: number, color: number, x: number, y: number, z: number, rough = 0.8) {
  const m = new Mesh(G.sphLow, stdMat(color, rough));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
const glowRed = new MeshBasicMaterial({ color: new Color(3, 0.4, 0.3), toneMapped: false });

interface Cfg {
  skin: number;
  top: number;
  sleeve: number;
  pants: number;
  fat: boolean;
  tw: number;
  td: number;
  legX: number;
  armX: number;
  armT: number;
  scale: number;
}
const CFG: Record<HumanKind, Cfg> = {
  bruno: { skin: 0xe2a487, top: 0xd63a2e, sleeve: 0xd63a2e, pants: 0x34495e, fat: true, tw: 0.9, td: 0.62, legX: 0.17, armX: 0.62, armT: 0.2, scale: 1.0 },
  chloe: { skin: 0xf6cdb0, top: 0xff6fa5, sleeve: 0xff6fa5, pants: 0x6b4fd1, fat: false, tw: 0.46, td: 0.28, legX: 0.1, armX: 0.31, armT: 0.13, scale: 0.96 },
  karen: { skin: 0xeab894, top: 0x9b4fc4, sleeve: 0x9b4fc4, pants: 0x2c3e50, fat: false, tw: 0.52, td: 0.32, legX: 0.11, armX: 0.34, armT: 0.15, scale: 0.97 },
  zombie: { skin: 0x7fa65a, top: 0x6b5a4a, sleeve: 0x6b5a4a, pants: 0x30343a, fat: false, tw: 0.5, td: 0.3, legX: 0.11, armX: 0.33, armT: 0.14, scale: 1.0 },
};

export function makeHumanoid(kind: HumanKind): Humanoid {
  const c = CFG[kind];
  const root = new Group();
  const rig = new Group();
  root.add(rig);

  const mkLeg = (side: number) => {
    const g = new Group();
    g.position.set(side * c.legX, 0.8, 0);
    const w = c.fat ? 0.27 : 0.2;
    bx(g, w, 0.8, w + 0.04, c.pants, 0, -0.4, 0);
    bx(g, w + 0.03, 0.12, w + 0.16, kind === 'chloe' ? 0xffffff : 0x1d1d1d, 0, -0.74, 0.05);
    rig.add(g);
    return g;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  // torso
  if (c.fat) {
    sp(rig, 0.56, 0.52, 0.5, c.top, 0, 1.02, 0.1);
    bx(rig, 0.92, 0.42, 0.58, c.top, 0, 1.38, 0);
    bx(rig, 0.5, 0.06, 0.06, 0xf5e6a0, 0.06, 0.95, 0.56 * 0.9); // mustard stain
    sp(rig, 0.1, 0.1, 0.05, 0xc97c5d, 0, 0.78, 0.5); // belly button peeking
  } else {
    bx(rig, c.tw, 0.72, c.td, c.top, 0, 1.14, 0);
    if (kind === 'chloe') bx(rig, c.tw + 0.01, 0.1, c.td + 0.01, 0xf6cdb0, 0, 0.84, 0); // crop top
    if (kind === 'karen') bx(rig, c.tw + 0.03, 0.2, c.td + 0.03, 0x7b3a9c, 0, 0.98, 0);
  }

  // head
  const head = new Group();
  head.position.set(0, 1.64, 0);
  rig.add(head);
  const hs = c.fat ? 1.12 : 1;
  sp(head, 0.24 * hs, 0.26 * hs, 0.24 * hs, c.skin, 0, 0, 0, 0.6);
  const eye = kind === 'zombie' ? glowRed : null;
  const eyeCol = 0x151515;
  for (const s of [-1, 1]) {
    if (eye) {
      const e = new Mesh(G.box, eye);
      e.scale.set(0.06, 0.05, 0.04);
      e.position.set(s * 0.085, 0.04, 0.22);
      head.add(e);
    } else {
      bx(head, c.fat ? 0.04 : 0.05, c.fat ? 0.04 : 0.06, 0.03, eyeCol, s * 0.085 * hs, 0.03, 0.225 * hs);
    }
    sp(head, 0.05, 0.07, 0.04, c.skin, s * 0.245 * hs, -0.01, 0, 0.6); // ears
  }
  if (kind === 'bruno') {
    bx(head, 0.2, 0.035, 0.04, 0x2b1d14, 0, 0.09, 0.235); // unibrow
    sp(head, 0.075, 0.07, 0.09, 0xd4806a, 0, -0.03, 0.26); // big nose
    bx(head, 0.3, 0.12, 0.22, 0xb98a74, 0, -0.13, 0.1, 1); // stubble shadow
    bx(head, 0.12, 0.03, 0.03, 0x4a1d1d, 0, -0.12, 0.26); // frown
    sp(head, 0.26, 0.1, 0.26, 0x2b1d14, 0, 0.2, -0.05); // sad thin hair
    sp(head, 0.08, 0.04, 0.04, 0x2b1d14, 0.2, 0.03, 0.1);
  } else if (kind === 'chloe') {
    sp(head, 0.26, 0.17, 0.27, 0xf2d04a, 0, 0.15, -0.045);
    bx(head, 0.2, 0.06, 0.05, 0xf2d04a, 0.04, 0.12, 0.2); // bangs
    bx(head, 0.1, 0.36, 0.1, 0xf2d04a, 0, -0.1, -0.3);
    bx(head, 0.13, 0.05, 0.13, 0xff3d8b, 0, 0.1, -0.27);
    bx(head, 0.07, 0.025, 0.03, 0xd9455f, 0, -0.1, 0.235); // lips
  } else if (kind === 'karen') {
    sp(head, 0.27, 0.18, 0.28, 0xc8c8c8, 0, 0.14, -0.05);
    sp(head, 0.13, 0.13, 0.13, 0xc8c8c8, 0, 0.3, -0.12);
    bx(head, 0.1, 0.075, 0.02, 0x222222, -0.09, 0.04, 0.25);
    bx(head, 0.1, 0.075, 0.02, 0x222222, 0.09, 0.04, 0.25);
    bx(head, 0.06, 0.02, 0.02, 0x222222, 0, 0.05, 0.25);
    bx(head, 0.09, 0.03, 0.03, 0xc0273d, 0, -0.1, 0.235);
  } else {
    bx(head, 0.12, 0.04, 0.03, 0x2a0d0d, 0, -0.11, 0.23);
  }

  // arms
  const mkArm = (side: number) => {
    const g = new Group();
    g.position.set(side * c.armX, 1.46, 0);
    const t = c.armT;
    bx(g, t, 0.32, t, c.sleeve, 0, -0.16, 0);
    bx(g, t * 0.85, 0.34, t * 0.85, c.skin, 0, -0.49, 0);
    sp(g, t * 0.6, t * 0.6, t * 0.6, c.skin, 0, -0.68, 0);
    rig.add(g);
    return g;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);
  const weapon = new Group();
  weapon.position.set(0, -0.68, 0);
  armR.add(weapon);

  root.scale.setScalar(c.scale);
  return { root, rig, head, armL, armR, legL, legR, weapon, kind };
}

/** Procedural pose animation. phase = running clock, amp = intensity, k = 0..1 progress for one-shot poses. */
export function animate(h: Humanoid, pose: Pose, phase: number, amp = 1, k = 0) {
  const { rig, armL, armR, legL, legR, head } = h;
  rig.position.set(0, 0, 0);
  rig.rotation.set(0, 0, 0);
  armL.rotation.set(0, 0, 0);
  armR.rotation.set(0, 0, 0);
  legL.rotation.set(0, 0, 0);
  legR.rotation.set(0, 0, 0);
  head.rotation.set(0, 0, 0);
  const s = Math.sin(phase);
  switch (pose) {
    case 'idle':
      rig.position.y = Math.sin(phase * 0.4) * 0.012;
      armL.rotation.z = -0.07 - Math.sin(phase * 0.4) * 0.02;
      armR.rotation.z = 0.07 + Math.sin(phase * 0.4) * 0.02;
      break;
    case 'walk':
    case 'run': {
      const a = pose === 'run' ? 1.0 : 0.7;
      legL.rotation.x = s * a * amp;
      legR.rotation.x = -s * a * amp;
      armL.rotation.x = -s * a * 0.9 * amp;
      armR.rotation.x = s * a * 0.9 * amp;
      rig.position.y = Math.abs(Math.cos(phase)) * 0.06 * amp;
      rig.rotation.z = s * 0.04 * amp;
      if (pose === 'run') rig.rotation.x = 0.2 * amp;
      break;
    }
    case 'zombie':
      armL.rotation.x = -1.45 + Math.sin(phase * 0.5) * 0.1;
      armR.rotation.x = -1.4 + Math.cos(phase * 0.5) * 0.1;
      legL.rotation.x = s * 0.5 * amp;
      legR.rotation.x = -s * 0.5 * amp;
      rig.rotation.x = 0.15;
      rig.position.y = Math.abs(Math.cos(phase)) * 0.03;
      break;
    case 'panic':
      armL.rotation.x = -2.7 + Math.sin(phase * 3) * 0.35;
      armR.rotation.x = -2.7 + Math.cos(phase * 3) * 0.35;
      armL.rotation.z = -0.4;
      armR.rotation.z = 0.4;
      legL.rotation.x = s * 1.1 * amp;
      legR.rotation.x = -s * 1.1 * amp;
      rig.position.y = Math.abs(Math.cos(phase)) * 0.09 * amp;
      rig.rotation.x = 0.12;
      break;
    case 'kick':
      legR.rotation.x = -1.35 * k;
      legL.rotation.x = 0.15 * k;
      armL.rotation.x = -0.6 * k;
      armR.rotation.x = 0.5 * k;
      rig.rotation.x = -0.18 * k;
      break;
    case 'aim':
      armR.rotation.x = -1.5;
      armL.rotation.x = -1.2;
      armL.rotation.z = 0.25;
      legL.rotation.x = s * 0.7 * amp;
      legR.rotation.x = -s * 0.7 * amp;
      rig.position.y = Math.abs(Math.cos(phase)) * 0.05 * amp;
      break;
    case 'swing':
      armR.rotation.x = -2.7 + k * 3.4;
      armR.rotation.z = 0.2;
      armL.rotation.x = -0.4;
      rig.rotation.y = 0.7 - k * 1.4;
      legL.rotation.x = s * 0.6 * amp;
      legR.rotation.x = -s * 0.6 * amp;
      break;
    case 'fall':
      armL.rotation.x = -2.5 + Math.sin(phase * 4) * 0.5;
      armR.rotation.x = -2.5 + Math.cos(phase * 4) * 0.5;
      legL.rotation.x = Math.sin(phase * 4) * 0.8;
      legR.rotation.x = -Math.sin(phase * 4) * 0.8;
      break;
    case 'cheer':
      armL.rotation.x = -2.8;
      armR.rotation.x = -2.8 + Math.sin(phase * 4) * 0.3;
      armL.rotation.z = -0.3;
      armR.rotation.z = 0.3;
      rig.position.y = Math.abs(Math.sin(phase * 2)) * 0.12;
      break;
    case 'crouch':
      rig.position.y = -0.38;
      legL.rotation.x = -0.9;
      legR.rotation.x = -0.9;
      break;
    case 'point':
      armR.rotation.x = -1.55;
      armR.rotation.z = -0.1;
      armL.rotation.z = -0.1;
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
      head.rotation.x = -0.25;
      break;
  }
}

/** Simple held-weapon models. They extend along local -Y (the arm axis, forward when armR.x = -PI/2). */
export function setWeaponModel(h: Humanoid, id: string) {
  const w = h.weapon;
  while (w.children.length) w.remove(w.children[0]);
  const metal = 0x3a3f46;
  const wood = 0x7a4b25;
  switch (id) {
    case 'bat':
      bx(w, 0.07, 0.8, 0.07, wood, 0, -0.3, 0);
      bx(w, 0.12, 0.3, 0.12, 0x9b6a38, 0, -0.62, 0);
      for (let i = 0; i < 4; i++) bx(w, 0.03, 0.03, 0.2, 0xbcbcbc, 0, -0.5 - i * 0.07, 0);
      break;
    case 'pistol':
      bx(w, 0.08, 0.1, 0.07, metal, 0, -0.02, 0.03);
      bx(w, 0.07, 0.26, 0.07, 0x555b63, 0, -0.18, 0);
      break;
    case 'smg':
      bx(w, 0.09, 0.4, 0.09, metal, 0, -0.18, 0);
      bx(w, 0.05, 0.2, 0.05, 0x25282d, 0, -0.1, 0.1);
      bx(w, 0.04, 0.18, 0.04, 0x777, 0, -0.5, 0);
      break;
    case 'shotgun':
      bx(w, 0.1, 0.62, 0.1, 0x4d3321, 0, -0.1, 0);
      bx(w, 0.06, 0.55, 0.06, metal, 0, -0.5, 0.0);
      bx(w, 0.1, 0.14, 0.12, 0x4d3321, 0, -0.35, 0);
      break;
    case 'minigun':
      bx(w, 0.16, 0.3, 0.16, 0x2d3036, 0, -0.08, 0);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        bx(w, 0.04, 0.6, 0.04, 0x8b9099, Math.cos(a) * 0.05, -0.5, Math.sin(a) * 0.05);
      }
      bx(w, 0.18, 0.08, 0.18, 0xe0a23a, 0, -0.78, 0);
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Instanced zombie horde: 7 draw calls for up to MAX zombies          */
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
}

export class ZombieSwarm {
  private torso: InstancedMesh;
  private headM: InstancedMesh;
  private armLm: InstancedMesh;
  private armRm: InstancedMesh;
  private legLm: InstancedMesh;
  private legRm: InstancedMesh;
  private eyes: InstancedMesh;
  private all: InstancedMesh[];
  private max: number;
  private rootM = new Matrix4();
  private partM = new Matrix4();
  private outM = new Matrix4();
  private rq = new Quaternion();
  private fq = new Quaternion();
  private pq = new Quaternion();
  private v1 = new Vector3();
  private vs = new Vector3();
  private vOne = new Vector3(1, 1, 1);
  private ax = new Vector3(1, 0, 0);
  private ay = new Vector3(0, 1, 0);
  private white = new Color(1, 1, 1);
  private tc = new Color();
  private dark = new Color();

  constructor(scene: Scene, max: number) {
    this.max = max;
    const std = () => new MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
    const mk = (g: BoxGeometry | SphereGeometry, m: MeshStandardMaterial | MeshBasicMaterial, shadow = true) => {
      const im = new InstancedMesh(g, m, max);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = shadow;
      im.receiveShadow = false;
      im.setColorAt(0, this.white);
      scene.add(im);
      return im;
    };
    const arm = new BoxGeometry(0.14, 0.62, 0.14);
    arm.translate(0, -0.31, 0);
    const leg = new BoxGeometry(0.2, 0.78, 0.22);
    leg.translate(0, -0.39, 0);
    this.torso = mk(new BoxGeometry(0.5, 0.72, 0.3), std());
    this.headM = mk(new SphereGeometry(0.18, 8, 6), std());
    this.armLm = mk(arm, std());
    this.armRm = mk(arm, std());
    this.legLm = mk(leg, std());
    this.legRm = mk(leg, std());
    this.eyes = mk(new BoxGeometry(0.24, 0.05, 0.04), glowRed, false);
    this.all = [this.torso, this.headM, this.armLm, this.armRm, this.legLm, this.legRm, this.eyes];
  }

  setShadows(on: boolean) {
    this.all.forEach((m, i) => (m.castShadow = on && i !== 6));
  }

  private put(mesh: InstancedMesh, i: number, px: number, py: number, pz: number, rx: number) {
    this.pq.setFromAxisAngle(this.ax, rx);
    this.partM.compose(this.v1.set(px, py, pz), this.pq, this.vOne);
    this.outM.multiplyMatrices(this.rootM, this.partM);
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
      const sw = z.dead ? 0 : Math.sin(z.phase) * 0.62 * z.moving;
      const bob = z.dead ? 0 : Math.abs(Math.cos(z.phase)) * 0.03 * z.moving;
      const aSw = z.atk > 0 ? Math.sin((z.atk / 0.35) * Math.PI) * 0.9 : 0;
      const armBase = z.dead ? -0.4 : -1.35;
      this.put(this.legLm, i, -0.12, 0.78, 0, sw);
      this.put(this.legRm, i, 0.12, 0.78, 0, -sw);
      this.put(this.torso, i, 0, 1.14 + bob, 0, 0.16);
      this.put(this.headM, i, 0, 1.64 + bob, 0.06, 0.1);
      this.put(this.eyes, i, 0, 1.66 + bob, 0.21, 0);
      this.put(this.armLm, i, -0.35, 1.44 + bob, 0.04, armBase + Math.sin(z.phase * 0.5) * 0.1 - aSw);
      this.put(this.armRm, i, 0.35, 1.44 + bob, 0.04, armBase + Math.cos(z.phase * 0.5) * 0.1 - aSw);

      const f = z.flash;
      this.tc.copy(z.skin);
      if (f > 0) this.tc.lerp(this.white, Math.min(1, f * 4)).multiplyScalar(1 + f * 2);
      this.headM.setColorAt(i, this.tc);
      this.armLm.setColorAt(i, this.tc);
      this.armRm.setColorAt(i, this.tc);
      this.tc.copy(z.cloth);
      if (f > 0) this.tc.lerp(this.white, Math.min(1, f * 4)).multiplyScalar(1 + f * 2);
      this.torso.setColorAt(i, this.tc);
      this.dark.copy(this.tc).multiplyScalar(0.55);
      this.legLm.setColorAt(i, this.dark);
      this.legRm.setColorAt(i, this.dark);
      this.eyes.setColorAt(i, z.dead ? this.dark.setRGB(0, 0, 0) : this.white);
    }
    for (const m of this.all) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
