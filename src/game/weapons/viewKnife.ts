import * as THREE from 'three';

// 第一人称军刀：挂在相机上，显示在视野右下角（挤出造型的刀身 + 缠绕握把 + 护手 + 尾盖）。
export function createKnife(): THREE.Group {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8ced6, metalness: 0.55, roughness: 0.3, depthTest: false });
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.5, roughness: 0.5, depthTest: false });
  const gripM = new THREE.MeshStandardMaterial({ color: 0x352a1d, roughness: 0.85, depthTest: false }); // 棕黑握把
  const add = (m: THREE.Mesh, y: number): THREE.Mesh => { m.position.y = y; m.renderOrder = 999; g.add(m); return m; };

  // 刀身：挑尖造型(clip point)挤出薄厚度
  const sh = new THREE.Shape();
  sh.moveTo(-0.04, 0);
  sh.lineTo(0.035, 0);
  sh.lineTo(0.035, 0.28);
  sh.quadraticCurveTo(0.03, 0.40, 0.004, 0.43); // 刃口弧到刀尖
  sh.lineTo(-0.04, 0.33);                         // 假刃到尖
  sh.lineTo(-0.04, 0);
  const bladeGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: false });
  bladeGeo.translate(0, 0, -0.008);
  add(new THREE.Mesh(bladeGeo, steel), 0.03);

  add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.026, 0.06), metal), 0.018);   // 护手
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.17, 12), gripM), -0.085); // 握把(锥形)
  for (let i = 0; i < 4; i++) {                                                   // 缠绕环
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.029, 0.005, 6, 14), gripM);
    ring.rotation.x = Math.PI / 2; add(ring, -0.03 - i * 0.04);
  }
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.03, 12), metal), -0.185); // 尾盖

  g.scale.setScalar(0.85);
  g.position.set(0.34, -0.36, -0.62); // 视野右下角
  g.rotation.set(0.7, -0.4, 0.5);     // 像握着的角度
  return g;
}
