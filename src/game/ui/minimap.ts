import { MapObj } from '../world/mapData';

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

    // 建筑：黑描边 + 灰填充（按高矮明暗）
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#000';
    for (const o of this.objs) {
      if (!SOLID.has(o.t)) continue;
      ctx.save();
      ctx.translate(mapX(o.x), mapY(o.z));
      ctx.rotate(-o.ry);
      ctx.fillStyle = heightGray(o.h);
      const w = o.w * s, d = o.d * s;
      ctx.fillRect(-w / 2, -d / 2, w, d);
      ctx.strokeRect(-w / 2, -d / 2, w, d);
      ctx.restore();
    }

    // 包点 A/B：彩色圆 + 字母
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 11px system-ui, sans-serif';
    for (const o of this.objs) {
      if (o.t !== 'A' && o.t !== 'B') continue;
      const mx = mapX(o.x), my = mapY(o.z);
      ctx.beginPath();
      ctx.arc(mx, my, 8, 0, Math.PI * 2);
      ctx.fillStyle = o.t === 'A' ? '#ff5630' : '#36c5f0';
      ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText(o.t, mx, my);
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
