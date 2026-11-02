import { Color, Scene } from 'three';
import {
  MAX_ZOMBIES,
  WORLD,
  ZDEFS,
  clamp,
  nightZombieCount,
  terrainHeight,
  type ZDef,
  type ZType,
} from './config';
import { ZombieSwarm, type ZombieVisual } from './characters';
import type { Game } from './game';

export interface Zombie extends ZombieVisual {
  id: number;
  type: ZType;
  def: ZDef;
  hp: number;
  maxHp: number;
  speed: number;
  mode: 0 | 1; // 0 wander, 1 hunting
  tgt: 0 | 1; // 0 ship, 1 treehouse
  night: boolean;
  wanderT: number;
  wx: number;
  wz: number;
  atkCd: number;
  kx: number;
  kz: number;
  slow: number;
}

const SKINS = [0x8aa86a, 0x7f9a82, 0x9aa878, 0x8a9a8a, 0x93ad78, 0x94a684, 0xa8a88a, 0x7a9078].map((c) => new Color(c));
const SPITTER_SKIN = new Color(0xa4c050);
const BLOATER_SKIN = new Color(0xc2b48a);
const CLOTHS = [0x6b5a4a, 0x4a5a6b, 0x7a3b3b, 0x3f4f3f, 0x5b4b6b, 0x6b6b5a, 0x2f3b4f, 0x8a7a4a].map((c) => new Color(c));
const BOSS_SKIN = new Color(0x9b4f6b);
const BOSS_CLOTH = new Color(0x2a2a35);

const CELL = 1.6;
const GX = Math.ceil((WORLD.maxX - WORLD.minX + 20) / CELL);
const GZ = Math.ceil((WORLD.maxZ - WORLD.minZ + 20) / CELL);

