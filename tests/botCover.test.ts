import { describe, it, expect } from 'vitest';
import { generateCoverPoints, pickCover, pickRetreatCover, peekPoint, COVER } from '../src/game/ai/botCover';
import { losClear } from '../src/game/ai/botSenses';
import { Box } from '../src/game/physics/aabb';

// 窄墙：x∈[-0.5,0.5], z∈[0,1], 高2 —— 探头1.2m能露出边
const wall: Box = { min: { x: -0.5, y: 0, z: 0 }, max: { x: 0.5, y: 2, z: 1 } };
const bounds = { minX: -30, maxX: 30, minZ: -30, maxZ: 30 };

describe('generateCoverPoints', () => {
  it('会沿墙四周生成点，且都不嵌在墙里', () => {
    const pts = generateCoverPoints([wall], bounds);
    expect(pts.length > 0).toBe(true);
    // 全部离墙有点距离(不 blocked)
    expect(pts.every((p) => p.x < -0.5 || p.x > 0.5 || p.z < 0 || p.z > 1)).toBe(true);
  });
  it('矮箱子(<0.6m)不生成掩体点', () => {
    const low: Box = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0.5, z: 1 } };
    expect(generateCoverPoints([low], bounds).length).toBe(0);
  });
});

describe('pickCover 挑掩体', () => {
  const covers = generateCoverPoints([wall], bounds);
  it('挑到的点确实挡住了对威胁的视线', () => {
    const i = pickCover(covers, [wall], 2.5, -0.7, 0, 7, () => false); // 蛋在墙南侧旁,威胁在北边7米
    expect(i >= 0).toBe(true);
    const p = covers[i];
    expect(losClear(p.x, p.z, 0, 7, [wall])).toBe(false); // 从掩体看威胁=被挡 ✓
  });
  it('被占用的点不挑', () => {
    const all = new Set(covers.map((_, i) => i));
    expect(pickCover(covers, [wall], 2.5, -0.7, 0, 7, (i) => all.has(i))).toBe(-1);
  });
  it('太远(>10m)的掩体不要(战斗中不跨图跑)', () => {
    expect(pickCover(covers, [wall], 25, 25, 28, 28, () => false)).toBe(-1);
  });
});

describe('pickRetreatCover 撤退掩体', () => {
  // 第二面远处的墙(南边16米外)
  const far: Box = { min: { x: -0.5, y: 0, z: -17 }, max: { x: 0.5, y: 2, z: -16 } };
  const covers = generateCoverPoints([wall, far], bounds);
  it('挑离威胁>14m且方向远离威胁的点', () => {
    const i = pickRetreatCover(covers, [wall, far], 0, -3, 0, 7, () => false); // 蛋在(0,-3),威胁(0,7)
    expect(i >= 0).toBe(true);
    const p = covers[i];
    expect(Math.hypot(p.x - 0, p.z - 7) > COVER.RETREAT_DIST).toBe(true);
    expect(p.z < -3).toBe(true); // 在蛋的南边=远离威胁
  });
});

describe('peekPoint 探头', () => {
  it('从掩体侧移能找到看得见威胁的点', () => {
    const cover = { x: 0, z: -0.7 }; // 墙正南
    const p = peekPoint(cover, [wall], 0, 7);
    expect(p !== null).toBe(true);
    expect(losClear(p!.x, p!.z, 0, 7, [wall])).toBe(true); // 探出来能看到 ✓
  });
  it('两边都探不出去(墙太宽)返回 null', () => {
    const wide: Box = { min: { x: -5, y: 0, z: 0 }, max: { x: 5, y: 2, z: 1 } };
    expect(peekPoint({ x: 0, z: -0.7 }, [wide], 0, 7)).toBe(null);
  });
});
