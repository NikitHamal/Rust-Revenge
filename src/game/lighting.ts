import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { clamp, smoothstep } from './config';
import { createDome, createSkyMaterial } from './sky';
import { FX } from './shading';

const C = (h: number) => new Color(h);
interface Pal {
  sun: Color;
  sunI: number;
  sky: Color;
  gnd: Color;
  hemiI: number;
  fog: Color;
  exp: number;
  dir: Vector3;
  zen: Color;
  hor: Color;
  env: number;
}
const NIGHT: Pal = { sun: C(0x7f9fe8), sunI: 1.5, sky: C(0x3a5a98), gnd: C(0x141c30), hemiI: 0.9, fog: C(0x0c1630), exp: 1.35, dir: new Vector3(0.5, 0.8, -0.4), zen: C(0x040a1c), hor: C(0x14233f), env: 0.4 };
const DUSK: Pal = { sun: C(0xff8a45), sunI: 3.2, sky: C(0xc88a70), gnd: C(0x4a3c34), hemiI: 0.8, fog: C(0xb8704f), exp: 1.1, dir: new Vector3(-0.9, 0.26, 0.45), zen: C(0x3a4a85), hor: C(0xff8a4d), env: 0.65 };
const DAY: Pal = { sun: C(0xfff1da), sunI: 4.2, sky: C(0xbfdcff), gnd: C(0x6b7e48), hemiI: 0.7, fog: C(0xa9cbe3), exp: 1.0, dir: new Vector3(-0.55, 0.78, 0.45), zen: C(0x2f62c8), hor: C(0xb9d2ea), env: 0.95 };
const BLOOD = { sun: C(0xff3a1c), zen: C(0x2a0305), hor: C(0x8a1410), fog: C(0x3a0a0a), sky: C(0x8a2a22) };

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
  /** blood moon 0..1 */
  blood = 0;
  bloodT = 0;
  /** storm (rain) 0..1 */
  storm = 0;
  stormT = 0;
  /** lightning flash 0..1 */
  flash = 0;
  camera: PerspectiveCamera | null = null;
  skyMat: ShaderMaterial;
  dome: Mesh;
  private envScene = new Scene();
  private pmrem: PMREMGenerator | null = null;
  private envRT: WebGLRenderTarget | null = null;
  private envKey = -99;
  private sunCol = new Color();
  private skyCol = new Color();
  private zen = new Color();
  private hor = new Color();
  private time = 0;

  constructor(private scene: Scene, private renderer: WebGLRenderer, private waterMat: ShaderMaterial) {
    this.sun = new DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 3;
    const cam = this.sun.shadow.camera;
    cam.left = -36;
    cam.right = 36;
    cam.top = 36;
    cam.bottom = -36;
    cam.near = 1;
    cam.far = 170;
    scene.add(this.sun, this.sun.target);
    this.hemi = new HemisphereLight(0xffffff, 0x445522, 1);
    scene.add(this.hemi);
    this.fog = new Fog(0xa4d0e8, 60, 190);
    scene.fog = this.fog;

    this.skyMat = createSkyMaterial();
    this.dome = createDome(this.skyMat, 320);
    scene.add(this.dome);
    this.envScene.add(createDome(this.skyMat, 50));
    if ((renderer as unknown as { capabilities?: unknown }).capabilities) {
      this.pmrem = new PMREMGenerator(renderer);
    }
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

  strike() {
    this.flash = 1;
  }

  /** Smoothly move toward target light level and apply. */
  update(dt: number, target: number, focus: Vector3) {
    this.time += dt;
    const rate = 0.1;
    const d = target - this.L;
    this.L += clamp(d, -dt * rate, dt * rate);
    this.blood += clamp(this.bloodT - this.blood, -dt * 0.15, dt * 0.15);
    this.storm += clamp(this.stormT - this.storm, -dt * 0.12, dt * 0.12);
    this.flash = Math.max(0, this.flash - dt * 2.6);
    if (this.camera) this.dome.position.copy(this.camera.position);
    this.skyMat.uniforms.uTime.value = this.time;
    this.apply(this.L, focus);
  }

  apply(L: number, focus: Vector3) {
    this.L = L;
    const b = this.blood;
    const st = this.storm;
    const nightish = 1 - smoothstep(0.2, 0.8, L);
    mix3(this.sunCol, NIGHT.sun, DUSK.sun, DAY.sun, L);
    if (b > 0) this.sunCol.lerp(BLOOD.sun, b * nightish * 0.8);
    this.sun.color.copy(this.sunCol);
    this.sun.intensity = mixN(NIGHT.sunI, DUSK.sunI, DAY.sunI, L) * (1 - st * 0.55) * (1 + b * 0.2);
    tmpV.set(
      mixN(NIGHT.dir.x, DUSK.dir.x, DAY.dir.x, L),
      mixN(NIGHT.dir.y, DUSK.dir.y, DAY.dir.y, L),
      mixN(NIGHT.dir.z, DUSK.dir.z, DAY.dir.z, L),
    ).normalize();
    this.sun.position.copy(focus).addScaledVector(tmpV, 80);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();

    mix3(this.hemi.color, NIGHT.sky, DUSK.sky, DAY.sky, L);
    mix3(this.hemi.groundColor, NIGHT.gnd, DUSK.gnd, DAY.gnd, L);
    if (b > 0) this.hemi.color.lerp(BLOOD.sky, b * nightish * 0.7);
    this.hemi.intensity = mixN(NIGHT.hemiI, DUSK.hemiI, DAY.hemiI, L) * (1 - st * 0.2) + this.flash * 5;

    mix3(this.zen, NIGHT.zen, DUSK.zen, DAY.zen, L);
    mix3(this.hor, NIGHT.hor, DUSK.hor, DAY.hor, L);
    mix3(this.skyCol, NIGHT.fog, DUSK.fog, DAY.fog, L);
    if (b > 0) {
      const k = b * nightish;
      this.zen.lerp(BLOOD.zen, k);
      this.hor.lerp(BLOOD.hor, k);
      this.skyCol.lerp(BLOOD.fog, k * 0.85);
    }
    if (st > 0) {
      // overcast: pull toward grey
      const g = (this.zen.r + this.zen.g + this.zen.b) / 3;
      this.zen.lerp(tmpC.setRGB(g * 0.9, g * 0.95, g), st * 0.7);
      const gh = (this.hor.r + this.hor.g + this.hor.b) / 3;
      this.hor.lerp(tmpC.setRGB(gh * 0.85, gh * 0.9, gh * 0.95), st * 0.7);
      const gf = (this.skyCol.r + this.skyCol.g + this.skyCol.b) / 3;
      this.skyCol.lerp(tmpC.setRGB(gf * 0.8, gf * 0.86, gf * 0.9), st * 0.6);
    }
    this.fog.color.copy(this.skyCol);
    this.fog.near = 60 - st * 28;
    this.fog.far = 190 - st * 80;
    this.scene.background = this.skyCol;
    this.renderer.toneMappingExposure = mixN(NIGHT.exp, DUSK.exp, DAY.exp, L) * (1 - st * 0.1);
    this.lamp = 1 - smoothstep(0.15, 0.7, L);
    FX.cloud.value = smoothstep(0.35, 0.9, L) * (0.45 + st * 0.5);
    FX.wet.value = st;

    const su = this.skyMat.uniforms;
    su.uSunDir.value.copy(tmpV);
    (su.uSunCol.value as Color).copy(this.sunCol);
    su.uSunI.value = L > 0.45 ? 35 : 4;
    su.uGlow.value = (L > 0.45 ? 1 : 0.35) * (1 - st * 0.8);
    (su.uZenith.value as Color).copy(this.zen);
    (su.uHorizon.value as Color).copy(this.hor);
    (su.uGround.value as Color).copy(this.skyCol).multiplyScalar(0.55);
    (su.uCloudCol.value as Color).copy(this.hor).lerp(tmpC.setRGB(1, 1, 1), 0.45 * smoothstep(0.3, 0.9, L)).multiplyScalar(0.55 + 0.45 * smoothstep(0.1, 0.8, L));
    su.uCloudAmt.value = 0.55 + st * 0.45;
    su.uStars.value = (1 - smoothstep(0.1, 0.45, L)) * (1 - st) * (1 - b * 0.6);
    su.uFlash.value = this.flash;

    // image based lighting from the sky (re-baked only when the sky changes noticeably)
    const key = L * 2 + b + st * 1.3 + this.flash * 3;
    if (this.pmrem && Math.abs(key - this.envKey) > 0.06) {
      this.envKey = key;
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 200);
      this.envRT?.dispose();
      this.envRT = rt;
      this.scene.environment = rt.texture;
    }
    this.scene.environmentIntensity = mixN(NIGHT.env, DUSK.env, DAY.env, L) * (1 - st * 0.3);

    const u = this.waterMat.uniforms;
    u.uSunDir.value.copy(tmpV);
    (u.uSunColor.value as Color).copy(this.sunCol).multiplyScalar(0.6 + L * 0.5);
    const dim = 0.18 + 0.82 * smoothstep(0.1, 0.9, L);
    (u.uDeep.value as Color).setRGB(0.02, 0.13, 0.17).multiplyScalar(dim);
    (u.uShallow.value as Color).setRGB(0.1, 0.38, 0.38).multiplyScalar(dim);
    (u.uSky.value as Color).copy(this.zen).lerp(this.hor, 0.5);
    (u.uHorizon.value as Color).copy(this.hor);
    (u.uZenith.value as Color).copy(this.zen);
    (u.uFogColor.value as Color).copy(this.skyCol);
    u.uFogNear.value = this.fog.near;
    u.uFogFar.value = this.fog.far;
    u.uStorm.value = st;
  }
}
