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

// 沙漠小镇配色
const SAND = 0xd8c08a;
const ADOBE = 0xc8a366;
const ADOBE2 = 0xe0c699;
const ADOBE_DARK = 0x9c7b46;

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

// 带碰撞的实心方块（墙/建筑主体）
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

// 纯装饰方块（不加碰撞）——屋顶、门窗、裙边等
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

// 精致一点的土墙建筑：主体(带碰撞) + 略外挑平屋顶 + 底部裙边 + 门 + 两扇窗
function building(scene: THREE.Scene, walls: Box[], cx: number, cy: number, cz: number,
                  sx: number, sy: number, sz: number, color: number): void {
  box(scene, walls, cx, cy, cz, sx, sy, sz, color);                    // 主体 + 碰撞
  const top = cy + sy / 2;
  deco(scene, cx, top + 0.2, cz, sx + 0.7, 0.5, sz + 0.7, ADOBE_DARK); // 平屋顶（外挑）
  deco(scene, cx, cy - sy / 2 + 0.35, cz, sx + 0.14, 0.7, sz + 0.14, ADOBE_DARK); // 底部裙边
  // 门（朝南 +z 面，深色凹门）
  deco(scene, cx, 1.0, cz + sz / 2 + 0.03, Math.min(1.5, sx * 0.28), 2.0, 0.08, 0x5b4326);
  // 两扇窗（南面两侧，偏青色玻璃）
  for (const dx of [-sx * 0.3, sx * 0.3]) {
    deco(scene, cx + dx, cy + 0.4, cz + sz / 2 + 0.03, 1.0, 1.0, 0.08, 0x7fb0c0);
  }
}

// 包点地面标记（薄片，半透明彩色）——垫高一点 + polygonOffset，避免和地面闪烁
function patch(scene: THREE.Scene, cx: number, cz: number, size: number, color: number): void {
  const mat = new THREE.MeshStandardMaterial({
    color, transparent: true, opacity: 0.55, roughness: 0.8,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, 0.08, size), mat);
  mesh.position.set(cx, 0.06, cz);
  mesh.receiveShadow = true;
  scene.add(mesh);
}

interface PropOpts {
  width?: number;     // 目标宽度（米），自动算缩放
  scale?: number;     // 或直接给缩放
  rotY?: number;
  solid?: boolean;    // 用包围盒做碰撞
  collide?: { hx: number; hz: number }; // 或自定义碰撞半尺寸（如树只挡树干）
}

// 放一个 Kenney 模型：贴地 + 配碰撞（防穿模），并做"插墙就跳过"的安全检查
function prop(scene: THREE.Scene, walls: Box[], url: string, x: number, z: number, o: PropOpts = {}): void {
  try {
    let scale = o.scale ?? 1;
    if (o.width != null) {
      const natX = modelSize(url, 1).x || 1;
      scale = o.width / natX;
    }
    const p = placeOnGround(url, x, z, { rotY: o.rotY, scale, solid: o.solid, collide: o.collide });
    if (p.box) {
      if (walls.some((w) => overlaps(p.box as Box, w))) {
        console.warn('跳过会重叠/插墙的模型：', url, x, z);
        return; // 防穿模：宁可不放，也不穿
      }
      walls.push(p.box);
    }
    scene.add(p.group);
  } catch (e) {
    console.warn('放置模型失败，跳过：', url, e);
  }
}

