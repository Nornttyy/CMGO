import * as THREE from 'three';

// 第一人称军刀：挂在相机上，显示在视野右下角，像握着一把刀。
export function createKnife(): THREE.Group {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xd2d7dd, metalness: 0.6, roughness: 0.35, depthTest: false });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.75, depthTest: false });
  const mk = (geo: THREE.BufferGeometry, mtl: THREE.Material, y: number): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mtl); m.position.y = y; m.renderOrder = 999; g.add(m); return m;
  };
  mk(new THREE.BoxGeometry(0.05, 0.17, 0.05), dark, 0);          // 刀柄
  mk(new THREE.BoxGeometry(0.12, 0.022, 0.055), dark, 0.095);    // 护手
  mk(new THREE.BoxGeometry(0.032, 0.34, 0.013), steel, 0.27);    // 刀身
  const tip = mk(new THREE.ConeGeometry(0.02, 0.09, 4), steel, 0.48); // 刀尖
  tip.rotation.y = Math.PI / 4;

  g.scale.setScalar(0.8);
  g.position.set(0.36, -0.4, -0.62); // 视野右下角
  g.rotation.set(0.7, -0.35, 0.5);   // 像握着的角度
  return g;
}
