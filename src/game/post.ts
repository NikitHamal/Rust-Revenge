import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Vector2 } from 'three';

/** Final cinematic grade: subtle chromatic aberration, vignette, filmic contrast/saturation, tint (blood moon), grain, hurt flash. */
export function createGradePass() {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uRes: { value: new Vector2(1280, 720) },
      uVig: { value: 0.42 },
      uSat: { value: 1.12 },
      uContrast: { value: 1.08 },
      uTint: { value: [1, 1, 1] },
      uHurt: { value: 0 },
      uGrain: { value: 0.035 },
      uStorm: { value: 0 },
    },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uVig; uniform float uSat;
      uniform float uContrast; uniform vec3 uTint; uniform float uHurt; uniform float uGrain; uniform float uStorm;
      varying vec2 vUv;
      float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p,p+19.19); return fract(p.x*p.y); }
      void main(){
        vec2 c = vUv - 0.5;
        float r2 = dot(c,c);
        vec2 off = c * (0.0016 + r2 * 0.006);
        vec3 col;
        col.r = texture2D(tDiffuse, vUv + off).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - off).b;
        float l = dot(col, vec3(0.299,0.587,0.114));
        col = mix(vec3(l), col, uSat * (1.0 - uStorm * 0.25));
        col = (col - 0.5) * uContrast + 0.5;
        // gentle S-curve + shadow teal / highlight warm split toning
        col = mix(col, smoothstep(0.0, 1.0, col), 0.35);
        float lum = dot(col, vec3(0.299,0.587,0.114));
        col += vec3(-0.012, 0.004, 0.018) * (1.0 - lum) + vec3(0.02, 0.008, -0.012) * lum;
        col *= uTint;
        float vig = smoothstep(0.18, 0.78, r2 * 1.9);
        col *= 1.0 - vig * uVig;
        col = mix(col, vec3(0.75, 0.04, 0.03), uHurt * vig * 0.8);
        col += (hash(vUv * uRes + fract(uTime) * 91.7) - 0.5) * uGrain;
        gl_FragColor = vec4(max(col, 0.0), 1.0);
      }`,
  });
  return pass;
}
