import { describe, it, expect } from 'vitest';
import { BotSenses, losClear, SENSE } from '../src/game/ai/botSenses';
import { Box } from '../src/game/physics/aabb';

// 一面挡在中间的墙：x∈[-0.5,0.5], z∈[0,1], 高2米
const wall: Box = { min: { x: -0.5, y: 0, z: 0 }, max: { x: 0.5, y: 2, z: 1 } };

describe('losClear 视线', () => {
  it('没有墙时看得见', () => {
    expect(losClear(0, -5, 0, 5, [])).toBe(true);
  });
  it('隔着墙看不见', () => {
    expect(losClear(0, -5, 0, 5, [wall])).toBe(false);
  });
  it('矮箱子(<0.6m)不挡视线', () => {
    const low: Box = { min: { x: -0.5, y: 0, z: 0 }, max: { x: 0.5, y: 0.5, z: 1 } };
    expect(losClear(0, -5, 0, 5, [low])).toBe(true);
  });
});

describe('BotSenses 视野', () => {
  it('正前方近处能看到 → 记下位置', () => {
    const s = new BotSenses();
    s.updateVision(0, 0, 0, 1, 0, 10, true, []); // 面朝+z，玩家在正前10米
    expect(s.visible).toBe(true);
    expect(s.lastKnown !== null).toBe(true);
    expect(s.lastKnown!.x).toBe(0);
    expect(s.lastKnown!.z).toBe(10);
  });
  it('正后方看不到（120°扇形外）', () => {
    const s = new BotSenses();
    s.updateVision(0, 0, 0, 1, 0, -10, true, []); // 玩家在正后方
    expect(s.visible).toBe(false);
  });
  it('太远(>24m)看不到', () => {
    const s = new BotSenses();
    s.updateVision(0, 0, 0, 1, 0, SENSE.VIEW_DIST + 1, true, []);
    expect(s.visible).toBe(false);
  });
  it('隔墙看不到', () => {
    const s = new BotSenses();
    s.updateVision(0, -5, 0, 1, 0, 5, true, [wall]);
    expect(s.visible).toBe(false);
  });
  it('玩家阵亡了当作不存在', () => {
    const s = new BotSenses();
    s.updateVision(0, 0, 0, 1, 0, 10, false, []);
    expect(s.visible).toBe(false);
  });
  it('看到会清掉疑点(都亲眼看见了)', () => {
    const s = new BotSenses();
    s.hearAt(3, 3, () => 0);
    s.updateVision(0, 0, 0, 1, 0, 10, true, []);
    expect(s.heard === null).toBe(true);
  });
});

describe('BotSenses 听觉/挨打/记忆', () => {
  it('听声有±2m内的误差(rng=0时无偏)', () => {
    const s = new BotSenses();
    s.hearAt(5, 7, () => 0);
    expect(s.heard!.x).toBe(5);
    expect(s.heard!.z).toBe(7);
  });
  it('挨打立刻大致知道你在哪', () => {
    const s = new BotSenses();
    s.onDamaged(4, 6, () => 0);
    expect(s.lastKnown!.x).toBe(4);
    expect(s.lastKnown!.z).toBe(6);
  });
  it('8秒后遗忘', () => {
    const s = new BotSenses();
    s.onDamaged(4, 6, () => 0);
    s.hearAt(1, 1, () => 0);
    s.tick(SENSE.FORGET + 0.1);
    expect(s.lastKnown === null).toBe(true);
    expect(s.heard === null).toBe(true);
  });
  it('reset 清空一切', () => {
    const s = new BotSenses();
    s.onDamaged(4, 6, () => 0);
    s.updateVision(0, 0, 0, 1, 0, 5, true, []);
    s.reset();
    expect(s.visible).toBe(false);
    expect(s.lastKnown === null).toBe(true);
  });
});
