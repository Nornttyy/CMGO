import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Box } from '../physics/aabb';
import { Vec3, vec3 } from '../core/vec3';
import { loadObjects, footprint, MapObj } from './mapData';
import { placeOnGround, modelSize } from './modelLoader';

// —— 沙漠装饰物（撒在场地四周的沙漠里，纯装饰不挡路）——
export const DECOR_MODELS = [
  'models/kenney/nature/cactus_tall.glb',
  'models/kenney/nature/cactus_short.glb',
  'models/kenney/nature/tree_palmDetailedTall.glb',
  'models/kenney/nature/plant_bushDetailed.glb',
  'models/kenney/nature/plant_bushLarge.glb',
  'models/kenney/survival/rock-sand-a.glb',
  'models/kenney/survival/rock-sand-b.glb',
  'models/kenney/survival/rock-sand-c.glb',
];
// 地图内部点缀用的"矮装饰"（短仙人掌/灌木/石头，不挡视线、不当大障碍）—— 都是 DECOR_MODELS 的子集，已预加载
const INSIDE_DECOR = [
  'models/kenney/nature/cactus_short.glb',
  'models/kenney/nature/plant_bushDetailed.glb',
  'models/kenney/nature/plant_bushLarge.glb',
  'models/kenney/survival/rock-sand-a.glb',
  'models/kenney/survival/rock-sand-b.glb',
  'models/kenney/survival/rock-sand-c.glb',
];
let _seed = 99;
function rnd(): number { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function rrange(a: number, b: number): number { return a + rnd() * (b - a); }

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

const AIR_TOP = 30; // 墙/楼上方隐形"空气墙"的高度，防止跳过去/爬上去越狱

// —— 程序生成的材质纹理（不用图片文件），让墙/箱子看着像真材料 ——
function canvasTex(draw: (x: CanvasRenderingContext2D, S: number) => void): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d') as CanvasRenderingContext2D;
  draw(x, S);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
// 纹理用灰度（亮砖/暗缝），和材质颜色相乘 → 保留沙岩/木头本色 + 花纹
function makeBrick(): THREE.CanvasTexture {
  return canvasTex((x, S) => {
    x.fillStyle = '#8f8f8f'; x.fillRect(0, 0, S, S);            // 砖缝(灰)
    x.fillStyle = '#efe9df';                                    // 砖块(亮)
    const rows = 4, cols = 2, bh = S / rows, bw = S / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) ? bw / 2 : 0;
      for (let c = -1; c <= cols; c++) x.fillRect(c * bw + off + 2.5, r * bh + 2.5, bw - 5, bh - 5);
    }
  });
}
function makeWood(): THREE.CanvasTexture {
  return canvasTex((x, S) => {
    x.fillStyle = '#e9e2d6'; x.fillRect(0, 0, S, S);            // 木板(亮)
    x.strokeStyle = '#7c6a4f'; x.lineWidth = 4;                 // 板缝(深)
    const planks = 4, pw = S / planks;
    for (let i = 0; i <= planks; i++) { x.beginPath(); x.moveTo(i * pw, 0); x.lineTo(i * pw, S); x.stroke(); }
    x.strokeStyle = 'rgba(124,106,79,0.35)'; x.lineWidth = 1;   // 木纹
    for (let i = 0; i < 10; i++) { const y = (i + 0.5) * S / 10; x.beginPath(); x.moveTo(0, y); x.lineTo(S, y); x.stroke(); }
  });
}
function makeSand(): THREE.CanvasTexture {
  return canvasTex((x, S) => {
    x.fillStyle = '#e9e2d2'; x.fillRect(0, 0, S, S);            // 沙底(亮)
    for (let i = 0; i < 900; i++) {                            // 颗粒
      const g = 60 + Math.floor(Math.random() * 60);
      x.fillStyle = `rgba(${g},${g - 12},${g - 28},0.22)`;
      x.fillRect(Math.random() * S, Math.random() * S, 1.6, 1.6);
    }
    x.strokeStyle = 'rgba(150,132,98,0.22)'; x.lineWidth = 2;   // 沙波纹
    for (let r = 0; r < 6; r++) {
      const y = r * S / 6 + 5;
      x.beginPath();
      for (let xx = 0; xx <= S; xx += 8) x.lineTo(xx, y + Math.sin(xx * 0.12 + r) * 3);
      x.stroke();
    }
  });
}
let _tex: { brick: THREE.CanvasTexture; wood: THREE.CanvasTexture; sand: THREE.CanvasTexture } | null = null;
function textures(): { brick: THREE.CanvasTexture; wood: THREE.CanvasTexture; sand: THREE.CanvasTexture } {
  if (!_tex) _tex = { brick: makeBrick(), wood: makeWood(), sand: makeSand() };
  return _tex;
}
// 每种颜色用哪种纹理 + 贴图密度（多少米一块花纹）
const TEX_TILE: Record<number, number> = { [ADOBE]: 2.4, [ADOBE2]: 2.4, [WOOD]: 1.1 };
function texFor(color: number): THREE.Texture | null {
  if (color === ADOBE || color === ADOBE2) return textures().brick;
  if (color === WOOD) return textures().wood;
  return null;
}
// 把盒子每个面的 UV 按它的实际大小缩放 → 纹理按"米"平铺，长墙也不拉伸
function tileBoxUVs(g: THREE.BoxGeometry, w: number, h: number, d: number, tile: number): void {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const faces: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x -x +y -y +z -z
  for (let f = 0; f < 6; f++) {
    const ru = faces[f][0] / tile, rv = faces[f][1] / tile;
    for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * ru, uv.getY(k) * rv); }
  }
  uv.needsUpdate = true;
}

