import * as THREE from 'three';
import { Box } from '../physics/aabb';
import { Vec3, vec3 } from '../core/vec3';
import { placeOnGround, modelSize } from './modelLoader';

// 精细道具模型(Kenney Survival Kit, CC0,见 docs/CREDITS.md)——启动时需预加载
export const PROP_MODEL_URLS = [
  'models/kenney/survival/tent-canvas.glb',
  'models/kenney/survival/barrel.glb',
  'models/kenney/survival/barrel-open.glb',
  'models/kenney/survival/signpost.glb',
  'models/kenney/survival/fence.glb',
];

// 放一个精细模型道具：按目标高度缩放 + 实心碰撞 + 巨大化保险(尺寸算错就跳过,绝不再出"天降巨物")
function placeProp(scene: THREE.Scene, walls: Box[], url: string, x: number, z: number,
  targetH: number, rotY: number, mat?: string): void {
  try {
    const scale = targetH / (modelSize(url, 1).y || 1);
    const placed = placeOnGround(url, x, z, { rotY, scale, solid: true });
    const bb = new THREE.Box3().setFromObject(placed.group);
    if (bb.max.y - bb.min.y > 14) { console.warn('道具尺寸异常,跳过:', url); return; }
    if (mat) placed.group.userData.mat = mat;
    scene.add(placed.group);
    if (placed.box) walls.push(placed.box);
  } catch { /* 缺模型就跳过 */ }
}

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
  const shaft = mesh(new THREE.BoxGeometry(3.2, 10, 3.2), STONE, 'brick'); shaft.position.y = 5; g.add(shaft);
  const belfry = mesh(new THREE.BoxGeometry(4.2, 2.4, 4.2), STONE_DARK, 'brick'); belfry.position.y = 11.2; g.add(belfry);
  const tex = clockTex();
  for (let i = 0; i < 4; i++) { // 四面钟
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    face.rotation.y = (Math.PI / 2) * i;
    face.position.set(Math.sin(face.rotation.y) * 2.12, 11.2, Math.cos(face.rotation.y) * 2.12);
    g.add(face);
  }
  // 塔身两层窗洞(深色内凹面片,四面都有)——地标更精致
  const winMat = new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 0.9 });
  for (const wy of [3.4, 6.8]) {
    for (let i = 0; i < 4; i++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.95), winMat);
      win.rotation.y = (Math.PI / 2) * i;
      win.position.set(Math.sin(win.rotation.y) * 1.62, wy, Math.cos(win.rotation.y) * 1.62);
      g.add(win);
    }
  }
  const roof = mesh(new THREE.ConeGeometry(3.1, 2.4, 4), 0x9a5a30, 'brick'); roof.position.y = 13.6; roof.rotation.y = Math.PI / 4; g.add(roof);
  const pole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4), STONE_DARK); pole.position.y = 15.4; g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xffc23c, side: THREE.DoubleSide }));
  flag.position.set(0.47, 15.7, 0); g.add(flag);
  g.position.set(22.5, 0, -17.5);
  scene.add(g);
}

