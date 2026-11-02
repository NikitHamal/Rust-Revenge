import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  Euler,
} from 'three';
import { WORLD, clamp, terrainHeight, ZDEFS } from './config';
import { groundDecal } from './textures';
import type { Game } from './game';

/* ------------------------------------------------------------------ */
/* Ground decals (blood / acid / scorch) — ring-buffer instanced quads  */
/* ------------------------------------------------------------------ */
export type DecalKind = 'blood' | 'acid' | 'scorch';
export class Decals {
  private meshes: Record<DecalKind, InstancedMesh>;
  private next: Record<DecalKind, number> = { blood: 0, acid: 0, scorch: 0 };
  private cap = 110;
  private m = new Matrix4();
  private q = new Quaternion();
  private e = new Euler();
  private p = new Vector3();
  private s = new Vector3();

  constructor(scene: Scene) {
    const geo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mk = (kind: DecalKind) => {
      const mat = new MeshStandardMaterial({
        map: groundDecal(kind),
        transparent: true,
        depthWrite: false,
        roughness: kind === 'scorch' ? 0.95 : 0.25,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
        emissive: kind === 'acid' ? new Color(0.25, 0.8, 0.1) : new Color(0, 0, 0),
        emissiveMap: kind === 'acid' ? groundDecal(kind) : null,
        emissiveIntensity: kind === 'acid' ? 0.8 : 0,
      });
      const im = new InstancedMesh(geo, mat, this.cap);
      im.count = this.cap;
      im.frustumCulled = false;
      im.receiveShadow = true;
      const zero = new Matrix4().makeScale(0, 0, 0);
      for (let i = 0; i < this.cap; i++) im.setMatrixAt(i, zero);
      im.renderOrder = 1;
      scene.add(im);
      return im;
    };
    this.meshes = { blood: mk('blood'), acid: mk('acid'), scorch: mk('scorch') };
  }

  add(x: number, z: number, kind: DecalKind, size: number) {
    const h = terrainHeight(x, z);
    if (h < 0.02) return;
    const im = this.meshes[kind];
    const i = this.next[kind]++ % this.cap;
    this.e.set(0, Math.random() * 6.28, 0);
    this.q.setFromEuler(this.e);
    this.m.compose(this.p.set(x, h + 0.035, z), this.q, this.s.set(size, 1, size));
    im.setMatrixAt(i, this.m);
    im.instanceMatrix.needsUpdate = true;
  }

  clear() {
    const zero = new Matrix4().makeScale(0, 0, 0);
    (Object.keys(this.meshes) as DecalKind[]).forEach((k) => {
      for (let i = 0; i < this.cap; i++) this.meshes[k].setMatrixAt(i, zero);
      this.meshes[k].instanceMatrix.needsUpdate = true;
      this.next[k] = 0;
    });
  }
}

/* ------------------------------------------------------------------ */
/* Acid spit projectiles (spitter zombies)                             */
/* ------------------------------------------------------------------ */
interface Bolt {
  on: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  T: number;
  kind: 'hull' | 'player' | 'tree';
  dmg: number;
}
const G_ACID = 14;
export class Projectiles {
  private bolts: Bolt[] = [];
  private mesh: InstancedMesh;
  private m = new Matrix4();
  private zero = new Matrix4().makeScale(0, 0, 0);
  private q = new Quaternion();
  private p = new Vector3();
  private s = new Vector3();

