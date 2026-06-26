import { Box } from '../physics/aabb';
import { blocked } from './steering';

export interface Pt { x: number; z: number; }

// 网格 A* 寻路：把地图按格子分块，标出哪些格子被墙挡住，然后用 A* 找一条绕开墙的路。
// 让蛋蛋会真正"绕过去"，而不是傻傻顶着墙。
export class PathGrid {
  private cols: number;
  private rows: number;
  private cell: number;
  private ox: number;
  private oz: number;
  private block: Uint8Array; // 1=该格被墙挡住

  constructor(walls: Box[], minX: number, minZ: number, maxX: number, maxZ: number, cell = 1.8, clear = 0.9) {
    this.cell = cell;
    this.ox = minX;
    this.oz = minZ;
    this.cols = Math.max(1, Math.ceil((maxX - minX) / cell) + 1);
    this.rows = Math.max(1, Math.ceil((maxZ - minZ) / cell) + 1);
    this.block = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = this.ox + c * cell, z = this.oz + r * cell;
        this.block[r * this.cols + c] = blocked(x, z, walls, clear) ? 1 : 0;
      }
    }
  }

  private inb(c: number, r: number): boolean { return c >= 0 && c < this.cols && r >= 0 && r < this.rows; }
  private walkable(c: number, r: number): boolean { return this.inb(c, r) && this.block[r * this.cols + c] === 0; }
  private cc(x: number): number { return Math.max(0, Math.min(this.cols - 1, Math.round((x - this.ox) / this.cell))); }
  private cr(z: number): number { return Math.max(0, Math.min(this.rows - 1, Math.round((z - this.oz) / this.cell))); }

  // 从 (sx,sz) 找一条到 (tx,tz) 的路；返回拐点(世界坐标)列表，找不到返回 []
  findPath(sx: number, sz: number, tx: number, tz: number): Pt[] {
    const sc = this.cc(sx), sr = this.cr(sz);
    let tc = this.cc(tx), tr = this.cr(tz);
    if (!this.walkable(tc, tr)) { const near = this.nearestWalkable(tc, tr); if (!near) return []; tc = near.c; tr = near.r; }
    if (!this.walkable(sc, sr)) return [];

    const N = this.cols * this.rows;
    const g = new Float32Array(N).fill(Infinity);
    const f = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const si = sr * this.cols + sc, ti = tr * this.cols + tc;
    const heur = (c: number, r: number): number => Math.hypot(c - tc, r - tr);
    g[si] = 0; f[si] = heur(sc, sr);
    const open: number[] = [si];

    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur === ti) return this.reconstruct(came, ti);
      closed[cur] = 1;
      const cucol = cur % this.cols, curow = (cur / this.cols) | 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dc === 0 && dr === 0) continue;
          const nc = cucol + dc, nr = curow + dr;
          if (!this.walkable(nc, nr)) continue;
          if (dc !== 0 && dr !== 0 && (!this.walkable(cucol + dc, curow) || !this.walkable(cucol, curow + dr))) continue; // 不抄对角的墙角
          const ni = nr * this.cols + nc;
          if (closed[ni]) continue;
          const step = dc !== 0 && dr !== 0 ? 1.4142 : 1;
          const ng = g[cur] + step;
          if (ng < g[ni]) { came[ni] = cur; g[ni] = ng; f[ni] = ng + heur(nc, nr); if (!open.includes(ni)) open.push(ni); }
        }
      }
    }
    return [];
  }

  // 在 (c,r) 附近螺旋找一个能走的格子（目标点正好在墙里时用）
  private nearestWalkable(c: number, r: number): { c: number; r: number } | null {
    for (let rad = 1; rad <= 6; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.abs(dc) !== rad && Math.abs(dr) !== rad) continue;
          if (this.walkable(c + dc, r + dr)) return { c: c + dc, r: r + dr };
        }
      }
    }
    return null;
  }

  // 由 came 链还原路径，并去掉同方向的中间点（只留拐点），让走起来不那么格子化
  private reconstruct(came: Int32Array, ti: number): Pt[] {
    const cells: number[] = [];
    for (let cur = ti; cur !== -1; cur = came[cur]) cells.push(cur);
    cells.reverse();
    const pts: Pt[] = [];
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i] % this.cols, r = (cells[i] / this.cols) | 0;
      if (i > 0 && i < cells.length - 1) {
        const pc = cells[i - 1] % this.cols, pr = (cells[i - 1] / this.cols) | 0;
        const ncc = cells[i + 1] % this.cols, nrr = (cells[i + 1] / this.cols) | 0;
        if (c - pc === ncc - c && r - pr === nrr - r) continue; // 方向没变，跳过这个中间点
      }
      pts.push({ x: this.ox + c * this.cell, z: this.oz + r * this.cell });
    }
    return pts;
  }
}
