import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
const ROOFG = 0x4a9d5b;    // 绿四坡屋顶（配 Kenney 房子）
const ROOFF = 0x4c525a;    // 高楼平顶/帽（深，和墙拉开对比）
// 楼身配色：暖冷穿插、卡通但不花哨（拉开城市色彩，别一片米黄）
const WALLH = [0xe2dccb, 0xc6cdd2, 0xceA98a, 0xb78a82, 0x8fa9ab, 0xc7b079, 0x9fb0bf, 0xd9cdb4, 0xb6967c, 0x86a08e];
const WINDOW = 0x35596e;   // 玻璃（深蓝绿，和浅墙强对比）

const M = {
  box: 'models/kenney/survival/box.glb',
  boxLarge: 'models/kenney/survival/box-large.glb',
  boxOpen: 'models/kenney/survival/box-open.glb',
  barrel: 'models/kenney/survival/barrel.glb',
  chest: 'models/kenney/survival/chest.glb',
  palmTall: 'models/kenney/nature/tree_palmDetailedTall.glb',
  palmShort: 'models/kenney/nature/tree_palmDetailedShort.glb',
  bush: 'models/kenney/nature/plant_bushDetailed.glb',
  bushLarge: 'models/kenney/nature/plant_bushLarge.glb',
};
const HOUSE = 'abcdefghijklmnopqrstu'.split('').map((c) => `models/kenney/city/building-type-${c}.glb`);
export const MAP_MODELS = [...Object.values(M), ...HOUSE];

