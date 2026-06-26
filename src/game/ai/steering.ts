import { Box } from '../physics/aabb';

// 简单避障"寻路"：在想去的方向附近挑一个不会撞墙的方向走。
// 不是全局 A*，但能让蛋蛋绕开墙、不卡住，看起来会自己找路。

export function blocked(x: number, z: number, walls: Box[], r: number): boolean {
  for (const b of walls) {
    if (b.max.y < 0.6) continue; // 地面等矮物不算墙
    if (x > b.min.x - r && x < b.max.x + r && z > b.min.z - r && z < b.max.z + r) return true;
  }
  return false;
}

// 从最贴近想走的方向开始，逐步往两边偏；最后能掉头(±π)绕出死角
const OFFS = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.7, -1.7, 2.3, -2.3, Math.PI];
// 返回一个单位方向：尽量贴近(dirX,dirZ)，但近处/中段/远处都不撞墙（近处也查，免得贴着墙蹭）
export function steer(px: number, pz: number, dirX: number, dirZ: number, walls: Box[], look = 4, r = 0.7): { x: number; z: number } {
  const base = Math.atan2(dirZ, dirX);
  for (const o of OFFS) {
    const a = base + o;
    const dx = Math.cos(a), dz = Math.sin(a);
    if (!blocked(px + dx * look, pz + dz * look, walls, r) &&
        !blocked(px + dx * look * 0.5, pz + dz * look * 0.5, walls, r) &&
        !blocked(px + dx * look * 0.22, pz + dz * look * 0.22, walls, r)) {
      return { x: dx, z: dz };
    }
  }
  return { x: dirX, z: dirZ }; // 全堵：保持原方向（让碰撞推开）
}

// 把点推出所有墙（避免卡进去）
export function pushOut(p: { x: number; z: number }, walls: Box[], r: number): void {
  for (const b of walls) {
    if (b.max.y < 0.6) continue;
    const minx = b.min.x - r, maxx = b.max.x + r, minz = b.min.z - r, maxz = b.max.z + r;
    if (p.x > minx && p.x < maxx && p.z > minz && p.z < maxz) {
      const pl = p.x - minx, pr = maxx - p.x, pd = p.z - minz, pu = maxz - p.z;
      const m = Math.min(pl, pr, pd, pu);
      if (m === pl) p.x = minx; else if (m === pr) p.x = maxx;
      else if (m === pd) p.z = minz; else p.z = maxz;
    }
  }
}
