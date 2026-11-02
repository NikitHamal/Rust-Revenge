import { Material, MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from 'three';

/**
 * Shared shader uniforms + onBeforeCompile patches that add world-space procedural
 * surface detail (grime, micro-bump, roughness variation), wind sway and cloud shadows
 * to ordinary MeshStandardMaterials. No UVs required, so it works on merged/instanced primitives.
 */
export const FX = {
  time: { value: 0 },
  /** 0..1 strength of drifting cloud shadows (0 at night) */
  cloud: { value: 0.35 },
  wind: { value: 1 },
  /** wetness 0..1 (rain) – darkens + lowers roughness of surfaces */
  wet: { value: 0 },
};

const NOISE = /* glsl */ `
float rr_h(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float rr_n(vec3 x){
  vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(rr_h(i),rr_h(i+vec3(1,0,0)),f.x), mix(rr_h(i+vec3(0,1,0)),rr_h(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(rr_h(i+vec3(0,0,1)),rr_h(i+vec3(1,0,1)),f.x), mix(rr_h(i+vec3(0,1,1)),rr_h(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float rr_fbm(vec3 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*rr_n(p); p=p*2.03+17.; a*=.5;} return s; }
float rr_cloud(vec2 p){ float a=.5,s=0.; for(int i=0;i<3;i++){ s+=a*rr_n(vec3(p,3.7)); p=p*2.1+7.; a*=.5;} return s; }
vec3 rr_pn(vec3 sp, vec3 sn, vec2 dH, float fd){
  vec3 sx = normalize(dFdx(sp)); vec3 sy = normalize(dFdy(sp));
  vec3 r1 = cross(sy, sn); vec3 r2 = cross(sn, sx);
  float det = dot(sx, r1) * fd;
  vec3 g = sign(det) * (dH.x * r1 + dH.y * r2);
  return normalize(abs(det) * sn - g);
}
`;

export interface SurfaceOpts {
  /** noise frequency in world units (higher = finer) */
  scale?: number;
  /** 0..1 how dark/dirty the noise makes the albedo */
  grime?: number;
  /** micro-bump strength */
  bump?: number;
  /** roughness variation */
  rough?: number;
  /** drifting cloud shadows */
  cloud?: boolean;
  /** extra high-frequency grain mix 0..1 */
  grain?: number;
  /** slight per-surface hue breakup */
  hue?: number;
}

const patched = new WeakSet<Material>();

export function patchSurface<T extends MeshStandardMaterial>(mat: T, o: SurfaceOpts = {}): T {
  if (patched.has(mat)) return mat;
  patched.add(mat);
  const scale = o.scale ?? 3;
  const grime = o.grime ?? 0.3;
  const bump = o.bump ?? 0.4;
  const rough = o.rough ?? 0.25;
  const grain = o.grain ?? 0.35;
  const hue = o.hue ?? 0.06;
  const cloud = o.cloud ? 1 : 0;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, r) => {
    prev?.call(mat, shader, r);
    shader.uniforms.uTime = FX.time;
    shader.uniforms.uCloud = FX.cloud;
    shader.uniforms.uWet = FX.wet;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 rrw = vec4(transformed, 1.0);
        vec3 rrn = objectNormal;
        #ifdef USE_INSTANCING
          rrw = instanceMatrix * rrw;
          rrn = mat3(instanceMatrix) * rrn;
        #endif
        vWP = (modelMatrix * rrw).xyz;
        vWN = normalize(mat3(modelMatrix) * rrn);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime; uniform float uCloud; uniform float uWet;
        varying vec3 vWP; varying vec3 vWN;
        ${NOISE}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float rrN = rr_fbm(vWP * ${scale.toFixed(3)});
        float rrG = rr_n(vWP * ${(scale * 7).toFixed(3)});
        float rrV = mix(rrN, rrG, ${grain.toFixed(3)});
        diffuseColor.rgb *= mix(${(1 - grime).toFixed(3)}, 1.12, rrV);
        diffuseColor.rgb *= 1.0 + (rr_n(vWP*${(scale * 0.35).toFixed(3)} + 11.0) - 0.5) * ${hue.toFixed(3)} * vec3(1.6, 0.8, -1.2);
        float rrDist = length(vViewPosition);
        ${
          cloud
            ? `float rrCl = rr_cloud(vWP.xz * 0.028 + vec2(uTime * 0.05, uTime * 0.021));
        diffuseColor.rgb *= 1.0 - uCloud * smoothstep(0.42, 0.68, rrCl) * 0.55;`
            : ''
        }
        diffuseColor.rgb *= 1.0 - uWet * 0.38;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (rrV - 0.5) * ${rough.toFixed(3)} - uWet * 0.35 * (1.0 - metalness), 0.04, 1.0);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          float rrFade = 1.0 - smoothstep(22.0, 80.0, rrDist);
          float rrHgt = rr_fbm(vWP * ${(scale * 2.2).toFixed(3)}) * 0.7 + rr_n(vWP * ${(scale * 11).toFixed(3)}) * 0.3;
          vec2 rrD = vec2(dFdx(rrHgt), dFdy(rrHgt)) * ${(bump * 0.9).toFixed(3)} * rrFade;
          normal = rr_pn(-vViewPosition, normal, rrD, faceDirection);
        }`,
      );
  };
  mat.customProgramCacheKey = () => `rrs|${scale}|${grime}|${bump}|${rough}|${grain}|${hue}|${cloud}`;
  mat.needsUpdate = true;
  return mat;
}

/** Wind sway for foliage / grass: amplitude grows with `heightAttr` (uv.y when 'uv', else local y). */
export function patchWind<T extends MeshStandardMaterial>(mat: T, amp = 0.12, speed = 1.6, mode: 'uv' | 'y' = 'y', heightScale = 0.2): T {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, r) => {
    prev?.call(mat, shader, r);
    shader.uniforms.uWTime = FX.time;
    shader.uniforms.uWind = FX.wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWTime; uniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float rrH = ${mode === 'uv' ? 'uv.y' : `max(transformed.y, 0.0) * ${heightScale.toFixed(3)}`};
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
          #endif
          float ph = uWTime * ${speed.toFixed(3)} + ip.x * 0.31 + ip.z * 0.23;
          float gust = 0.6 + 0.4 * sin(uWTime * 0.37 + ip.x * 0.05);
          transformed.x += (sin(ph) + 0.4 * sin(ph * 2.3 + 1.7)) * ${amp.toFixed(3)} * rrH * rrH * uWind * gust;
          transformed.z += (cos(ph * 0.83) * 0.6) * ${amp.toFixed(3)} * rrH * rrH * uWind * gust;
        }`,
      );
  };
  const k = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${k ? k() : ''}|wind|${amp}|${speed}|${mode}|${heightScale}`;
  mat.needsUpdate = true;
  return mat;
}
