import * as THREE from 'three';
import { instance } from '../world/modelLoader';

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

const HERO_GOLD = 0xffc23c; // 英雄描边：蛋黄金

// 主菜单的英雄蛋蛋：金色描边 + 坚毅眉毛 + 手持真·P226消音手枪摆pose。
// 需要先 preloadModels(['models/weapons/p226.glb'])。
export function createHeroEgg(): THREE.Group {
  const g = createEgg('red');
  // 把红色描边换成金色（描边 = BackSide 的 BasicMaterial）
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && (m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial
      && (m.material as THREE.Material).side === THREE.BackSide) {
      (m.material as THREE.MeshBasicMaterial).color.set(HERO_GOLD);
    }
  });
  // 拿掉小盒子枪（createEgg 里唯一的 BoxGeometry），换成真枪模型
  for (const c of [...g.children]) {
    const m = c as THREE.Mesh;
    if (m.isMesh && m.geometry.type === 'BoxGeometry') g.remove(c);
  }

  // 坚毅眉毛：两条deep色小条，向中间压低 → 帅气专注脸
  const browMat = new THREE.MeshStandardMaterial({ color: 0x161a24, roughness: 0.4 });
  for (const s of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.03), browMat);
    brow.position.set(s * 0.17, 0.92, 0.43);
    brow.rotation.z = s * 0.38; // 外高内低 → 皱眉
    g.add(brow);
  }

  // 真·P226 消音手枪（和游戏里"鬼魅"同款），斜举在胸前的经典特工pose
  const gun = instance('models/weapons/p226.glb');
  const bb = new THREE.Box3().setFromObject(gun);
  const size = bb.getSize(new THREE.Vector3());
  const center = bb.getCenter(new THREE.Vector3());
  const s = 0.74 / Math.max(size.x, size.y, size.z, 0.001); // 枪长≈0.74，够醒目
  const holder = new THREE.Group();
  gun.position.set(-center.x * s, -center.y * s, -center.z * s);
  gun.scale.setScalar(s);
  holder.add(gun);
  // 消音器：找模型里的 Barrel 部件贴到枪管前端（与 viewGun 的做法一致）
  gun.updateMatrixWorld(true);
  let barrel: THREE.Object3D | null = null;
  gun.traverse((o) => { if (!barrel && /barrel/i.test(o.name)) barrel = o; });
  if (barrel) {
    const b2 = new THREE.Box3().setFromObject(barrel);
    const c2 = b2.getCenter(new THREE.Vector3());
    const supGeo = new THREE.CylinderGeometry(0.062, 0.062, 0.26, 14);
    supGeo.rotateX(Math.PI / 2);
    const sup = new THREE.Mesh(supGeo, new THREE.MeshStandardMaterial({ color: 0x23272f, roughness: 0.35, metalness: 0.3 })); // 比枪身亮一点点+反光，看得清
    sup.position.set(c2.x, c2.y, b2.min.z - 0.11); // 尾部略插进枪口
    sup.castShadow = true;
    holder.add(sup);
  }
  holder.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
  holder.position.set(0.42, 0.46, 0.36);   // 举在身体右前方(胸口高度，不挡脸)
  holder.rotation.set(-0.38, -0.62, 0.06); // 横持侧影微微上扬——轮廓最清楚的海报pose
  g.add(holder);
  return g;
}
