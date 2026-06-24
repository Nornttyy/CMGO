import * as THREE from 'three';
import { Box } from '../physics/aabb';
import { Vec3, vec3 } from '../core/vec3';
import { GRID as DEFAULT_GRID } from './mapGrid';

export const MAP_STORAGE_KEY = 'cmgo_map_v1';
// 优先读"你在编辑器里做的地图"（存在浏览器里），没有就用默认起手图
function loadGrid(): string {
  try {
    const s = localStorage.getItem(MAP_STORAGE_KEY);
    if (s && s.trim().length > 0) return s;
  } catch { /* localStorage 不可用就用默认 */ }
  return DEFAULT_GRID;
}

export interface Barrier { mesh: THREE.Mesh; box: Box; }
export interface MapData {
  walls: Box[];                 // 静态碰撞体
  barriers: Barrier[];          // 出生光幕（会落下）——格子地图先不用
  attackerSpawn: Vec3;
}

// 沙漠小镇配色
const SAND = 0xd8c08a;
const ADOBE = 0xc8a366;   // 墙
const ADOBE2 = 0xe0c699;  // 房子墙
const ROOFC = 0x9c6b3f;   // 房顶
const WOOD = 0xb07a44;    // 箱子

const TILE = 5;     // 一个格子 = 5 米
const WALL_H = 5;   // 墙高

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

// 只画一块装饰（不挡路，如房顶、地标）
function deco(scene: THREE.Scene, cx: number, cy: number, cz: number,
             sx: number, sy: number, sz: number, color: number, opacity = 1): void {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, transparent: opacity < 1, opacity }),
  );
  mesh.position.set(cx, cy, cz);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
}

function inSet(ch: string, set: string): boolean { return set.indexOf(ch) >= 0; }

// 读 mapGrid.ts 里的字母格子，变成 3D 地图
export function buildDesertMap(scene: THREE.Scene): MapData {
  const walls: Box[] = [];

  // 把格子拆成一行行，去掉空行与行尾空格
  const rows = loadGrid().split('\n').map((r) => r.replace(/\s+$/, '')).filter((r) => r.length > 0);
  const H = rows.length || 1;
  const W = Math.max(1, ...rows.map((r) => r.length));
  // 让整张图以 (0,0) 为中心
  const ox = -((W - 1) * TILE) / 2;
  const oz = -((H - 1) * TILE) / 2;

  // 地面（铺满整张格子，四边各多留一格当余量）
  box(scene, walls, 0, -0.5, 0, (W + 2) * TILE, 1, (H + 2) * TILE, SAND, true);

  let spawn = vec3(0, 0.9, oz + (H - 2) * TILE); // 默认出生点：最下面中间

  for (let r = 0; r < H; r++) {
    const line = rows[r];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      const x = ox + c * TILE;
      const z = oz + r * TILE;

      if (inSet(ch, '#▩')) {
        box(scene, walls, x, WALL_H / 2, z, TILE, WALL_H, TILE, ADOBE);
      } else if (inSet(ch, 'Xx口箱')) {
        box(scene, walls, x, 0.85, z, 2, 1.7, 2, WOOD);
      } else if (inSet(ch, 'Hh房')) {
        box(scene, walls, x, 2.6, z, TILE * 0.98, 5.2, TILE * 0.98, ADOBE2);          // 楼体
        deco(scene, x, 5.45, z, TILE * 1.04, 0.5, TILE * 1.04, ROOFC);                 // 房顶
      } else if (ch === 'A' || ch === 'B') {
        deco(scene, x, 0.06, z, TILE * 0.9, 0.1, TILE * 0.9, ch === 'A' ? 0xff5630 : 0x36c5f0, 0.55); // 包点地标
      } else if (inSet(ch, 'Ss生')) {
        spawn = vec3(x, 0.9, z);
      }
      // '.' 或空格 = 空地，什么都不放
    }
  }

  return { walls, barriers: [], attackerSpawn: spawn };
}
