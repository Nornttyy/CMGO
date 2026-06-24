import * as THREE from 'three';
import { Box, overlaps } from '../physics/aabb';
import { Vec3, vec3 } from '../core/vec3';
import { placeOnGround, modelSize } from './modelLoader';

export interface Barrier { mesh: THREE.Mesh; box: Box; }
export interface MapData {
  walls: Box[];                 // 静态碰撞体
  barriers: Barrier[];          // 出生光幕（会落下）
  attackerSpawn: Vec3;
}

// 沙漠小镇配色（几种土墙色，做出层次，不那么单调）
const SAND = 0xd8c08a;
const PERIM = 0xb89a64;        // 外围墙
const ADOBE_A = 0xe0c699;
const ADOBE_B = 0xcaa367;
const ADOBE_C = 0xd8b483;
const ADOBE_D = 0xbf9a5f;
const ROOF = 0x8a6a3e;
const WINDOW = 0x6f97a6;

// 用到的 Kenney 模型（路径相对 public）。main.ts 进场前会 preload 这一组。
const M = {
  box: 'models/kenney/survival/box.glb',
  boxLarge: 'models/kenney/survival/box-large.glb',
  boxOpen: 'models/kenney/survival/box-open.glb',
  barrel: 'models/kenney/survival/barrel.glb',
  barrelOpen: 'models/kenney/survival/barrel-open.glb',
  chest: 'models/kenney/survival/chest.glb',
  fenceFort: 'models/kenney/survival/fence-fortified.glb',
  tent: 'models/kenney/survival/tent.glb',
  tentCanvas: 'models/kenney/survival/tent-canvas.glb',
  signpost: 'models/kenney/survival/signpost.glb',
  rockA: 'models/kenney/survival/rock-sand-a.glb',
  rockB: 'models/kenney/survival/rock-sand-b.glb',
  rockC: 'models/kenney/survival/rock-sand-c.glb',
  palmTall: 'models/kenney/nature/tree_palmDetailedTall.glb',
  palmShort: 'models/kenney/nature/tree_palmDetailedShort.glb',
  palmBend: 'models/kenney/nature/tree_palmBend.glb',
  cactusTall: 'models/kenney/nature/cactus_tall.glb',
  cactusShort: 'models/kenney/nature/cactus_short.glb',
  bush: 'models/kenney/nature/plant_bushDetailed.glb',
  bushS: 'models/kenney/nature/plant_bushSmall.glb',
};
export const MAP_MODELS = Object.values(M);