let _seed = 7;
function rnd(): number { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function rrange(a: number, b: number): number { return a + rnd() * (b - a); }
function pick<T>(arr: T[]): T { return arr[Math.floor(rnd() * arr.length) % arr.length]; }

// —— 几何合并：所有静态方块/屋顶/水箱先攒进 BATCH，最后合成一个网格一次绘制（大幅省帧率）——
let BATCH: THREE.BufferGeometry[] = [];
function bake(g: THREE.BufferGeometry, color: number, cx: number, cy: number, cz: number, rotY = 0): void {
  if (rotY) g.rotateY(rotY);
  g.translate(cx, cy, cz);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  BATCH.push(g);
}
function flushBatch(scene: THREE.Scene): void {
  if (!BATCH.length) return;
  const merged = mergeGeometries(BATCH, false);
  BATCH = [];
  const m = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
}

function box(_scene: THREE.Scene, walls: Box[], cx: number, cy: number, cz: number,
            sx: number, sy: number, sz: number, color: number, _receive = false): void {
  bake(new THREE.BoxGeometry(sx, sy, sz), color, cx, cy, cz);
  walls.push({ min: vec3(cx - sx / 2, cy - sy / 2, cz - sz / 2), max: vec3(cx + sx / 2, cy + sy / 2, cz + sz / 2) });
}
function deco(_scene: THREE.Scene, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: number, _emi = 0): void {
  bake(new THREE.BoxGeometry(sx, sy, sz), color, cx, cy, cz);
}
function seg(scene: THREE.Scene, walls: Box[], cx: number, cz: number, sx: number, sz: number, h: number, color: number): void {
  box(scene, walls, cx, h / 2, cz, sx, h, sz, color);
}

// —— 不规则路网：每条路记下矩形，用于"别把房子盖在路上"判断 ——
interface Rect { x0: number; x1: number; z0: number; z1: number; }
const roadRects: Rect[] = [];
function road(scene: THREE.Scene, cx: number, cz: number, sx: number, sz: number, line = true): void {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.1, sz),
    new THREE.MeshStandardMaterial({ color: ROAD, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  m.position.set(cx, 0.06, cz); m.receiveShadow = true; scene.add(m);
  if (line) {
    const along = sx >= sz;
    const l = new THREE.Mesh(new THREE.BoxGeometry(along ? sx : 0.5, 0.12, along ? 0.5 : sz),
      new THREE.MeshStandardMaterial({ color: LINE, roughness: 0.8, emissive: LINE, emissiveIntensity: 0.15 }));
    l.position.set(cx, 0.09, cz); scene.add(l);
  }
  roadRects.push({ x0: cx - sx / 2, x1: cx + sx / 2, z0: cz - sz / 2, z1: cz + sz / 2 });
}
function nearRoad(x: number, z: number, m: number): boolean {
  return roadRects.some((r) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m);
}

const T = 0.6, DOORW = 3.6;
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

// 一面墙的窗户（一格一格的真窗 + 窗框；已合并网格，多画不卡）
function windowRow(scene: THREE.Scene, cx: number, cz: number, sx: number, sz: number, h: number, floors: number): void {
  const along = sx >= sz;
  const span = (along ? sx : sz) - 1.6;
  if (span < 1.4) return;
  const cols = Math.max(1, Math.round(span / 3.2));
  for (let f = 0; f < floors; f++) {
    const wy = 1.9 + f * 3.3;
    if (wy > h - 1.0) break;
    for (let i = 0; i < cols; i++) {
      const t = cols === 1 ? 0 : i / (cols - 1) - 0.5;
      const ox = along ? t * (span - 1.4) : 0;
      const oz = along ? 0 : t * (span - 1.4);
      deco(scene, cx + ox, wy, cz + oz, along ? 1.9 : 0.2, 2.1, along ? 0.2 : 1.9, TRIM);          // 窗框
      deco(scene, cx + ox, wy, cz + oz, along ? 1.5 : 0.26, 1.7, along ? 0.26 : 1.5, WINDOW, 0.1);  // 玻璃
    }
  }
}

// —— 建筑结构件（让楼不只是个盒子）——
const TRIM = 0x6e6557, CANOPY = [0x9c3f30, 0x2f6f8a, 0x3d7a4a, 0xb8893a];
// 四角竖向角柱（凸出墙面）
function corners(scene: THREE.Scene, cx: number, cz: number, hx: number, hz: number, h: number, color: number, cw = 0.7): void {
  for (const sxn of [-1, 1]) for (const szn of [-1, 1])
    deco(scene, cx + sxn * hx, h / 2, cz + szn * hz, cw, h, cw, color);
}
// 楼层腰线（每隔几层一条横向分隔，立面有层次）
function floorBands(scene: THREE.Scene, cx: number, cz: number, hx: number, hz: number, floors: number, fH: number, color: number): void {
  for (let f = 1; f < floors; f++) {
    if (f % 2 !== 0) continue;
    deco(scene, cx, f * fH, cz, hx * 2 + 0.3, 0.28, hz * 2 + 0.3, color);
  }
}
// 楼顶杂物：楼梯间 + 水箱 + 天线（让天际线不平）
function roofClutter(scene: THREE.Scene, cx: number, cz: number, hx: number, hz: number, topY: number, color: number): void {
  deco(scene, cx - hx * 0.3, topY + 1.3, cz - hz * 0.2, Math.min(hx, 3.2) * 2, 2.6, Math.min(hz, 2.6) * 2, color); // 楼梯间
  bake(new THREE.CylinderGeometry(1.4, 1.4, 2, 12), 0x9aa0a6, cx + hx * 0.45, topY + 1.1, cz + hz * 0.4); // 水箱
  deco(scene, cx + hx * 0.4, topY + 2.8, cz - hz * 0.45, 0.14, 2.8, 0.14, 0x2a2a2a); // 天线
}
// 入口雨棚（在第一个有门的面，挑出一块彩色棚板 + 两根柱）
function canopy(scene: THREE.Scene, cx: number, cz: number, hx: number, hz: number, doors: Doors): void {
  let nx = 0, nz = 0; // 朝外法线
  if (doors.s) nz = 1; else if (doors.n) nz = -1; else if (doors.e) nx = 1; else if (doors.w) nx = -1; else return;
  const out = 1.2;                    // 棚板挑出墙外的半深
  const halfAlong = DOORW / 2 + 0.9;  // 沿墙方向半宽
  const px = cx + nx * (hx + out), pz = cz + nz * (hz + out);
  const bhx = nx !== 0 ? out : halfAlong, bhz = nz !== 0 ? out : halfAlong;
  deco(scene, px, 3.0, pz, bhx * 2, 0.22, bhz * 2, pick(CANOPY)); // 棚板
  for (const sgn of [-1, 1]) {        // 两根柱（外缘两端）
    const lx = nz !== 0 ? px + sgn * (halfAlong - 0.2) : px + nx * (out - 0.2);
    const lz = nz !== 0 ? pz + nz * (out - 0.2) : pz + sgn * (halfAlong - 0.2);
    deco(scene, lx, 1.5, lz, 0.18, 3, 0.18, TRIM);
  }
}

// 能进的矮房：墙裙 + 浅墙(留门洞) + 窗 + 绿四坡屋顶 + 门廊 + 烟囱 + 室内搜刮
function prettyHouse(scene: THREE.Scene, walls: Box[], cx: number, cz: number, half: number, floors: number, doors: Doors, color: number): void {
  const h = floors * 3.3 + 0.4;
  const s = half;
  deco(scene, cx, 0.55, cz, s * 2 + 0.5, 1.1, s * 2 + 0.5, TRIM); // 墙裙
  wallX(scene, walls, cx, cz - s, s * 2, h, color, !!doors.n);
  wallX(scene, walls, cx, cz + s, s * 2, h, color, !!doors.s);
  wallZ(scene, walls, cx - s, cz, s * 2, h, color, !!doors.w);
  wallZ(scene, walls, cx + s, cz, s * 2, h, color, !!doors.e);
  windowRow(scene, cx, cz - s - 0.04, s * 2, 0.08, h, floors);
  windowRow(scene, cx, cz + s + 0.04, s * 2, 0.08, h, floors);
  windowRow(scene, cx - s - 0.04, cz, 0.08, s * 2, h, floors);
  windowRow(scene, cx + s + 0.04, cz, 0.08, s * 2, h, floors);
  corners(scene, cx, cz, s, s, h, color, 0.6);
  canopy(scene, cx, cz, s, s, doors);
  // 屋顶悬空留采光缝 + 四角柱
  const gap = 0.9;
  for (const sxn of [-1, 1]) for (const szn of [-1, 1])
    deco(scene, cx + sxn * (s - 0.4), h + gap / 2, cz + szn * (s - 0.4), 0.5, gap, 0.5, color);
  const rh = s * 0.85;
  bake(new THREE.ConeGeometry(s * 1.5, rh, 4), ROOFG, cx, h + gap + rh / 2, cz, Math.PI / 4); // 绿四坡顶
  deco(scene, cx + s * 0.5, h + gap + rh * 0.5, cz - s * 0.5, 1, rh + 1, 1, TRIM); // 烟囱
  if (rnd() < 0.7) prop(scene, walls, pick([M.chest, M.boxLarge, M.box]), cx + rrange(-s * 0.4, s * 0.4), cz + rrange(-s * 0.4, s * 0.4), { width: 1.5, rotY: rrange(0, 6.28), solid: true });
}

// 能进的多层高楼：墙裙底商 + 主体窗带 + 角柱 + 腰线 + 错层收顶 + 楼顶杂物 + 入口雨棚 + 室内搜刮
function tower(scene: THREE.Scene, walls: Box[], cx: number, cz: number, hx: number, hz: number, floors: number, doors: Doors, color: number): void {
  const fH = 3.4;
  const h = floors * fH;
  wallX(scene, walls, cx, cz - hz, hx * 2, h, color, !!doors.n);
  wallX(scene, walls, cx, cz + hz, hx * 2, h, color, !!doors.s);
  wallZ(scene, walls, cx - hx, cz, hz * 2, h, color, !!doors.w);
  wallZ(scene, walls, cx + hx, cz, hz * 2, h, color, !!doors.e);
  for (const [dx, dz, sx, sz] of [[0, -hz - 0.04, hx * 2, 0.08], [0, hz + 0.04, hx * 2, 0.08], [-hx - 0.04, 0, 0.08, hz * 2], [hx + 0.04, 0, 0.08, hz * 2]] as [number, number, number, number][])
    windowRow(scene, cx + dx, cz + dz, sx, sz, h, floors);
  deco(scene, cx, 0.45, cz, hx * 2 + 0.5, 0.9, hz * 2 + 0.5, TRIM);      // 底座勒脚
  deco(scene, cx, 3.15, cz, hx * 2 + 0.3, 0.3, hz * 2 + 0.3, ROOFF);     // 底商腰线（一层顶）
  corners(scene, cx, cz, hx, hz, h, color, 0.8);
  floorBands(scene, cx, cz, hx, hz, floors, fH, color);
  canopy(scene, cx, cz, hx, hz, doors);
  // 错层收顶：5 层以上顶上加一截收进的小塔楼
  const gap = 1.0;
  let topY = h + gap;
  for (const sxn of [-1, 1]) for (const szn of [-1, 1])
    deco(scene, cx + sxn * (hx - 0.4), h + gap / 2, cz + szn * (hz - 0.4), 0.5, gap, 0.5, color);
  deco(scene, cx, h + gap + 0.2, cz, hx * 2 + 0.6, 0.4, hz * 2 + 0.6, ROOFF); // 平顶板
  for (const [ex, ez, ww, dd] of [[0, -hz, hx * 2 + 0.6, 0.4], [0, hz, hx * 2 + 0.6, 0.4], [-hx, 0, 0.4, hz * 2 + 0.6], [hx, 0, 0.4, hz * 2 + 0.6]] as [number, number, number, number][])
    deco(scene, cx + ex, h + gap + 0.75, cz + ez, ww, 0.8, dd, color); // 女儿墙一圈
  if (floors >= 5) {
    const cw = hx * 0.55, cd = hz * 0.55, ch = fH * 1.6;
    deco(scene, cx, topY + 0.4 + ch / 2, cz, cw * 2, ch, cd * 2, color); // 收进塔冠
    windowRow(scene, cx, cz - cd - 0.04, cw * 2, 0.08, ch + 2, 1);
    topY += 0.4 + ch;
  }
  roofClutter(scene, cx, cz, hx, hz, topY, color);
  if (rnd() < 0.8) prop(scene, walls, pick([M.chest, M.boxLarge, M.barrel]), cx + rrange(-hx * 0.4, hx * 0.4), cz + rrange(-hz * 0.4, hz * 0.4), { width: 1.6, rotY: rrange(0, 6.28), solid: true });
}

// 放一栋漂亮模型房子（封闭装饰），90° 朝向，整体包围盒碰撞（贴合，不留空气墙）
function modelHouse(scene: THREE.Scene, walls: Box[], x: number, z: number, width: number): void {
  try {
    const url = pick(HOUSE);
    const scale = width / (modelSize(url, 1).x || 1);
    const rotY = Math.floor(rnd() * 4) * (Math.PI / 2);
    const p = placeOnGround(url, x, z, { rotY, scale, solid: true });
    if (p.box && walls.some((wl) => overlaps(p.box as Box, wl))) return;
    if (p.box) walls.push(p.box);
    scene.add(p.group);
  } catch { /* 缺模型就跳过 */ }
}

// 撤离点：发光地标 + 光柱
function extractPad(scene: THREE.Scene, cx: number, cz: number): void {
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.15, 28),
    new THREE.MeshStandardMaterial({ color: 0x4ad98a, emissive: 0x2ad07a, emissiveIntensity: 0.8, transparent: true, opacity: 0.55 }));
  ring.position.set(cx, 0.1, cz); scene.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 14, 22, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x4ad98a, emissive: 0x2ad07a, emissiveIntensity: 0.6, transparent: true, opacity: 0.14, side: THREE.DoubleSide }));
  beam.position.set(cx, 7, cz); scene.add(beam);
}

