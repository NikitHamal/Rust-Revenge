import { MeshStandardMaterial, Group, CylinderGeometry, Mesh, Vector3 } from 'three';
import { DECK_Y, clamp, lerp, riverCenter, riverHalfWidth, smoothstep, terrainHeight } from './config';
import { animate, makeHumanoid, type Humanoid, type Pose } from './characters';
import { setUI } from './store';
import { audio } from './audio';
import type { Game } from './game';

type Key = [number, number, number]; // t, x, z

function pathAt(keys: Key[], t: number): { x: number; z: number } {
  if (t <= keys[0][0]) return { x: keys[0][1], z: keys[0][2] };
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const a = keys[i - 1];
      const b = keys[i];
      const u = (t - a[0]) / (b[0] - a[0]);
      return { x: lerp(a[1], b[1], u), z: lerp(a[2], b[2], u) };
    }
  }
  const l = keys[keys.length - 1];
  return { x: l[1], z: l[2] };
}

const bank = (x: number, dz: number) => riverCenter(x) + riverHalfWidth(x) + dz;

interface Line {
  t: number;
  d: number;
  who: string;
  text: string;
}

export const INTRO_DURATION = 39;

/**
 * The opening story, scripted in-engine on the real game world:
 * three survivors hide in the river breathing through pipes — the mother stabs her
 * daughter's fat boyfriend to lure the zombies away, then they abandon him at the treehouse.
 */
export class Cinematic {
  t = 0;
  playing = false;
  private zombies: Humanoid[] = [];
  private pipes: Mesh[] = [];
  private pipeGroup = new Group();
  private fired = new Set<number>();
  private lines: Line[];
  private camPos = new Vector3();
  private camLook = new Vector3();
  private tmp = new Vector3();
  private bubbleT = 0;
  private lastB = { x: 0, z: 0 };
  private zOffsets: { x: number; z: number }[] = [];
  private zPhase: number[] = [];
  private zStart: { x: number; z: number }[] = [];

  // geometry anchors
  private th;
  W: { x: number; z: number };
  private chloeHide: { x: number; z: number };
  private karenHide: { x: number; z: number };
  private bKeys: Key[];
  private cKeys: Key[];
  private kKeys: Key[];

  constructor(private game: Game) {
    const th = game.props.treehouse;
    this.th = th;
    const hideZ = (x: number) => bank(x, -3.6);
    this.W = { x: -23, z: hideZ(-23) };
    this.chloeHide = { x: -21, z: hideZ(-21) };
    this.karenHide = { x: -25, z: hideZ(-25) };
    const tz = th.z;
    const lx = th.ladderX;
    this.bKeys = [
      [0, this.W.x, this.W.z],
      [10.0, this.W.x, this.W.z],
      [10.9, -26, bank(-26, 4.0)],
      [12.6, -34, bank(-34, 7)],
      [14.4, -35.5, tz - 1.5],
      [16.2, -31.5, tz + 0.5],
      [17.6, lx - 0.9, tz],
      [19.0, lx - 0.9, tz],
      [21.2, lx - 0.9, tz],
      [22.2, lx - 3.4, tz + 0.4],
      [26.4, lx - 3.4, tz + 0.4],
      [28.0, -27, bank(-27, 3.5)],
      [29.2, -24, bank(-24, 1.8)],
      [30.4, -21, bank(-21, -2)],
      [35.6, -10.4, 0.2],
      [37.2, -6, 0],
    ];
    this.cKeys = [
      [0, this.chloeHide.x, this.chloeHide.z],
      [13.0, this.chloeHide.x, this.chloeHide.z],
      [15.4, -27, bank(-27, 3.5)],
      [17.0, lx - 0.7, tz + 0.35],
      [17.2, lx - 0.7, tz + 0.35],
    ];
    this.kKeys = [
      [0, this.karenHide.x, this.karenHide.z],
      [13.4, this.karenHide.x, this.karenHide.z],
      [15.7, -28.5, bank(-28.5, 3.8)],
      [17.2, lx - 0.7, tz - 0.35],
      [17.4, lx - 0.7, tz - 0.35],
    ];
    this.lines = [
      { t: 0.6, d: 3.0, who: '', text: 'Day 1 of the zombie apocalypse...' },
      { t: 3.7, d: 3.0, who: '', text: 'Safest hiding spot? Underwater. Breathing through pipes.' },
      { t: 6.8, d: 2.7, who: 'Karen', text: 'Hold still, Bruno, honey... just a little prick.' },
      { t: 10.0, d: 1.8, who: 'Bruno', text: 'AAAAARGH!!!' },
      { t: 12.4, d: 2.8, who: 'Chloe', text: 'Mom, you are a genius. He was SO slow.' },
      { t: 15.4, d: 2.0, who: 'Karen', text: 'Quick! To the treehouse!' },
      { t: 17.7, d: 1.9, who: 'Bruno', text: 'BABE! HELP ME UP! PLEASE!!' },
      { t: 19.5, d: 1.9, who: 'Chloe', text: 'Sorry babe. Fat, slow, and you snore.' },
      { t: 21.4, d: 1.0, who: 'Bruno', text: 'OOOOOF!!' },
      { t: 22.7, d: 2.6, who: 'Bruno', text: 'I have a LEVEL 5 SHELTER! I will UPGRADE it for you!' },
      { t: 25.2, d: 2.0, who: 'Chloe', text: 'Ew. We are done, loser. Bye.' },
      { t: 26.6, d: 2.0, who: 'Bruno', text: 'Just... you WAIT!!!' },
      { t: 31.0, d: 3.2, who: '', text: 'Out in the river, a rusty old wreck was waiting...' },
    ];
  }