// 小型确定性随机（每次建图一致，方便截图核对）
let _seed = 12345;
function rnd(): number { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function rrange(a: number, b: number): number { return a + rnd() * (b - a); }
function pick<T>(arr: T[]): T { return arr[Math.floor(rnd() * arr.length) % arr.length]; }

// 带碰撞的实心方块（墙/建筑主体）。cy 是中心高度。
function box(scene: THREE.Scene, walls: Box[], cx: number, cy: number, cz: number,
            sx: number, sy: number, sz: number, color: number, receive = false): void {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    new THREE.MeshStandardMaterial({ color, roughness: 0.92 }),
  );
  mesh.position.set(cx, cy, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = receive;
  scene.add(mesh);
  walls.push({
    min: vec3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
    max: vec3(cx + sx / 2, cy + sy / 2, cz + sz / 2),
  });
}

// 贴地的墙段（底在 y=0，高 h）
function seg(scene: THREE.Scene, walls: Box[], cx: number, cz: number, sx: number, sz: number, h: number, color: number): void {
  box(scene, walls, cx, h / 2, cz, sx, h, sz, color);
}

// 纯装饰方块（不加碰撞）——屋顶、门楣、窗、裙边等
function deco(scene: THREE.Scene, cx: number, cy: number, cz: number,
             sx: number, sy: number, sz: number, color: number): void {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
  );
  mesh.position.set(cx, cy, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

const T = 0.6;     // 墙厚
const DOORW = 3.2; // 门洞宽

// 沿 X 的一面墙（长 sx，在 z=cz），door=true 时中间留门洞 + 门楣
function wallX(scene: THREE.Scene, walls: Box[], cx: number, cz: number, sx: number, h: number, color: number, door: boolean): void {
  if (!door) { seg(scene, walls, cx, cz, sx, T, h, color); return; }
  const s = (sx - DOORW) / 2;
  if (s > 0.15) {
    seg(scene, walls, cx - (DOORW / 2 + s / 2), cz, s, T, h, color);
    seg(scene, walls, cx + (DOORW / 2 + s / 2), cz, s, T, h, color);
  }
  deco(scene, cx, h - 0.45, cz, DOORW, 0.9, T, color); // 门楣（门洞上方，能走过去）
}
// 沿 Z 的一面墙（长 sz，在 x=cx）
function wallZ(scene: THREE.Scene, walls: Box[], cx: number, cz: number, sz: number, h: number, color: number, door: boolean): void {
  if (!door) { seg(scene, walls, cx, cz, T, sz, h, color); return; }
  const s = (sz - DOORW) / 2;
  if (s > 0.15) {
    seg(scene, walls, cx, cz - (DOORW / 2 + s / 2), T, s, h, color);
    seg(scene, walls, cx, cz + (DOORW / 2 + s / 2), T, s, h, color);
  }
  deco(scene, cx, h - 0.45, cz, T, 0.9, DOORW, color);
}

interface Doors { n?: boolean; s?: boolean; e?: boolean; w?: boolean; }
// 能走进去的院子：四面墙（可留门洞），开顶（亮堂，像土墙院落）
function room(scene: THREE.Scene, walls: Box[], cx: number, cz: number, sx: number, sz: number, h: number, doors: Doors, color: number): void {
  wallX(scene, walls, cx, cz - sz / 2, sx, h, color, !!doors.n); // 北墙
  wallX(scene, walls, cx, cz + sz / 2, sx, h, color, !!doors.s); // 南墙
  wallZ(scene, walls, cx - sx / 2, cz, sz, h, color, !!doors.w); // 西墙
  wallZ(scene, walls, cx + sx / 2, cz, sz, h, color, !!doors.e); // 东墙
}

// 实心建筑（进不去）：主体 + 屋顶帽 + 南面两扇窗（窗只外凸一点，不和别的面打架，所以不穿模）
function solid(scene: THREE.Scene, walls: Box[], cx: number, cz: number, sx: number, sz: number, h: number, color: number): void {
  seg(scene, walls, cx, cz, sx, sz, h, color);
  deco(scene, cx, h + 0.14, cz, sx + 0.5, 0.3, sz + 0.5, ROOF);            // 屋顶帽（外挑）
  for (const dx of [-sx * 0.26, sx * 0.26]) {
    deco(scene, cx + dx, h * 0.55, cz + sz / 2 + 0.06, 1.0, 1.0, 0.06, WINDOW); // 南面窗
  }
}

// 包点地面标记（薄片，垫高 + polygonOffset，不和地面闪烁）
function patch(scene: THREE.Scene, cx: number, cz: number, size: number, color: number): void {
  const mat = new THREE.MeshStandardMaterial({
    color, transparent: true, opacity: 0.5, roughness: 0.8,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, 0.08, size), mat);
  mesh.position.set(cx, 0.06, cz);
  mesh.receiveShadow = true;
  scene.add(mesh);
}

interface PropOpts { width?: number; scale?: number; rotY?: number; solid?: boolean; collide?: { hx: number; hz: number }; }
// 放一个 Kenney 模型：贴地 + 配碰撞（防穿模），插墙就跳过
function prop(scene: THREE.Scene, walls: Box[], url: string, x: number, z: number, o: PropOpts = {}): void {
  try {
    let scale = o.scale ?? 1;
    if (o.width != null) scale = o.width / (modelSize(url, 1).x || 1);
    const p = placeOnGround(url, x, z, { rotY: o.rotY, scale, solid: o.solid, collide: o.collide });
    if (p.box) {
      if (walls.some((w) => overlaps(p.box as Box, w))) return; // 防穿模：宁可不放也不穿
      walls.push(p.box);
    }
    scene.add(p.group);
  } catch { /* 缺模型就跳过 */ }
}

// 一道发光的出生光幕（横跨地图宽度）
function makeBarrier(scene: THREE.Scene, cz: number): Barrier {
  const sx = 54, sy = 4.5, sz = 0.3;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    new THREE.MeshStandardMaterial({
      color: 0x4ad9ff, emissive: 0x2aa8d8, emissiveIntensity: 1.3,
      transparent: true, opacity: 0.3, side: THREE.DoubleSide,
    }),
  );
  mesh.position.set(0, sy / 2, cz);
  mesh.visible = false; // 菜单时不显示；开局准备阶段 raiseBarriers 才亮
  scene.add(mesh);
  return { mesh, box: { min: vec3(-sx / 2, 0, cz - sz / 2), max: vec3(sx / 2, sy, cz + sz / 2) } };
}

// 沙漠小镇：南=攻方出生，北=守方出生。中间是连成片的小镇——A路/中路/B路 + 巷子 + A/B 院子包点。
export function buildDesertMap(scene: THREE.Scene): MapData {
  _seed = 12345;
  const walls: Box[] = [];

  // 沙地
  box(scene, walls, 0, -0.5, 0, 54, 1, 74, SAND, true);

  // 四周围墙
  box(scene, walls, 0, 3.5, -36, 54, 7, 1, PERIM); // 北
  box(scene, walls, 0, 3.5, 36, 54, 7, 1, PERIM);  // 南
  box(scene, walls, -27, 3.5, 0, 1, 7, 74, PERIM); // 西
  box(scene, walls, 27, 3.5, 0, 1, 7, 74, PERIM);  // 东

  // ── 建筑群：连成片围出三条街（西/中/东）和巷子 ──
  // 街道（保持空着走人）：西街 x∈[-26,-20]、东街 x∈[20,26]、中街 x∈[-3,3]、横巷 z∈[-11,-6]

  // 南半（攻方一出生，路被这两栋大楼分成三股）
  solid(scene, walls, -12, 14, 13, 12, 5.0, ADOBE_D);
  solid(scene, walls, 12, 14, 13, 12, 5.0, ADOBE_D);

  // 中路房子（中街上，能穿过去：南北开门）+ 两侧夹楼
  room(scene, walls, 0, 1, 9, 9, 3.2, { n: true, s: true, e: true, w: true }, ADOBE_C);
  solid(scene, walls, -11, 1, 7, 9, 4.0, ADOBE_B);
  solid(scene, walls, 11, 1, 7, 9, 4.0, ADOBE_B);

  // A 包点（西北）：能走进去的院子，朝南、朝东、朝西开门
  room(scene, walls, -15, -16, 13, 10, 3.2, { s: true, e: true, w: true }, ADOBE_A);
  patch(scene, -15, -16, 6, 0xff5630);
  // B 包点（东北）：镜像
  room(scene, walls, 15, -16, 13, 10, 3.2, { s: true, e: true, w: true }, ADOBE_A);
  patch(scene, 15, -16, 6, 0x36c5f0);

  // 守方一侧（北）：A/B 后各一栋，给守方掩体、也挡住直接对穿
  solid(scene, walls, -15, -29, 12, 5, 4.5, ADOBE_B);
  solid(scene, walls, 15, -29, 12, 5, 4.5, ADOBE_B);
  // 中路尽头（守方正面）一栋矮房，做对称的中路屏障
  solid(scene, walls, 0, -28, 9, 5, 4.0, ADOBE_C);

  // ── 掩体（矮箱/桶，放在街口、包点、横巷——该打的地方）──
  // A 包点内
  prop(scene, walls, M.boxLarge, -17, -14, { width: 1.7, rotY: 0.2, solid: true });
  prop(scene, walls, M.barrel, -13, -18, { width: 1.15, solid: true });
  prop(scene, walls, M.boxOpen, -16, -19, { width: 1.5, rotY: -0.3, solid: true });
  // B 包点内
  prop(scene, walls, M.boxLarge, 17, -14, { width: 1.7, rotY: -0.2, solid: true });
  prop(scene, walls, M.barrel, 13, -18, { width: 1.15, solid: true });
  prop(scene, walls, M.boxOpen, 16, -19, { width: 1.5, rotY: 0.3, solid: true });
  // 中路房子前后
  prop(scene, walls, M.box, 0, 7, { width: 1.4, rotY: 0.3, solid: true });
  prop(scene, walls, M.barrel, -1.5, -7, { width: 1.1, solid: true });
  prop(scene, walls, M.chest, 1.5, -7, { width: 1.3, rotY: 0.4, solid: true });
  // 横巷里的掩体（连接三条街的地方）
  prop(scene, walls, M.boxLarge, -6, -8.5, { width: 1.6, rotY: 0.5, solid: true });
  prop(scene, walls, M.box, 6, -8.5, { width: 1.4, rotY: -0.4, solid: true });
  // 攻方出生口的掩体
  prop(scene, walls, M.barrel, -22, 20, { width: 1.15, solid: true });
  prop(scene, walls, M.box, 22, 20, { width: 1.4, rotY: 0.3, solid: true });
  prop(scene, walls, M.boxLarge, 0, 21, { width: 1.7, rotY: 0.2, solid: true });

  // ── 让小镇活起来：街边/院里/角落 的棕榈、仙人掌、市集帐篷、石头、灌木（贴地、不挡主路）──
  const palms = [M.palmTall, M.palmShort, M.palmBend];
  for (const [x, z] of [[-23, 8], [23, 8], [-23, -3], [23, -3], [-23, 30], [23, 30], [-7, 18], [7, 18]] as [number, number][]) {
    prop(scene, walls, pick(palms), x, z, { width: rrange(2.6, 3.2), rotY: rrange(0, 6.28), collide: { hx: 0.3, hz: 0.3 } });
  }
  const cacti = [M.cactusTall, M.cactusShort];
  for (const [x, z] of [[-24, 14], [24, 14], [-24, -10], [24, -10], [-5, 28], [5, 28], [-24, 25], [24, 25]] as [number, number][]) {
    prop(scene, walls, pick(cacti), x, z, { width: rrange(1.0, 1.4), rotY: rrange(0, 6.28), collide: { hx: 0.35, hz: 0.35 } });
  }
  const rocks = [M.rockA, M.rockB, M.rockC];
  for (const [x, z] of [[-24, 3], [24, 3], [-24, -20], [24, -20], [-22, -32], [22, -32], [0, 32], [-9, 30], [9, 30]] as [number, number][]) {
    prop(scene, walls, pick(rocks), x, z, { width: rrange(1.5, 2.4), rotY: rrange(0, 6.28), solid: true });
  }
  const bushes = [M.bush, M.bushS];
  for (const [x, z] of [[-22, 12], [22, 12], [-22, -6], [22, -6], [-6, 24], [6, 24], [-18, 8], [18, 8], [-24, 32], [24, 32]] as [number, number][]) {
    prop(scene, walls, pick(bushes), x, z, { width: rrange(0.9, 1.5), rotY: rrange(0, 6.28) });
  }
  // 市集帐篷（攻方出生外的小集市，做气氛）
  prop(scene, walls, M.tent, -8, 28, { width: 3.0, rotY: 0.3, solid: true });
  prop(scene, walls, M.tentCanvas, 8, 28, { width: 3.0, rotY: -0.3, solid: true });
  // 路牌（指路，攻方出生口）
  prop(scene, walls, M.signpost, 3, 24, { width: 0.9, rotY: 2.2, collide: { hx: 0.25, hz: 0.25 } });

  // 出生光幕：攻方(南 z=24) / 守方(北 z=-24)
  const barriers = [makeBarrier(scene, 24), makeBarrier(scene, -24)];

  return { walls, barriers, attackerSpawn: vec3(0, 0.9, 31) };
}
