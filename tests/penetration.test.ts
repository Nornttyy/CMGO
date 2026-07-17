import { describe, it, expect } from 'vitest';
import { resolveShot, HitFace, Mat } from '../src/game/weapons/penetration';

// 造一个"打进又打出"的物体（两张面：进 + 出）
let nextId = 1;
function obj(mat: Mat, enterDist: number, thickness: number): HitFace[] {
  const id = nextId++;
  return [
    { dist: enterDist, mat, entering: true, objId: id },
    { dist: enterDist + thickness, mat, entering: false, objId: id },
  ];
}

describe('子弹穿透规则', () => {
  it('空场：飞到天边,伤害不减', () => {
    const r = resolveShot([], 2);
    expect(r.stopDist).toBe(null);
    expect(r.factor).toBe(1);
  });

  it('薄木箱：低穿×0.55 / 中穿×0.7 / 高穿×0.8', () => {
    expect(resolveShot(obj('wood', 5, 0.5), 1).factor).toBeCloseTo(0.55);
    expect(resolveShot(obj('wood', 5, 0.5), 2).factor).toBeCloseTo(0.7);
    expect(resolveShot(obj('wood', 5, 0.5), 3).factor).toBeCloseTo(0.8);
    expect(resolveShot(obj('wood', 5, 0.5), 1).stopDist).toBe(null);
  });

  it('超厚木头(3米>上限2米)：高穿也挡停', () => {
    const r = resolveShot(obj('wood', 5, 3), 3);
    expect(r.stopDist).toBe(5);
  });

  it('矮墙：低穿挡停,中穿×0.55,高穿×0.7', () => {
    expect(resolveShot(obj('low', 4, 1), 1).stopDist).toBe(4);
    expect(resolveShot(obj('low', 4, 1), 2).factor).toBeCloseTo(0.55);
    expect(resolveShot(obj('low', 4, 1), 3).factor).toBeCloseTo(0.7);
  });

  it('砖墙1米：低/中穿挡停,高穿×0.45', () => {
    expect(resolveShot(obj('brick', 8, 1), 1).stopDist).toBe(8);
    expect(resolveShot(obj('brick', 8, 1), 2).stopDist).toBe(8);
    expect(resolveShot(obj('brick', 8, 1), 3).factor).toBeCloseTo(0.45);
  });

  it('5米厚合并墙：高穿也打不穿', () => {
    expect(resolveShot(obj('brick', 8, 5), 3).stopDist).toBe(8);
  });

  it('主城墙/地面(solid)：永远挡停', () => {
    expect(resolveShot(obj('solid', 3, 1), 3).stopDist).toBe(3);
  });

  it('植物：全穿不衰减', () => {
    const r = resolveShot(obj('plant', 2, 0.8), 1);
    expect(r.stopDist).toBe(null);
    expect(r.factor).toBe(1);
  });

  it('两层木箱：保留率连乘(高穿0.8×0.8=0.64)', () => {
    const faces = [...obj('wood', 5, 0.5), ...obj('wood', 9, 0.5)];
    const r = resolveShot(faces, 3);
    expect(r.factor).toBeCloseTo(0.64);
    expect(r.passDists.length).toBe(2);
  });

  it('只打进没打出(没有出面)：按挡停', () => {
    const r = resolveShot([{ dist: 6, mat: 'wood', entering: true, objId: 77 }], 3);
    expect(r.stopDist).toBe(6);
  });

  it('乱序输入也按距离先后处理', () => {
    const faces = [...obj('wood', 9, 0.5), ...obj('solid', 5, 1)];
    const r = resolveShot(faces, 3);
    expect(r.stopDist).toBe(5); // 先撞到5米处的solid就停,后面木箱无关
  });
});
