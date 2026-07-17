import { describe, it, expect } from 'vitest';
import { gridToObjects } from '../src/game/world/mapData';

// 图纸图例扩展：C=警家出生点，= 是准备阶段光幕（朝向按邻格自动判断）
describe('图例扩展', () => {
  it('C 解析成警家出生点', () => {
    const objs = gridToObjects(`\n###\n#C#\n###\n`);
    expect(objs.some((o) => o.t === 'spawnC')).toBe(true);
  });

  it('= 左右贴墙 → 横跨走廊(ry=0)', () => {
    const objs = gridToObjects(`\n###\n#=#\n###\n`);
    const b = objs.find((o) => o.t === 'barrier');
    expect(b?.ry).toBe(0);
  });

  it('= 上下贴墙 → 竖跨门洞(ry=π/2)', () => {
    const objs = gridToObjects(`\n.#.\n.=.\n.#.\n`);
    const b = objs.find((o) => o.t === 'barrier');
    expect(b?.ry).toBeCloseTo(Math.PI / 2);
  });
});
