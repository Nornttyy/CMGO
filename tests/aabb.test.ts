import { describe, it, expect } from 'vitest';
import { overlaps, aabbFromCenter, resolveCollisions, Box } from '../src/game/physics/aabb';
import { vec3 } from '../src/game/core/vec3';

const wall: Box = { min: vec3(0, 0, 0), max: vec3(2, 2, 2) };
const half = vec3(0.5, 0.5, 0.5);

describe('aabb', () => {
  it('重叠判定', () => {
    expect(overlaps(aabbFromCenter(vec3(1, 1, 1), half), wall)).toBe(true);
    expect(overlaps(aabbFromCenter(vec3(5, 5, 5), half), wall)).toBe(false);
  });
  it('没碰到时位置不变', () => {
    expect(resolveCollisions(vec3(5, 1, 1), half, [wall])).toEqual(vec3(5, 1, 1));
  });
  it('从左边插进墙里会被推到墙左边', () => {
    // 中心 x=-0.2，右边缘 0.3 插进了墙（墙 min.x=0）。应被推到 x=-0.5（右边缘正好贴墙）
    const out = resolveCollisions(vec3(-0.2, 1, 1), half, [wall]);
    expect(Math.abs(out.x - -0.5) < 1e-6).toBe(true);
    expect(out.z).toBe(1);
  });
});