  start() {
    const g = this.game;
    this.t = 0;
    this.playing = true;
    this.fired.clear();
    g.camera.fov = 45;
    g.camera.updateProjectionMatrix();
    // hero & npcs
    g.player.h.root.rotation.order = 'YXZ';
    g.player.h.root.visible = true;
    g.setHeroWeaponVisible(false);
    // pipes
    this.pipeGroup = new Group();
    const mat = new MeshStandardMaterial({ color: 0x6f8f7a, roughness: 0.5, metalness: 0.4 });
    for (let i = 0; i < 3; i++) {
      const m = new Mesh(new CylinderGeometry(0.05, 0.05, 1.3, 6), mat);
      m.castShadow = true;
      this.pipeGroup.add(m);
      this.pipes.push(m);
    }
    g.scene.add(this.pipeGroup);
    // cinematic zombies
    this.zombies = [];
    this.zOffsets = [];
    this.zPhase = [];
    this.zStart = [];
    for (let i = 0; i < 6; i++) {
      const z = makeHumanoid('zombie');
      z.root.traverse((o) => (o.castShadow = true));
      g.scene.add(z.root);
      this.zombies.push(z);
      this.zOffsets.push({ x: (Math.random() - 0.5) * 1.8, z: (Math.random() - 0.5) * 1.8 });
      this.zPhase.push(Math.random() * 6);
      this.zStart.push({ x: -8 - i * 2.8, z: bank(-8 - i * 2.8, 6 + (i % 3) * 1.4) });
    }
    this.camPos.set(-31, 5.5, -9);
    this.camLook.set(-23, 0, 2);
    g.camera.position.copy(this.camPos);
    g.camera.lookAt(this.camLook);
    setUI({ subtitle: null, titleCard: false });
  }

  private cleanup() {
    const g = this.game;
    this.zombies.forEach((z) => g.scene.remove(z.root));
    this.zombies = [];
    g.scene.remove(this.pipeGroup);
    this.pipes = [];
    this.playing = false;
    setUI({ subtitle: null, titleCard: false });
    g.camera.fov = 40;
    g.camera.updateProjectionMatrix();
    g.player.h.root.rotation.set(0, 0, 0);
    g.setHeroWeaponVisible(true);
  }

  skip() {
    if (!this.playing) return;
    this.t = INTRO_DURATION;
    this.finish(true);
  }

  private finish(skipped: boolean) {
    this.cleanup();
    this.game.onIntroDone(skipped);
  }

  private bPos(t: number) {
    return pathAt(this.bKeys, t);
  }

