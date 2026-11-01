import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  RingGeometry,
  Scene,
  Vector3,
} from 'three';

/** Pooled particle system: one InstancedMesh, ring-buffer allocation, zero GC per frame. */
export class Particles {
  mesh: InstancedMesh;
  private n: number;
  private px: Float32Array;
  private py: Float32Array;
  private pz: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private vz: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private size: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private grow: Float32Array;
  private next = 0;
  private m = new Matrix4();
  private q = new Quaternion();
  private pos = new Vector3();
  private sc = new Vector3();
  private c = new Color();
  private hidden: Uint8Array;
  private zero = new Matrix4().makeScale(0, 0, 0);

  constructor(scene: Scene, n = 900) {
    this.n = n;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.vz = new Float32Array(n);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n).fill(1);
    this.size = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.hidden = new Uint8Array(n).fill(1);
    const mat = new MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    for (let i = 0; i < n; i++) {
      this.mesh.setMatrixAt(i, this.zero);
      this.mesh.setColorAt(i, this.c.setRGB(1, 1, 1));
    }
    scene.add(this.mesh);
  }

  emit(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, size: number, color: Color | number,
    grav = 9, drag = 0, grow = -1,
  ) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.max[i] = life;
    this.size[i] = size; this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow;
    this.hidden[i] = 0;
    this.mesh.setColorAt(i, typeof color === 'number' ? this.c.set(color) : color);
  }

  burst(x: number, y: number, z: number, count: number, speed: number, color: Color | number, size = 0.1, life = 0.5, up = 3) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.emit(x, y, z, Math.cos(a) * s, up * Math.random() + 0.5, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), color);
    }
  }

  update(dt: number) {
    let anyColor = false;
    for (let i = 0; i < this.n; i++) {
      if (this.hidden[i]) continue;
      const l = (this.life[i] -= dt);
      if (l <= 0) {
        this.hidden[i] = 1;
        this.mesh.setMatrixAt(i, this.zero);
        continue;
      }
      const d = 1 - this.drag[i] * dt;
      this.vx[i] *= d; this.vz[i] *= d;
      this.vy[i] -= this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      const t = l / this.max[i];
      const s = this.size[i] * (this.grow[i] < 0 ? t : 1 + (1 - t) * this.grow[i]);
      this.m.compose(this.pos.set(this.px[i], this.py[i], this.pz[i]), this.q, this.sc.set(s, s, s));
      this.mesh.setMatrixAt(i, this.m);
      anyColor = true;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = anyColor || true;
  }
}

/** Bullet tracers / lightning beams: pooled additive boxes stretched between two points. */
export class Tracers {
  mesh: InstancedMesh;
  private n: number;
  private life: Float32Array;
  private maxLife: Float32Array;
  private ax: Float32Array;
  private ay: Float32Array;
  private az: Float32Array;
  private bx: Float32Array;
  private by: Float32Array;
  private bz: Float32Array;
  private wid: Float32Array;
  private next = 0;
  private dummy = new Object3D();
  private c = new Color();
  private zero = new Matrix4().makeScale(0, 0, 0);
  private hidden: Uint8Array;

  constructor(scene: Scene, n = 160) {
    this.n = n;
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n).fill(1);
    this.ax = new Float32Array(n); this.ay = new Float32Array(n); this.az = new Float32Array(n);
    this.bx = new Float32Array(n); this.by = new Float32Array(n); this.bz = new Float32Array(n);
    this.wid = new Float32Array(n);
    this.hidden = new Uint8Array(n).fill(1);
    const geo = new BoxGeometry(1, 1, 1);
    geo.translate(0, 0, 0.5);
    const mat = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false, blending: AdditiveBlending, transparent: true, depthWrite: false });
    this.mesh = new InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    for (let i = 0; i < n; i++) {
      this.mesh.setMatrixAt(i, this.zero);
      this.mesh.setColorAt(i, this.c.setRGB(1, 1, 1));
    }
    scene.add(this.mesh);
  }

  add(a: Vector3, bx: number, by: number, bz: number, color: Color | number, width = 0.06, life = 0.07) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.ax[i] = a.x; this.ay[i] = a.y; this.az[i] = a.z;
    this.bx[i] = bx; this.by[i] = by; this.bz[i] = bz;
    this.life[i] = life; this.maxLife[i] = life; this.wid[i] = width;
    this.hidden[i] = 0;
    this.mesh.setColorAt(i, typeof color === 'number' ? this.c.set(color) : color);
  }

  update(dt: number) {
    const d = this.dummy;
    for (let i = 0; i < this.n; i++) {
      if (this.hidden[i]) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.hidden[i] = 1;
        this.mesh.setMatrixAt(i, this.zero);
        continue;
      }
      const t = this.life[i] / this.maxLife[i];
      d.position.set(this.ax[i], this.ay[i], this.az[i]);
      d.lookAt(this.bx[i], this.by[i], this.bz[i]);
      const len = Math.hypot(this.bx[i] - this.ax[i], this.by[i] - this.ay[i], this.bz[i] - this.az[i]);
      const w = this.wid[i] * (0.4 + t * 0.6);
      d.scale.set(w, w, len);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Expanding shockwave rings (slam, explosions). */
export class Shockwaves {
  private rings: { mesh: Mesh; t: number; dur: number; r: number }[] = [];

  constructor(scene: Scene) {
    const geo = new RingGeometry(0.82, 1, 48);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, side: DoubleSide, depthWrite: false, toneMapped: false, blending: AdditiveBlending });
      const mesh = new Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 4;
      scene.add(mesh);
      this.rings.push({ mesh, t: 0, dur: 0.5, r: 5 });
    }
  }

  spawn(x: number, y: number, z: number, radius: number, color: number | Color, dur = 0.5) {
    const r = this.rings.find((q) => !q.mesh.visible) ?? this.rings[0];
    r.t = 0;
    r.dur = dur;
    r.r = radius;
    r.mesh.visible = true;
    r.mesh.position.set(x, y + 0.05, z);
    (r.mesh.material as MeshBasicMaterial).color.set(color as Color);
  }

  update(dt: number) {
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const u = r.t / r.dur;
      if (u >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const s = r.r * (1 - Math.pow(1 - u, 3)) + 0.1;
      r.mesh.scale.set(s, 1, s);
      (r.mesh.material as MeshBasicMaterial).opacity = (1 - u) * 0.9;
    }
  }
}
