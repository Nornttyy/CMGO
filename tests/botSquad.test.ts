import { describe, it, expect } from 'vitest';
import { BotSquad, SQUAD } from '../src/game/ai/botSquad';

const mate = (x: number, z: number, known: { x: number; z: number; age: number } | null = null, alive = true, visible = false) =>
  ({ alive, x, z, known, visible });

describe('BotSquad 情报共享', () => {
  it('有蛋看到玩家 → 0.5秒喊话延迟后全队知道', () => {
    const sq = new BotSquad();
    const mates = [mate(0, 0, { x: 10, z: 10, age: 0 }), mate(5, 0)];
    sq.update(0.2, mates);
    expect(sq.shared === null).toBe(true); // 还在喊
    sq.update(0.4, mates);
    expect(sq.shared !== null).toBe(true); // 喊到了
    expect(sq.shared!.x).toBe(10);
  });
  it('死蛋不广播', () => {
    const sq = new BotSquad();
    const mates = [mate(0, 0, { x: 10, z: 10, age: 0 }, false), mate(5, 0)];
    sq.update(1, mates); sq.update(1, mates);
    expect(sq.shared === null).toBe(true);
  });
  it('所有人都遗忘后共享情报消失', () => {
    const sq = new BotSquad();
    let mates = [mate(0, 0, { x: 10, z: 10, age: 0 }), mate(5, 0)];
    sq.update(0.6, mates);
    expect(sq.shared !== null).toBe(true);
    mates = [mate(0, 0, null), mate(5, 0)]; // 都忘了
    sq.update(0.1, mates);
    expect(sq.shared === null).toBe(true);
  });
});

describe('BotSquad 分工', () => {
  it('正面名额最多2只，第3只近的派去绕后，其余驻守', () => {
    const sq = new BotSquad();
    const mates = [
      mate(9, 10, { x: 10, z: 10, age: 0 }), // 离目标最近
      mate(8, 10), mate(7, 10), mate(0, 0), mate(-5, 0),
    ];
    sq.update(0.6, mates); sq.update(0.1, mates);
    expect(sq.roles.filter((r) => r === 'front').length).toBe(SQUAD.FRONT);
    expect(sq.roles.filter((r) => r === 'flank').length).toBe(1);
    expect(sq.roles[0]).toBe('front');
    expect(sq.roles[1]).toBe('front');
    expect(sq.roles[2]).toBe('flank');
    expect(sq.roles[3]).toBe('hold');
  });
  it('没有情报时全员 hold', () => {
    const sq = new BotSquad();
    sq.update(0.1, [mate(0, 0), mate(1, 0)]);
    expect(sq.roles.every((r) => r === 'hold')).toBe(true);
  });
});

describe('BotSquad 绕后点与谨慎', () => {
  it('绕后候选点在目标"背面"(相对正面蛋)约12米', () => {
    const sq = new BotSquad();
    // 正面蛋在原点附近，目标在(20,0) → 绕后点应在 x>20 的侧后方
    const mates = [mate(0, 1, { x: 20, z: 0, age: 0 }), mate(0, -1), mate(0, 5)];
    sq.update(0.6, mates); sq.update(0.1, mates);
    const cands = sq.flankCandidates(mates, 2);
    expect(cands.length).toBe(2);
    for (const c of cands) {
      expect(c.x > 20).toBe(true); // 在目标背面
      expect(Math.abs(Math.hypot(c.x - 20, c.z - 0) - SQUAD.FLANK_R) < 0.01).toBe(true);
    }
  });
  it('有队友阵亡 → 谨慎20秒', () => {
    const sq = new BotSquad();
    sq.noteDeath();
    expect(sq.caution).toBe(1);
    sq.update(SQUAD.CAUTION_T + 0.1, []);
    expect(sq.caution).toBe(0);
  });
});