  update(dt: number) {
    if (!this.playing) return;
    const g = this.game;
    this.t += dt;
    const t = this.t;
    const th = this.th;
    const lx = th.ladderX;
    const tz = th.z;

    /* ---------------- scheduled one-shots ---------------- */
    const once = (id: number, at: number, fn: () => void) => {
      if (t >= at && !this.fired.has(id)) {
        this.fired.add(id);
        fn();
      }
    };
    once(1, 9.6, () => {
      audio.play('hurt', 1);
      g.fx.particles.burst(this.W.x, 0.2, this.W.z, 10, 2, 0xb01818, 0.1, 0.6, 2);
    });
    once(2, 9.95, () => {
      audio.play('scream', 1);
      audio.play('splash', 1);
      g.fx.particles.burst(this.W.x, 0.1, this.W.z, 70, 6, 0xcfefff, 0.14, 0.9, 6);
      g.shake(0.4);
    });
    once(3, 12.4, () => {
      audio.play('splash', 0.8);
      for (const p of [this.chloeHide, this.karenHide]) g.fx.particles.burst(p.x, 0.1, p.z, 40, 4, 0xcfefff, 0.12, 0.8, 5);
    });
    once(4, 21.3, () => audio.play('kick', 1));
    once(5, 21.8, () => {
      audio.play('hurt', 0.9);
      g.fx.particles.burst(lx - 3.4, 0.4, tz, 12, 3, 0xc9b38a, 0.14, 0.6, 2);
    });
    once(6, 26.0, () => audio.play('kick', 0.5));
    once(7, 34.0, () => {
      audio.play('dawn', 1);
      setUI({ titleCard: true });
    });
    once(8, 10.4, () => audio.play('groan', 1));
    once(9, 17.0, () => audio.play('groan', 1));
    once(10, 23.0, () => audio.play('groan', 1));
    once(11, 28.0, () => audio.play('groan', 1));

    /* ---------------- subtitles ---------------- */
    let cur: Line | null = null;
    for (const l of this.lines) if (t >= l.t && t < l.t + l.d) cur = l;
    setUI({ subtitle: cur ? { who: cur.who, text: cur.text } : null });

    /* ---------------- Bruno ---------------- */
    const B = g.player.h;
    const bp = this.bPos(t);
    let by = Math.max(terrainHeight(bp.x, bp.z), -0.5);
    let pose: Pose = 'run';
    let amp = 1.2;
    let kk = 0;
    let rotX = 0;
    let yaw = Math.atan2(bp.x - this.lastB.x, bp.z - this.lastB.z);
    if (Math.hypot(bp.x - this.lastB.x, bp.z - this.lastB.z) < 0.002) yaw = B.root.rotation.y;
    this.lastB = bp;
    let bx = bp.x;
    let bz = bp.z;
    if (t < 9.9) {
      by = -1.6;
      pose = 'crouch';
      yaw = 0;
    } else if (t < 10.9) {
      const u = (t - 10.0) / 0.9;
      by = lerp(-1.6, terrainHeight(bp.x, bp.z), clamp(u * 1.3, 0, 1)) + Math.sin(Math.PI * clamp(u, 0, 1)) * 2.6;
      pose = 'panic';
    } else if (t < 17.6) {
      pose = 'panic';
      amp = 1.3;
    } else if (t < 19.0) {
      pose = 'panic';
      amp = 0;
      yaw = Math.PI / 2;
    } else if (t < 21.2) {
      const u = (t - 19.0) / 2.2;
      by = u * 3.4;
      bx = lx - 0.45;
      pose = 'walk';
      amp = 1.4;
      yaw = Math.PI / 2;
    } else if (t < 22.2) {
      const u = (t - 21.2) / 1.0;
      bx = lerp(lx - 0.45, lx - 3.4, u);
      bz = tz + 0.4 * u;
      by = lerp(3.4, 0, u * u) + Math.sin(Math.PI * u) * 1.1;
      rotX = -u * Math.PI * 2.5;
      pose = 'fall';
      yaw = Math.PI / 2;
    } else if (t < 22.8) {
      by = 0.3 + (terrainHeight(bx, bz) - 0.3) * 0;
      rotX = -Math.PI / 2 * (1 - smoothstep(22.2, 22.8, t));
      pose = 'idle';
      yaw = Math.PI / 2;
    } else if (t < 26.4) {
      pose = 'panic';
      amp = 0;
      yaw = Math.PI / 2 + Math.sin(t * 3) * 0.2;
    } else if (t < 28.4) {
      pose = 'panic';
      amp = 1.3;
    } else if (t < 35.6) {
      pose = 'run';
      amp = 1;
      by = lerp(by, -0.45, smoothstep(29.3, 30.6, t));
      if (t > 29.2) by = Math.max(by, -0.5);
    } else {
      const u = smoothstep(35.6, 37.2, t);
      by = lerp(-0.45, DECK_Y, u);
      pose = 'run';
    }
    B.root.visible = true;
    B.root.position.set(bx, by, bz);
    B.root.rotation.set(rotX, yaw, 0);
    animate(B, pose, t * 9, amp, kk);

    /* ---------------- Chloe & Karen ---------------- */
    this.actWoman(g.chloe, this.cKeys, this.chloeHide, 12.4, 'chloe');
    this.actWoman(g.karen, this.kKeys, this.karenHide, 12.7, 'karen');

    /* ---------------- pipes ---------------- */
    const hideTop = (h: { x: number; z: number }, idx: number, visible: boolean) => {
      const m = this.pipes[idx];
      m.visible = visible;
      if (visible) {
        m.position.set(h.x + 0.1, -0.25 + Math.sin(t * 2 + idx) * 0.02, h.z + 0.05);
        m.rotation.z = 0.08 * (idx - 1);
      }
    };
    hideTop(this.chloeHide, 0, t < 12.3);
    hideTop(this.W, 1, t < 9.9);
    hideTop(this.karenHide, 2, t < 12.6);
    this.bubbleT -= dt;
    if (this.bubbleT <= 0 && t < 12.3) {
      this.bubbleT = 0.28;
      for (const p of [this.chloeHide, this.W, this.karenHide]) {
        if (t > 9.9 && p === this.W) continue;
        g.fx.particles.emit(p.x + 0.1 + (Math.random() - 0.5) * 0.2, 0.08, p.z + (Math.random() - 0.5) * 0.2, 0, 0.7, 0, 0.9, 0.09, 0xe8fbff, -0.2, 0, -1);
      }
    }

    /* ---------------- zombies ---------------- */
    this.zombies.forEach((z, i) => {
      const hs = this.zStart[i];
      let zx: number;
      let zz: number;
      let zp: Pose = 'zombie';
      let za = 1;
      if (t < 10.3) {
        zx = hs.x - t * 0.9;
        zz = hs.z;
        za = 0.7;
        z.root.rotation.y = -Math.PI / 2 + Math.sin(t + i) * 0.3;
        z.root.position.set(zx, terrainHeight(zx, zz), zz);
        this.zStart[i] = hs;
      } else {
        const delay = 0.9 + i * 0.55;
        const tp = this.bPos(Math.max(0, t - delay));
        const off = this.zOffsets[i];
        const tx = tp.x + off.x * (t > 17 && t < 27 ? 1 : 0.3);
        const tzz = tp.z + off.z * (t > 17 && t < 27 ? 1 : 0.3);
        const cx = z.root.position.x || hs.x - 9;
        const cz = z.root.position.z || hs.z;
        const k = 1 - Math.exp(-(t < 11.5 ? 2.2 : 4) * dt);
        // after the chase they stop at the shore (zombies don't swim far)
        let ttx = tx;
        let ttz = tzz;
        if (t > 29.6) {
          ttz = Math.max(tzz, bank(-24, 2.4));
          ttx = Math.min(tx, -22);
        }
        zx = cx + (ttx - cx) * k;
        zz = cz + (ttz - cz) * k;
        const dxm = zx - cx;
        const dzm = zz - cz;
        const sp = Math.hypot(dxm, dzm) / Math.max(dt, 0.001);
        z.root.position.set(zx, Math.max(terrainHeight(zx, zz), -0.5), zz);
        if (sp > 0.3) z.root.rotation.y = Math.atan2(dxm, dzm);
        else z.root.rotation.y = Math.atan2(bx - zx, bz - zz);
        za = clamp(sp / 3, 0.2, 1.8);
        if (t > 32) zp = 'zombie';
      }
      this.zPhase[i] += dt * (4 + za * 4);
      animate(z, zp, this.zPhase[i], za);
    });

    /* ---------------- camera ---------------- */
    this.camera(t, bx, bz, dt);

    if (t >= INTRO_DURATION) this.finish(false);
  }