// —— 几何合并：同色实心方块先攒进 batches，最后每色合成一个网格 ——
// 相邻的墙连成一片、没有接缝，阴影也是整体的。
const batches = new Map<number, THREE.BufferGeometry[]>();
function bakeBox(color: number, x: number, y: number, z: number, w: number, h: number, d: number, ry: number): void {
  const g = new THREE.BoxGeometry(w, h, d);
  const tile = TEX_TILE[color];
  if (tile) tileBoxUVs(g, w, h, d, tile);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  const arr = batches.get(color);
  if (arr) arr.push(g); else batches.set(color, [g]);
}
function flushBatches(scene: THREE.Scene): void {
  for (const [color, geos] of batches) {
    const merged = mergeGeometries(geos, false);
    const m = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color, roughness: 0.95, map: texFor(color) }));
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
  // 只有"立着(可见)"时才挡子弹：光幕落下(隐藏)后，射线不再打到它
  const baseRaycast = m.raycast.bind(m);
  m.raycast = (rc, intersects) => { if (m.visible) baseRaycast(rc, intersects); };
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

// 在场地四周的沙漠里(玩家活动区之外)撒装饰：沙丘 + 仙人掌/石头/棕榈/枯灌木（纯装饰不挡路）
function scatterDecor(scene: THREE.Scene, cx: number, cz: number, inHX: number, inHZ: number, outHX: number, outHZ: number): void {
  _seed = 4242;
  const inRing = (x: number, z: number): boolean => Math.abs(x - cx) > inHX + 4 || Math.abs(z - cz) > inHZ + 4;
  // 矮沙丘
  for (let i = 0; i < 7; i++) {
    let x = cx, z = cz;
    for (let t = 0; t < 12 && !inRing(x, z); t++) { x = cx + (rnd() * 2 - 1) * outHX; z = cz + (rnd() * 2 - 1) * outHZ; }
    if (!inRing(x, z)) continue;
    const r = rrange(6, 13);
    const dune = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd8c89e, roughness: 1 }));
    dune.position.set(x, -r * 0.22, z); dune.scale.y = 0.38; dune.receiveShadow = true; scene.add(dune);
  }
  // 仙人掌/石头/棕榈/枯灌木
  for (let i = 0; i < 95; i++) {
    let x = cx, z = cz;
    for (let t = 0; t < 12 && !inRing(x, z); t++) { x = cx + (rnd() * 2 - 1) * outHX; z = cz + (rnd() * 2 - 1) * outHZ; }
    if (!inRing(x, z)) continue;
    const url = DECOR_MODELS[Math.floor(rnd() * DECOR_MODELS.length)];
    try {
      const scale = rrange(2, 4.5) / (modelSize(url, 1).x || 1);
      scene.add(placeOnGround(url, x, z, { rotY: rrange(0, 6.28), scale }).group);
    } catch { /* 缺模型就跳过 */ }
  }
}

