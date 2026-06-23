import { describe, it, expect } from 'vitest';
import { vec3, add, scale, length, normalize } from '../src/game/core/vec3';

describe('vec3', () => {
  it('相加', () => expect(add(vec3(1, 2, 3), vec3(4, 5, 6))).toEqual({ x: 5, y: 7, z: 9 }));
  it('缩放', () => expect(scale(vec3(1, 2, 3), 2)).toEqual({ x: 2, y: 4, z: 6 }));
  it('长度', () => expect(length(vec3(3, 4, 0))).toBe(5));
  it('单位化', () => expect(normalize(vec3(0, 0, 5))).toEqual({ x: 0, y: 0, z: 1 }));
  it('零向量单位化返回零', () => expect(normalize(vec3(0, 0, 0))).toEqual({ x: 0, y: 0, z: 0 }));
});
