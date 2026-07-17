import * as THREE from 'three';

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06; // 晴天：明亮通透
  return renderer;
}

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  // 大晴天：湛蓝天空，整张地图内几乎无雾（雾只在地图外把沙地边缘融进地平线）
  const HORIZON = 0xcfe6f5, ZENITH = 0x3d87d9; // 地平线浅蓝白 / 天顶湛蓝
  const HAZE = 0xd4e4ee; // 远处空气色(跟地平线接近，不发白挡视野)
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.Fog(HAZE, 130, 520); // 活动范围(~100m)内清晰，只淡化极远处

  // 天空穹顶：地平线浅蓝白 → 天顶湛蓝 的渐变（顶点色）
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

  const sun = new THREE.DirectionalLight(0xfff1d4, 2.6); // 正午烈日：亮、偏白的暖光
  sun.position.set(8, 55, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 100;
  sun.shadow.radius = 2; // 晴天影子更利落
  const s = 30;
  sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
  sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
  scene.add(sun);

  // 晴天环境光：上半是天空蓝、下半是沙地反弹的暖光
  scene.add(new THREE.HemisphereLight(0xbdd8f2, 0xcfa878, 0.95));
  return scene;
}

export function onResize(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