interface PropOpts { width?: number; scale?: number; rotY?: number; solid?: boolean; collide?: { hx: number; hz: number }; tint?: number; }
function prop(scene: THREE.Scene, walls: Box[], url: string, x: number, z: number, o: PropOpts = {}): void {
  try {
    let scale = o.scale ?? 1;
    if (o.width != null) scale = o.width / (modelSize(url, 1).x || 1);
    let collide = o.collide;
    if (o.solid && !collide) {
      const s = modelSize(url, scale);
      collide = { hx: Math.max(0.2, s.x * 0.42), hz: Math.max(0.2, s.z * 0.42) };
    }
    const p = placeOnGround(url, x, z, { rotY: o.rotY, scale, solid: o.solid, collide, tint: o.tint });
    if (p.box) { if (walls.some((wl) => overlaps(p.box as Box, wl))) return; walls.push(p.box); }
    scene.add(p.group);
  } catch { /* 缺模型就跳过 */ }
}

// 一片公园/空地：草地色块 + 几棵树和灌木
function park(scene: THREE.Scene, walls: Box[], cx: number, cz: number, r: number): void {
  const grass = new THREE.Mesh(new THREE.BoxGeometry(r * 2, 0.08, r * 2),
    new THREE.MeshStandardMaterial({ color: 0x7c9a55, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  grass.position.set(cx, 0.05, cz); grass.receiveShadow = true; scene.add(grass);
  const n = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++)
    prop(scene, walls, pick([M.palmTall, M.palmShort, M.bushLarge, M.bush]), cx + rrange(-r * 0.7, r * 0.7), cz + rrange(-r * 0.7, r * 0.7),
      { width: rrange(2, 4), rotY: rrange(0, 6.28), collide: { hx: 0.3, hz: 0.3 } });
}

// 《蛋蛋城市》：800×1200 超大城市，不规则路网，模型矮房+多层高楼混搭，公园空地，远处雾气。
export function buildDesertMap(scene: THREE.Scene): MapData {
  _seed = 7;
  roadRects.length = 0;
  BATCH = [];
  const w: Box[] = [];
  const SX = 800, SZ = 1200;
  const HX = SX / 2, HZ = SZ / 2;

  // 远处雾气（又好看又让远景不渲染、保帧率）
  scene.fog = new THREE.Fog(0xbfe3ff, 180, 460);

  // 地面（水泥）
  box(scene, w, 0, -0.5, 0, SX, 1, SZ, GROUND, true);
  // 超高城墙（四周，高 26）
  const WH = 26;
  box(scene, w, 0, WH / 2, -HZ, SX, WH, 3, WALLC);
  box(scene, w, 0, WH / 2, HZ, SX, WH, 3, WALLC);
  box(scene, w, -HX, WH / 2, 0, 3, WH, SZ, WALLC);
  box(scene, w, HX, WH / 2, 0, 3, WH, SZ, WALLC);

  // —— 不规则路网：竖向大道（不等间距、宽窄不一、有的不贯通）——
  const vx = [-330, -190, -60, 70, 200, 320];
  vx.forEach((x, i) => {
    const partial = i % 3 === 1; // 部分路不贯通
    const cz = partial ? rrange(-HZ * 0.4, HZ * 0.4) : 0;
    let len = partial ? SZ * rrange(0.5, 0.7) : SZ - 24;
    len = Math.min(len, 2 * (HZ - 14 - Math.abs(cz))); // 夹紧，别戳出城墙
    road(scene, x, cz, rrange(9, 16), len);
  });
  // 横向大街
  const hz = [-500, -360, -210, -70, 80, 240, 420];
  hz.forEach((z, i) => {
    const partial = i % 3 === 2;
    const cx = partial ? rrange(-HX * 0.4, HX * 0.4) : 0;
    let len = partial ? SX * rrange(0.55, 0.75) : SX - 24;
    len = Math.min(len, 2 * (HX - 14 - Math.abs(cx)));
    road(scene, cx, z, len, rrange(9, 15));
  });
  // 主干大道（x=0，从南墙穿到广场、再从广场到北墙；出生点就在它南端，正前方通畅）
  road(scene, 0, (HZ + 60) / 2, 14, HZ - 60);
  road(scene, 0, -(HZ + 60) / 2, 14, HZ - 60);
  // 中央广场（核心区，留空铺地）
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(120, 0.09, 120),
    new THREE.MeshStandardMaterial({ color: 0x8f8a7e, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  plaza.position.set(0, 0.055, 0); plaza.receiveShadow = true; scene.add(plaza);
  roadRects.push({ x0: -60, x1: 60, z0: -60, z1: 60 });

  // —— 城市核心：广场四周几栋高楼（能进，搜刮重地）——
  const coreColor = () => pick(WALLH);
  tower(scene, w, -44, -44, 13, 11, 6, { s: true, e: true }, coreColor());
  tower(scene, w, 46, -42, 12, 12, 7, { s: true, w: true }, coreColor());
  tower(scene, w, -42, 46, 11, 12, 5, { n: true, e: true }, coreColor());
  tower(scene, w, 45, 46, 13, 11, 6, { n: true, w: true }, coreColor());
  // 广场掩体（四角斜位，不挡通行）
  for (const [x, z] of [[-30, 30], [30, 30], [-30, -30], [30, -30]] as [number, number][])
    prop(scene, w, pick([M.boxLarge, M.barrel, M.chest]), x, z, { width: 1.8, rotY: rrange(0, 6.28), solid: true });

  // —— 全城铺楼：抖动网格扫描，避开马路；近中心多高楼，外围多模型矮房 + 公园 ——
  let count = 0;
  for (let gx = -HX + 44; gx <= HX - 44; gx += 58) {
    for (let gz = -HZ + 44; gz <= HZ - 44; gz += 56) {
      const jx = Math.round(gx + rrange(-12, 12));
      const jz = Math.round(gz + rrange(-12, 12));
      if (nearRoad(jx, jz, 12)) continue;
      const dC = Math.hypot(jx, jz);
      if (dC < 95) continue; // 中央广场已布置
      const r = rnd();
      if (dC < 230) {
        // 市中心圈：高楼为主
        if (r < 0.7) tower(scene, w, jx, jz, rrange(10, 15), rrange(10, 14), 4 + Math.floor(rnd() * 4), randDoors(), pick(WALLH));
        else if (r < 0.85) prettyHouse(scene, w, jx, jz, rrange(9, 12), 1 + Math.floor(rnd() * 2), randDoors(), pick(WALLH));
        else park(scene, w, jx, jz, rrange(14, 20));
      } else {
        // 外围：模型矮房为主，夹杂高楼/能进的房/公园空地
        if (r < 0.5) modelHouse(scene, w, jx, jz, rrange(15, 24));
        else if (r < 0.66) prettyHouse(scene, w, jx, jz, rrange(9, 13), 1 + Math.floor(rnd() * 2), randDoors(), pick(WALLH));
        else if (r < 0.8) tower(scene, w, jx, jz, rrange(9, 13), rrange(9, 13), 3 + Math.floor(rnd() * 3), randDoors(), pick(WALLH));
        else if (r < 0.92) park(scene, w, jx, jz, rrange(16, 24));
        else { /* 留空地 */ }
      }
      count++;
    }
  }

  // —— 撤离点（四角 + 四边中点，靠墙）——
  for (const [x, z] of [[-HX + 24, -HZ + 24], [HX - 24, -HZ + 24], [-HX + 24, HZ - 24], [HX - 24, HZ - 24],
    [0, -HZ + 20], [0, HZ - 20], [-HX + 20, 0], [HX - 20, 0]] as [number, number][])
    extractPad(scene, x, z);

  // 把所有静态方块合并成一个网格（一次绘制，省帧率）
  flushBatch(scene);

  // 出生点（南边大街上，正前方通畅）
  return { walls: w, barriers: [], attackerSpawn: vec3(0, 0.9, HZ - 40) };
}

function randDoors(): Doors {
  const sides: (keyof Doors)[] = ['n', 's', 'e', 'w'];
  const d: Doors = {};
  const a = pick(sides); d[a] = true;
  if (rnd() < 0.5) { const b = pick(sides); d[b] = true; }
  return d;
}
