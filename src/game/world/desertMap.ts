import * as THREE from 'three';
import { Box, overlaps } from '../physics/aabb';
import { Vec3, vec3 } from '../core/vec3';
import { placeOnGround, modelSize } from './modelLoader';

export interface Barrier { mesh: THREE.Mesh; box: Box; }
export interface MapData {
  walls: Box[];
  barriers: Barrier[];
  attackerSpawn: Vec3;
}

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
  ptower: 'models/kenney/pirate/tower-complete-small.glb',
  ptowerL: 'models/kenney/pirate/tower-complete-large.glb',
  ptowerDoor: 'models/kenney/pirate/tower-base-door.glb',
  pstruct: 'models/kenney/pirate/structure.glb',
  pwall: 'models/kenney/pirate/castle-wall.glb',
  proof: 'models/kenney/pirate/structure-roof.glb',
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
const DOORW = 3.6;
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
  for (const dx of [-sx * 0.28, sx * 0.28]) deco(scene, cx + dx, h * 0.55, cz + sz / 2 + 0.06, 1.0, 1.0, 0.06, WINDOW);
}
function patch(scene: THREE.Scene, cx: number, cz: number, size: number, color: number): void {
  const mat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.5, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, 0.08, size), mat);
  mesh.position.set(cx, 0.06, cz);
  mesh.receiveShadow = true;
  scene.add(mesh);
}
interface PropOpts { width?: number; scale?: number; rotY?: number; solid?: boolean; collide?: { hx: number; hz: number }; tint?: number; }
function prop(scene: THREE.Scene, walls: Box[], url: string, x: number, z: number, o: PropOpts = {}): void {
  try {
    let scale = o.scale ?? 1;
    if (o.width != null) scale = o.width / (modelSize(url, 1).x || 1);
    const p = placeOnGround(url, x, z, { rotY: o.rotY, scale, solid: o.solid, collide: o.collide, tint: o.tint });
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

// 封闭式沙漠小镇（学 Dust2 走法、我们自己的样子）。南=攻方(T) 北=守方(CT)，东=A 西=B。
// 三条路：东"长街"(→A) / 中路(中门→连接带→两边) / 西"窄巷"(弯绕→B)。中间夹楼+横巷做包抄。
export function buildDesertMap(scene: THREE.Scene): MapData {
  _seed = 12345;
  const w: Box[] = [];

  box(scene, w, 0, -0.5, 0, 54, 1, 74, SAND, true); // 沙地
  box(scene, w, 0, 3.5, -36, 54, 7, 1, PERIM);
  box(scene, w, 0, 3.5, 36, 54, 7, 1, PERIM);
  box(scene, w, -27, 3.5, 0, 1, 7, 74, PERIM);
  box(scene, w, 27, 3.5, 0, 1, 7, 74, PERIM);

  // —— 中路两侧夹楼（东 AM / 西 BM）：留出窄中路 x[-2,2]，各开一条横巷(z[6,12])做包抄 ——
  solid(scene, w, 10, 2, 16, 8, 4.5, ADOBE_D);   // AM-南
  solid(scene, w, 10, 16, 16, 8, 5.0, ADOBE_B);  // AM-北
  solid(scene, w, -10, 2, 16, 8, 4.5, ADOBE_D);  // BM-南
  solid(scene, w, -10, 16, 16, 8, 5.0, ADOBE_B); // BM-北

  // —— 中门（中路关口）+ 中路掩体(xbox) ——
  wallX(scene, w, 0, 14, 4, 3.6, ADOBE_C, true);

  // —— A 包点（东北）：南/西/北 三口 ——
  room(scene, w, 15, -14, 14, 10, 3.2, { s: true, w: true, n: true }, ADOBE_A);
  patch(scene, 15, -14, 6, 0xff5630);
  // —— B 包点（西北）：南/东/北 三口 ——
  room(scene, w, -15, -14, 14, 10, 3.2, { s: true, e: true, n: true }, ADOBE_A);
  patch(scene, -15, -14, 6, 0x36c5f0);

  // —— 守方中央楼（隔 A/B、快速换防）——
  solid(scene, w, 0, -22, 9, 6, 4.0, ADOBE_C);

  // —— A 长街尽头"长拐"：一段横墙让长街不直通，要拐 ——
  seg(scene, w, 20.5, -1, 6, 0.6, 3.2, ADOBE_D);
  // —— B 窄巷"弯绕"：纵墙收窄 + 横墙逼着拐（更像地道）——
  seg(scene, w, -22, 10, 0.6, 16, 3.5, ADOBE_D);
  seg(scene, w, -24, 1, 5, 0.6, 3.5, ADOBE_D);

  // ── 掩体（矮箱/桶）：包点 / 连接带 / 长街 / 窄巷 / 横巷 / 中路 / 出生 ──
  prop(scene, w, M.box, 0, 9, { width: 1.4, rotY: 0.3, solid: true });        // 中路 xbox
  // A 包点
  prop(scene, w, M.boxLarge, 17, -12, { width: 1.7, rotY: 0.2, solid: true });
  prop(scene, w, M.barrel, 12, -16, { width: 1.15, solid: true });
  prop(scene, w, M.boxOpen, 16, -17, { width: 1.5, rotY: -0.3, solid: true });
  // B 包点
  prop(scene, w, M.boxLarge, -17, -12, { width: 1.7, rotY: -0.2, solid: true });
  prop(scene, w, M.barrel, -12, -16, { width: 1.15, solid: true });
  prop(scene, w, M.boxOpen, -16, -17, { width: 1.5, rotY: 0.3, solid: true });
  // 连接带（mid ↔ A/B）
  prop(scene, w, M.chest, 6, -6, { width: 1.3, rotY: 0.4, solid: true });
  prop(scene, w, M.chest, -6, -6, { width: 1.3, rotY: -0.4, solid: true });
  prop(scene, w, M.barrel, 0, -6, { width: 1.1, solid: true });
  // A 长街
  prop(scene, w, M.boxLarge, 23, 12, { width: 1.5, rotY: 0.3, solid: true });
  prop(scene, w, M.barrel, 24, -5, { width: 1.15, solid: true });
  // B 窄巷
  prop(scene, w, M.box, -24, 16, { width: 1.3, rotY: 0.4, solid: true });
  // 横巷（包抄路）
  prop(scene, w, M.box, 9, 9, { width: 1.3, rotY: 0.5, solid: true });
  prop(scene, w, M.box, -9, 9, { width: 1.3, rotY: -0.5, solid: true });
  // 攻方出生口
  prop(scene, w, M.boxLarge, 0, 22, { width: 1.7, rotY: 0.2, solid: true });

  // ── 植被 + 市集（放边角和出生区，不挡路）──
  const palms = [M.palmTall, M.palmShort, M.palmBend];
  for (const [x, z] of [[-24, 31], [24, 31], [-24, -31], [24, -31], [-8, 30], [8, 30]] as [number, number][])
    prop(scene, w, pick(palms), x, z, { width: rrange(2.6, 3.1), rotY: rrange(0, 6.28), collide: { hx: 0.3, hz: 0.3 } });
  const cacti = [M.cactusTall, M.cactusShort];
  for (const [x, z] of [[-24, 22], [24, 22], [-10, 31], [10, 31], [-24, -27], [24, -27]] as [number, number][])
    prop(scene, w, pick(cacti), x, z, { width: rrange(1.0, 1.3), rotY: rrange(0, 6.28), collide: { hx: 0.35, hz: 0.35 } });
  const rocks = [M.rockA, M.rockB, M.rockC];
  for (const [x, z] of [[-24, 27], [24, 27], [-22, -33], [22, -33], [0, 33]] as [number, number][])
    prop(scene, w, pick(rocks), x, z, { width: rrange(1.5, 2.2), rotY: rrange(0, 6.28), solid: true });
  const bushes = [M.bush, M.bushS];
  for (const [x, z] of [[-6, 31], [6, 31], [-24, 18], [24, 18], [-23, -29], [23, -29]] as [number, number][])
    prop(scene, w, pick(bushes), x, z, { width: rrange(0.9, 1.4), rotY: rrange(0, 6.28) });
  prop(scene, w, M.tent, -8, 28, { width: 3.0, rotY: 0.3, solid: true });
  prop(scene, w, M.tentCanvas, 8, 28, { width: 3.0, rotY: -0.3, solid: true });
  prop(scene, w, M.signpost, 2, 24, { width: 0.9, rotY: 2.2, collide: { hx: 0.25, hz: 0.25 } });

  // —— 沙岩角楼：建筑角上立真模型塔楼（装饰，碰撞靠墙体），把"方盒子"变"堡垒" ——
  const towerC = ADOBE_C;
  // A 包点四角
  for (const [tx, tz] of [[8, -9], [22, -9], [8, -19], [22, -19]] as [number, number][])
    prop(scene, w, M.ptower, tx, tz, { scale: 1.5, tint: towerC, rotY: rrange(0, 6.28) });
  // B 包点四角
  for (const [tx, tz] of [[-8, -9], [-22, -9], [-8, -19], [-22, -19]] as [number, number][])
    prop(scene, w, M.ptower, tx, tz, { scale: 1.5, tint: towerC, rotY: rrange(0, 6.28) });
  // 中路四楼的外角 + 南楼外角（点缀，不挡路）
  for (const [tx, tz] of [[18, 6], [18, 20], [-18, 6], [-18, 20], [18, -2], [-18, -2]] as [number, number][])
    prop(scene, w, M.ptower, tx, tz, { scale: 1.4, tint: ADOBE_B, rotY: rrange(0, 6.28) });
  // 地图四角的大角楼（实心地标）
  for (const [tx, tz] of [[-24, 33], [24, 33], [-24, -33], [24, -33]] as [number, number][])
    prop(scene, w, M.ptowerL, tx, tz, { scale: 1.9, solid: true, tint: towerC, rotY: rrange(0, 6.28) });
  // 攻方出生口城门
  prop(scene, w, M.ptowerDoor, 0, 33, { scale: 2.0, tint: ADOBE_B });

  const barriers = [makeBarrier(scene, 24), makeBarrier(scene, -24)];
  return { walls: w, barriers, attackerSpawn: vec3(0, 0.9, 31) };
}
