import {
  BufferAttribute,
  Color,
  DataTexture,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  Vector4,
} from 'three';
import { WORLD, clamp, lerp, riverDist, smoothstep, terrainHeight } from './config';
import { patchSurface } from './shading';

const SX = WORLD.maxX - WORLD.minX;
const SZ = WORLD.maxZ - WORLD.minZ;

export function createTerrain(segScale = 1) {
  const sx = Math.round(400 * segScale);
  const sz = Math.round(320 * segScale);
  const geo = new PlaneGeometry(SX, SZ, sx, sz);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const d = riverDist(x, z);
    const n1 = Math.sin(x * 0.31 + Math.cos(z * 0.23) * 2) * Math.cos(z * 0.37 - x * 0.05) * 0.5 + 0.5;
    const n2 = Math.sin(x * 1.3) * Math.sin(z * 1.1) * 0.5 + 0.5;
    const grassT = clamp(n1 * 0.8 + (Math.sin(x * 0.047 + 2.1) * Math.sin(z * 0.053) * 0.5 + 0.5) * 0.35, 0, 1);
    // lush grass <-> dry straw
    c.setRGB(lerp(0.11, 0.2, grassT) * (0.9 + n2 * 0.2), lerp(0.24, 0.36, grassT) * (0.9 + n2 * 0.2), lerp(0.05, 0.1, grassT));
    const dry = smoothstep(0.55, 0.9, Math.sin(x * 0.083 - 1.1) * Math.cos(z * 0.071 + 0.7) * 0.5 + 0.5);
    c.r = lerp(c.r, 0.36, dry * 0.5);
    c.g = lerp(c.g, 0.34, dry * 0.5);
    c.b = lerp(c.b, 0.12, dry * 0.5);
    // dirt / loam patches
    const dirt = smoothstep(0.7, 0.9, Math.sin(x * 0.12 + 1.7) * Math.cos(z * 0.1 - 0.4) * 0.5 + 0.5);
    c.r = lerp(c.r, 0.26, dirt * 0.8);
    c.g = lerp(c.g, 0.19, dirt * 0.8);
    c.b = lerp(c.b, 0.11, dirt * 0.8);
    // sand / wet mud near water
    const sand = 1 - smoothstep(0.1, 0.7, h);
    const sandy = clamp(sand + (1 - smoothstep(1, 5.5, d)) * 0.4, 0, 1);
    c.r = lerp(c.r, 0.52 + n2 * 0.05, sandy);
    c.g = lerp(c.g, 0.47 + n2 * 0.05, sandy);
    c.b = lerp(c.b, 0.3, sandy);
    const wet = 1 - smoothstep(0.0, 0.5, h);
    c.multiplyScalar(1 - wet * 0.38);
    // river bed
    const bed = 1 - smoothstep(-0.9, -0.1, h);
    c.r = lerp(c.r, 0.17, bed);
    c.g = lerp(c.g, 0.16, bed);
    c.b = lerp(c.b, 0.11, bed);
    // rocky hills
    const rock = smoothstep(2.0, 5.5, h);
    c.r = lerp(c.r, 0.3, rock);
    c.g = lerp(c.g, 0.285, rock);
    c.b = lerp(c.b, 0.26, rock);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = patchSurface(new MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 }), { scale: 0.85, grime: 0.5, bump: 1.4, grain: 0.55, rough: 0.2, hue: 0.05, cloud: true });
  const terrain = new Mesh(geo, mat);
  terrain.receiveShadow = true;

  /* depth texture used by the water shader (foam + transparency) */
  const TW = 320;
  const TH = 256;
  const data = new Uint8Array(TW * TH * 4);
  for (let j = 0; j < TH; j++) {
    for (let i = 0; i < TW; i++) {
      const x = WORLD.minX + (i / (TW - 1)) * SX;
      const z = WORLD.minZ + (j / (TH - 1)) * SZ;
      const h = terrainHeight(x, z);
      const depth = clamp(-h / 1.5, 0, 1);
      const k = (j * TW + i) * 4;
      data[k] = Math.round(depth * 255);
      data[k + 3] = 255;
    }
  }
  const depthTex = new DataTexture(data, TW, TH, RGBAFormat, UnsignedByteType);
  depthTex.magFilter = LinearFilter;
  depthTex.minFilter = LinearFilter;
  depthTex.needsUpdate = true;

  const waterMat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uDepth: { value: depthTex },
      uBounds: { value: new Vector4(WORLD.minX, WORLD.minZ, SX, SZ) },
      uSunDir: { value: new Vector3(0.5, 0.8, 0.4).normalize() },
      uSunColor: { value: new Color(1, 0.95, 0.8) },
      uDeep: { value: new Color(0.03, 0.2, 0.26) },
      uShallow: { value: new Color(0.12, 0.5, 0.52) },
      uSky: { value: new Color(0.55, 0.75, 0.9) },
      uHorizon: { value: new Color(0.7, 0.82, 0.95) },
      uZenith: { value: new Color(0.18, 0.38, 0.8) },
      uStorm: { value: 0 },
      uFogColor: { value: new Color(0.6, 0.8, 0.9) },
      uFogNear: { value: 70 },
      uFogFar: { value: 190 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform sampler2D uDepth; uniform vec4 uBounds;
      uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uDeep; uniform vec3 uShallow;
      uniform vec3 uSky; uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uFogColor;
      uniform float uFogNear; uniform float uFogFar; uniform float uStorm;
      varying vec3 vWorld;
      float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*n2(p); p=p*2.03+3.1; a*=.5;} return s; }
      vec3 skyCol(vec3 R){
        float h = clamp(R.y, 0.0, 1.0);
        vec3 c = mix(uHorizon, uZenith, pow(h, 0.5));
        float sd = max(dot(R, uSunDir), 0.0);
        c += uSunColor * (pow(sd, 18.0) * 0.35 + pow(sd, 5.0) * 0.08);
        float cl = smoothstep(0.5, 0.8, fbm(R.xz / (R.y + 0.25) * 1.4 + uTime * 0.01));
        c = mix(c, uHorizon * 1.15 + 0.08, cl * 0.55 * smoothstep(0.0, 0.3, R.y));
        return c;
      }
      void main(){
        vec2 uv = (vWorld.xz - uBounds.xy) / uBounds.zw;
        float depth = texture2D(uDepth, uv).r;
        vec2 p = vWorld.xz;
        float t = uTime;
        float amp = 1.0 + uStorm * 0.9;
        vec2 d1 = vec2(0.8,0.6); vec2 d2 = vec2(-0.5,0.85); vec2 d3 = vec2(0.95,-0.3); vec2 d4 = vec2(-0.2,-0.97);
        vec2 g = vec2(0.0);
        g += d1 * cos(dot(p,d1)*0.9 + t*1.1) * 0.9 * 0.05;
        g += d2 * cos(dot(p,d2)*1.7 + t*1.6) * 1.7 * 0.03;
        g += d3 * cos(dot(p,d3)*3.1 + t*2.3) * 3.1 * 0.016;
        g += d4 * cos(dot(p,d4)*5.3 + t*3.1) * 5.3 * 0.008;
        // fine ripples from noise
        vec2 q = p * 2.2;
        float e = 0.08;
        float r0 = fbm(q + vec2(t*0.35, t*0.2));
        g += vec2(fbm(q + vec2(e,0.) + vec2(t*0.35, t*0.2)) - r0, fbm(q + vec2(0.,e) + vec2(t*0.35, t*0.2)) - r0) * (0.55 * amp);
        // rain rings
        if (uStorm > 0.01) {
          vec2 rc = p * 1.6; vec2 ri = floor(rc); vec2 rf = fract(rc) - 0.5;
          float ph = fract(t * 0.9 + h21(ri) * 7.0);
          float rad = ph * 0.5; float ring = smoothstep(0.06, 0.0, abs(length(rf) - rad)) * (1.0 - ph);
          g += normalize(rf + 0.001) * ring * 0.35 * uStorm;
        }
        vec3 n = normalize(vec3(-g.x * amp, 1.0, -g.y * amp));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n,V),0.0), 5.0);
        vec3 R = reflect(-V, n);
        R.y = abs(R.y);
        vec3 refl = skyCol(R);
        float shallowK = smoothstep(0.0, 0.7, depth);
        vec3 col = mix(uShallow, uDeep, shallowK);
        // caustics in shallows
        float c1 = n2(p * 3.0 + vec2(t * 0.4, -t * 0.3));
        float c2 = n2(p * 3.4 - vec2(t * 0.3, t * 0.37));
        float caus = pow(1.0 - abs(c1 - c2), 6.0) * (1.0 - shallowK) * 0.5;
        col += uSunColor * caus * 0.35;
        col = mix(col, refl, clamp(fres * 0.9 + 0.12, 0.0, 1.0));
        vec3 Rs = reflect(-uSunDir, n);
        float spec = pow(max(dot(Rs,V),0.0), 220.0);
        col += uSunColor * spec * 3.0;
        float sp1 = n2(p * 6.0 + t * 0.7) * n2(p * 5.0 - t * 0.5);
        float sparkle = smoothstep(0.62, 0.8, sp1) * pow(max(dot(reflect(-uSunDir, n), V), 0.0), 6.0);
        col += uSunColor * sparkle * 1.2 * (1.0 - uStorm);
        // shoreline foam
        float edge = 1.0 - smoothstep(0.0, 0.2, depth);
        float fn = fbm(p * 2.6 + vec2(t * 0.15, -t * 0.1));
        float foam = edge * smoothstep(0.32, 0.7, fn + edge * 0.35);
        float line = smoothstep(0.05, 0.0, abs(depth - 0.24 - sin(t*0.9 + p.x*0.4)*0.05)) * 0.3 * fn;
        col = mix(col, vec3(0.95, 0.98, 1.0) * (0.35 + 0.65 * length(uSunColor) * 0.6 + 0.2), clamp(foam*0.9 + line, 0.0, 1.0));
        float alpha = mix(0.35, 0.92, smoothstep(0.0, 0.5, depth));
        alpha = max(alpha, max(foam * 0.95, fres * 0.8));
        float dist = length(cameraPosition - vWorld);
        col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, dist));
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const wGeo = new PlaneGeometry(SX, SZ, 1, 1);
  wGeo.rotateX(-Math.PI / 2);
  const water = new Mesh(wGeo, waterMat);
  water.position.y = 0;
  water.renderOrder = 2;

  return { terrain, water, waterMat };
}

/** Pre-render the world into a canvas for the minimap background. */
export function drawMinimapBase(canvas: HTMLCanvasElement) {
  const w = canvas.width;
  const h = canvas.height;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = WORLD.minX + (i / w) * SX;
      const z = WORLD.minZ + (j / h) * SZ;
      const ht = terrainHeight(x, z);
      const k = (j * w + i) * 4;
      let r: number, gg: number, b: number;
      if (ht < -0.06) {
        const d = clamp(-ht / 1.5, 0, 1);
        r = lerp(60, 15, d);
        gg = lerp(150, 70, d);
        b = lerp(170, 100, d);
      } else if (ht < 0.4) {
        r = 190;
        gg = 170;
        b = 110;
      } else if (ht > 2.5) {
        r = 100;
        gg = 96;
        b = 88;
      } else {
        r = 60;
        gg = 110 + ht * 10;
        b = 50;
      }
      img.data[k] = r;
      img.data[k + 1] = gg;
      img.data[k + 2] = b;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}
