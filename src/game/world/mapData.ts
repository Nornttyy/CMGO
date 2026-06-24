import { GRID as DEFAULT_GRID } from './mapGrid';

// 地图改成"对象格式"：每个东西记下 类型 + 位置 + 朝向 + 大小，
// 这样才能支持旋转、自定义高/长/宽、光幕、警家/匪家两个出生点。

export type ObjType = 'wall' | 'box' | 'house' | 'barrier' | 'A' | 'B' | 'spawnT' | 'spawnC';
export interface MapObj {
  t: ObjType;
  x: number; z: number;   // 世界坐标
  ry: number;             // 朝向（弧度，0 / 90° / 180° / 270°）
  w: number; h: number; d: number; // 大小：宽(x) 高(y) 深(z)，旋转前
}

export const MAP_KEY = 'cmgo_map_v2';
export const TILE = 5;

// 每种东西的默认大小
export const DEFAULTS: Record<ObjType, { w: number; h: number; d: number }> = {
  wall:    { w: 5, h: 5,   d: 5 },
  box:     { w: 2, h: 1.7, d: 2 },
  house:   { w: 6, h: 6,   d: 6 },
  barrier: { w: 5, h: 4.5, d: 0.5 },
  A:       { w: 4, h: 0.2, d: 4 },
  B:       { w: 4, h: 0.2, d: 4 },
  spawnT:  { w: 3, h: 0.2, d: 3 },
  spawnC:  { w: 3, h: 0.2, d: 3 },
};

export function makeObj(t: ObjType, x: number, z: number, ry = 0): MapObj {
  const d = DEFAULTS[t];
  return { t, x, z, ry, w: d.w, h: d.h, d: d.d };
}

export function saveObjects(objs: MapObj[]): void {
  try { localStorage.setItem(MAP_KEY, JSON.stringify({ v: 2, objs })); } catch { /* ignore */ }
}

export function loadObjects(): MapObj[] {
  try {
    const s = localStorage.getItem(MAP_KEY);
    if (s) {
      const j = JSON.parse(s) as { objs?: MapObj[] };
      if (j && Array.isArray(j.objs)) return j.objs;
    }
  } catch { /* ignore */ }
  return gridToObjects(DEFAULT_GRID); // 没存过就用起手示例图
}

// 把老的字母格子转成对象（当默认起手图用）
export function gridToObjects(grid: string): MapObj[] {
  const rows = grid.split('\n').map((r) => r.replace(/\s+$/, '')).filter((r) => r.length > 0);
  const H = rows.length, W = Math.max(1, ...rows.map((r) => r.length));
  const ox = -((W - 1) * TILE) / 2, oz = -((H - 1) * TILE) / 2;
  const objs: MapObj[] = [];
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const ch = rows[r][c];
      const x = ox + c * TILE, z = oz + r * TILE;
      if ('#▩'.includes(ch)) objs.push(makeObj('wall', x, z));
      else if ('Xx口箱'.includes(ch)) objs.push(makeObj('box', x, z));
      else if ('Hh房'.includes(ch)) objs.push(makeObj('house', x, z));
      else if (ch === 'A') objs.push(makeObj('A', x, z));
      else if (ch === 'B') objs.push(makeObj('B', x, z));
      else if ('Ss生'.includes(ch)) objs.push(makeObj('spawnT', x, z));
    }
  }
  return objs;
}

// 旋转 90° 的整数倍时，水平占地的宽/深会互换 —— 给碰撞盒/落点用
export function footprint(o: { ry: number; w: number; d: number }): { hw: number; hd: number } {
  const swap = Math.abs(Math.sin(o.ry)) > 0.5;
  return { hw: (swap ? o.d : o.w) / 2, hd: (swap ? o.w : o.d) / 2 };
}