function lerpAngle(a: number, b: number, t: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class ZombieManager {
  list: Zombie[] = [];
  swarm: ZombieSwarm;
  queue: ZType[] = [];
  spawnTimer = 0;
  spawnInterval = 1;
  nightNo = 1;
  private head = new Int32Array(GX * GZ).fill(-1);
  private next = new Int32Array(MAX_ZOMBIES + 8);
  private nextId = 1;
  private tmp = { x: 0, z: 0 };
  hpMul = 1;

  constructor(private game: Game, scene: Scene) {
    this.swarm = new ZombieSwarm(scene, MAX_ZOMBIES);
  }

  get alive() {
    let n = 0;
    for (const z of this.list) if (!z.dead) n++;
    return n;
  }

  clear() {
    this.list.length = 0;
    this.queue.length = 0;
    this.swarm.update(this.list);
  }

  spawn(type: ZType, x: number, z: number, mode: 0 | 1, tgt: 0 | 1, night: boolean): Zombie | null {
    if (this.list.length >= MAX_ZOMBIES) return null;
    const def = ZDEFS[type];
    const hp = def.hp * this.hpMul;
    const boss = type === 'boss';
    const v = 0.88 + Math.random() * 0.24;
    const zb: Zombie = {
      id: this.nextId++,
      type,
      def,
      x,
      z,
      y: 0,
      yaw: Math.random() * 6.28,
      scale: def.scale * (boss ? 1 : 0.92 + Math.random() * 0.16),
      phase: Math.random() * 10,
      moving: 0,
      atk: 0,
      dead: false,
      deathT: 0,
      flash: 0,
      skin: boss ? BOSS_SKIN : type === 'spitter' ? SPITTER_SKIN : type === 'bloater' ? BLOATER_SKIN : SKINS[Math.floor(Math.random() * SKINS.length)],
      fat: type === 'bloater' ? 1.7 : type === 'brute' ? 1.25 : 1,
      variant: type === 'spitter' ? 1 : type === 'bloater' ? 2 : 0,
      cloth: boss ? BOSS_CLOTH : CLOTHS[Math.floor(Math.random() * CLOTHS.length)],
      hp,
      maxHp: hp,
      speed: def.speed * v,
      mode,
      tgt,
      night,
      wanderT: Math.random() * 3,
      wx: 0,
      wz: 0,
      atkCd: Math.random(),
      kx: 0,
      kz: 0,
      slow: 0,
    };
    zb.y = Math.max(terrainHeight(x, z), -0.55);
    this.list.push(zb);
    return zb;
  }

  landPoint(minD: number, maxD: number, avoid?: { x: number; z: number; r: number }): { x: number; z: number } {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = minD + Math.random() * (maxD - minD);
      const x = Math.cos(a) * d * 1.3;
      const z = Math.sin(a) * d;
      if (Math.abs(x) > WORLD.playX - 4 || Math.abs(z) > WORLD.playZ - 4) continue;
      if (terrainHeight(x, z) < 0.3) continue;
      if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < avoid.r) continue;
      return { x, z };
    }
    return { x: -50, z: 40 };
  }

  edgePoint(): { x: number; z: number } {
    for (let i = 0; i < 30; i++) {
      const r = Math.random();
      let x: number, z: number;
      if (r < 0.3) {
        x = -(WORLD.playX - 3);
        z = (Math.random() * 2 - 1) * (WORLD.playZ - 8);
      } else if (r < 0.6) {
        x = WORLD.playX - 3;
        z = (Math.random() * 2 - 1) * (WORLD.playZ - 8);
      } else if (r < 0.8) {
        z = WORLD.playZ - 3;
        x = (Math.random() * 2 - 1) * (WORLD.playX - 8);
      } else {
        z = -(WORLD.playZ - 3);
        x = (Math.random() * 2 - 1) * (WORLD.playX - 8);
      }
      if (terrainHeight(x, z) > 0.1) return { x, z };
    }
    return { x: -60, z: 30 };
  }

  /* -------------------- wave control -------------------- */
  beginNight(n: number, countMul = 1) {
    this.nightNo = n;
    this.hpMul = 1 + 0.14 * (n - 1);
    // convert day roamers into hunters
    for (const z of this.list) {
      if (!z.dead) {
        z.mode = 1;
        z.night = true;
      }
    }
    const count = Math.round(nightZombieCount(n) * countMul);
    const spitP = n >= 4 ? Math.min(0.12, 0.02 * n) : 0;
    const bloatP = n >= 3 ? Math.min(0.09, 0.012 * n + 0.01) : 0;
    const runnerP = n >= 2 ? Math.min(0.38, 0.1 + 0.04 * n) : 0;
    const bruteP = n >= 3 ? Math.min(0.22, 0.03 + 0.025 * n) : 0;
    this.queue = [];
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      this.queue.push(
        r < bruteP ? 'brute' : r < bruteP + runnerP ? 'runner' : r < bruteP + runnerP + spitP ? 'spitter' : r < bruteP + runnerP + spitP + bloatP ? 'bloater' : 'walker',
      );
    }
    if (n % 5 === 0) {
      const bosses = Math.floor(n / 5);
      for (let i = 0; i < bosses; i++) this.queue.splice(Math.floor(this.queue.length * (0.45 + i * 0.1)), 0, 'boss');
    }
    this.spawnInterval = clamp(42 / count, 0.25, 4);
    this.spawnTimer = 1.5;
  }

  spawnSiege(n: number, tx: number) {
    const count = 8 + n * 2;
    for (let i = 0; i < count; i++) {
      const x = clamp(tx + (Math.random() - 0.5) * 30, -WORLD.playX + 4, WORLD.playX - 4);
      const z = WORLD.playZ - 4 - Math.random() * 5;
      const type: ZType = Math.random() < 0.15 ? 'brute' : Math.random() < 0.3 ? 'runner' : 'walker';
      this.spawn(type, x, z, 1, 1, true);
    }
  }

  spawnRoamers(count: number, night: number) {
    this.hpMul = 1 + 0.14 * (night - 1);
    for (let i = 0; i < count; i++) {
      const p = this.landPoint(22, 52, { x: this.game.props.treehouse.x, z: this.game.props.treehouse.z, r: 14 });
      const r = Math.random();
      this.spawn(r < 0.15 ? 'runner' : 'walker', p.x, p.z, 0, 0, false);
    }
  }

  private spawnTick(dt: number) {
    if (!this.queue.length) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = this.spawnInterval;
    const pack = Math.min(this.queue.length, 1 + Math.floor(Math.random() * 3));
    const p = this.edgePoint();
    for (let i = 0; i < pack; i++) {
      const type = this.queue.shift()!;
      this.spawn(type, p.x + (Math.random() - 0.5) * 4, p.z + (Math.random() - 0.5) * 4, 1, 0, true);
    }
  }

  /* -------------------- queries -------------------- */
  nearest(x: number, z: number, range: number): Zombie | null {
    let best: Zombie | null = null;
    let bd = range * range;
    for (const q of this.list) {
      if (q.dead) continue;
      const d = (q.x - x) ** 2 + (q.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    return best;
  }

  nearestExcluding(x: number, z: number, range: number, excl: Zombie[]): Zombie | null {
    let best: Zombie | null = null;
    let bd = range * range;
    for (const q of this.list) {
      if (q.dead || excl.includes(q)) continue;
      const d = (q.x - x) ** 2 + (q.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    return best;
  }

  each(cb: (z: Zombie) => void) {
    for (const q of this.list) if (!q.dead) cb(q);
  }

  /** First zombie hit by a ray from (ox,oz) along unit dir. */
  raycast(ox: number, oz: number, dx: number, dz: number, range: number): { z: Zombie; t: number } | null {
    let best: Zombie | null = null;
    let bt = range;
    for (const q of this.list) {
      if (q.dead) continue;
      const rx = q.x - ox;
      const rz = q.z - oz;
      const t = rx * dx + rz * dz;
      if (t < 0 || t > bt) continue;
      const perp = Math.abs(rx * dz - rz * dx);
      if (perp < 0.4 * q.scale + 0.12) {
        bt = t;
        best = q;
      }
    }
    return best ? { z: best, t: bt } : null;
  }

  damage(z: Zombie, dmg: number, dx: number, dz: number, knock: number, quiet = false) {
    if (z.dead) return;
    z.hp -= dmg;
    z.flash = 0.12;
    const kn = (knock * 5) / Math.max(0.8, z.scale * z.scale);
    z.kx += dx * kn;
    z.kz += dz * kn;
    const g = this.game;
    if (!quiet) {
      g.fx.particles.burst(z.x, z.y + 1.1 * z.scale, z.z, 4, 3, 0x6b1d1d, 0.09, 0.45, 2);
      g.audio.play('hit', 0.6);
    } else if (Math.random() < 0.15) {
      g.fx.particles.burst(z.x, z.y + 1.1 * z.scale, z.z, 1, 1.5, 0x6b1d1d, 0.08, 0.3, 1);
    }
    if (z.hp <= 0) this.kill(z, quiet && dmg >= 1e8);
  }

  private explode(z: Zombie) {
    const g = this.game;
    const R = 5.2;
    g.fx.particles.burst(z.x, z.y + 1.2, z.z, 34, 6, 0xb8e03a, 0.2, 0.8, 4);
    g.fx.particles.burst(z.x, z.y + 1.2, z.z, 18, 5, 0xffc23a, 0.16, 0.6, 5);
    g.fx.shock.spawn(z.x, z.y + 0.2, z.z, R, new Color(0.7, 2.2, 0.3), 0.6);
    g.audio.play('boom', 0.8);
    g.shake(0.35);
    g.decals.add(z.x, z.z, 'acid', R * 0.9);
    const p = g.player;
    const dp = Math.hypot(p.x - z.x, p.z - z.z);
    if (p.alive && dp < R) p.hurt(z.def.playerDmg * (1 - (dp / R) * 0.5) * g.difficultyDamage(), z.x, z.z);
    g.ship.nearest(z.x, z.z, this.tmp);
    if (Math.hypot(this.tmp.x - z.x, this.tmp.z - z.z) < R * 0.75) g.damageHull(z.def.hullDmg * g.difficultyDamage());
  }

  private kill(z: Zombie, silent = false) {
    z.dead = true;
    z.deathT = 0;
    const g = this.game;
    if (silent) {
      z.hp = 0;
    } else if (z.type === 'bloater') this.explode(z);
    else g.decals.add(z.x, z.z, 'blood', 0.9 + z.scale * 0.5);
    g.fx.particles.burst(z.x, z.y + 0.8 * z.scale, z.z, z.type === 'boss' ? 30 : 8, 3.5, 0x5a1515, 0.12, 0.6, 3);
    g.audio.play('zdie', z.type === 'brute' || z.type === 'boss' ? 1 : 0.6);
    g.onZombieKilled(z);
  }

  /* -------------------- simulation -------------------- */
  update(dt: number) {
    const g = this.game;
    const p = g.player;
    const ship = g.ship;
    const th = g.props.treehouse;
    this.spawnTick(dt);

    // spatial hash
    this.head.fill(-1);
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const q = list[i];
      if (q.dead) continue;
      const cx = clamp(Math.floor((q.x - WORLD.minX + 10) / CELL), 0, GX - 1);
      const cz = clamp(Math.floor((q.z - WORLD.minZ + 10) / CELL), 0, GZ - 1);
      const c = cz * GX + cx;
      this.next[i] = this.head[c];
      this.head[c] = i;
    }

    const r = ship.rect;
    const speedMul = g.difficultySpeed();
    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      z.flash = Math.max(0, z.flash - dt);
      if (z.dead) {
        z.deathT += dt;
        continue;
      }
      z.atk = Math.max(0, z.atk - dt);
      z.slow = Math.max(0, z.slow - dt);
      const sc = z.scale;
      const dpx = p.x - z.x;
      const dpz = p.z - z.z;
      const dp2 = dpx * dpx + dpz * dpz;
      const playerOk = p.alive && !p.hidden;

      let mx = 0;
      let mz = 0;
      let spd = 0;
      let faceX = 0;
      let faceZ = 0;
      let hasFace = false;

      if (z.mode === 0) {
        z.wanderT -= dt;
        if (z.wanderT <= 0) {
          z.wanderT = 2 + Math.random() * 4;
          if (Math.random() < 0.4) {
            z.wx = 0;
            z.wz = 0;
          } else {
            const a = Math.random() * 6.28;
            z.wx = Math.cos(a);
            z.wz = Math.sin(a);
          }
        }
        mx = z.wx;
        mz = z.wz;
        spd = z.speed * 0.28;
        if (playerOk && dp2 < 12 * 12) {
          z.mode = 1;
          if (Math.random() < 0.5) g.audio.play('groan', 0.7);
        }
      } else {
        let tx: number;
        let tz: number;
        let isPlayer = false;
        const aggro = z.night ? 7.5 : 15;
        if (playerOk && dp2 < aggro * aggro) {
          tx = p.x;
          tz = p.z;
          isPlayer = true;
        } else if (!z.night) {
          if (!playerOk || dp2 > 30 * 30) z.mode = 0;
          tx = p.x;
          tz = p.z;
        } else if (z.tgt === 1) {
          tx = th.x - 2;
          tz = th.z;
        } else {
          ship.nearest(z.x, z.z, this.tmp);
          tx = this.tmp.x;
          tz = this.tmp.z;
        }
        const dx = tx - z.x;
        const dz = tz - z.z;
        const d = Math.hypot(dx, dz) || 0.001;
        const ranged = z.type === 'spitter';
        const reach = ranged ? Math.max(3.5, 8.5 - Math.max(0, g.run.nightClock - 60) * 0.06) : isPlayer ? 0.7 * sc + 0.55 : z.tgt === 1 && z.night ? 3.2 : 0.35 + 0.5 * sc;
        faceX = dx;
        faceZ = dz;
        hasFace = true;
        if (d > reach) {
          mx = dx / d;
          mz = dz / d;
          spd = z.speed;
        } else {
          z.atkCd -= dt;
          if (z.atkCd <= 0) {
            z.atkCd = z.def.atkRate * (0.9 + Math.random() * 0.2);
            z.atk = 0.35;
            if (ranged) {
              g.projectiles.spit(z.x, z.y + 1.5, z.z, tx, tz, isPlayer ? 'player' : z.tgt === 1 ? 'tree' : 'hull', isPlayer ? z.def.playerDmg : z.def.hullDmg);
            } else if (z.type === 'bloater') {
              z.hp = 0;
              this.kill(z);
            } else if (isPlayer) p.hurt(z.def.playerDmg * g.difficultyDamage(), z.x, z.z);
            else if (z.tgt === 1) g.damageTreehouse(z.def.hullDmg * 2.2);
            else g.damageHull(z.def.hullDmg * g.difficultyDamage());
          }
        }
      }

      // terrain / water
      const h = terrainHeight(z.x, z.z);
      const inWater = h < -0.06;
      const sp = spd * (inWater ? 0.55 : 1) * (z.slow > 0 ? 0.55 : 1) * speedMul;

      // separation
      let sx = 0;
      let sz = 0;
      const cx = clamp(Math.floor((z.x - WORLD.minX + 10) / CELL), 1, GX - 2);
      const cz = clamp(Math.floor((z.z - WORLD.minZ + 10) / CELL), 1, GZ - 2);
      for (let oz = -1; oz <= 1; oz++) {
        for (let ox = -1; ox <= 1; ox++) {
          let j = this.head[(cz + oz) * GX + cx + ox];
          let guard = 0;
          while (j !== -1 && guard++ < 24) {
            if (j !== i) {
              const o = list[j];
              const ddx = z.x - o.x;
              const ddz = z.z - o.z;
              const rad = 0.42 * (sc + o.scale);
              const d2 = ddx * ddx + ddz * ddz;
              if (d2 < rad * rad && d2 > 0.0001) {
                const dd = Math.sqrt(d2);
                const push = (rad - dd) / rad;
                sx += (ddx / dd) * push;
                sz += (ddz / dd) * push;
              }
            }
            j = this.next[j];
          }
        }
      }

      z.x += (mx * sp + sx * 2.6 + z.kx) * dt;
      z.z += (mz * sp + sz * 2.6 + z.kz) * dt;
      const kd = Math.max(0, 1 - 7 * dt);
      z.kx *= kd;
      z.kz *= kd;
      z.x = clamp(z.x, -WORLD.playX - 6, WORLD.playX + 6);
      z.z = clamp(z.z, -WORLD.playZ - 6, WORLD.playZ + 6);

      // keep out of hull
      const m = 0.3;
      if (z.x > r.minX - m && z.x < r.maxX + m && z.z > r.minZ - m && z.z < r.maxZ + m) {
        const dl = z.x - (r.minX - m);
        const dr = r.maxX + m - z.x;
        const dd = z.z - (r.minZ - m);
        const du = r.maxZ + m - z.z;
        const mn = Math.min(dl, dr, dd, du);
        if (mn === dl) z.x = r.minX - m;
        else if (mn === dr) z.x = r.maxX + m;
        else if (mn === dd) z.z = r.minZ - m;
        else z.z = r.maxZ + m;
      }

      const targetY = Math.max(terrainHeight(z.x, z.z), -0.55);
      z.y += (targetY - z.y) * Math.min(1, dt * 12);
      const moved = sp > 0.05 ? Math.min(1, sp / 1.6) : 0;
      z.moving += (moved - z.moving) * Math.min(1, dt * 8);
      z.phase += dt * (1.5 + sp * 2.4);
      if (hasFace && (faceX !== 0 || faceZ !== 0)) z.yaw = lerpAngle(z.yaw, Math.atan2(faceX, faceZ), 1 - Math.exp(-9 * dt));
      else if (mx !== 0 || mz !== 0) z.yaw = lerpAngle(z.yaw, Math.atan2(mx, mz), 1 - Math.exp(-5 * dt));

      if (Math.random() < dt * 0.02 && dp2 < 28 * 28) g.audio.play('groan', 0.35);
    }

    // remove fully decayed corpses
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      if (z.dead && z.deathT > 2.2) continue;
      list[w++] = z;
    }
    list.length = w;
    this.swarm.update(list);
  }
}
