import { Vec3, vec3 } from '../core/vec3';

export interface Box { min: Vec3; max: Vec3; }

export function aabbFromCenter(center: Vec3, half: Vec3): Box {
  return {
    min: vec3(center.x - half.x, center.y - half.y, center.z - half.z),
    max: vec3(center.x + half.x, center.y + half.y, center.z + half.z),
  };
}

export function overlaps(a: Box, b: Box): boolean {
  return (
    a.min.x < b.max.x && a.max.x > b.min.x &&
    a.min.y < b.max.y && a.max.y > b.min.y &&
    a.min.z < b.max.z && a.max.z > b.min.z
  );
}

// 把中心点沿"插得最浅"的那个轴推出墙外。返回新的中心点。
export function resolveCollisions(center: Vec3, half: Vec3, walls: Box[]): Vec3 {
  const c = vec3(center.x, center.y, center.z);
  for (const w of walls) {
    const box = aabbFromCenter(c, half);
    if (!overlaps(box, w)) continue;
    const penX = Math.min(box.max.x - w.min.x, w.max.x - box.min.x);
    const penY = Math.min(box.max.y - w.min.y, w.max.y - box.min.y);
    const penZ = Math.min(box.max.z - w.min.z, w.max.z - box.min.z);
    const minPen = Math.min(penX, penY, penZ);
    if (minPen === penX) {
      const mid = (w.min.x + w.max.x) / 2;
      c.x += c.x < mid ? -penX : penX;
    } else if (minPen === penY) {
      const mid = (w.min.y + w.max.y) / 2;
      c.y += c.y < mid ? -penY : penY;
    } else {
      const mid = (w.min.z + w.max.z) / 2;
      c.z += c.z < mid ? -penZ : penZ;
    }
  }
  return c;
}