  private actWoman(h: Humanoid, keys: Key[], hide: { x: number; z: number }, riseAt: number, kind: 'chloe' | 'karen') {
    const g = this.game;
    const t = this.t;
    const th = this.th;
    const p = pathAt(keys, t);
    h.root.visible = true;
    let y: number;
    let pose: Pose = 'run';
    let amp = 1;
    let yaw = Math.atan2(p.x - (h.root.position.x || p.x), p.z - (h.root.position.z || p.z));
    let x = p.x;
    let z = p.z;
    const climbStart = keys[keys.length - 2][0];
    const climbEnd = climbStart + 1.6;
    const spot = kind === 'chloe' ? th.girl : th.mom;
    const edgeX = th.x - 2.4;
    if (t < riseAt) {
      y = -1.6;
      pose = 'crouch';
      yaw = 0;
      x = hide.x;
      z = hide.z;
    } else if (t < riseAt + 0.8) {
      const u = (t - riseAt) / 0.8;
      y = lerp(-1.6, Math.max(terrainHeight(p.x, p.z), -0.5), u);
      pose = 'idle';
      yaw = Math.PI / 2;
    } else if (t < climbStart + 0.01) {
      y = Math.max(terrainHeight(x, z), -0.5);
      pose = 'run';
      amp = 1.1;
    } else if (t < climbEnd) {
      const u = (t - climbStart) / 1.6;
      y = terrainHeight(x, z) + u * (th.platformY - terrainHeight(x, z));
      x = p.x + 0.3 * u;
      pose = 'walk';
      amp = 1.4;
      yaw = Math.PI / 2;
    } else {
      // step onto platform and move to the edge to watch Bruno
      const u = smoothstep(climbEnd, climbEnd + 1.2, t);
      const goalX = t < 26.5 ? (kind === 'chloe' ? edgeX : edgeX + 0.2) : spot.x;
      const goalZ = t < 26.5 ? (kind === 'chloe' ? th.z + 0.35 : th.z - 0.7) : spot.z;
      x = lerp(th.ladderX - 0.4, goalX, u);
      z = lerp(keys[keys.length - 1][2], goalZ, u);
      y = th.platformY;
      yaw = -Math.PI / 2 + (kind === 'chloe' ? 0.15 : -0.15);
      pose = t < climbEnd + 1.2 ? 'walk' : 'idle';
      amp = t < climbEnd + 1.2 ? 0.8 : 0;
      let kk = 0;
      if (kind === 'chloe' && t > 21.0 && t < 21.9) {
        pose = 'kick';
        kk = Math.sin(((t - 21.0) / 0.9) * Math.PI);
      } else if (kind === 'karen' && t > 21.0 && t < 23) {
        pose = 'point';
      } else if (t > 22.7 && t < 26.5) {
        pose = 'laugh';
      } else if (t >= 26.5) {
        pose = 'laugh';
        yaw = Math.PI * 0.5;
      }
      h.root.position.set(x, y, z);
      h.root.rotation.set(0, yaw, 0);
      animate(h, pose, t * 8, amp, kk);
      void g;
      return;
    }
    h.root.position.set(x, y, z);
    h.root.rotation.set(0, yaw, 0);
    animate(h, pose, t * 11, amp, 0);
  }