// A包点天台(c20.5-22.5, r0.5-1.9)：2.4米大平台 + 南缘真楼梯(6级0.4m,走上去不用跳) + 护栏。
// 居高临下俯瞰整个A包点；护栏0.9米=站着探头、蹲下全遮。
function aTerrace(scene: THREE.Scene, walls: Box[]): void {
  const plat = mesh(new THREE.BoxGeometry(10, 2.4, 6), 0xe0b57e, 'brick');
  plat.position.set(50, 1.2, -48); scene.add(plat);
  pushBox(walls, 50, 0, -48, 10, 2.4, 6);
  // 楼梯：6级(第6级即平台边),每级0.4m高/1m深/3m宽,从 z=-39.5 往北登到平台
  for (let k = 1; k <= 5; k++) {
    const h = 0.4 * k;
    const s = mesh(new THREE.BoxGeometry(3, h, 1), 0xd8ab72, 'brick');
    s.position.set(47, h / 2, -39.5 - (k - 1));
    scene.add(s);
    pushBox(walls, 47, 0, -39.5 - (k - 1), 3, h, 1);
  }
  // 护栏：南缘(留楼梯口) + 西缘
  const railMat = 0xc99a5f;
  const railS = mesh(new THREE.BoxGeometry(6.4, 0.9, 0.18), railMat, 'brick');
  railS.position.set(51.8, 2.85, -45.1); scene.add(railS);
  pushBox(walls, 51.8, 2.4, -45.1, 6.4, 0.9, 0.18);
  const railW = mesh(new THREE.BoxGeometry(0.18, 0.9, 6), railMat, 'brick');
  railW.position.set(45.1, 2.85, -48); scene.add(railW);
  pushBox(walls, 45.1, 2.4, -48, 0.18, 0.9, 6);
  // 台缘警戒条
  const trim = new THREE.Mesh(new THREE.BoxGeometry(10, 0.12, 0.14),
    new THREE.MeshStandardMaterial({ color: A_ACCENT }));
  trim.position.set(50, 2.46, -45.02); scene.add(trim);
}

// B庭院露台(c0.5-1.9, r0.3-1.5)：1.6米平台 + 东侧斜坡(视觉斜面,碰撞是8级0.2m小台阶,走感顺滑) + 护栏
function bTerrace(scene: THREE.Scene, walls: Box[]): void {
  const plat = mesh(new THREE.BoxGeometry(7, 1.6, 6), 0xb9c9ae, 'brick'); // B区青调沙岩
  plat.position.set(-51.5, 0.8, -48); scene.add(plat);
  pushBox(walls, -51.5, 0, -48, 7, 1.6, 6);
  // 斜坡碰撞：8级0.2m小台阶(隐形,只推碰撞盒),配自动上台阶=顺滑走上去
  for (let k = 1; k <= 8; k++) {
    pushBox(walls, -44.25 - (k - 1) * 0.5, 0, -48, 0.5, 0.2 * k, 3);
  }
  // 斜坡视觉：一块斜放的板 + 两个支撑墩
  const ramp = mesh(new THREE.BoxGeometry(4.35, 0.24, 3), 0xaebfa2, 'brick');
  ramp.position.set(-46, 0.85, -48);
  ramp.rotation.z = Math.atan2(1.6, 4); // 斜度=升1.6走4
  scene.add(ramp);
  const but1 = mesh(new THREE.BoxGeometry(1.2, 0.5, 2.6), 0xa3b498); but1.position.set(-45, 0.25, -48); scene.add(but1);
  const but2 = mesh(new THREE.BoxGeometry(1.2, 1.1, 2.6), 0xa3b498); but2.position.set(-46.8, 0.55, -48); scene.add(but2);
  // 护栏：南缘+北缘(东侧留给斜坡)
  const railMat = 0x8fa584;
  for (const z of [-45.1, -50.9]) {
    const rail = mesh(new THREE.BoxGeometry(7, 0.9, 0.18), railMat, 'brick');
    rail.position.set(-51.5, 2.05, z); scene.add(rail);
    pushBox(walls, -51.5, 1.6, z, 7, 0.9, 0.18);
  }
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
  const spots: [number, number, number][] = [[-43.5, -47.5, 0.7], [-26, -44, 2.4]]; // 让位给露台：c2.8,r1 / c6.3,r1.7
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

// 旗帜串：两点之间挂一长串旗(下垂弧线,纯视觉)。旗数和下垂度按跨度自动配——跨街大串才有集市味。
function flagString(scene: THREE.Scene, a: Vec3, b: Vec3, colors: number[]): void {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const N = Math.max(8, Math.round(len / 2));      // 约每2米一面旗
  const sagMax = Math.min(1.6, len * 0.045);       // 跨得越长垂得越深
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const sag = Math.sin(Math.PI * t) * sagMax;
    pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag, a.z + (b.z - a.z) * t));
  }
  const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x5a4632 }));
  scene.add(rope);
  const flagGeo = new THREE.PlaneGeometry(0.8, 0.55);
  for (let i = 1; i < N; i++) {
    const f = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({
      color: colors[i % colors.length], side: THREE.DoubleSide, roughness: 0.9 }));
    f.position.copy(pts[i]); f.position.y -= 0.32;
    f.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2; // 旗面顺着绳
    scene.add(f);
  }
}

