import * as THREE from 'three';
import { Box } from '../physics/aabb';
import { Vec3, vec3 } from '../core/vec3';

// 小镇大件装饰：钟楼 / A高台 / 中庭喷泉 / 路口拱门 / 遮阳棚 / 水井 / 棕榈 / 旗帜串。
// 坐标是"当前三路图纸"的格子位置（注释里标了格子号），改图纸记得同步。
// 规则：会挡人的推 walls(碰撞盒)；纯装饰(拱门横梁/棚/旗)不推、也不打材质标(mat)→ 子弹不理它。

const STONE = 0xd6c193;    // 沙岩(同矮墙)
const STONE_DARK = 0xb9a276;
const A_ACCENT = 0xd9772f; // A区暖橙
const B_ACCENT = 0x3f8f83; // B区青蓝

function mesh(g: THREE.BufferGeometry, color: number, mat?: string): THREE.Mesh {
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.92 }));
  m.castShadow = true; m.receiveShadow = true;
  if (mat) m.userData.mat = mat; // 子弹穿透系统用的材质标(第二块接入)
  return m;
}
function pushBox(walls: Box[], x: number, y0: number, z: number, w: number, h: number, d: number): void {
  walls.push({ min: vec3(x - w / 2, y0, z - d / 2), max: vec3(x + w / 2, y0 + h, z + d / 2) });
}

// —— 钟面贴图：白底 + 黑刻度指针（程序画,不用图片）——
function clockTex(): THREE.CanvasTexture {
  const S = 64; const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d') as CanvasRenderingContext2D;
  x.fillStyle = '#f5efdf'; x.beginPath(); x.arc(S / 2, S / 2, S * 0.46, 0, 7); x.fill();
  x.strokeStyle = '#2a2620'; x.lineWidth = 3; x.stroke();
  for (let i = 0; i < 12; i++) { // 刻度
    const a = (i / 12) * Math.PI * 2, r0 = S * 0.36, r1 = S * 0.42;
    x.beginPath(); x.moveTo(S / 2 + Math.cos(a) * r0, S / 2 + Math.sin(a) * r0);
    x.lineTo(S / 2 + Math.cos(a) * r1, S / 2 + Math.sin(a) * r1); x.lineWidth = 2; x.stroke();
  }
  x.lineWidth = 4; x.beginPath(); x.moveTo(S / 2, S / 2); x.lineTo(S / 2, S * 0.2); x.stroke();  // 分针指12
  x.lineWidth = 5; x.beginPath(); x.moveTo(S / 2, S / 2); x.lineTo(S * 0.68, S / 2); x.stroke(); // 时针指3
  return new THREE.CanvasTexture(c);
}
// —— 遮阳棚条纹贴图 ——
function awningTex(color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 64; c.height = 16;
  const x = c.getContext('2d') as CanvasRenderingContext2D;
  x.fillStyle = '#f3ecdc'; x.fillRect(0, 0, 64, 16);
  x.fillStyle = color;
  for (let i = 0; i < 4; i++) x.fillRect(i * 16, 0, 8, 16);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(2, 1);
  return t;
}

// 钟楼(c16,r7 实心填充块上,只加视觉不加碰撞)：全图可见的中路地标
function clockTower(scene: THREE.Scene): void {
  const g = new THREE.Group();
  const shaft = mesh(new THREE.BoxGeometry(3.2, 10, 3.2), STONE); shaft.position.y = 5; g.add(shaft);
  const belfry = mesh(new THREE.BoxGeometry(4.2, 2.4, 4.2), STONE_DARK); belfry.position.y = 11.2; g.add(belfry);
  const tex = clockTex();
  for (let i = 0; i < 4; i++) { // 四面钟
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    face.rotation.y = (Math.PI / 2) * i;
    face.position.set(Math.sin(face.rotation.y) * 2.12, 11.2, Math.cos(face.rotation.y) * 2.12);
    g.add(face);
  }
  const roof = mesh(new THREE.ConeGeometry(3.1, 2.4, 4), 0x9a5a30); roof.position.y = 13.6; roof.rotation.y = Math.PI / 4; g.add(roof);
  const pole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4), STONE_DARK); pole.position.y = 15.4; g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xffc23c, side: THREE.DoubleSide }));
  flag.position.set(0.47, 15.7, 0); g.add(flag);
  g.position.set(22.5, 0, -17.5);
  scene.add(g);
}

