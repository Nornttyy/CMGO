import { MapObj, footprint } from '../world/mapData';

interface MRect { x0: number; x1: number; z0: number; z1: number; h: number; t: string; }

// 右上角小地图：从正上方往下看，把墙/楼/箱子画成"黑描边 + 灰填充"的方块，
// 用明暗表示高矮（越矮越浅灰、越高越深灰），再画一个玩家朝向箭头。

const SOLID = new Set(['wall', 'house', 'box']);

// 高矮 → 灰度：矮 = 浅灰(205)，高 = 深灰(85)
function heightGray(h: number): string {
  const t = Math.max(0, Math.min(1, (h - 1) / (15 - 1)));
  const v = Math.round(205 - t * 120);
  return `rgb(${v},${v},${v})`;
}

export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private minX = -30; private maxX = 30; private minZ = -30; private maxZ = 30;

  constructor(private canvas: HTMLCanvasElement, private objs: MapObj[]) {
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
    for (const o of objs) {
      if (!SOLID.has(o.t)) continue;
      const r = Math.max(o.w, o.d) / 2;
      mnx = Math.min(mnx, o.x - r); mxx = Math.max(mxx, o.x + r);
      mnz = Math.min(mnz, o.z - r); mxz = Math.max(mxz, o.z + r);
    }
    if (mnx !== Infinity) {
      const pad = 5;
      this.minX = mnx - pad; this.maxX = mxx + pad; this.minZ = mnz - pad; this.maxZ = mxz + pad;
    }
  }

  draw(px: number, pz: number, yaw: number): void {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    const spanX = this.maxX - this.minX, spanZ = this.maxZ - this.minZ;
    const s = Math.min(W / spanX, H / spanZ);
    const ox = (W - spanX * s) / 2, oz = (H - spanZ * s) / 2;
    const mapX = (x: number): number => ox + (x - this.minX) * s;
    const mapY = (z: number): number => oz + (z - this.minZ) * s;

    // 建筑：相邻的连成一片 —— 灰填充(按高矮明暗)不描每块的边，只在整体外轮廓描黑边
    const rects: MRect[] = this.objs.filter((o) => SOLID.has(o.t)).map((o) => {
      const fp = footprint(o);
      return { x0: o.x - fp.hw, x1: o.x + fp.hw, z0: o.z - fp.hd, z1: o.z + fp.hd, h: o.h, t: o.t };
    });
    for (const r of rects) { // 填充（多撑 0.5px 让相邻块严丝合缝，不留发丝缝）
      ctx.fillStyle = heightGray(r.h);
      ctx.fillRect(mapX(r.x0) - 0.5, mapY(r.z0) - 0.5, (r.x1 - r.x0) * s + 1, (r.z1 - r.z0) * s + 1);
    }
    // 只描外轮廓：某条边旁边紧挨着别的建筑就不画（那是内部边）
    const E = 0.3;
    const ovX = (a: MRect, b: MRect): boolean => a.x0 < b.x1 - 0.1 && a.x1 > b.x0 + 0.1;
    const ovZ = (a: MRect, b: MRect): boolean => a.z0 < b.z1 - 0.1 && a.z1 > b.z0 + 0.1;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const r of rects) {
      const L = mapX(r.x0), R = mapX(r.x1), T = mapY(r.z0), B = mapY(r.z1);
      const same = (o: MRect): boolean => o !== r && o.t === r.t; // 只有同类型才算"连着"，不画内部边
      if (!rects.some((o) => same(o) && Math.abs(o.z1 - r.z0) < E && ovX(o, r))) { ctx.moveTo(L, T); ctx.lineTo(R, T); }
      if (!rects.some((o) => same(o) && Math.abs(o.z0 - r.z1) < E && ovX(o, r))) { ctx.moveTo(L, B); ctx.lineTo(R, B); }
      if (!rects.some((o) => same(o) && Math.abs(o.x1 - r.x0) < E && ovZ(o, r))) { ctx.moveTo(L, T); ctx.lineTo(L, B); }
      if (!rects.some((o) => same(o) && Math.abs(o.x0 - r.x1) < E && ovZ(o, r))) { ctx.moveTo(R, T); ctx.lineTo(R, B); }
    }
    ctx.stroke();

    // 包点 A/B：每个包点只在它的中心画一个标记（不是每格一个字母）
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 12px system-ui, sans-serif';
    for (const [letter, color] of [['A', '#ff5630'], ['B', '#36c5f0']] as [string, string][]) {
      const cells = this.objs.filter((o) => o.t === letter);
      if (!cells.length) continue;
      const cx = cells.reduce((s, o) => s + o.x, 0) / cells.length;
      const cz = cells.reduce((s, o) => s + o.z, 0) / cells.length;
      const mx = mapX(cx), my = mapY(cz);
      ctx.beginPath();
      ctx.arc(mx, my, 9, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText(letter, mx, my);
    }

    // 玩家朝向箭头
    ctx.save();
    ctx.translate(mapX(px), mapY(pz));
    ctx.rotate(-yaw);
    ctx.fillStyle = '#ffd35a';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
