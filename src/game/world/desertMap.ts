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

// 《蛋蛋城市》配色
const GROUND = 0x9a9286;   // 城市地面（水泥）
const ROAD = 0x55585e;     // 马路（沥青）
const LINE = 0xd9c24a;     // 路中线
const WALLC = 0x6f6a60;    // 超高城墙
const ROOF = 0x6a6f76;
const WINDOW = 0x7fb0c0;
const BLD = [0xcdc6b6, 0xc2b39a, 0xb4bcc4, 0xd2c4ac, 0xb9b0a2]; // 楼身几种色

const M = {
  box: 'models/kenney/survival/box.glb',
  boxLarge: 'models/kenney/survival/box-large.glb',
  boxOpen: 'models/kenney/survival/box-open.glb',
  barrel: 'models/kenney/survival/barrel.glb',
  chest: 'models/kenney/survival/chest.glb',
  palmTall: 'models/kenney/nature/tree_palmDetailedTall.glb',
  palmShort: 'models/kenney/nature/tree_palmDetailedShort.glb',
  bush: 'models/kenney/nature/plant_bushDetailed.glb',
};
const HOUSE = 'abcdefghijklmnopqrstu'.split('').map((c) => `models/kenney/city/building-type-${c}.glb`);
export const MAP_MODELS = [...Object.values(M), ...HOUSE];

let _seed = 7;
function rnd(): number { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function rrange(a: number, b: number): number { return a + rnd() * (b - a); }
function pick<T>(arr: T[]): T { return arr[Math.floor(rnd() * arr.length) % arr.length]; }

function box(scene: THREE.Scene, walls: Box[], cx: number, cy: number, cz: number,
            sx: number, sy: number, sz: number, color: number, receive = false): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  mesh.position.set(cx, cy, cz);
  mesh.castShadow = true; mesh.receiveShadow = receive;
  scene.add(mesh);
  walls.push({ min: vec3(cx - sx / 2, cy - sy / 2, cz - sz / 2), max: vec3(cx + sx / 2, cy + sy / 2, cz + sz / 2) });
}
function deco(scene: THREE.Scene, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: number, op = 1): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshStandardMaterial({ color, roughness: 0.92, transparent: op < 1, opacity: op }));
  mesh.position.set(cx, cy, cz);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
}
function seg(scene: THREE.Scene, walls: Box[], cx: number, cz: number, sx: number, sz: number, h: number, color: number): void {
  box(scene, walls, cx, h / 2, cz, sx, h, sz, color);
}