// 在地图内部(玩家活动区里)的空地上点缀矮装饰，避开建筑/箱子和出生点。
// 每放一个就给它加一个碰撞盒（玩家和蛋蛋都会被挡住、撞不过去）。
function scatterInside(scene: THREE.Scene, walls: Box[], cx: number, cz: number, hx: number, hz: number, spawns: Vec3[]): void {
  _seed = 9137;
  const clear = (x: number, z: number, r: number): boolean => {
    for (const b of walls) {
      if (b.max.y < 0.6) continue;                                   // 地面/矮物不算
      if (x > b.min.x - r && x < b.max.x + r && z > b.min.z - r && z < b.max.z + r) return false;
    }
    for (const s of spawns) if (Math.hypot(x - s.x, z - s.z) < 5) return false; // 离出生点远一点
    return true;
  };
  let placed = 0;
  for (let i = 0; i < 260 && placed < 24; i++) {
    const x = cx + (rnd() * 2 - 1) * hx, z = cz + (rnd() * 2 - 1) * hz;
    if (!clear(x, z, 2.2)) continue;                                  // 不嵌墙、不挡门口、不和别的装饰挤
    const url = INSIDE_DECOR[Math.floor(rnd() * INSIDE_DECOR.length)];
    try {
      const scale = rrange(1.5, 2.8) / (modelSize(url, 1).x || 1);
      const g = placeOnGround(url, x, z, { rotY: rrange(0, 6.28), scale }).group;
      scene.add(g);
      // 按可见范围加碰撞盒（缩窄一点，免得仙人掌手臂挡太宽；至少 0.7 高，蛋蛋也会绕开）
      g.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(g);
      const hwx = ((bb.max.x - bb.min.x) / 2) * 0.6, hwz = ((bb.max.z - bb.min.z) / 2) * 0.6;
      const mx = (bb.min.x + bb.max.x) / 2, mz = (bb.min.z + bb.max.z) / 2;
      walls.push({ min: vec3(mx - hwx, 0, mz - hwz), max: vec3(mx + hwx, Math.max(bb.max.y, 0.7), mz + hwz) });
      placed++;
    } catch { /* 缺模型就跳过 */ }
  }
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
  const gw = (maxX - minX) + 40, gd = (maxZ - minZ) + 40;         // 玩家活动范围（边界在这）
  const ew = (maxX - minX) + 560, ed = (maxZ - minZ) + 560;       // 沙地视觉范围（延伸到地平线）
  const sand = textures().sand; sand.repeat.set(ew / 8, ed / 8);
  const ground = new THREE.Mesh(new THREE.BoxGeometry(ew, 1, ed),
    new THREE.MeshStandardMaterial({ color: SAND, roughness: 1, map: sand }));
  ground.position.set(cx, -0.5, cz); ground.receiveShadow = true; scene.add(ground);
  walls.push({ min: vec3(cx - ew / 2, -1, cz - ed / 2), max: vec3(cx + ew / 2, 0, cz + ed / 2) });
  // 隐形边界墙（只挡人，不显示）
  const bound = (bx: number, bz: number, bw: number, bd: number): void => {
    walls.push({ min: vec3(bx - bw / 2, 0, bz - bd / 2), max: vec3(bx + bw / 2, 40, bz + bd / 2) });
  };
  bound(cx, cz - gd / 2, gw, 1); bound(cx, cz + gd / 2, gw, 1);
  bound(cx - gw / 2, cz, 1, gd); bound(cx + gw / 2, cz, 1, gd);

  // 场地四周的沙漠里撒装饰（仙人掌/石头/棕榈/枯灌木/沙丘）
  scatterDecor(scene, cx, cz, gw / 2, gd / 2, ew / 2 - 8, ed / 2 - 8);

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

  // 地图内部也点缀一些矮装饰（建好结构后再撒，才能避开墙/箱子/出生点）
  scatterInside(scene, walls, cx, cz, gw / 2 - 6, gd / 2 - 6, [attackerSpawn, defenderSpawn]);

  flushBatches(scene); // 把同色实心方块合成整片网格（相邻的连起来、没接缝）

  return { walls, barriers, attackerSpawn, defenderSpawn };
}
