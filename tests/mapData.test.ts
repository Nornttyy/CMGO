import { describe, it, expect } from 'vitest';
import { gridToObjects } from '../src/game/world/mapData';
import { GRID } from '../src/game/world/mapGrid';

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

// 三路图纸本体：连通性 + 外圈封死（图纸改坏了这里会第一时间报警）
describe('三路图纸', () => {
  const rows = GRID.split('\n').map((r) => r.replace(/\s+$/, '')).filter((r) => r.length > 0);
  const walk = (ch: string): boolean => !'#▩HhX'.includes(ch); // 连通不许靠跳箱子

  const reach = (from: string, to: string): boolean => {
    const seen = new Set<string>(); const q: [number, number][] = [];
    rows.forEach((row, r) => [...row].forEach((c2, c) => { if (c2 === from) q.push([r, c]); }));
    while (q.length) {
      const [r, c] = q.pop() as [number, number];
      const k = r + ',' + c; if (seen.has(k)) continue; seen.add(k);
      const ch = rows[r]?.[c] ?? '#';
      if (ch === to) return true;
      if (!walk(ch)) continue;
      q.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
    }
    return false;
  };

  it('匪家能到警家/A包点/B包点', () => {
    expect(reach('S', 'C')).toBe(true);
    expect(reach('S', 'A')).toBe(true);
    expect(reach('S', 'B')).toBe(true);
  });

  it('外圈城墙封死', () => {
    expect([...rows[0]].every((c) => c === '#')).toBe(true);
    expect([...rows[rows.length - 1]].every((c) => c === '#')).toBe(true);
    for (const r of rows) {
      expect(r[0]).toBe('#');
      expect(r[r.length - 1]).toBe('#');
    }
  });
});
