import * as THREE from 'three';

export type Team = 'red' | 'blue';

const TEAM_COLOR: Record<Team, number> = { red: 0xff5630, blue: 0x36c5f0 };

// 一个可爱的蛋蛋特工：蛋身 + 豆豆眼 + 小帽子 + 小枪。
// 菜单背景小战斗用它；以后做真正的特工/机器人也复用它。
export function createEgg(team: Team): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Color(TEAM_COLOR[team]);

  // 蛋身（球压成蛋形）
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 24, 24),
    new THREE.MeshStandardMaterial({ color: base, roughness: 0.55, metalness: 0.05 }),
  );
  body.scale.set(1, 1.3, 1);
  body.position.y = 0.65;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // 小帽子（深一点的同色半球）
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
    new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.55), roughness: 0.5 }),
  );
  cap.position.y = 0.95;
  cap.castShadow = true;
  g.add(cap);

  // 豆豆眼（两颗黑点，朝 +Z 前方）
  const eyeGeo = new THREE.SphereGeometry(0.085, 12, 12);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x161a24, roughness: 0.35 });
  for (const dx of [-0.17, 0.17]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(dx, 0.78, 0.45);
    g.add(eye);
  }

  // 小枪（前面一个深色小盒子）
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.5 }),
  );
  gun.position.set(0.26, 0.5, 0.4);
  gun.castShadow = true;
  g.add(gun);

  return g;
}

// 枪口在角色本地坐标的位置（发射弹道用）
export const GUN_MUZZLE = new THREE.Vector3(0.26, 0.5, 0.72);