// 一段灰色马路（不挡路，垫高一点免闪烁），带中线
function road(scene: THREE.Scene, cx: number, cz: number, sx: number, sz: number): void {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.1, sz),
    new THREE.MeshStandardMaterial({ color: ROAD, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  m.position.set(cx, 0.06, cz); m.receiveShadow = true; scene.add(m);
  // 中线
  const along = sx >= sz;
  const line = new THREE.Mesh(new THREE.BoxGeometry(along ? sx : 0.4, 0.12, along ? 0.4 : sz),
    new THREE.MeshStandardMaterial({ color: LINE, roughness: 0.8, emissive: LINE, emissiveIntensity: 0.15 }));
  line.position.set(cx, 0.09, cz); scene.add(line);
}

const T = 0.6, DOORW = 3.8;
function wallX(scene: THREE.Scene, walls: Box[], cx: number, cz: number, sx: number, h: number, color: number, door: boolean): void {
  if (!door) { seg(scene, walls, cx, cz, sx, T, h, color); return; }
  const s = (sx - DOORW) / 2;
  if (s > 0.15) { seg(scene, walls, cx - (DOORW / 2 + s / 2), cz, s, T, h, color); seg(scene, walls, cx + (DOORW / 2 + s / 2), cz, s, T, h, color); }
  deco(scene, cx, h - 0.5, cz, DOORW, 1.0, T, color); // 门楣
}
function wallZ(scene: THREE.Scene, walls: Box[], cx: number, cz: number, sz: number, h: number, color: number, door: boolean): void {
  if (!door) { seg(scene, walls, cx, cz, T, sz, h, color); return; }
  const s = (sz - DOORW) / 2;
  if (s > 0.15) { seg(scene, walls, cx, cz - (DOORW / 2 + s / 2), T, s, h, color); seg(scene, walls, cx, cz + (DOORW / 2 + s / 2), T, s, h, color); }
  deco(scene, cx, h - 0.5, cz, T, 1.0, DOORW, color);
}
interface Doors { n?: boolean; s?: boolean; e?: boolean; w?: boolean; }
// 能进的楼：四面墙(留门洞) + 窗 + 屋顶悬在墙顶上方留采光缝(天窗) + 四角柱
function building(scene: THREE.Scene, walls: Box[], cx: number, cz: number, sx: number, sz: number, h: number, doors: Doors, color: number): void {
  wallX(scene, walls, cx, cz - sz / 2, sx, h, color, !!doors.n);
  wallX(scene, walls, cx, cz + sz / 2, sx, h, color, !!doors.s);
  wallZ(scene, walls, cx - sx / 2, cz, sz, h, color, !!doors.w);
  wallZ(scene, walls, cx + sx / 2, cz, sz, h, color, !!doors.e);
  // 窗（南北面各两扇，装饰）
  for (const dz of [cz - sz / 2 - 0.02, cz + sz / 2 + 0.02]) for (const dx of [-sx * 0.28, sx * 0.28])
    deco(scene, cx + dx, h * 0.5, dz, 1.4, 1.4, 0.06, WINDOW);
  // 屋顶悬空留缝采光（缝在 h~h+1.1）+ 四角柱
  const gap = 1.1;
  for (const sxn of [-1, 1]) for (const szn of [-1, 1])
    deco(scene, cx + sxn * (sx / 2 - 0.4), h + gap / 2, cz + szn * (sz / 2 - 0.4), 0.5, gap, 0.5, color);
  deco(scene, cx, h + gap + 0.18, cz, sx + 0.8, 0.36, sz + 0.8, ROOF);
}

// 撤离点：发光地标 + 地面光圈（先只做标记，撤离玩法以后接）
function extractPad(scene: THREE.Scene, cx: number, cz: number): void {
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.15, 24),
    new THREE.MeshStandardMaterial({ color: 0x4ad98a, emissive: 0x2ad07a, emissiveIntensity: 0.8, transparent: true, opacity: 0.55 }));
  ring.position.set(cx, 0.1, cz); scene.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 9, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x4ad98a, emissive: 0x2ad07a, emissiveIntensity: 0.6, transparent: true, opacity: 0.16, side: THREE.DoubleSide }));
  beam.position.set(cx, 4.6, cz); scene.add(beam);
}

interface PropOpts { width?: number; scale?: number; rotY?: number; solid?: boolean; collide?: { hx: number; hz: number }; tint?: number; }
function prop(scene: THREE.Scene, walls: Box[], url: string, x: number, z: number, o: PropOpts = {}): void {
  try {
    let scale = o.scale ?? 1;
    if (o.width != null) scale = o.width / (modelSize(url, 1).x || 1);
    const p = placeOnGround(url, x, z, { rotY: o.rotY, scale, solid: o.solid, collide: o.collide, tint: o.tint });
    if (p.box) { if (walls.some((wl) => overlaps(p.box as Box, wl))) return; walls.push(p.box); }
    scene.add(p.group);
  } catch { /* 缺模型就跳过 */ }
}