export function buildDesertMap(scene: THREE.Scene): MapData {
  _seed = 12345;
  const walls: Box[] = [];

  // 沙地
  box(scene, walls, 0, -0.5, 0, 54, 1, 74, SAND, true);

  // 四周围墙
  box(scene, walls, 0, 3, -36, 54, 6, 1, ADOBE);  // 北
  box(scene, walls, 0, 3, 36, 54, 6, 1, ADOBE);   // 南
  box(scene, walls, -27, 3, 0, 1, 6, 74, ADOBE);  // 西
  box(scene, walls, 27, 3, 0, 1, 6, 74, ADOBE);   // 东

  // 中路小房子（精致建筑）
  building(scene, walls, 0, 2, 0, 8, 4, 8, ADOBE2);
  // 中路掩体（木箱/油桶模型）
  prop(scene, walls, M.boxLarge, 0, 7, { width: 1.7, rotY: 0.2, solid: true });
  prop(scene, walls, M.barrel, -3, 8, { width: 1.05, solid: true });
  prop(scene, walls, M.box, 0, -7, { width: 1.5, rotY: -0.3, solid: true });

  // 车道分隔墙（南半部，把左/中/右分开；北边留缺口可绕后）
  box(scene, walls, -10, 2, 12, 1, 4, 16, ADOBE);
  box(scene, walls, 10, 2, 12, 1, 4, 16, ADOBE);

  // A / B 包点（左右对称：side=-1 → A 在西，side=1 → B 在东）
  for (const side of [-1, 1]) {
    const x = 17 * side;
    building(scene, walls, x, 2.5, -20, 12, 5, 8, ADOBE2);             // 包点旁的建筑
    prop(scene, walls, M.boxLarge, x - 5 * side, -13, { width: 1.8, rotY: 0.3, solid: true }); // 箱子掩体
    prop(scene, walls, M.barrel, x + 4 * side, -15, { width: 1.15, solid: true });
    prop(scene, walls, M.boxOpen, x, -11, { width: 1.9, rotY: -0.2, solid: true });
    patch(scene, x, -14, 6, side < 0 ? 0xff5630 : 0x36c5f0);          // A 红 / B 蓝
  }

  // ── 装饰：棕榈、仙人掌、沙石、灌木、帐篷、路牌（贴地、避开主路、实心物配碰撞）──
  const palms = [M.palmTall, M.palmShort, M.palmBend];
  for (const [x, z] of [[-24, 32], [24, 32], [-24, -31], [24, -31], [-22, 26], [22, 26], [24, -26], [-24, -26]] as [number, number][]) {
    prop(scene, walls, pick(palms), x, z, { width: rrange(2.6, 3.3), rotY: rrange(0, 6.28), collide: { hx: 0.3, hz: 0.3 } });
  }

  const cacti = [M.cactusTall, M.cactusShort];
  for (const [x, z] of [[-24, 2], [24, -4], [-19, -31], [19, -31], [-24, -18], [24, 16], [-24, 22]] as [number, number][]) {
    prop(scene, walls, pick(cacti), x, z, { width: rrange(1.0, 1.4), rotY: rrange(0, 6.28), collide: { hx: 0.35, hz: 0.35 } });
  }

  const rocks = [M.rockA, M.rockB, M.rockC];
  for (const [x, z] of [[-24, -8], [24, -10], [-14, 33], [14, 33], [-24, 12], [24, 26], [8, -32], [-8, -32], [-23, -28], [20, -29]] as [number, number][]) {
    prop(scene, walls, pick(rocks), x, z, { width: rrange(1.6, 2.6), rotY: rrange(0, 6.28), solid: true });
  }

  const bushes = [M.bush, M.bushS];
  for (const [x, z] of [[-22, 30], [22, 30], [-23, 0], [23, 4], [-16, -30], [16, -31], [-21, -23], [21, -23], [-12, 33], [12, 33]] as [number, number][]) {
    prop(scene, walls, pick(bushes), x, z, { width: rrange(1.0, 1.6), rotY: rrange(0, 6.28) }); // 小灌木不挡道、无碰撞
  }

  // 市集帐篷（侧路边，做气氛，实心）
  prop(scene, walls, M.tent, -13, 4, { width: 3.2, rotY: 0.3, solid: true });
  prop(scene, walls, M.tentCanvas, 13, 4, { width: 3.0, rotY: -0.3, solid: true });

  // 路牌（中路两个，实心细柱）
  prop(scene, walls, M.signpost, 3, 14, { width: 0.9, rotY: 2.4, collide: { hx: 0.25, hz: 0.25 } });
  prop(scene, walls, M.signpost, -3, 20, { width: 0.9, rotY: -1.8, collide: { hx: 0.25, hz: 0.25 } });

  // 出生光幕：攻方(南 z=24) / 守方(北 z=-24)
  const barriers = [makeBarrier(scene, 24), makeBarrier(scene, -24)];

  return { walls, barriers, attackerSpawn: vec3(0, 0.9, 30) };
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
  mesh.visible = false; // 菜单时不显示；开局准备阶段 raiseBarriers 才亮起
  scene.add(mesh);
  return {
    mesh,
    box: { min: vec3(-sx / 2, 0, cz - sz / 2), max: vec3(sx / 2, sy, cz + sz / 2) },
  };
}
