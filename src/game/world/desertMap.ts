import * as THREE from 'three';
import { Box } from '../physics/aabb';
import { Vec3, vec3 } from '../core/vec3';
import { loadObjects, footprint, MapObj } from './mapData';

export interface Barrier { mesh: THREE.Mesh; box: Box; }
export interface MapData {
  walls: Box[];                 // 静态碰撞体
  barriers: Barrier[];          // 出生光幕（准备阶段挡着，倒计时结束落下）
  attackerSpawn: Vec3;          // 匪家出生点（单人先用这个）
  defenderSpawn: Vec3;          // 警家出生点（留给以后的队伍/AI）
}

// 沙漠小镇配色
const SAND = 0xd8c08a;
const ADOBE = 0xc8a366;   // 墙
const ADOBE2 = 0xe0c699;  // 房子墙
const ROOFC = 0x9c6b3f;   // 房顶
const WOOD = 0xb07a44;    // 箱子

function mat(color: number, opacity = 1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.92, transparent: opacity < 1, opacity });
}

// 一个实心方块（按大小+朝向），加贴合的碰撞盒
function solid(scene: THREE.Scene, walls: Box[], o: MapObj, color: number): void {
  const m = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), mat(color));
  m.position.set(o.x, o.h / 2, o.z); m.rotation.y = o.ry;
  m.castShadow = true; m.receiveShadow = true; scene.add(m);
  const fp = footprint(o);
  walls.push({ min: vec3(o.x - fp.hw, 0, o.z - fp.hd), max: vec3(o.x + fp.hw, o.h, o.z + fp.hd) });
}

function makeBarrier(scene: THREE.Scene, o: MapObj): Barrier {
  // 用单片平面（不是盒子）+ 几乎不透明 —— 避免前后两层透明面叠加出的穿模重影
  const m = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h),
    new THREE.MeshStandardMaterial({ color: 0x4ad9ff, emissive: 0x2aa8d8, emissiveIntensity: 1.3,
      transparent: true, opacity: 0.92, side: THREE.DoubleSide }));
  m.position.set(o.x, o.h / 2, o.z); m.rotation.y = o.ry; scene.add(m);
  const fp = footprint(o);
  return { mesh: m, box: { min: vec3(o.x - fp.hw, 0, o.z - fp.hd), max: vec3(o.x + fp.hw, o.h, o.z + fp.hd) } };
}

export function buildDesertMap(scene: THREE.Scene): MapData {
  const walls: Box[] = [];
  const barriers: Barrier[] = [];
  const objs = loadObjects();

  let attackerSpawn = vec3(0, 0.9, 24);
  let defenderSpawn = vec3(0, 0.9, -24);
  let hasT = false, hasC = false;

  // 算出地图范围，铺地面 + 四周隐形边界（防掉出去）
  let minX = -20, maxX = 20, minZ = -20, maxZ = 20;
  for (const o of objs) { minX = Math.min(minX, o.x); maxX = Math.max(maxX, o.x); minZ = Math.min(minZ, o.z); maxZ = Math.max(maxZ, o.z); }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const gw = (maxX - minX) + 40, gd = (maxZ - minZ) + 40;
  const ground = new THREE.Mesh(new THREE.BoxGeometry(gw, 1, gd), mat(SAND));
  ground.position.set(cx, -0.5, cz); ground.receiveShadow = true; scene.add(ground);
  walls.push({ min: vec3(cx - gw / 2, -1, cz - gd / 2), max: vec3(cx + gw / 2, 0, cz + gd / 2) });
  // 隐形边界墙（只挡人，不显示）
  const bound = (bx: number, bz: number, bw: number, bd: number): void => {
    walls.push({ min: vec3(bx - bw / 2, 0, bz - bd / 2), max: vec3(bx + bw / 2, 16, bz + bd / 2) });
  };
  bound(cx, cz - gd / 2, gw, 1); bound(cx, cz + gd / 2, gw, 1);
  bound(cx - gw / 2, cz, 1, gd); bound(cx + gw / 2, cz, 1, gd);

  for (const o of objs) {
    if (o.t === 'wall') solid(scene, walls, o, ADOBE);
    else if (o.t === 'box') solid(scene, walls, o, WOOD);
    else if (o.t === 'house') {
      solid(scene, walls, o, ADOBE2);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.6, 0.5, o.d + 0.6), mat(ROOFC));
      roof.position.set(o.x, o.h + 0.25, o.z); roof.rotation.y = o.ry; roof.castShadow = true; scene.add(roof);
    } else if (o.t === 'barrier') {
      barriers.push(makeBarrier(scene, o));
    } else if (o.t === 'A' || o.t === 'B') {
      /* 包点：游戏里不显示颜色（和普通地面一样），只作为"能下包"的位置 —— 下包玩法以后做 */
    } else if (o.t === 'spawnT') { attackerSpawn = vec3(o.x, 0.9, o.z); hasT = true; }
    else if (o.t === 'spawnC') { defenderSpawn = vec3(o.x, 0.9, o.z); hasC = true; }
  }
  if (!hasC && hasT) defenderSpawn = attackerSpawn;
  if (!hasT && hasC) attackerSpawn = defenderSpawn;

  return { walls, barriers, attackerSpawn, defenderSpawn };
}
