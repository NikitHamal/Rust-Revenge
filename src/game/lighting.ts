import { Color, DirectionalLight, HemisphereLight, Scene, ShaderMaterial, Vector3, WebGLRenderer, Fog } from 'three';
import { clamp, smoothstep } from './config';

const C = (h: number) => new Color(h);
const NIGHT = { sun: C(0x8fb0ff), sunI: 2.0, sky: C(0x4a6aa8), gnd: C(0x1a2236), hemiI: 2.4, fog: C(0x101c36), exp: 1.25, dir: new Vector3(0.5, 0.8, -0.4) };
const DUSK = { sun: C(0xff9050), sunI: 2.9, sky: C(0xd09070), gnd: C(0x5a4a40), hemiI: 1.8, fog: C(0xc77b5a), exp: 1.0, dir: new Vector3(-0.9, 0.3, 0.45) };
const DAY = { sun: C(0xfff0d8), sunI: 3.6, sky: C(0xbfe0ff), gnd: C(0x7a8f50), hemiI: 2.0, fog: C(0xa4d0e8), exp: 1.0, dir: new Vector3(-0.55, 0.78, 0.45) };

const tmpC = new Color();
const tmpV = new Vector3();

function mix3(out: Color, a: Color, b: Color, c: Color, t: number) {
  if (t < 0.5) return out.copy(a).lerp(b, t * 2);
  return out.copy(b).lerp(c, (t - 0.5) * 2);
}
function mixN(a: number, b: number, c: number, t: number) {
  return t < 0.5 ? a + (b - a) * t * 2 : b + (c - b) * (t - 0.5) * 2;
}

export class Lighting {
  sun: DirectionalLight;
  hemi: HemisphereLight;
  fog: Fog;
  /** 0 = deep night, 0.5 = dusk, 1 = day */
  L = 1;
  /** 1 at night (lamps on) */
  lamp = 0;
  private sunCol = new Color();
  private skyCol = new Color();

  constructor(private scene: Scene, private renderer: WebGLRenderer, private waterMat: ShaderMaterial) {
    this.sun = new DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.06;
    const cam = this.sun.shadow.camera;
    cam.left = -34;
    cam.right = 34;
    cam.top = 34;
    cam.bottom = -34;
    cam.near = 1;
    cam.far = 160;
    scene.add(this.sun, this.sun.target);
    this.hemi = new HemisphereLight(0xffffff, 0x445522, 1);
    scene.add(this.hemi);
    this.fog = new Fog(0xa4d0e8, 65, 175);
    scene.fog = this.fog;
    this.apply(1, new Vector3());
  }

  setShadows(on: boolean, size: number) {
    this.sun.castShadow = on;
    if (on && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  /** Smoothly move toward target light level and apply. */
  update(dt: number, target: number, focus: Vector3) {
    const rate = 0.1;
    const d = target - this.L;
    this.L += clamp(d, -dt * rate, dt * rate);
    this.apply(this.L, focus);
  }

  apply(L: number, focus: Vector3) {
    this.L = L;
    mix3(this.sunCol, NIGHT.sun, DUSK.sun, DAY.sun, L);
    this.sun.color.copy(this.sunCol);
    this.sun.intensity = mixN(NIGHT.sunI, DUSK.sunI, DAY.sunI, L);
    tmpV.set(
      mixN(NIGHT.dir.x, DUSK.dir.x, DAY.dir.x, L),
      mixN(NIGHT.dir.y, DUSK.dir.y, DAY.dir.y, L),
      mixN(NIGHT.dir.z, DUSK.dir.z, DAY.dir.z, L),
    ).normalize();
    this.sun.position.copy(focus).addScaledVector(tmpV, 70);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();

    mix3(this.hemi.color, NIGHT.sky, DUSK.sky, DAY.sky, L);
    mix3(this.hemi.groundColor, NIGHT.gnd, DUSK.gnd, DAY.gnd, L);
    this.hemi.intensity = mixN(NIGHT.hemiI, DUSK.hemiI, DAY.hemiI, L);
    mix3(this.skyCol, NIGHT.fog, DUSK.fog, DAY.fog, L);
    this.fog.color.copy(this.skyCol);
    this.scene.background = this.skyCol;
    this.renderer.toneMappingExposure = mixN(NIGHT.exp, DUSK.exp, DAY.exp, L);
    this.lamp = 1 - smoothstep(0.15, 0.7, L);

    const u = this.waterMat.uniforms;
    u.uSunDir.value.copy(tmpV);
    (u.uSunColor.value as Color).copy(this.sunCol).multiplyScalar(0.6 + L * 0.5);
    const dim = 0.22 + 0.78 * smoothstep(0.1, 0.9, L);
    (u.uDeep.value as Color).setRGB(0.03, 0.2, 0.26).multiplyScalar(dim);
    (u.uShallow.value as Color).setRGB(0.12, 0.5, 0.52).multiplyScalar(dim);
    (u.uSky.value as Color).copy(tmpC.copy(this.skyCol).lerp(this.hemi.color, 0.5)).multiplyScalar(0.9);
    (u.uFogColor.value as Color).copy(this.skyCol);
  }
}