// A包点高台(c21-22,r1-2)：1.2米平台+南侧两级台阶，居高临下守A
function aPlatform(scene: THREE.Scene, walls: Box[]): void {
  const plat = mesh(new THREE.BoxGeometry(8, 1.2, 8), 0xe0b57e, 'brick'); // A区暖沙岩
  plat.position.set(50, 0.6, -45); scene.add(plat);
  pushBox(walls, 50, 0, -45, 8, 1.2, 8);
  const s1 = mesh(new THREE.BoxGeometry(4, 0.6, 1.6), 0xd8ab72, 'brick');
  s1.position.set(49, 0.3, -40.2); scene.add(s1);
  pushBox(walls, 49, 0, -40.2, 4, 0.6, 1.6);
  // 台沿警戒条
  const trim = new THREE.Mesh(new THREE.BoxGeometry(8, 0.12, 0.12),
    new THREE.MeshStandardMaterial({ color: A_ACCENT }));
  trim.position.set(50, 1.26, -41.05); scene.add(trim);
}

// 中庭喷泉(c11-12,r6)：八角池沿(可跳上)+中柱水碗+静水面
function fountain(scene: THREE.Scene, walls: Box[]): void {
  const rim = mesh(new THREE.CylinderGeometry(2, 2.15, 0.55, 8), STONE, 'brick');
  rim.position.set(0, 0.275, -22.5); scene.add(rim);
  pushBox(walls, 0, 0, -22.5, 4, 0.55, 4);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.75, 24),
    new THREE.MeshStandardMaterial({ color: 0x4fc3dc, emissive: 0x1a6a80, emissiveIntensity: 0.35, roughness: 0.25 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.5, -22.5); scene.add(water);
  const pillar = mesh(new THREE.CylinderGeometry(0.32, 0.4, 1.4, 8), STONE_DARK, 'brick');
  pillar.position.set(0, 0.7, -22.5); scene.add(pillar);
  pushBox(walls, 0, 0, -22.5, 0.8, 1.5, 0.8);
  const bowl = mesh(new THREE.CylinderGeometry(0.75, 0.55, 0.22, 8), STONE, 'brick');
  bowl.position.set(0, 1.5, -22.5); scene.add(bowl);
}

// 路口装饰拱门：借现有墙当柱，横梁+两端逐级内收的"叠涩拱脚"勾出拱形。
// 纯视觉(不挡人不挡子弹)；全用方块,任何角度看都正常。
function arch(scene: THREE.Scene, x: number, z: number, w: number, alongX: boolean, accent: number): void {
  const g = new THREE.Group();
  const beam = mesh(new THREE.BoxGeometry(w + 1.2, 0.8, 1.1), STONE);
  beam.position.y = 3.9; g.add(beam);
  const band = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.16, 1.14),
    new THREE.MeshStandardMaterial({ color: accent }));
  band.position.y = 4.35; g.add(band);
  for (const s of [-1, 1]) { // 拱脚：两级内收(都在2.8米以上,跳不到)
    const c1 = mesh(new THREE.BoxGeometry(1.7, 0.5, 1.06), STONE_DARK);
    c1.position.set(s * (w / 2 - 0.85), 3.25, 0); g.add(c1);
    const c2 = mesh(new THREE.BoxGeometry(0.95, 0.4, 1.02), STONE_DARK);
    c2.position.set(s * (w / 2 - 0.48), 2.87, 0); g.add(c2);
  }
  if (!alongX) g.rotation.y = Math.PI / 2;
  g.position.set(x, 0, z);
  scene.add(g);
}

// A市集遮阳棚：斜布面+四根细木杆(纯视觉)
function awning(scene: THREE.Scene, x: number, z: number, rotY: number, color: string): void {
  const g = new THREE.Group();
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3),
    new THREE.MeshStandardMaterial({ map: awningTex(color), side: THREE.DoubleSide, roughness: 0.9 }));
  cloth.rotation.x = -Math.PI / 2 + 0.22; cloth.position.y = 2.55; g.add(cloth);
  for (const [px, pz] of [[-1.6, -1.3], [1.6, -1.3], [-1.6, 1.3], [1.6, 1.3]] as [number, number][]) {
    const pole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5), 0x8a6a48);
    pole.position.set(px, 1.25, pz); g.add(pole);
  }
  g.rotation.y = rotY; g.position.set(x, 0, z);
  scene.add(g);
}

