import { describe, it, expect } from 'vitest';
import { overlaps, aabbFromCenter, resolveCollisions, tryStepUp, Box } from '../src/game/physics/aabb';
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

describe('自动上台阶 tryStepUp', () => {
  // 玩家盒 half=(0.4,0.9,0.4)，站地时中心 y=0.9
  const ph = vec3(0.4, 0.9, 0.4);
  // 0.4 米高的台阶：x 0..2，顶面 y=0.4
  const step = { min: vec3(0, 0, -2), max: vec3(2, 0.4, 2) };
  // 5 米高墙
  const tall = { min: vec3(0, 0, -2), max: vec3(2, 5, 2) };

  it('0.4米台阶：垫高后能走上去', () => {
    // 真实走路是每帧往里挤几厘米：右边缘刚好探进台阶 0.05 → 被水平推回
    const want = vec3(-0.35, 0.9, 0);
    const corrected = resolveCollisions(want, ph, [step]);
    const up = tryStepUp(want, corrected, ph, [step], 0.55);
    expect(up !== null).toBe(true);
    expect((up as { y: number }).y > 0.4 + 0.9 - 1e-6).toBe(true); // 中心至少抬到台阶顶+半高
  });

  it('5米高墙：垫0.55米也过不去 → null', () => {
    const want = vec3(0.2, 0.9, 0);
    const corrected = resolveCollisions(want, ph, [tall]);
    expect(tryStepUp(want, corrected, ph, [tall], 0.55)).toBe(null);
  });

  it('没被挡住时不垫步 → null', () => {
    const want = vec3(-3, 0.9, 0);
    expect(tryStepUp(want, want, ph, [step], 0.55)).toBe(null);
  });
});
