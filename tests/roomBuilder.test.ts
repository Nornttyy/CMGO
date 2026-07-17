import { describe, it, expect } from 'vitest';
import { roomBoxes, RoomSpec } from '../src/game/world/roomBuilder';

// 样板房：7×6 两层，南门、北窗
const SPEC: RoomSpec = {
  x: 0, z: 0, w: 7, d: 6, wallH: 3.0, color: 0xdddddd,
  doors: [{ side: 'S' }], windows: [{ side: 'N' }], twoFloor: true,
};

const boxes = roomBoxes(SPEC);
const blockedAt = (x: number, y: number, z: number): boolean =>
  boxes.some(({ box: b }) =>
    x > b.min.x && x < b.max.x && y > b.min.y && y < b.max.y && z > b.min.z && z < b.max.z);

describe('盖房机 roomBoxes', () => {
  it('南门洞能走人(1.6宽×2.2高),门边是墙,门上有门楣', () => {
    expect(blockedAt(0, 1.0, 2.85)).toBe(false);  // 门洞中间
    expect(blockedAt(2.0, 1.0, 2.85)).toBe(true); // 门旁边的墙
    expect(blockedAt(0, 2.6, 2.85)).toBe(true);   // 门楣
  });

  it('北窗：窗台挡脚、窗口能架枪、窗楣挡头', () => {
    expect(blockedAt(0, 0.5, -2.85)).toBe(true);  // 窗台(0~1.1)
    expect(blockedAt(0, 1.6, -2.85)).toBe(false); // 窗口(1.1~2.1)
    expect(blockedAt(0, 2.5, -2.85)).toBe(true);  // 窗楣(2.1~墙顶)
  });

  it('楼梯6级,级差全部≤0.55(自动上台阶能走)', () => {
    const steps = boxes.filter((b) => b.kind === 'step').map((b) => b.box.max.y).sort((a, b2) => a - b2);
    expect(steps.length).toBe(6);
    expect(steps[0] <= 0.55).toBe(true);
    for (let i = 1; i < steps.length; i++) expect(steps[i] - steps[i - 1] <= 0.55).toBe(true);
    // 顶级台阶(3.0)到楼板面(3.2)也只差0.2
    const slabTop = Math.max(...boxes.filter((b) => b.kind === 'slab').map((b) => b.box.max.y));
    expect(slabTop - steps[steps.length - 1] <= 0.55).toBe(true);
  });

  it('楼板盖住二楼但楼梯上方留口', () => {
    expect(blockedAt(1.0, 3.05, 0)).toBe(true);    // 楼板本体
    expect(blockedAt(-2.7, 3.05, 0.5)).toBe(false); // 楼梯上方的口子
  });

  it('女儿墙半高：3.6米处挡住,4.3米处已是天空', () => {
    expect(blockedAt(0, 3.6, 2.85)).toBe(true);
    expect(blockedAt(0, 4.3, 2.85)).toBe(false);
  });
});