  private camera(t: number, bx: number, bz: number, dt: number) {
    const g = this.game;
    const th = this.th;
    const pos = this.tmp;
    const look = new Vector3();
    if (t < 6.4) {
      const u = t / 6.4;
      pos.set(lerp(-31, -27.5, u), lerp(5.5, 3.2, u), lerp(-9, -5.2, u));
      look.set(-23.2, lerp(0.3, 0, u), lerp(2.2, 0.5, u));
    } else if (t < 10.9) {
      pos.set(-25.4, 2.6, -3.6);
      look.set(-23.2, -0.2, this.W.z);
    } else if (t < 19.0) {
      const u = smoothstep(10.9, 14, t);
      look.set(bx, 1.2, bz);
      pos.set(bx + lerp(7, 9, u), 6.5 + u * 2, bz + lerp(-8, -9, u));
    } else if (t < 26.2) {
      pos.set(th.ladderX - 8, 6.5, th.z - 7.5);
      look.set(th.ladderX - 0.8, 2.6, th.z);
    } else if (t < 33) {
      look.set(bx, 0.6, bz);
      pos.set(bx + 8, 7.5, bz - 7);
    } else {
      // glide into the standard gameplay camera pose
      const u = smoothstep(33, 38, t);
      const gp = g.rigPose(new Vector3(-6, 0.8, 0));
      const follow = new Vector3(bx + 8, 7.5, bz - 7);
      pos.copy(follow).lerp(gp.pos, u);
      look.set(bx, 0.6, bz).lerp(gp.look, u);
    }
    const k = 1 - Math.exp(-(t < 2 ? 12 : 3.4) * dt);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    g.camera.position.copy(this.camPos).add(g.shakeOffset);
    g.camera.lookAt(this.camLook);
    g.rig.target.copy(this.camLook);
  }
}

