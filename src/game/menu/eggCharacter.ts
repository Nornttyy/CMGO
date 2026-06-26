import * as THREE from 'three';

export type Team = 'red' | 'blue';

const TEAM_COLOR: Record<Team, number> = { red: 0xff5630, blue: 0x36c5f0 };
const FLESH = 0xf2c4a0;       // 肉色蛋身（两队一样）
const FLESH_DARK = 0xb98a66;  // 帽子：中性深肉色（不分队伍）

// 把一个网格做成"描边壳"：放大一圈、只渲染反面 → 围着它一圈的纯色边框。
function outline(geo: THREE.BufferGeometry, scale: THREE.Vector3, y: number, color: THREE.Color): THREE.Mesh {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }));
  m.scale.copy(scale);
  m.position.y = y;
  return m;
}

// 一个可爱的蛋蛋特工：肉色蛋身 + 队伍色描边 + 中性小帽 + 豆豆眼 + 小枪。
// 两队长得一样，只有"边框颜色"按队伍不同（红/蓝）。
export function createEgg(team: Team): THREE.Group {
  const g = new THREE.Group();
  const edge = new THREE.Color(TEAM_COLOR[team]); // 队伍边框色

  // 蛋身（肉色，球压成蛋形）
  const bodyGeo = new THREE.SphereGeometry(0.5, 24, 24);
  const body = new THREE.Mesh(
    bodyGeo,
    new THREE.MeshStandardMaterial({ color: FLESH, roughness: 0.6, metalness: 0.04 }),
  );
  body.scale.set(1, 1.3, 1);
  body.position.y = 0.65;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // 蛋身的队伍色描边
  g.add(outline(bodyGeo, new THREE.Vector3(1.08, 1.3 * 1.08, 1.08), 0.65, edge));

  // 小帽子（中性深肉色半球）+ 队伍色描边
  const capGeo = new THREE.SphereGeometry(0.45, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const cap = new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({ color: FLESH_DARK, roughness: 0.55 }));
  cap.position.y = 0.95;
  cap.castShadow = true;
  g.add(cap);
  g.add(outline(capGeo, new THREE.Vector3(1.12, 1.12, 1.12), 0.95, edge));

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
