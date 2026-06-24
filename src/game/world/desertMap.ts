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

// 沙漠小镇配色（几种土墙色，做出层次）
const SAND = 0xd8c08a;
const PERIM = 0xb89a64;
const ADOBE_A = 0xe0c699;
const ADOBE_B = 0xcaa367;
const ADOBE_C = 0xd8b483;
const ADOBE_D = 0xbf9a5f;
const ROOF = 0x8a6a3e;
const WINDOW = 0x6f97a6;

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

let _seed = 12345;
function rnd(): number { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function rrange(a: number, b: number): number { return a + rnd() * (b - a); }
function pick<T>(arr: T[]): T { return arr[Math.floor(rnd() * arr.length) % arr.length]; }

function box(scene: THREE.Scene, walls: Box[], cx: number, cy: number, cz: number,
            sx: number, sy: number, sz: number, color: number, receive = false): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshStandardMaterial({ color, roughness: 0.92 }));
  mesh.position.set(cx, cy, cz);
  mesh.castShadow = true; mesh.receiveShadow = receive;
  scene.add(mesh);
  walls.push({ min: vec3(cx - sx / 2, cy - sy / 2, cz - sz / 2), max: vec3(cx + sx / 2, cy + sy / 2, cz + sz / 2) });
}
function seg(scene: THREE.Scene, walls: Box[], cx: number, cz: number, sx: number, sz: number, h: number, color: number): void {
  box(scene, walls, cx, h / 2, cz, sx, h, sz, color);
}
function deco(scene: THREE.Scene, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: number): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
  mesh.position.set(cx, cy, cz);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
}

