export * from 'three-real';
export class WebGLRenderer {
  domElement: any = { style: {}, addEventListener() {}, removeEventListener() {}, remove() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) };
  toneMapping = 0; toneMappingExposure = 1;
  shadowMap: any = { enabled: false, type: 0 };
  setPixelRatio() {} setSize() {} render() {} setAnimationLoop() {} dispose() {} getPixelRatio() { return 1; }
}