// B庭院水井(c5-6,r4-5)：石筒+双柱小顶棚,可当小掩体
function well(scene: THREE.Scene, walls: Box[]): void {
  const g = new THREE.Group();
  const ring = mesh(new THREE.CylinderGeometry(0.9, 1.0, 1.0, 10), STONE, 'brick');
  ring.position.y = 0.5; g.add(ring);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.72, 16),
    new THREE.MeshStandardMaterial({ color: 0x3fb0c9, emissive: 0x155a70, emissiveIntensity: 0.3 }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.86; g.add(water);
  for (const px of [-0.95, 0.95]) {
    const post = mesh(new THREE.BoxGeometry(0.14, 2.1, 0.14), 0x8a6a48);
    post.position.set(px, 1.05, 0); g.add(post);
  }
  const roofL = mesh(new THREE.BoxGeometry(1.5, 0.1, 1.7), B_ACCENT); roofL.rotation.z = 0.5; roofL.position.set(-0.55, 2.35, 0); g.add(roofL);
  const roofR = mesh(new THREE.BoxGeometry(1.5, 0.1, 1.7), B_ACCENT); roofR.rotation.z = -0.5; roofR.position.set(0.55, 2.35, 0); g.add(roofR);
  g.position.set(-30, 0, -30);
  scene.add(g);
  pushBox(walls, -30, 0, -30, 1.9, 1.0, 1.9);
}

// B庭院棕榈：程序化卡通棕榈(树干圆柱+锥形叶)，尺寸写死不依赖模型包围盒(不会巨大化)
function palms(scene: THREE.Scene, walls: Box[]): void {
  const spots: [number, number, number][] = [[-47.5, -47.5, 0.7], [-26, -44, 2.4]]; // c2,r1 / c6.3,r1.7
  for (const [x, z, rot] of spots) {
    const g = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.16, 0.26, 4.6, 7), 0x8a6242, 'plant');
    trunk.position.y = 2.3; g.add(trunk);
    for (let i = 0; i < 6; i++) { // 六片下垂的叶子
      const leaf = mesh(new THREE.ConeGeometry(0.34, 2.6, 4), 0x3f9464, 'plant');
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.0, 4.75, Math.sin(a) * 1.0);
      leaf.rotation.z = Math.cos(a) * 1.25; leaf.rotation.x = -Math.sin(a) * 1.25;
      g.add(leaf);
    }
    const top = mesh(new THREE.SphereGeometry(0.3, 8, 6), 0x2f7a50, 'plant');
    top.position.y = 4.7; g.add(top);
    g.rotation.y = rot; g.position.set(x, 0, z);
    scene.add(g);
    pushBox(walls, x, 0, z, 0.7, 2.5, 0.7);
  }
}

// 旗帜串：两点之间挂一串小三角旗(下垂弧线,纯视觉)
function flagString(scene: THREE.Scene, a: Vec3, b: Vec3, colors: number[]): void {
  const N = 9, pts: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const sag = Math.sin(Math.PI * t) * 0.7; // 中间下垂
    pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag, a.z + (b.z - a.z) * t));
  }
  const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x5a4632 }));
  scene.add(rope);
  const flagGeo = new THREE.PlaneGeometry(0.55, 0.4);
  for (let i = 1; i < N; i++) {
    const f = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({
      color: colors[i % colors.length], side: THREE.DoubleSide, roughness: 0.9 }));
    f.position.copy(pts[i]); f.position.y -= 0.24;
    f.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2; // 旗面顺着绳
    scene.add(f);
  }
}

// 入口：在 buildDesertMap 里、撒掩体之前调用（后撒的箱子会自动避开这些碰撞盒）
export function buildTownProps(scene: THREE.Scene, walls: Box[]): void {
  clockTower(scene);                       // 中路地标(c16,r7)
  aPlatform(scene, walls);                 // A高台(c21-22,r1-2)
  fountain(scene, walls);                  // 中庭喷泉(c11-12,r6)
  arch(scene, -45, -22.5, 10, true, B_ACCENT); // B隧道口拱门(c2-3,r6)——门洞在东西向墙上,横梁跨x方向
  arch(scene, 35, -27.5, 10, true, A_ACCENT);   // A长道口拱门(c18-19,r5)
  arch(scene, 0, 7.5, 10, true, 0xc9a24a);      // 中门拱门(c11-12,r12)
  awning(scene, 37, -42.5, 0.2, '#d9772f');     // A市集棚(c18.9,r2)
  awning(scene, 31.5, -33.5, -0.35, '#c9512f'); // A市集棚(c17.8,r3.8)
  well(scene, walls);                      // B水井(c5.5,r4.5)
  palms(scene, walls);                     // B棕榈
  flagString(scene, vec3(27.5, 4.6, -50), vec3(45, 4.6, -40), [0xd9772f, 0xf3ecdc, 0xffc23c]); // A市集
  flagString(scene, vec3(-45, 4.6, -50), vec3(-30, 4.6, -41), [0x3f8f83, 0xf3ecdc, 0x7fc4b6]); // B庭院
  flagString(scene, vec3(-14.8, 4.4, -22.5), vec3(14.8, 4.4, -22.5), [0xc9a24a, 0xf3ecdc]);    // 中庭(跨喷泉)
}
