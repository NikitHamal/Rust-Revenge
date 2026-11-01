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

const SX = WORLD.maxX - WORLD.minX;
const SZ = WORLD.maxZ - WORLD.minZ;

export function createTerrain(segScale = 1) {
  const sx = Math.round(240 * segScale);
  const sz = Math.round(192 * segScale);
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
    // grass
    c.setRGB(lerp(0.17, 0.3, n1) * (0.92 + n2 * 0.16), lerp(0.36, 0.52, n1) * (0.92 + n2 * 0.16), lerp(0.1, 0.18, n1));
    // dirt patches
    const dirt = smoothstep(0.72, 0.9, Math.sin(x * 0.12 + 1.7) * Math.cos(z * 0.1 - 0.4) * 0.5 + 0.5);
    c.r = lerp(c.r, 0.36, dirt * 0.7);
    c.g = lerp(c.g, 0.27, dirt * 0.7);
    c.b = lerp(c.b, 0.15, dirt * 0.7);
    // sand near water
    const sand = 1 - smoothstep(0.1, 0.65, h) ;
    const sandy = clamp(sand + (1 - smoothstep(1, 5.5, d)) * 0.45, 0, 1);
    c.r = lerp(c.r, 0.74 + n2 * 0.05, sandy);
    c.g = lerp(c.g, 0.66 + n2 * 0.04, sandy);
    c.b = lerp(c.b, 0.42, sandy);
    // river bed
    const bed = 1 - smoothstep(-0.9, -0.1, h);
    c.r = lerp(c.r, 0.2, bed);
    c.g = lerp(c.g, 0.2, bed);
    c.b = lerp(c.b, 0.15, bed);
    // rocky hills
    const rock = smoothstep(2.0, 5.5, h);
    c.r = lerp(c.r, 0.4, rock);
    c.g = lerp(c.g, 0.38, rock);
    c.b = lerp(c.b, 0.34, rock);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
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
      uniform vec3 uSky; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
      varying vec3 vWorld;
      void main(){
        vec2 uv = (vWorld.xz - uBounds.xy) / uBounds.zw;
        float depth = texture2D(uDepth, uv).r;
        vec2 p = vWorld.xz;
        float t = uTime;
        vec2 d1 = vec2(0.8,0.6); vec2 d2 = vec2(-0.5,0.85); vec2 d3 = vec2(0.95,-0.3); vec2 d4 = vec2(-0.2,-0.97);
        vec2 g = vec2(0.0);
        g += d1 * cos(dot(p,d1)*0.9 + t*1.1) * 0.9 * 0.05;
        g += d2 * cos(dot(p,d2)*1.7 + t*1.6) * 1.7 * 0.03;
        g += d3 * cos(dot(p,d3)*3.1 + t*2.3) * 3.1 * 0.016;
        g += d4 * cos(dot(p,d4)*5.3 + t*3.1) * 5.3 * 0.008;
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n,V),0.0), 4.0);
        vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 0.75, depth));
        col = mix(col, uSky, fres * 0.6);
        vec3 R = reflect(-uSunDir, n);
        float spec = pow(max(dot(R,V),0.0), 120.0);
        col += uSunColor * spec * 1.6;
        float sparkle = smoothstep(0.985, 1.0, sin(p.x*7.0 + t*2.0) * sin(p.y*6.0 - t*1.7));
        col += uSunColor * sparkle * 0.25;
        float edge = 1.0 - smoothstep(0.0, 0.17, depth);
        float fn = sin(p.x*3.0 + t*0.8) * sin(p.y*3.3 - t*0.6) * 0.5 + 0.5;
        float foam = edge * (0.45 + 0.55 * fn);
        float line = smoothstep(0.035, 0.0, abs(depth - 0.2 - sin(t*0.9 + p.x*0.4)*0.04)) * 0.35;
        col = mix(col, vec3(1.0), clamp(foam*0.85 + line, 0.0, 1.0));
        float alpha = mix(0.4, 0.8, smoothstep(0.0, 0.55, depth));
        alpha = max(alpha, foam * 0.9);
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
