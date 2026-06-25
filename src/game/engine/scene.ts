import * as THREE from 'three';

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  return renderer;
}

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  const HORIZON = 0xe7d9bb, ZENITH = 0x86b2d8; // 地平沙色 / 天顶暖蓝
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.Fog(HORIZON, 55, 320); // 沙漠远处的热浪/沙尘霾

  // 天空穹顶：地平线沙色 → 天顶暖蓝 的渐变（顶点色）
  const skyGeo = new THREE.SphereGeometry(500, 24, 16);
  const sp = skyGeo.attributes.position;
  const cols = new Float32Array(sp.count * 3);
  const hor = new THREE.Color(HORIZON), zen = new THREE.Color(ZENITH);
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i) / 500;
    const t = Math.max(0, Math.min(1, (y + 0.04) / 0.5));
    const c = hor.clone().lerp(zen, t);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));

  const sun = new THREE.DirectionalLight(0xfff0d6, 2.35); // 暖阳
  sun.position.set(8, 55, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 100;
  const s = 30;
  sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
  sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
  scene.add(sun);

  scene.add(new THREE.HemisphereLight(0xdfe6e0, 0xc2a06a, 1.05)); // 暖沙地反光
  return scene;
}

export function onResize(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