// 《蛋蛋城市》：长方形大地图，四周超高城墙，马路网，能进的楼 + 空地 + 中央核心区，边缘撤离点。
export function buildDesertMap(scene: THREE.Scene): MapData {
  _seed = 7;
  const w: Box[] = [];
  const SX = 116, SZ = 156; // 地图大小（大！）
  const HX = SX / 2, HZ = SZ / 2;

  // 地面（水泥）
  box(scene, w, 0, -0.5, 0, SX, 1, SZ, GROUND, true);
  // 超高城墙（四周，高 18）
  const WH = 18;
  box(scene, w, 0, WH / 2, -HZ, SX, WH, 2, WALLC);
  box(scene, w, 0, WH / 2, HZ, SX, WH, 2, WALLC);
  box(scene, w, -HX, WH / 2, 0, 2, WH, SZ, WALLC);
  box(scene, w, HX, WH / 2, 0, 2, WH, SZ, WALLC);

  // —— 马路网（纵 ±36 全长；中路 x=0、横路 z=0 在核心区断开，不穿过核心大楼）——
  road(scene, -36, 0, 7, SZ - 4); road(scene, 36, 0, 7, SZ - 4);
  road(scene, 0, -48, SX - 4, 7); road(scene, 0, 48, SX - 4, 7);
  road(scene, 0, -45, 9, 62); road(scene, 0, 45, 9, 62);   // 中纵路，核心区(±14)断开
  road(scene, -35, 0, 42, 9); road(scene, 35, 0, 42, 9);   // 中横路，核心区断开（不伸出墙外）

  // —— 中央核心区：大广场 + 正中一栋大楼（多门，好东西最多最危险）——
  building(scene, w, 0, 0, 22, 22, 8, { n: true, s: true, e: true, w: true }, BLD[2]);
  // 核心广场掩体
  for (const [x, z] of [[-13, 0], [13, 0], [0, -13], [0, 13], [-9, 9], [9, -9]] as [number, number][])
    prop(scene, w, pick([M.boxLarge, M.box, M.barrel, M.chest]), x, z, { width: 1.6, rotY: rrange(0, 6.28), solid: true });

  // —— 四周街区：能进的楼（有门洞），高矮不一；穿插空地 ——
  type B = [number, number, number, number, number, Doors];
  const blds: B[] = [
    // 左上区
    [-46, -62, 16, 14, 6, { s: true, e: true }], [-22, -62, 14, 14, 9, { s: true }],
    [-46, -30, 14, 16, 5, { e: true, n: true }],
    // 右上区
    [22, -62, 14, 14, 7, { s: true }], [46, -62, 16, 14, 10, { s: true, w: true }],
    [46, -30, 14, 16, 6, { w: true, n: true }],
    // 左下区
    [-46, 30, 16, 16, 8, { e: true, s: true }], [-22, 62, 14, 14, 5, { n: true }],
    [-46, 62, 16, 14, 7, { n: true, e: true }],
    // 右下区
    [46, 30, 16, 16, 6, { w: true, n: true }], [22, 62, 14, 14, 9, { n: true }],
    [46, 62, 16, 14, 8, { n: true, w: true }],
    // 中带两侧（靠核心）
    [-22, -24, 12, 14, 5, { s: true, e: true }], [22, -24, 12, 14, 7, { s: true, w: true }],
    [-22, 24, 12, 14, 6, { n: true, e: true }], [22, 24, 12, 14, 5, { n: true, w: true }],
  ];
  for (const [cx, cz, bx, bz, h, d] of blds) building(scene, w, cx, cz, bx, bz, h, d, pick(BLD));

  // —— 空地（不全是房子）：停车场/小公园，摆掩体和树 ——
  // 左上空地
  prop(scene, w, M.palmTall, -46, -46, { width: 3, collide: { hx: 0.3, hz: 0.3 } });
  for (const [x, z] of [[-44, -46], [-48, -44], [-46, -49]] as [number, number][]) prop(scene, w, pick([M.box, M.barrel]), x, z, { width: 1.5, rotY: rrange(0, 6.28), solid: true });
  // 右下空地（公园）
  for (const [x, z] of [[44, 46], [48, 44], [46, 49], [42, 48]] as [number, number][]) prop(scene, w, pick([M.palmShort, M.bush, M.box]), x, z, { width: rrange(1.4, 2.6), rotY: rrange(0, 6.28), collide: { hx: 0.3, hz: 0.3 } });
  // 右上空地（停车场，几个箱桶）
  for (const [x, z] of [[44, -46], [48, -48], [42, -44]] as [number, number][]) prop(scene, w, pick([M.boxLarge, M.barrel, M.boxOpen]), x, z, { width: 1.6, rotY: rrange(0, 6.28), solid: true });

  // —— 街上/街口的零散掩体 ——
  for (const [x, z] of [[0, 30], [0, -30], [-36, 24], [36, -24], [-36, -16], [36, 16], [0, 60], [0, -60]] as [number, number][])
    prop(scene, w, pick([M.box, M.boxLarge, M.barrel]), x, z, { width: 1.5, rotY: rrange(0, 6.28), solid: true });

  // —— 撤离点（四角靠墙）——
  extractPad(scene, -HX + 8, -HZ + 8);
  extractPad(scene, HX - 8, -HZ + 8);
  extractPad(scene, -HX + 8, HZ - 8);
  extractPad(scene, HX - 8, HZ - 8);

  // 出生点（南边中路）
  return { walls: w, barriers: [], attackerSpawn: vec3(0, 0.9, HZ - 12) };
}
