import { describe, it, expect } from 'vitest';
import { horizontalVelocity, WALK_SPEED, SPRINT_SPEED } from '../src/game/player/movement';
import { length } from '../src/game/core/vec3';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe('horizontalVelocity', () => {
  it('没有输入时速度为 0', () => {
    expect(horizontalVelocity({ forward: 0, right: 0, sprint: false }, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });
  it('yaw=0 向前 = -Z 方向，速度为走路速度', () => {
    const v = horizontalVelocity({ forward: 1, right: 0, sprint: false }, 0);
    expect(near(v.x, 0)).toBe(true);
    expect(near(v.z, -WALK_SPEED)).toBe(true);
  });
  it('yaw=0 向右 = +X 方向', () => {
    const v = horizontalVelocity({ forward: 0, right: 1, sprint: false }, 0);
    expect(near(v.x, WALK_SPEED)).toBe(true);
    expect(near(v.z, 0)).toBe(true);
  });
  it('斜着走不会更快（仍是走路速度）', () => {
    const v = horizontalVelocity({ forward: 1, right: 1, sprint: false }, 0);
    expect(near(length(v), WALK_SPEED)).toBe(true);
  });
  it('冲刺时用冲刺速度', () => {
    const v = horizontalVelocity({ forward: 1, right: 0, sprint: true }, 0);
    expect(near(length(v), SPRINT_SPEED)).toBe(true);
  });
  it('转向后速度大小不变', () => {
    const v = horizontalVelocity({ forward: 1, right: 0, sprint: false }, Math.PI / 2);
    expect(near(length(v), WALK_SPEED)).toBe(true);
  });
});
