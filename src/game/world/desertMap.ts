import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Box } from '../physics/aabb';
import { Vec3, vec3 } from '../core/vec3';
import { loadObjects, footprint, MapObj } from './mapData';

export interface Barrier { mesh: THREE.Mesh; box: Box; tick?: (dt: number) => void; }
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

const AIR_TOP = 30; // 墙/楼上方隐形"空气墙"的高度，防止跳过去/爬上去越狱

// —— 几何合并：同色实心方块先攒进 batches，最后每色合成一个网格 ——
// 这样相邻的墙连成一片、没有一块一块的接缝，阴影也是整体的。
const batches = new Map<number, THREE.BufferGeometry[]>();
function bakeBox(color: number, x: number, y: number, z: number, w: number, h: number, d: number, ry: number): void {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  const arr = batches.get(color);
  if (arr) arr.push(g); else batches.set(color, [g]);
}
function flushBatches(scene: THREE.Scene): void {
  for (const [color, geos] of batches) {
    const merged = mergeGeometries(geos, false);
    const m = new THREE.Mesh(merged, mat(color));
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }
  batches.clear();
}

// 一个实心方块（按大小+朝向），加贴合的碰撞盒；airWall=true 时碰撞顶一直顶到很高
function solid(walls: Box[], o: MapObj, color: number, airWall = false): void {
  bakeBox(color, o.x, o.h / 2, o.z, o.w, o.h, o.d, o.ry);
  const fp = footprint(o);
  const top = airWall ? Math.max(o.h, AIR_TOP) : o.h; // 墙/楼：碰撞顶到 AIR_TOP，越不过去
  walls.push({ min: vec3(o.x - fp.hw, 0, o.z - fp.hd), max: vec3(o.x + fp.hw, top, o.z + fp.hd) });
}

const TILE = 5;
interface Rect { c0: number; r0: number; c1: number; r1: number; }
// 贪心把占用的格子合并成尽量大的矩形（消除相邻墙之间的接缝）
function greedyRects(cells: Set<string>): Rect[] {
  const rem = new Set(cells);
  const has = (c: number, r: number): boolean => rem.has(c + ',' + r);
  const sorted = [...cells].map((s) => s.split(',').map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const rects: Rect[] = [];
  for (const [c0, r0] of sorted) {
    if (!has(c0, r0)) continue;
    let c1 = c0;
    while (has(c1 + 1, r0)) c1++;          // 往右延伸
    let r1 = r0, ext = true;
    while (ext) {                          // 往下延伸（整行都占才行）
      for (let c = c0; c <= c1; c++) if (!has(c, r1 + 1)) { ext = false; break; }
      if (ext) r1++;
    }
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) rem.delete(c + ',' + r);
    rects.push({ c0, r0, c1, r1 });
  }
  return rects;
}

// 墙：标准格子墙按高度分组贪心合并成大矩形（连成一片）；非标准的(改过大小)单独处理
function buildWalls(walls: Box[], wallObjs: MapObj[]): void {
  const custom: MapObj[] = [];
  const byH = new Map<number, { h: number; cells: Set<string> }>();
  for (const o of wallObjs) {
    const onGrid = Math.abs(o.w - TILE) < 0.6 && Math.abs(o.d - TILE) < 0.6 &&
      Math.abs(o.x / TILE - Math.round(o.x / TILE)) < 0.05 &&
      Math.abs(o.z / TILE - Math.round(o.z / TILE)) < 0.05;
    if (!onGrid) { custom.push(o); continue; }
    const hk = Math.round(o.h * 100);
    let g = byH.get(hk);
    if (!g) { g = { h: o.h, cells: new Set() }; byH.set(hk, g); }
    g.cells.add(Math.round(o.x / TILE) + ',' + Math.round(o.z / TILE));
  }
  for (const { h, cells } of byH.values()) {
    for (const r of greedyRects(cells)) {
      const w = (r.c1 - r.c0 + 1) * TILE, d = (r.r1 - r.r0 + 1) * TILE;
      const cx = ((r.c0 + r.c1) / 2) * TILE, cz = ((r.r0 + r.r1) / 2) * TILE;
      bakeBox(ADOBE, cx, h / 2, cz, w, h, d, 0);
      walls.push({ min: vec3(cx - w / 2, 0, cz - d / 2), max: vec3(cx + w / 2, Math.max(h, AIR_TOP), cz + d / 2) });
    }
  }
  for (const o of custom) solid(walls, o, ADOBE, true);
}

