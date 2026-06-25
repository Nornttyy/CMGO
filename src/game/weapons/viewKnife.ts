import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// 第一人称军刀：加载下载来的 Kabar 卡巴军刀模型(CC0)，挂在相机上、显示在视野右下角。
export function createKnife(): THREE.Group {
  const g = new THREE.Group();
  const inner = new THREE.Group(); // 模型放里层，方便单独调朝向/缩放
  g.add(inner);

  new GLTFLoader().load(import.meta.env.BASE_URL + 'models/weapons/kabar.glb', (gltf) => {
    const model = gltf.scene;
    // 视野模型：材质不被墙挡 + 永远画在最上层
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.renderOrder = 999;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mt of mats) { (mt as THREE.Material).depthTest = false; (m as THREE.Mesh).castShadow = false; }
      }
    });
    // 把模型中心移到原点，缩放到大约 0.5 长
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    model.scale.setScalar(0.5 / Math.max(size.x, size.y, size.z));
    inner.add(model);
  });

  // 摆到视野右下角、像握着的角度
  inner.rotation.set(0, 0, 0);
  g.position.set(0.36, -0.3, -0.58);
  g.rotation.set(0.12, -0.6, 0.32);
  return g;
}
