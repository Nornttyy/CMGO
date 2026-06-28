import * as THREE from 'three';

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96; // 风沙天稍微压暗一点
  return renderer;
}

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  // 风沙弥漫：天空是一片黄褐沙尘霾(低对比)，浓雾拉近能见度
  const HORIZON = 0xcaad7a, ZENITH = 0xc6b78a; // 地平沙黄 / 天顶偏黄(不再是蓝天)
  const HAZE = 0xcdb281; // 沙尘霾颜色(雾)
  scene.background = new THREE.Color(HAZE);
  scene.fog = new THREE.Fog(HAZE, 18, 98); // 风沙：能见度明显降低、远处糊成黄沙

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

  const sun = new THREE.DirectionalLight(0xffce8e, 1.75); // 阳光被沙尘滤成暖橙、变弱
  sun.position.set(8, 55, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 100;
  sun.shadow.radius = 3; // 沙尘里影子更柔
  const s = 30;
  sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
  sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
  scene.add(sun);

  // 沙尘里到处是散射的黄光 → 环境光更强、更黄
  scene.add(new THREE.HemisphereLight(0xe0cd98, 0xb39468, 1.3));
  return scene;
}

export function onResize(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