function makeBarrier(scene: THREE.Scene, o: MapObj): Barrier {
  // 单片平面（不是盒子，避免前后两层叠加重影）+ 几乎不透明
  const m = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h),
    new THREE.MeshStandardMaterial({ color: 0x4ad9ff, emissive: 0x2aa8d8, emissiveIntensity: 1.3,
      side: THREE.DoubleSide })); // 完全不透明（粒子在上面发光）
  m.position.set(o.x, o.h / 2, o.z); m.rotation.y = o.ry;
  m.visible = false; // 默认隐藏（菜单背景不显示）；准备阶段 raiseBarriers 才显示
  scene.add(m);

  // 光幕里向上流动的能量粒子
  const N = Math.min(220, Math.max(24, Math.round(o.w * o.h * 0.9)));
  const pos = new Float32Array(N * 3);
  const spd = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * o.w;       // 局部 x
    pos[i * 3 + 1] = (Math.random() - 0.5) * o.h;   // 局部 y
    pos[i * 3 + 2] = 0.07;                           // 稍微贴在表面前
    spd[i] = 1.6 + Math.random() * 3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xcdf5ff, size: 0.4, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  m.add(pts); // 作为子物体，跟着光幕的位置/朝向

  const h2 = o.h / 2;
  const tick = (dt: number): void => {
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      let y = p.getY(i) + spd[i] * dt;
      if (y > h2) y = -h2; // 流到顶就回到底，循环
      p.setY(i, y);
    }
    p.needsUpdate = true;
  };

  const fp = footprint(o);
  return { mesh: m, box: { min: vec3(o.x - fp.hw, 0, o.z - fp.hd), max: vec3(o.x + fp.hw, o.h, o.z + fp.hd) }, tick };
}

export function buildDesertMap(scene: THREE.Scene): MapData {
  const walls: Box[] = [];
  const barriers: Barrier[] = [];
  const objs = loadObjects();
  batches.clear();

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
    walls.push({ min: vec3(bx - bw / 2, 0, bz - bd / 2), max: vec3(bx + bw / 2, 40, bz + bd / 2) });
  };
  bound(cx, cz - gd / 2, gw, 1); bound(cx, cz + gd / 2, gw, 1);
  bound(cx - gw / 2, cz, 1, gd); bound(cx + gw / 2, cz, 1, gd);

  buildWalls(walls, objs.filter((o) => o.t === 'wall')); // 墙：贪心合并成整片，没有一块一块的接缝

  for (const o of objs) {
    if (o.t === 'wall') continue;                                   // 墙已在上面合并处理
    else if (o.t === 'box') solid(walls, o, WOOD);                  // 箱子：能跳上去，不加
    else if (o.t === 'house') {
      solid(walls, o, ADOBE2, true);                                // 楼：上方也有空气墙
      bakeBox(ROOFC, o.x, o.h + 0.25, o.z, o.w + 0.6, 0.5, o.d + 0.6, o.ry); // 房顶（也合并）
    } else if (o.t === 'barrier') {
      barriers.push(makeBarrier(scene, o));
    } else if (o.t === 'A' || o.t === 'B') {
      /* 包点：游戏里不显示颜色（和普通地面一样），只作为"能下包"的位置 —— 下包玩法以后做 */
    } else if (o.t === 'spawnT') { attackerSpawn = vec3(o.x, 0.9, o.z); hasT = true; }
    else if (o.t === 'spawnC') { defenderSpawn = vec3(o.x, 0.9, o.z); hasC = true; }
  }
  if (!hasC && hasT) defenderSpawn = attackerSpawn;
  if (!hasT && hasC) attackerSpawn = defenderSpawn;

  flushBatches(scene); // 把同色实心方块合成整片网格（相邻的连起来、没接缝）

  return { walls, barriers, attackerSpawn, defenderSpawn };
}
