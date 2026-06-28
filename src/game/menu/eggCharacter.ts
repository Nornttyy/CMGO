import * as THREE from 'three';

export type Team = 'red' | 'blue';

const TEAM_COLOR: Record<Team, number> = { red: 0xff5630, blue: 0x36c5f0 };
const FLESH = 0xf2c4a0;       // 肉色蛋身（两队一样）
const FLESH_DARK = 0xb98a66;  // 头盔：中性深肉色（不分队伍）
const DARK = 0x232733;        // 眼睛瞳孔 / 鞋 / 枪

// 把一个网格做成"描边壳"：放大一圈、只渲染反面 → 围着它一圈的纯色边框。
function outline(geo: THREE.BufferGeometry, scale: THREE.Vector3, pos: THREE.Vector3, color: THREE.Color): THREE.Mesh {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }));
  m.scale.copy(scale);
  m.position.copy(pos);
  return m;
}

// 一个可爱又精致的蛋蛋特工：肉色蛋身 + 队伍色描边/护目带 + 头盔 + 大眼睛 + 小手小脚 + 小枪。
// 两队长得一样，只有"队伍色"(描边 + 护目带)按队伍不同（红/蓝）。children[0] 一定是蛋身(受击闪白用)。
export function createEgg(team: Team): THREE.Group {
  const g = new THREE.Group();
  const edge = new THREE.Color(TEAM_COLOR[team]);
  const teamMat = new THREE.MeshStandardMaterial({ color: TEAM_COLOR[team], roughness: 0.45, metalness: 0.1 });
  const fleshMat = new THREE.MeshStandardMaterial({ color: FLESH, roughness: 0.55, metalness: 0.04 });
  const darkMat = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.45 });

  // 蛋身（children[0]，受击闪白用）+ 队伍色描边
  const bodyGeo = new THREE.SphereGeometry(0.5, 28, 28);
  const body = new THREE.Mesh(bodyGeo, fleshMat);
  body.scale.set(1, 1.3, 1); body.position.y = 0.65; body.castShadow = true; body.receiveShadow = true;
  g.add(body); // [0]
  g.add(outline(bodyGeo, new THREE.Vector3(1.07, 1.3 * 1.07, 1.07), new THREE.Vector3(0, 0.65, 0), edge));

  // 头盔（深肉色圆顶）+ 队伍色描边
  const helmGeo = new THREE.SphereGeometry(0.46, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const helm = new THREE.Mesh(helmGeo, new THREE.MeshStandardMaterial({ color: FLESH_DARK, roughness: 0.5 }));
  helm.position.y = 0.96; helm.castShadow = true; g.add(helm);
  g.add(outline(helmGeo, new THREE.Vector3(1.1, 1.1, 1.1), new THREE.Vector3(0, 0.96, 0), edge));

  // 队伍色护目带（横在脸上方的一圈），清楚区分红/蓝队
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.05, 8, 24), teamMat);
  band.rotation.x = Math.PI / 2; band.position.y = 0.92; band.scale.set(1, 1, 0.7); g.add(band);

  // 大眼睛：白眼球 + 深瞳孔 + 小高光（朝 +Z 前方）
  const scleraGeo = new THREE.SphereGeometry(0.12, 14, 14);
  const pupilGeo = new THREE.SphereGeometry(0.06, 12, 12);
  const hiGeo = new THREE.SphereGeometry(0.025, 8, 8);
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  for (const dx of [-0.18, 0.18]) {
    const sc = new THREE.Mesh(scleraGeo, whiteMat); sc.position.set(dx, 0.74, 0.42); sc.scale.set(1, 1.15, 0.7); g.add(sc);
    const pu = new THREE.Mesh(pupilGeo, darkMat); pu.position.set(dx, 0.73, 0.5); g.add(pu);
    const hi = new THREE.Mesh(hiGeo, whiteMat); hi.position.set(dx + 0.03, 0.78, 0.54); g.add(hi);
  }

  // 小手（两颗肉色圆球在身体两侧，右手靠前握枪）
  const handGeo = new THREE.SphereGeometry(0.13, 12, 12);
  const lh = new THREE.Mesh(handGeo, fleshMat); lh.position.set(-0.46, 0.5, 0.12); lh.castShadow = true; g.add(lh);
  const rh = new THREE.Mesh(handGeo, fleshMat); rh.position.set(0.42, 0.46, 0.3); rh.castShadow = true; g.add(rh);

  // 小脚（两只深色圆鞋）
  const footGeo = new THREE.SphereGeometry(0.15, 12, 10);
  for (const dx of [-0.2, 0.2]) {
    const ft = new THREE.Mesh(footGeo, darkMat); ft.position.set(dx, 0.06, 0.1); ft.scale.set(1, 0.6, 1.5); ft.castShadow = true; g.add(ft);
  }

  // 小枪（枪身 + 枪管，握在右手前）
  const gun = new THREE.Group();
  const gBody = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.28), darkMat); gBody.position.set(0, 0, 0); gun.add(gBody);
  const gBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.28), darkMat); gBarrel.position.set(0, 0.02, -0.26); gun.add(gBarrel);
  gun.position.set(0.42, 0.5, 0.36); gun.castShadow = true; g.add(gun);

  return g;
}

// 枪口在角色本地坐标的位置（发射弹道用）
export const GUN_MUZZLE = new THREE.Vector3(0.42, 0.52, 0.78);
