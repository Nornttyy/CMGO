import * as THREE from 'three';
import { Box } from '../physics/aabb';
import { Vec3, vec3 } from '../core/vec3';

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
const WOOD = 0x9c6b3f;

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

// 包点地面标记（薄薄一片，半透明彩色）
function patch(scene: THREE.Scene, cx: number, cz: number, size: number, color: number): void {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, 0.06, size),
    new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.5 }),
  );
  mesh.position.set(cx, 0.05, cz);
  mesh.receiveShadow = true;
  scene.add(mesh);
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
  scene.add(mesh);
  return {
    mesh,
    box: { min: vec3(-sx / 2, 0, cz - sz / 2), max: vec3(sx / 2, sy, cz + sz / 2) },
  };
}

export function buildDesertMap(scene: THREE.Scene): MapData {
  const walls: Box[] = [];

  // 沙地
  box(scene, walls, 0, -0.5, 0, 54, 1, 74, SAND, true);

  // 四周围墙
  box(scene, walls, 0, 3, -36, 54, 6, 1, ADOBE);  // 北
  box(scene, walls, 0, 3, 36, 54, 6, 1, ADOBE);   // 南
  box(scene, walls, -27, 3, 0, 1, 6, 74, ADOBE);  // 西
  box(scene, walls, 27, 3, 0, 1, 6, 74, ADOBE);   // 东

  // 中路小房子 + 箱子
  box(scene, walls, 0, 2, 0, 8, 4, 8, ADOBE2);
  box(scene, walls, 0, 0.7, 7, 1.6, 1.4, 1.6, WOOD);
  box(scene, walls, -3, 0.7, 8, 1.6, 1.4, 1.6, WOOD);
  box(scene, walls, 0, 0.7, -7, 1.6, 1.4, 1.6, WOOD);

  // 车道分隔墙（南半部，把左/中/右分开；北边留缺口可绕后）
  box(scene, walls, -10, 2, 12, 1, 4, 16, ADOBE);
  box(scene, walls, 10, 2, 12, 1, 4, 16, ADOBE);

  // A / B 包点（左右对称：side=-1 → A 在西，side=1 → B 在东）
  for (const side of [-1, 1]) {
    const x = 17 * side;
    box(scene, walls, x, 2.5, -20, 12, 5, 8, ADOBE2);          // 包点旁的建筑
    box(scene, walls, x - 5 * side, 0.7, -13, 1.8, 1.4, 1.8, WOOD); // 箱子掩体
    box(scene, walls, x + 4 * side, 0.7, -16, 1.8, 1.4, 1.8, WOOD);
    box(scene, walls, x, 0.7, -11, 2, 1.4, 2, WOOD);
    patch(scene, x, -14, 6, side < 0 ? 0xff5630 : 0x36c5f0);   // A 红 / B 蓝
  }

  // 出生光幕：攻方(南 z=24) / 守方(北 z=-24)
  const barriers = [makeBarrier(scene, 24), makeBarrier(scene, -24)];

  return { walls, barriers, attackerSpawn: vec3(0, 0.9, 30) };
}
