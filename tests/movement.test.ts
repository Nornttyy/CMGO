import { describe, it, expect } from 'vitest';
import { horizontalVelocity, WALK_SPEED, SLOW_WALK_SPEED, CROUCH_SPEED } from '../src/game/player/movement';
import { length } from '../src/game/core/vec3';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe('horizontalVelocity', () => {
  it('没有输入时速度为 0', () => {
    expect(horizontalVelocity({ forward: 0, right: 0, slowWalk: false, crouch: false }, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });
  it('yaw=0 向前 = -Z 方向，速度为走路速度', () => {
    const v = horizontalVelocity({ forward: 1, right: 0, slowWalk: false, crouch: false }, 0);
    expect(near(v.x, 0)).toBe(true);
    expect(near(v.z, -WALK_SPEED)).toBe(true);
  });
  it('yaw=0 向右 = +X 方向', () => {
    const v = horizontalVelocity({ forward: 0, right: 1, slowWalk: false, crouch: false }, 0);
    expect(near(v.x, WALK_SPEED)).toBe(true);
    expect(near(v.z, 0)).toBe(true);
  });
  it('斜着走不会更快（仍是走路速度）', () => {
    const v = horizontalVelocity({ forward: 1, right: 1, slowWalk: false, crouch: false }, 0);
    expect(near(length(v), WALK_SPEED)).toBe(true);
  });
  it('静步时用更慢的速度', () => {
    const v = horizontalVelocity({ forward: 1, right: 0, slowWalk: true, crouch: false }, 0);
    expect(near(length(v), SLOW_WALK_SPEED)).toBe(true);
  });
  it('蹲下时用蹲下速度（最慢）', () => {
    const v = horizontalVelocity({ forward: 1, right: 0, slowWalk: false, crouch: true }, 0);
    expect(near(length(v), CROUCH_SPEED)).toBe(true);
    expect(CROUCH_SPEED < WALK_SPEED).toBe(true);
  });
  it('转向后速度大小不变', () => {
    const v = horizontalVelocity({ forward: 1, right: 0, slowWalk: false, crouch: false }, Math.PI / 2);
    expect(near(length(v), WALK_SPEED)).toBe(true);
  });
});