  constructor(private game: Game, scene: Scene) {
    for (let i = 0; i < 40; i++) this.bolts.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, T: 1, kind: 'hull', dmg: 0 });
    this.mesh = new InstancedMesh(new SphereGeometry(0.2, 10, 8), new MeshBasicMaterial({ color: new Color(0.9, 3, 0.35), toneMapped: false }), this.bolts.length);
    this.mesh.frustumCulled = false;
    this.mesh.count = this.bolts.length;
    for (let i = 0; i < this.bolts.length; i++) this.mesh.setMatrixAt(i, this.zero);
    scene.add(this.mesh);
  }

  spit(sx: number, sy: number, sz: number, tx: number, tz: number, kind: Bolt['kind'], dmg: number) {
    const b = this.bolts.find((q) => !q.on);
    if (!b) return;
    const dist = Math.hypot(tx - sx, tz - sz);
    const T = 0.55 + dist * 0.045;
    const ty = kind === 'tree' ? this.game.props.treehouse.platformY + 1 : 1.2;
    b.on = true;
    b.x = sx;
    b.y = sy;
    b.z = sz;
    b.vx = (tx - sx) / T;
    b.vz = (tz - sz) / T;
    b.vy = (ty - sy + 0.5 * G_ACID * T * T) / T;
    b.t = 0;
    b.T = T;
    b.kind = kind;
    b.dmg = dmg;
    this.game.audio.play('spit', 0.7);
  }

  clear() {
    for (const b of this.bolts) b.on = false;
    for (let i = 0; i < this.bolts.length; i++) this.mesh.setMatrixAt(i, this.zero);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number) {
    const g = this.game;
    for (let i = 0; i < this.bolts.length; i++) {
      const b = this.bolts[i];
      if (!b.on) {
        continue;
      }
      b.t += dt;
      b.vy -= G_ACID * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (Math.random() < 0.6) g.fx.particles.burst(b.x, b.y, b.z, 1, 0.4, 0x7dff3a, 0.09, 0.35, 0);
      if (b.t >= b.T || b.y < 0.05) {
        b.on = false;
        this.mesh.setMatrixAt(i, this.zero);
        g.fx.particles.burst(b.x, Math.max(0.2, b.y), b.z, 12, 3, 0x7dff3a, 0.13, 0.5, 3);
        g.decals.add(b.x, b.z, 'acid', 1.8);
        g.audio.play('splat', 0.5);
        if (b.kind === 'hull') g.damageHull(b.dmg * g.difficultyDamage());
        else if (b.kind === 'tree') g.damageTreehouse(b.dmg * 2);
        else if (Math.hypot(g.player.x - b.x, g.player.z - b.z) < 1.8 && g.player.alive) g.player.hurt(b.dmg * g.difficultyDamage(), b.x, b.z);
        continue;
      }
      this.m.compose(this.p.set(b.x, b.y, b.z), this.q.identity(), this.s.set(1, 1, 1));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ */
/* Rain (fully GPU animated line segments)                             */
/* ------------------------------------------------------------------ */
export class Rain {
  mat: ShaderMaterial;
  mesh: LineSegments;
  constructor(scene: Scene, n = 3200) {
    const pos = new Float32Array(n * 6);
    const seed = new Float32Array(n * 8);
    const end = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const sx = Math.random();
      const sy = Math.random();
      const sz = Math.random();
      const sw = Math.random();
      for (let k = 0; k < 2; k++) {
        seed.set([sx, sy, sz, sw], (i * 2 + k) * 4);
        end[i * 2 + k] = k;
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new Float32BufferAttribute(seed, 4));
    geo.setAttribute('aEnd', new Float32BufferAttribute(end, 1));
    this.mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: { value: 0 }, uCenter: { value: new Vector3() }, uAmount: { value: 0 }, uBright: { value: 1 }, uWind: { value: 4 } },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed; attribute float aEnd;
        uniform float uTime; uniform vec3 uCenter; uniform float uAmount; uniform vec3 uBox; uniform float uWind;
        varying float vA;
        void main(){
          vec3 box = vec3(70.0, 36.0, 56.0);
          float speed = 26.0 + aSeed.w * 10.0;
          vec3 q = aSeed.xyz * box;
          q.y -= uTime * speed;
          q.x += uTime * uWind;
          vec3 w = mod(q - uCenter + box * 0.5, box) + uCenter - box * 0.5;
          if (aEnd > 0.5) { w.y += 1.1 + aSeed.w * 0.4; w.x -= uWind * 0.04; }
          vA = (aEnd > 0.5 ? 0.0 : 0.55) * step(aSeed.w, uAmount);
          vA *= smoothstep(0.0, 3.0, w.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uBright; varying float vA;
        void main(){ gl_FragColor = vec4(vec3(0.72, 0.8, 0.9) * uBright, vA); }`,
    });
    this.mesh = new LineSegments(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }
  update(t: number, center: Vector3, amount: number, bright: number) {
    this.mesh.visible = amount > 0.02;
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uCenter.value.copy(center);
    this.mat.uniforms.uAmount.value = amount;
    this.mat.uniforms.uBright.value = bright;
  }
}

/* ------------------------------------------------------------------ */
/* Supply drop                                                         */
/* ------------------------------------------------------------------ */
function chuteTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i % 2 ? '#f2efe6' : '#e2602a';
    g.fillRect((i * 256) / 12, 0, 256 / 12 + 1, 64);
  }
  const t = new CanvasTexture(c);
  return t;
}

export class SupplyDrop {
  group = new Group();
  chute: Group;
  beam: Mesh;
  active = false;
  landed = false;
  x = 0;
  z = 0;
  y = 0;
  t = 0;
  private smoke = 0;
  constructor(private game: Game, scene: Scene) {
    const crateMat = new MeshStandardMaterial({ color: 0x59673a, roughness: 0.55, metalness: 0.55 });
    const strap = new MeshStandardMaterial({ color: 0xd9b43a, roughness: 0.5, metalness: 0.3 });
    const crate = new Mesh(new BoxGeometry(1.3, 0.9, 1.3), crateMat);
    crate.position.y = 0.45;
    crate.castShadow = true;
    this.group.add(crate);
    for (const s of [-1, 1]) {
      const b = new Mesh(new BoxGeometry(0.18, 0.94, 1.34), strap);
      b.position.set(s * 0.42, 0.45, 0);
      this.group.add(b);
    }
    const lid = new Mesh(new BoxGeometry(1.4, 0.08, 1.4), new MeshStandardMaterial({ color: 0x3c4828, roughness: 0.5, metalness: 0.6 }));
    lid.position.y = 0.92;
    this.group.add(lid);
    this.chute = new Group();
    const dome = new Mesh(new SphereGeometry(2.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new MeshStandardMaterial({ map: chuteTexture(), roughness: 0.9, side: DoubleSide }));
    dome.scale.y = 0.65;
    dome.position.y = 4.2;
    dome.castShadow = true;
    this.chute.add(dome);
    const lineMat = new MeshBasicMaterial({ color: 0xdddddd });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const l = new Mesh(new CylinderGeometry(0.012, 0.012, 3.4, 3), lineMat);
      l.position.set(Math.cos(a) * 1.3, 2.5, Math.sin(a) * 1.3);
      l.lookAt(0, 1, 0);
      l.rotateX(Math.PI / 2);
      this.chute.add(l);
    }
    this.group.add(this.chute);
    this.beam = new Mesh(
      new CylinderGeometry(0.5, 1.1, 38, 14, 1, true),
      new MeshBasicMaterial({ color: new Color(0.9, 1.6, 2.2), transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }),
    );
    this.beam.position.y = 19;
    this.group.add(this.beam);
    this.group.visible = false;
    scene.add(this.group);
  }

  spawn() {
    const g = this.game;
    for (let i = 0; i < 40; i++) {
      const x = (Math.random() * 2 - 1) * (WORLD.playX - 12);
      const z = (Math.random() * 2 - 1) * (WORLD.playZ - 12);
      if (terrainHeight(x, z) > 0.3 && Math.hypot(x, z) > 18) {
        this.x = x;
        this.z = z;
        break;
      }
    }
    this.active = true;
    this.landed = false;
    this.t = 0;
    this.y = 46;
    this.chute.visible = true;
    this.group.visible = true;
    g.setAlert('📦 Supply drop incoming! Find the glowing beam.', 6);
    g.audio.play('pickup', 0.6);
  }

  clear() {
    this.active = false;
    this.group.visible = false;
  }

  update(dt: number, time: number) {
    if (!this.active) return;
    const g = this.game;
    const gy = terrainHeight(this.x, this.z);
    this.t += dt;
    if (!this.landed) {
      this.y = Math.max(gy, this.y - dt * 6.5);
      if (this.y <= gy + 0.001) {
        this.landed = true;
        this.chute.visible = false;
        g.fx.particles.burst(this.x, gy + 0.3, this.z, 20, 3, 0xcfc3a0, 0.2, 0.8, 1);
        g.audio.play('slam', 0.4);
      }
    }
    this.group.position.set(this.x + Math.sin(time * 0.9) * (this.landed ? 0 : 0.5), this.y, this.z);
    this.group.rotation.y = this.landed ? 0.4 : Math.sin(time * 0.7) * 0.2;
    (this.beam.material as MeshBasicMaterial).opacity = 0.16 + Math.sin(time * 3) * 0.06;
    this.smoke -= dt;
    if (this.smoke <= 0 && this.landed) {
      this.smoke = 0.12;
      g.fx.particles.burst(this.x, gy + 1.2, this.z, 2, 0.8, 0xe86a3a, 0.28, 1.4, 2);
    }
    if (this.landed && g.player.alive && Math.hypot(g.player.x - this.x, g.player.z - this.z) < 2.6) {
      const n = g.run.night;
      const s = 110 + n * 28;
      const w = 45 + n * 7;
      g.addResource('scrap', s);
      g.addResource('wood', w);
      g.player.heal(g.player.hpMax * 0.4);
      g.toast(`📦 Supply drop secured! +${s}⚙️ +${w}🪵 + medkit`);
      g.fx.particles.burst(this.x, gy + 1, this.z, 30, 4, 0xffe27a, 0.14, 0.8, 4);
      g.audio.play('upgrade', 0.9);
      this.active = false;
      this.group.visible = false;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Event director: weather, blood moons, supply drops                  */
/* ------------------------------------------------------------------ */
export const BLOOD_MOON_NIGHTS = [3, 6, 9, 10];
export const STORM_NIGHTS = [2, 5, 8];

export class WorldEvents {
  rain: Rain;
  drop: SupplyDrop;
  bloodMoon = false;
  storm = false;
  dayRain = false;
  private dropIn = -1;
  private lightningT = 8;
  private thunder: number[] = [];

  constructor(private game: Game, scene: Scene) {
    this.rain = new Rain(scene);
    this.drop = new SupplyDrop(game, scene);
  }

  get lootMul() {
    return this.bloodMoon ? 1.6 : 1;
  }
  get speedMul() {
    return this.bloodMoon ? 1.1 : 1;
  }
  get countMul() {
    return this.bloodMoon ? 1.35 : 1;
  }

  reset() {
    this.bloodMoon = false;
    this.storm = false;
    this.dayRain = false;
    this.dropIn = -1;
    this.drop.clear();
    this.game.light.bloodT = 0;
    this.game.light.stormT = 0;
    this.game.light.blood = 0;
    this.game.light.storm = 0;
  }

  onDay(night: number, first: boolean) {
    const g = this.game;
    this.bloodMoon = false;
    this.storm = false;
    g.light.bloodT = 0;
    this.dayRain = !first && night >= 3 && Math.random() < 0.3;
    g.light.stormT = this.dayRain ? 0.55 : 0;
    if (this.dayRain) g.toast('🌧️ A grey drizzle rolls in. Visibility drops, surfaces get slick.');
    this.dropIn = !first && night >= 2 && Math.random() < 0.7 ? 14 + Math.random() * 16 : -1;
    this.drop.clear();
    g.decals.clear();
    g.projectiles.clear();
  }

  onNight(night: number) {
    const g = this.game;
    this.dropIn = -1;
    this.bloodMoon = BLOOD_MOON_NIGHTS.includes(night);
    this.storm = STORM_NIGHTS.includes(night) || (night > 3 && !this.bloodMoon && Math.random() < 0.18);
    g.light.bloodT = this.bloodMoon ? 1 : 0;
    g.light.stormT = this.storm ? 1 : this.bloodMoon ? 0.15 : 0;
    this.lightningT = 4 + Math.random() * 5;
    if (this.bloodMoon) g.setAlert('🩸 BLOOD MOON — more zombies, faster, but loot is +60%!', 7);
    else if (this.storm) g.setAlert('⛈️ Thunderstorm — the horde hides in the downpour.', 6);
  }

  update(dt: number, time: number) {
    const g = this.game;
    if (this.dropIn > 0 && g.running && g.run.phase === 'day') {
      this.dropIn -= dt;
      if (this.dropIn <= 0) this.drop.spawn();
    }
    this.drop.update(dt, time);
    const st = g.light.storm;
    this.rain.update(time, g.rig.target, st > 0.05 ? clamp(st * 1.05, 0, 1) : 0, 0.35 + 0.65 * g.light.L);
    if (this.storm && g.run.phase === 'night' && st > 0.6) {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.lightningT = 5 + Math.random() * 9;
        g.light.strike();
        this.thunder.push(0.25 + Math.random() * 1.1);
      }
    }
    for (let i = this.thunder.length - 1; i >= 0; i--) {
      this.thunder[i] -= dt;
      if (this.thunder[i] <= 0) {
        g.audio.play('thunder', 0.9);
        g.shake(0.12);
        this.thunder.splice(i, 1);
      }
    }
  }
}

export const SPIT_RANGE = 9;
export const spitterDmg = () => ZDEFS.spitter.hullDmg;
