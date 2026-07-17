import * as THREE from 'three';
import { Box } from '../physics/aabb';
import { vec3 } from '../core/vec3';

// 盖房机：用"盒子"拼出能走进去的房间——四面墙 + 门洞 + 窗洞 + 楼梯 + 二楼楼板 + 女儿墙。
// roomBoxes 是纯函数(只算碰撞盒,好写单测)；buildRoom 负责画网格+把盒子推进 walls。
//
// 尺寸规矩(米)：墙厚0.3；门宽1.6高2.2(上有门楣)；窗宽1.4,窗台0~1.1,窗口1.1~2.1,窗楣2.1~墙顶；
// 二楼：楼板2.9~3.2(楼梯上方留口),女儿墙3.2~4.1(站二楼能探头能架枪);
// 楼梯：西侧内墙一条6级×0.5高×0.75深(自动上台阶≤0.55,走上去顺滑),顶级3.0再垫0.2上楼板。

export type Side = 'N' | 'S' | 'E' | 'W';
export interface RoomSpec {
  x: number; z: number;    // 房中心
  w: number; d: number;    // 外径(米)
  wallH: number;           // 单层墙高(二楼时忽略,墙到3.2+女儿墙到4.1)
  color: number;           // 墙色
  doors: { side: Side; off?: number }[];    // off=沿这面墙的偏移(米,默认居中)
  windows: { side: Side; off?: number }[];
  twoFloor?: boolean;
}
export type RoomKind = 'wall' | 'lintel' | 'sill' | 'top' | 'slab' | 'step' | 'parapet';
export interface RoomBox { box: Box; kind: RoomKind; }

const T = 0.3;                 // 墙厚
const DOOR_W = 1.6, DOOR_H = 2.2;
const WIN_W = 1.4, SILL_H = 1.1, WIN_TOP = 2.1;
const SLAB_Y0 = 2.9, SLAB_Y1 = 3.2, PARAPET_TOP = 4.1;
const STEPS = 6, STEP_RISE = 0.5, STEP_DEPTH = 0.75, STAIR_W = 1.0;

interface Hole { lo: number; hi: number; door: boolean; }

export function roomBoxes(spec: RoomSpec): RoomBox[] {
  const out: RoomBox[] = [];
  const H = spec.twoFloor ? SLAB_Y1 : spec.wallH;
  const hw = spec.w / 2, hd = spec.d / 2;

  // 一面墙：along='x' 时墙沿 x 方向延伸(N/S墙)，fixed 是墙中线的 z(或 x)
  const buildSide = (side: Side): void => {
    const along: 'x' | 'z' = side === 'N' || side === 'S' ? 'x' : 'z';
    const L = along === 'x' ? spec.w : spec.d;
    const fixed = side === 'N' ? spec.z - hd + T / 2 : side === 'S' ? spec.z + hd - T / 2
      : side === 'W' ? spec.x - hw + T / 2 : spec.x + hw - T / 2;
    const holes: Hole[] = [];
    for (const dr of spec.doors) if (dr.side === side) holes.push({ lo: (dr.off ?? 0) - DOOR_W / 2, hi: (dr.off ?? 0) + DOOR_W / 2, door: true });
    for (const wn of spec.windows) if (wn.side === side) holes.push({ lo: (wn.off ?? 0) - WIN_W / 2, hi: (wn.off ?? 0) + WIN_W / 2, door: false });
    holes.sort((a, b) => a.lo - b.lo);

    // s 是沿墙方向的局部坐标(-L/2..L/2) → 世界盒
    const seg = (s0: number, s1: number, y0: number, y1: number, kind: RoomKind): void => {
      if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return;
      const c = along === 'x' ? spec.x : spec.z;
      const box: Box = along === 'x'
        ? { min: vec3(c + s0, y0, fixed - T / 2), max: vec3(c + s1, y1, fixed + T / 2) }
        : { min: vec3(fixed - T / 2, y0, c + s0), max: vec3(fixed + T / 2, y1, c + s1) };
      out.push({ box, kind });
    };

    let cur = -L / 2;
    for (const h of holes) {
      seg(cur, h.lo, 0, H, 'wall');
      if (h.door) seg(h.lo, h.hi, DOOR_H, H, 'lintel');
      else { seg(h.lo, h.hi, 0, SILL_H, 'sill'); seg(h.lo, h.hi, WIN_TOP, H, 'top'); }
      cur = h.hi;
    }
    seg(cur, L / 2, 0, H, 'wall');
    if (spec.twoFloor) seg(-L / 2, L / 2, SLAB_Y1, PARAPET_TOP, 'parapet');
  };
  buildSide('N'); buildSide('S'); buildSide('E'); buildSide('W');

  if (spec.twoFloor) {
    // 楼梯：贴西侧内墙,从南往北登高
    const sx0 = spec.x - hw + T, sx1 = sx0 + STAIR_W;
    const zS = spec.z + hd - T; // 内侧南边缘
    for (let k = 1; k <= STEPS; k++) {
      out.push({ kind: 'step', box: { min: vec3(sx0, 0, zS - STEP_DEPTH * k), max: vec3(sx1, STEP_RISE * k, zS - STEP_DEPTH * (k - 1)) } });
    }
    // 楼板：主板(楼梯条以东) + 楼梯尽头的小平台(楼梯条以北)
    const zN = spec.z - hd + T;
    out.push({ kind: 'slab', box: { min: vec3(sx1, SLAB_Y0, zN), max: vec3(spec.x + hw - T, SLAB_Y1, spec.z + hd - T) } });
    const stairEndZ = zS - STEP_DEPTH * STEPS;
    if (stairEndZ > zN + 0.05) {
      out.push({ kind: 'slab', box: { min: vec3(sx0, SLAB_Y0, zN), max: vec3(sx1, SLAB_Y1, stairEndZ) } });
    }
  }
  return out;
}

// 每种部件的配色偏移(同一个墙色家族里做深浅,看得清结构)
function kindColor(base: number, kind: RoomKind): number {
  const c = new THREE.Color(base);
  if (kind === 'sill' || kind === 'step') c.multiplyScalar(0.82);
  else if (kind === 'lintel' || kind === 'top' || kind === 'parapet') c.multiplyScalar(0.9);
  else if (kind === 'slab') return 0x9a7a4e; // 楼板：木色
  return c.getHex();
}

export function buildRoom(scene: THREE.Scene, walls: Box[], spec: RoomSpec): void {
  for (const { box, kind } of roomBoxes(spec)) {
    const w = box.max.x - box.min.x, h = box.max.y - box.min.y, d = box.max.z - box.min.z;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: kindColor(spec.color, kind), roughness: 0.92 }));
    m.position.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.mat = kind === 'slab' ? 'wood' : 'brick'; // 0.3薄墙:高穿枪能打穿;木楼板:中穿就能隔楼板打
    scene.add(m);
    walls.push(box);
  }
}