// 入口：在 buildDesertMap 里、撒掩体之前调用（后撒的箱子会自动避开这些碰撞盒）
export function buildTownProps(scene: THREE.Scene, walls: Box[]): void {
  clockTower(scene);                       // 中路地标(c16,r7)
  aTerrace(scene, walls);                  // A天台(2.4m+真楼梯)
  bTerrace(scene, walls);                  // B露台(1.6m+斜坡)
  fountain(scene, walls);                  // 中庭喷泉(c11-12,r6)
  arch(scene, -45, -22.5, 10, true, B_ACCENT); // B隧道口拱门(c2-3,r6)——门洞在东西向墙上,横梁跨x方向
  arch(scene, 35, -27.5, 10, true, A_ACCENT);   // A长道口拱门(c18-19,r5)
  arch(scene, 0, 7.5, 10, true, 0xc9a24a);      // 中门拱门(c11-12,r12)
  awning(scene, 37, -42.5, 0.2, '#d9772f');     // A市集棚(c18.9,r2)
  awning(scene, 31.5, -33.5, -0.35, '#c9512f'); // A市集棚(c17.8,r3.8)
  well(scene, walls);                      // B水井(c5.5,r4.5)
  palms(scene, walls);                     // B棕榈
  // —— Kenney 精细道具：A市集帐篷+木桶+路牌 / B庭院栅栏+敞口桶 ——
  placeProp(scene, walls, PROP_MODEL_URLS[0], 33.5, -47.5, 2.8, Math.PI, 'wood');   // 市集帐篷
  placeProp(scene, walls, PROP_MODEL_URLS[1], 35.8, -45.6, 1.1, 0.5, 'wood');       // 木桶
  placeProp(scene, walls, PROP_MODEL_URLS[1], 36.7, -46.5, 1.1, 2.1, 'wood');       // 木桶
  placeProp(scene, walls, PROP_MODEL_URLS[3], 36.5, -31, 1.7, 2.7);                 // A口路牌
  placeProp(scene, walls, PROP_MODEL_URLS[4], -32.6, -27.8, 1.0, 0, 'wood');        // B栅栏
  placeProp(scene, walls, PROP_MODEL_URLS[4], -30.2, -27.8, 1.0, 0, 'wood');        // B栅栏
  placeProp(scene, walls, PROP_MODEL_URLS[2], -28.2, -31.4, 1.0, 1.2, 'wood');      // 敞口桶
  // —— 跨街长旗帜串(约30米,旗子加大;A/B锚在墙顶5.2米,不碰天台护栏) ——
  flagString(scene, vec3(28, 5.2, -51), vec3(56, 5.2, -39), [0xd9772f, 0xf3ecdc, 0xffc23c]);   // A市集跨全场
  flagString(scene, vec3(-56, 5.2, -51), vec3(-28, 5.2, -42), [0x3f8f83, 0xf3ecdc, 0x7fc4b6]); // B庭院跨全场
  flagString(scene, vec3(-14.8, 4.4, -22.5), vec3(14.8, 4.4, -22.5), [0xc9a24a, 0xf3ecdc]);    // 中庭(跨喷泉)
  flagString(scene, vec3(-25, 4.8, 32.5), vec3(25, 4.8, 32.5), [0xffc23c, 0xf3ecdc, 0xff5630]); // 匪家前场
}