const T = 0.6;
const DOORW = 3.4;
function wallX(scene: THREE.Scene, walls: Box[], cx: number, cz: number, sx: number, h: number, color: number, door: boolean): void {
  if (!door) { seg(scene, walls, cx, cz, sx, T, h, color); return; }
  const s = (sx - DOORW) / 2;
  if (s > 0.15) {
    seg(scene, walls, cx - (DOORW / 2 + s / 2), cz, s, T, h, color);
    seg(scene, walls, cx + (DOORW / 2 + s / 2), cz, s, T, h, color);
  }
  deco(scene, cx, h - 0.45, cz, DOORW, 0.9, T, color);
}
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
function room(scene: THREE.Scene, walls: Box[], cx: number, cz: number, sx: number, sz: number, h: number, doors: Doors, color: number): void {
  wallX(scene, walls, cx, cz - sz / 2, sx, h, color, !!doors.n);
  wallX(scene, walls, cx, cz + sz / 2, sx, h, color, !!doors.s);
  wallZ(scene, walls, cx - sx / 2, cz, sz, h, color, !!doors.w);
  wallZ(scene, walls, cx + sx / 2, cz, sz, h, color, !!doors.e);
}
function solid(scene: THREE.Scene, walls: Box[], cx: number, cz: number, sx: number, sz: number, h: number, color: number): void {
  seg(scene, walls, cx, cz, sx, sz, h, color);
  deco(scene, cx, h + 0.14, cz, sx + 0.5, 0.3, sz + 0.5, ROOF);
  for (const dx of [-sx * 0.26, sx * 0.26]) deco(scene, cx + dx, h * 0.55, cz + sz / 2 + 0.06, 1.0, 1.0, 0.06, WINDOW);
}
function patch(scene: THREE.Scene, cx: number, cz: number, size: number, color: number): void {
  const mat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.5, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, 0.08, size), mat);
  mesh.position.set(cx, 0.06, cz);
  mesh.receiveShadow = true;
  scene.add(mesh);
}
interface PropOpts { width?: number; scale?: number; rotY?: number; solid?: boolean; collide?: { hx: number; hz: number }; }
function prop(scene: THREE.Scene, walls: Box[], url: string, x: number, z: number, o: PropOpts = {}): void {
  try {
    let scale = o.scale ?? 1;
    if (o.width != null) scale = o.width / (modelSize(url, 1).x || 1);
    const p = placeOnGround(url, x, z, { rotY: o.rotY, scale, solid: o.solid, collide: o.collide });
    if (p.box) {
      if (walls.some((w) => overlaps(p.box as Box, w))) return;
      walls.push(p.box);
    }
    scene.add(p.group);
  } catch { /* 缺模型就跳过 */ }
}
function makeBarrier(scene: THREE.Scene, cz: number): Barrier {
  const sx = 54, sy = 4.5, sz = 0.3;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshStandardMaterial({ color: 0x4ad9ff, emissive: 0x2aa8d8, emissiveIntensity: 1.3, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
  mesh.position.set(0, sy / 2, cz);
  mesh.visible = false;
  scene.add(mesh);
  return { mesh, box: { min: vec3(-sx / 2, 0, cz - sz / 2), max: vec3(sx / 2, sy, cz + sz / 2) } };
}

// 沙漠小镇（学 Dust2 的"好玩骨架"，我们自己的样子）：
//   南=攻方出生 → 东"长街"(→A) / 中路(中门, 占了能拐 A 或 B) / 西"窄巷"(→B) → 北 A/B 包点 + 守方。
export function buildDesertMap(scene: THREE.Scene): MapData {
  _seed = 12345;
  const walls: Box[] = [];

  box(scene, walls, 0, -0.5, 0, 54, 1, 74, SAND, true); // 沙地
  box(scene, walls, 0, 3.5, -36, 54, 7, 1, PERIM);      // 北墙
  box(scene, walls, 0, 3.5, 36, 54, 7, 1, PERIM);       // 南墙
  box(scene, walls, -27, 3.5, 0, 1, 7, 74, PERIM);      // 西墙
  box(scene, walls, 27, 3.5, 0, 1, 7, 74, PERIM);       // 东墙

  // —— 南半：两栋大楼把出生口分成 西巷 / 中路 / 东长街 三股 ——
  solid(scene, walls, -10.5, 15, 12, 14, 5.0, ADOBE_D); // 西南楼
  solid(scene, walls, 10.5, 15, 12, 14, 5.0, ADOBE_D);  // 东南楼

  // —— 中路：中门（矮墙留洞当关口）+ 北段两侧夹楼 + 尽头可穿小屋 ——
  wallX(scene, walls, 0, 6, 10, 3.2, ADOBE_C, true);    // 中门
  solid(scene, walls, -10.5, -2, 12, 12, 4.5, ADOBE_B); // 中路西夹楼
  solid(scene, walls, 10.5, -2, 12, 12, 4.5, ADOBE_B);  // 中路东夹楼
  room(scene, walls, 0, -10, 9, 7, 3.0, { n: true, s: true, e: true, w: true }, ADOBE_C); // 中央小屋（连左右）

  // —— A 包点（东北，长街尽头）：南/西/北 三个口 ——
  room(scene, walls, 16, -17, 13, 10, 3.2, { s: true, w: true, n: true }, ADOBE_A);
  patch(scene, 16, -17, 6, 0xff5630);
  // —— B 包点（西北，窄巷尽头）：南/东/北 三个口 ——
  room(scene, walls, -16, -17, 13, 10, 3.2, { s: true, e: true, n: true }, ADOBE_A);
  patch(scene, -16, -17, 6, 0x36c5f0);

  // —— 守方一侧：中央楼隔开 A/B（守方掩体 + 快速换防）——
  solid(scene, walls, 0, -22, 9, 6, 4.0, ADOBE_C);
  // 守方出生区两侧的后场房（在出生线 z=-24 之后，不和包点重叠）
  solid(scene, walls, -17, -30, 6, 7, 4.0, ADOBE_B);
  solid(scene, walls, 17, -30, 6, 7, 4.0, ADOBE_B);

  // —— 西"窄巷"更挤：加一道矮掩体墙；东"长街"保持开阔长 ——
  seg(scene, walls, -20.5, 3, 0.6, 7, 2.4, ADOBE_D);

  // ── 掩体（矮箱/桶/木桶，放在包点、中门、长街、窄巷、横向连接处）──
  // A 包点内
  prop(scene, walls, M.boxLarge, 18, -15, { width: 1.7, rotY: 0.2, solid: true });
  prop(scene, walls, M.barrel, 14, -19, { width: 1.15, solid: true });
  prop(scene, walls, M.boxOpen, 16, -20, { width: 1.5, rotY: -0.3, solid: true });
  // B 包点内
  prop(scene, walls, M.boxLarge, -18, -15, { width: 1.7, rotY: -0.2, solid: true });
  prop(scene, walls, M.barrel, -14, -19, { width: 1.15, solid: true });
  prop(scene, walls, M.boxOpen, -16, -20, { width: 1.5, rotY: 0.3, solid: true });
  // 中门前后 + 中央小屋
  prop(scene, walls, M.box, 0, 10, { width: 1.4, rotY: 0.3, solid: true });
  prop(scene, walls, M.chest, 0, -6, { width: 1.3, rotY: 0.4, solid: true });
  // 横向连接（中路 ↔ A / B）的掩体
  prop(scene, walls, M.barrel, 6, -10, { width: 1.1, solid: true });
  prop(scene, walls, M.barrel, -6, -10, { width: 1.1, solid: true });
  // 东长街掩体
  prop(scene, walls, M.boxLarge, 22, 6, { width: 1.6, rotY: 0.3, solid: true });
  prop(scene, walls, M.box, 21, -4, { width: 1.4, rotY: -0.3, solid: true });
  // 西窄巷掩体
  prop(scene, walls, M.box, -22, 9, { width: 1.4, rotY: 0.4, solid: true });
  // 攻方出生口
  prop(scene, walls, M.boxLarge, 0, 22, { width: 1.7, rotY: 0.2, solid: true });

  // ── 让小镇活起来：植被/帐篷放在边角和出生区，不挡路 ──
  const palms = [M.palmTall, M.palmShort, M.palmBend];
  for (const [x, z] of [[-24, 30], [24, 30], [-24, -2], [24, -2], [-7, 30], [7, 30]] as [number, number][])
    prop(scene, walls, pick(palms), x, z, { width: rrange(2.6, 3.1), rotY: rrange(0, 6.28), collide: { hx: 0.3, hz: 0.3 } });
  const cacti = [M.cactusTall, M.cactusShort];
  for (const [x, z] of [[-24, 18], [24, 18], [-24, -24], [24, -24], [-24, 8], [24, 8]] as [number, number][])
    prop(scene, walls, pick(cacti), x, z, { width: rrange(1.0, 1.3), rotY: rrange(0, 6.28), collide: { hx: 0.35, hz: 0.35 } });
  const rocks = [M.rockA, M.rockB, M.rockC];
  for (const [x, z] of [[-24, 24], [24, 24], [-22, -32], [22, -32], [0, 32], [-24, -18], [24, -18]] as [number, number][])
    prop(scene, walls, pick(rocks), x, z, { width: rrange(1.5, 2.3), rotY: rrange(0, 6.28), solid: true });
  const bushes = [M.bush, M.bushS];
  for (const [x, z] of [[-23, 26], [23, 26], [-5, 31], [5, 31], [-24, 13], [24, 13], [-23, -28], [23, -28]] as [number, number][])
    prop(scene, walls, pick(bushes), x, z, { width: rrange(0.9, 1.4), rotY: rrange(0, 6.28) });
  prop(scene, walls, M.tent, -7, 27, { width: 3.0, rotY: 0.3, solid: true });
  prop(scene, walls, M.tentCanvas, 7, 27, { width: 3.0, rotY: -0.3, solid: true });
  prop(scene, walls, M.signpost, 2, 24, { width: 0.9, rotY: 2.2, collide: { hx: 0.25, hz: 0.25 } });

  const barriers = [makeBarrier(scene, 24), makeBarrier(scene, -24)];
  return { walls, barriers, attackerSpawn: vec3(0, 0.9, 31) };
}
