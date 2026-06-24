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

// Kenney 模型（道具 + 植被）。City Kit 的真房子见 CITY/HOUSE。
const M = {
  box: 'models/kenney/survival/box.glb',
  boxLarge: 'models/kenney/survival/box-large.glb',
  boxOpen: 'models/kenney/survival/box-open.glb',
  barrel: 'models/kenney/survival/barrel.glb',
  chest: 'models/kenney/survival/chest.glb',
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
const HOUSE = 'abcdefghijklmnopqrstu'.split('').map((c) => `models/kenney/city/building-type-${c}.glb`);
export const MAP_MODELS = [...Object.values(M), ...HOUSE];

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
      if (walls.some((wl) => overlaps(p.box as Box, wl))) return;
      walls.push(p.box);
    }
    scene.add(p.group);
  } catch { /* 缺模型就跳过 */ }
}
function makeBarrier(scene: THREE.Scene, cz: number): Barrier {
  const sx = 78, sy = 4.5, sz = 0.3;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshStandardMaterial({ color: 0x4ad9ff, emissive: 0x2aa8d8, emissiveIntensity: 1.3, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
  mesh.position.set(0, sy / 2, cz);
  mesh.visible = false;
  scene.add(mesh);
  return { mesh, box: { min: vec3(-sx / 2, 0, cz - sz / 2), max: vec3(sx / 2, sy, cz + sz / 2) } };
}

// 一座更大的卡通小镇：一排排真房子夹出街道。南=攻方出生 北=守方出生；A(东北)/B(西北) 包点广场；中路。
export function buildDesertMap(scene: THREE.Scene): MapData {
  _seed = 12345;
  const w: Box[] = [];

  // 更大的沙地（78 × 100）+ 围墙
  box(scene, w, 0, -0.5, 0, 78, 1, 100, SAND, true);
  box(scene, w, 0, 3.5, -49, 78, 7, 1, PERIM); // 北
  box(scene, w, 0, 3.5, 49, 78, 7, 1, PERIM);  // 南
  box(scene, w, -39, 3.5, 0, 1, 7, 100, PERIM); // 西
  box(scene, w, 39, 3.5, 0, 1, 7, 100, PERIM);  // 东

  // —— 房子网格（房子夹出街道）。竖列跳过 x=0 留中街；中间一排留横街；东北/西北留 A/B 广场 ——
  let ti = 5;
  const house = (x: number, z: number): void => {
    prop(scene, w, HOUSE[ti++ % HOUSE.length], x, z, { scale: 4.6, rotY: rrange(0, 6.28), solid: true });
  };
  const cols = [-28, -14, 0, 14, 28];
  const rows = [28, 14, 0, -14, -28];
  for (const z of rows) for (const x of cols) {
    if (Math.abs(x) <= 2 && Math.abs(z) <= 2) continue;  // 中央广场
    if (z <= -14 && Math.abs(x) >= 22) continue;          // A/B 包点广场（东北/西北角）
    house(x, z);
  }

  // —— A 包点（东北广场）/ B 包点（西北广场）：地标 + 掩体 ——
  patch(scene, 28, -22, 9, 0xff5630);
  patch(scene, -28, -22, 9, 0x36c5f0);
  const cover: [number, number, string, number][] = [
    [28, -18, M.boxLarge, 1.7], [24, -26, M.barrel, 1.15], [31, -25, M.boxOpen, 1.5], // A
    [-28, -18, M.boxLarge, 1.7], [-24, -26, M.barrel, 1.15], [-31, -25, M.boxOpen, 1.5], // B
    [0, 8, M.box, 1.4], [0, -8, M.barrel, 1.1], [0, 20, M.boxLarge, 1.6],   // 中街
    [-6, 0, M.box, 1.4], [6, 0, M.chest, 1.3],                              // 中横街
    [0, 36, M.boxLarge, 1.7],                                              // 攻方出生口
  ];
  for (const [x, z, u, wd] of cover) prop(scene, w, u, x, z, { width: wd, rotY: rrange(0, 6.28), solid: true });

  // —— 植被 + 市集（街边/广场/出生区，不挡路）——
  const palms = [M.palmTall, M.palmShort, M.palmBend];
  for (const [x, z] of [[-36, 42], [36, 42], [-36, -44], [36, -44], [0, 44], [-20, -30], [20, -30], [-20, 20], [20, 20], [0, -32]] as [number, number][])
    prop(scene, w, pick(palms), x, z, { width: rrange(2.6, 3.2), rotY: rrange(0, 6.28), collide: { hx: 0.3, hz: 0.3 } });
  const cacti = [M.cactusTall, M.cactusShort];
  for (const [x, z] of [[-37, 30], [37, 30], [-37, -32], [37, -32], [-9, 42], [9, 42]] as [number, number][])
    prop(scene, w, pick(cacti), x, z, { width: rrange(1, 1.3), rotY: rrange(0, 6.28), collide: { hx: 0.35, hz: 0.35 } });
  const rocks = [M.rockA, M.rockB, M.rockC];
  for (const [x, z] of [[-37, 6], [37, 6], [-37, -14], [37, -14], [0, 45]] as [number, number][])
    prop(scene, w, pick(rocks), x, z, { width: rrange(1.5, 2.2), rotY: rrange(0, 6.28), solid: true });
  const bushes = [M.bush, M.bushS];
  for (const [x, z] of [[-7, 40], [7, 40], [-37, 18], [37, 18], [-37, -22], [37, -22], [-20, 30], [20, 30]] as [number, number][])
    prop(scene, w, pick(bushes), x, z, { width: rrange(0.9, 1.4), rotY: rrange(0, 6.28) });
  prop(scene, w, M.tent, -10, 40, { width: 3, rotY: 0.3, solid: true });
  prop(scene, w, M.tentCanvas, 10, 40, { width: 3, rotY: -0.3, solid: true });
  prop(scene, w, M.signpost, 3, 36, { width: 0.9, rotY: 2.2, collide: { hx: 0.25, hz: 0.25 } });

  // 出生光幕：攻方(南 z=34) / 守方(北 z=-34)
  const barriers = [makeBarrier(scene, 34), makeBarrier(scene, -34)];
  return { walls: w, barriers, attackerSpawn: vec3(0, 0.9, 42) };
}
