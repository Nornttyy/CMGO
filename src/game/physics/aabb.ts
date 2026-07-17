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

// 自动上台阶：水平方向被挡时，若把玩家盒垫高不超过 maxStep 就能站进想去的位置，
// 返回垫高后的中心点；垫不上去(墙太高)或根本没被挡，返回 null。
export function tryStepUp(want: Vec3, corrected: Vec3, half: Vec3, walls: Box[], maxStep: number): Vec3 | null {
  const blocked = Math.abs(corrected.x - want.x) > 1e-6 || Math.abs(corrected.z - want.z) > 1e-6;
  if (!blocked) return null;
  for (let s = 0.05; s <= maxStep + 1e-6; s += 0.05) {
    const test = vec3(want.x, corrected.y + s, want.z);
    const box = aabbFromCenter(test, half);
    if (!walls.some((w) => overlaps(box, w))) return test;
  }
  return null;
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
