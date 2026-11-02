import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';

/** Procedural atmosphere dome: gradient sky, sun/moon disc + glow, drifting clouds, stars. Also used as IBL source. */
export function createSkyMaterial() {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uSunCol: { value: new Color(1, 0.9, 0.7) },
      uSunI: { value: 30 },
      uGlow: { value: 1 },
      uZenith: { value: new Color(0.18, 0.38, 0.8) },
      uHorizon: { value: new Color(0.7, 0.82, 0.95) },
      uGround: { value: new Color(0.1, 0.12, 0.08) },
      uCloudCol: { value: new Color(1, 1, 1) },
      uCloudAmt: { value: 0.6 },
      uStars: { value: 0 },
      uFlash: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunI; uniform float uGlow;
      uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uCloudCol; uniform float uCloudAmt;
      uniform float uStars; uniform float uFlash;
      varying vec3 vDir;
      float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*n2(p); p=p*2.02+5.1; a*=.5;} return s; }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uZenith, pow(clamp(h,0.0,1.0), 0.5));
        col = mix(col, uGround, smoothstep(0.0, -0.2, h));
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunCol * (pow(sd, 1500.0) * uSunI + pow(sd, 14.0) * 0.22 * uGlow + pow(sd, 4.0) * 0.07 * uGlow);
        if (h > 0.0) {
          vec2 p = d.xz / (h + 0.18) * 1.2 + vec2(uTime * 0.012, uTime * 0.004);
          float c = fbm(p);
          float m = smoothstep(0.48, 0.78, c) * uCloudAmt * smoothstep(0.0, 0.2, h);
          float lit = 0.7 + 0.3 * smoothstep(0.45, 0.75, fbm(p + uSunDir.xz * 0.12));
          vec3 cc = uCloudCol * lit + uSunCol * pow(sd, 6.0) * 0.25;
          col = mix(col, cc, m);
          vec3 sp = d * 90.0;
          vec3 id = floor(sp);
          float r = fract(sin(dot(id, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float star = step(0.9965, r) * smoothstep(0.05, 0.3, h) * (0.5 + 0.5 * fract(r * 91.7));
          col += vec3(0.85, 0.9, 1.0) * star * uStars * (1.0 - m);
        }
        col += vec3(0.8, 0.85, 1.0) * uFlash * (0.4 + 0.6 * smoothstep(0.0, 0.6, h));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function createDome(mat: ShaderMaterial, radius: number) {
  const m = new Mesh(new SphereGeometry(radius, 32, 20), mat);
  m.frustumCulled = false;
  m.renderOrder = -1000;
  return m;
}
