import { Color, Scene } from 'three';
import { DECK_Y, WEAPONS, WORLD, clamp, terrainHeight } from './config';
import { animate, makeHumanoid, setWeaponModel, type Humanoid, type Pose } from './characters';
import type { Game } from './game';

function lerpAngle(a: number, b: number, t: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Player {
  h: Humanoid;
  x = -2;
  z = 0;
  y = DECK_Y;
  vx = 0;
  vz = 0;
  yaw = 0;
  hp = 150;
  hpMax = 150;
  alive = true;
  hidden = false;
  respawnT = 0;
  fireCd = 0;
  swingT = 0;
  slamT = 0;
  slamCd = 0;
  dashCd = 0;
  dashT = 0;
  dashX = 0;
  dashZ = 0;
  invuln = 0;
  phase = 0;
  chopT = 0;
  chopSound = 0;
  aimVis = 0;
  speedNow = 0;
  private weaponId = '';
  private muzzleCol = new Color(4, 3, 1);

  constructor(private game: Game, scene: Scene) {
    this.h = makeHumanoid('bruno');
    scene.add(this.h.root);
    this.h.root.rotation.order = 'YXZ';
    this.h.root.traverse((o) => {
      o.castShadow = true;
    });
  }

  get weapon() {
    return WEAPONS.find((w) => w.id === this.game.run.weapon) ?? WEAPONS[0];
  }

  refreshStats() {
    const up = this.game.run.up;
    const old = this.hpMax;
    this.hpMax = 150 + 30 * up.hp;
    if (this.hpMax !== old) this.hp = Math.min(this.hpMax, this.hp + (this.hpMax - old));
  }

  reset() {
    this.refreshStats();
    this.hp = this.hpMax;
    this.alive = true;
    this.x = -2;
    this.z = 0;
    this.y = DECK_Y;
    this.vx = this.vz = 0;
    this.slamT = 0;
    this.slamCd = 0;
    this.dashCd = 0;
    this.dashT = 0;
    this.invuln = 1;
    this.h.root.rotation.set(0, 0, 0);
    this.h.root.visible = true;
    this.weaponId = '';
  }

  hurt(dmg: number, fx: number, fz: number) {
    if (!this.alive || this.invuln > 0) return;
    this.hp -= dmg;
    this.invuln = 0.3;
    const g = this.game;
    g.fx.particles.burst(this.x, this.y + 1.2, this.z, 6, 3, 0xb01818, 0.1, 0.5, 2);
    g.audio.play('hurt', 0.8);
    g.shake(0.25);
    g.hurtFlash = Math.min(1, 0.45 + dmg * 0.02);
    const d = Math.hypot(this.x - fx, this.z - fz) || 1;
    this.vx += ((this.x - fx) / d) * 2.5;
    this.vz += ((this.z - fz) / d) * 2.5;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.respawnT = 6;
      g.onPlayerDown();
    }
  }

  heal(n: number) {
    this.hp = Math.min(this.hpMax, this.hp + n);
  }

  trySlam() {
    if (!this.alive || this.slamT > 0 || this.slamCd > 0) return;
    this.slamT = 0.45;
    this.game.audio.play('swing', 1);
  }

  private doSlam() {
    const g = this.game;
    const up = g.run.up;
    const R = 4.6 + 0.45 * up.slam;
    const dmg = (95 + 28 * up.slam) * (1 + 0.12 * up.damage);
    g.zm.each((z) => {
      const dx = z.x - this.x;
      const dz = z.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d < R + z.scale * 0.4) {
        const f = 1 - (d / (R + 0.5)) * 0.5;
        g.zm.damage(z, dmg * f, dx / (d || 1), dz / (d || 1), 3.2);
        z.slow = 2;
      }
    });
    g.fx.shock.spawn(this.x, this.y, this.z, R, new Color(2, 1.4, 0.5), 0.55);
    g.fx.particles.burst(this.x, this.y + 0.2, this.z, 36, 7, 0xc9b38a, 0.16, 0.7, 3);
    g.audio.play('slam', 1);
    g.shake(0.9);
    this.slamCd = Math.max(3.5, 8 - 0.5 * up.slam);
  }

  update(dt: number) {
    const g = this.game;
    this.invuln = Math.max(0, this.invuln - dt);
    this.slamCd = Math.max(0, this.slamCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.dashT = Math.max(0, this.dashT - dt);
    const root = this.h.root;

    if (!this.alive) {
      this.respawnT -= dt;
      root.rotation.x = Math.max(-Math.PI / 2, root.rotation.x - dt * 5);
      root.position.set(this.x, this.y + 0.25, this.z);
      animate(this.h, 'idle', this.phase, 0);
      if (this.respawnT <= 0) {
        this.reset();
        g.onPlayerRespawn();
      }
      return;
    }

    // weapon model
    const w = this.weapon;
    if (this.weaponId !== w.id) {
      setWeaponModel(this.h, w.id);
      this.weaponId = w.id;
    }

    // ---------- movement ----------
    const mv = g.input.move(this.x, this.z);
    const h = terrainHeight(this.x, this.z);
    const onDeck = g.ship.onDeck(this.x, this.z);
    const inWater = !onDeck && h < -0.06;
    const base = 5.1 * (1 + 0.05 * g.run.up.speed) * (inWater ? 0.62 : 1) * (this.slamT > 0 ? 0.25 : 1) * (this.chopT > 0 ? 0.9 : 1);
    // Shift = dash (short burst with i-frames)
    if (g.input.keys.has('shift') && this.dashCd <= 0 && this.slamT <= 0 && (mv.x !== 0 || mv.z !== 0)) {
      const l = Math.hypot(mv.x, mv.z) || 1;
      this.dashX = mv.x / l;
      this.dashZ = mv.z / l;
      this.dashT = 0.2;
      this.dashCd = 2.4;
      this.invuln = Math.max(this.invuln, 0.3);
      g.audio.play('swing', 0.7);
      g.fx.particles.burst(this.x, this.y + 0.3, this.z, 10, 3, 0xd8d0b8, 0.14, 0.45, 1);
    }
    const k = Math.min(1, dt * 11);
    if (this.dashT > 0) {
      this.vx = this.dashX * 15;
      this.vz = this.dashZ * 15;
    } else {
      this.vx += (mv.x * base - this.vx) * k;
      this.vz += (mv.z * base - this.vz) * k;
    }
    this.x = clamp(this.x + this.vx * dt, -WORLD.playX, WORLD.playX);
    this.z = clamp(this.z + this.vz * dt, -WORLD.playZ, WORLD.playZ);
    this.speedNow = Math.hypot(this.vx, this.vz);
    const nowDeck = g.ship.onDeck(this.x, this.z);
    let ty = nowDeck ? DECK_Y + g.ship.bobY : Math.max(terrainHeight(this.x, this.z), -0.6);
    if (this.slamT > 0) {
      const u = 1 - this.slamT / 0.45;
      ty += Math.sin(Math.PI * u) * 1.7;
    }
    this.y += (ty - this.y) * Math.min(1, dt * (this.slamT > 0 ? 30 : 14));

    // ---------- combat ----------
    this.fireCd -= dt;
    this.swingT = Math.max(0, this.swingT - dt);
    this.aimVis = Math.max(0, this.aimVis - dt);
    const target = this.slamT > 0 ? null : g.zm.nearest(this.x, this.z, w.range);
    if (this.slamT > 0) {
      this.slamT -= dt;
      this.yaw += dt * 14;
      if (this.slamT <= 0) this.doSlam();
    } else if (target) {
      const desired = Math.atan2(target.x - this.x, target.z - this.z);
      this.yaw = lerpAngle(this.yaw, desired, 1 - Math.exp(-16 * dt));
      if (this.fireCd <= 0) this.fire(target.x, target.z);
      this.chopT = 0;
    } else if (this.speedNow > 0.4) {
      this.yaw = lerpAngle(this.yaw, Math.atan2(this.vx, this.vz), 1 - Math.exp(-12 * dt));
    }

    // ---------- chopping ----------
    const anyNear = g.zm.nearest(this.x, this.z, 5);
    const tree = !anyNear && this.speedNow < 1.4 && this.slamT <= 0 ? g.props.nearestTree(this.x, this.z, 2.6) : null;
    if (tree) {
      if (this.chopT <= 0) this.chopT = 0.0001;
      this.chopT += dt;
      this.chopSound -= dt;
      const desired = Math.atan2(tree.x - this.x, tree.z - this.z);
      this.yaw = lerpAngle(this.yaw, desired, 1 - Math.exp(-12 * dt));
      if (this.chopSound <= 0) {
        this.chopSound = 0.45;
        g.audio.play('chop', 0.8);
        tree.shake = 0.18;
        tree.hp -= 0.28;
        g.fx.particles.burst(tree.x, 1.2, tree.z, 5, 2.2, 0xb98a55, 0.08, 0.5, 2.5);
        if (tree.hp <= 0.02) {
          tree.felled = true;
          g.props.refreshTrees();
          const amt = 12 + Math.floor(Math.random() * 8) + g.run.shipLevel * 2;
          g.addResource('wood', amt);
          g.popText(`+${amt} 🪵`, tree.x, 3, tree.z, '#e6b36a');
          g.fx.particles.burst(tree.x, 2, tree.z, 20, 4, 0x4f8a2f, 0.18, 0.9, 3);
          this.chopT = 0;
        }
      }
    } else {
      this.chopT = 0;
    }

    // ---------- crates ----------
    for (const c of g.props.crates) {
      if (!c.active) continue;
      if ((c.x - this.x) ** 2 + (c.z - this.z) ** 2 < 2.2) g.collectCrate(c);
    }

    // ---------- animation ----------
    this.phase += dt * (6 + this.speedNow * 1.4);
    let pose: Pose = 'idle';
    let amp = 0;
    let kk = 0;
    const moving = this.speedNow > 0.5;
    if (this.swingT > 0 || (this.chopT > 0 && w.melee)) {
      pose = 'swing';
      kk = this.swingT > 0 ? 1 - this.swingT / 0.25 : (this.phase * 0.5) % 1;
      amp = moving ? 0.8 : 0;
    } else if (this.chopT > 0) {
      pose = 'swing';
      kk = (this.phase * 0.5) % 1;
    } else if (!w.melee && (this.aimVis > 0 || target)) {
      pose = 'aim';
      amp = moving ? 0.8 : 0;
    } else if (moving) {
      pose = this.speedNow > 4 ? 'run' : 'walk';
      amp = Math.min(1.2, this.speedNow / 4);
    }
    if (this.slamT > 0) pose = 'cheer';
    animate(this.h, pose, this.phase, amp, kk);
    root.position.set(this.x, this.y, this.z);
    root.rotation.set(0, this.yaw, 0);
    root.rotation.z = this.invuln > 0.15 ? Math.sin(this.invuln * 90) * 0.08 : 0;
  }

  private fire(tx: number, tz: number) {
    const g = this.game;
    const w = this.weapon;
    const dmgMul = 1 + 0.12 * g.run.up.damage;
    const baseYaw = Math.atan2(tx - this.x, tz - this.z);
    this.fireCd = 1 / w.rate;
    if (w.melee) {
      this.swingT = 0.25;
      g.audio.play('swing', 0.7);
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      g.zm.each((z) => {
        const dx = z.x - this.x;
        const dz = z.z - this.z;
        const d = Math.hypot(dx, dz);
        if (d > w.range + z.scale * 0.4) return;
        if ((dx * fx + dz * fz) / (d || 1) < 0.25) return;
        g.zm.damage(z, w.dmg * dmgMul, dx / (d || 1), dz / (d || 1), 1.6);
      });
      g.fx.particles.burst(this.x + fx * 1.5, this.y + 1.1, this.z + fz * 1.5, 2, 1.5, 0xffffff, 0.06, 0.2, 0);
      return;
    }
    this.aimVis = 0.5;
    const ox = this.x + Math.sin(baseYaw) * 0.75;
    const oz = this.z + Math.cos(baseYaw) * 0.75;
    const oy = this.y + 1.25;
    for (let p = 0; p < w.pellets; p++) {
      const ang = baseYaw + (Math.random() - 0.5) * 2 * w.spread;
      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      const hit = g.zm.raycast(this.x, this.z, dx, dz, w.range);
      const t = hit ? hit.t : w.range;
      const ey = hit ? hit.z.y + 1.1 * hit.z.scale : oy - 0.1;
      g.fx.tracers.add(g.tmpV.set(ox, oy, oz), this.x + dx * t, ey, this.z + dz * t, this.muzzleCol, w.pellets > 1 ? 0.04 : 0.06, 0.07);
      if (hit) g.zm.damage(hit.z, w.dmg * dmgMul, dx, dz, w.pellets > 1 ? 0.6 : 0.35);
      else g.fx.particles.emit(this.x + dx * t, 0.2, this.z + dz * t, 0, 1.2, 0, 0.2, 0.08, 0xc9b38a);
    }
    g.fx.particles.emit(ox, oy, oz, 0, 0.3, 0, 0.07, 0.4, new Color(4, 3, 1), 0, 0);
    g.audio.play(w.id as 'pistol', 0.7);
    if (w.id === 'shotgun') g.shake(0.25);
    else if (w.id === 'minigun') g.shake(0.08);
  }
}
