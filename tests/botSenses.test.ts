import { describe, it, expect } from 'vitest';
import { BotSenses, losClear, losClip, SENSE } from '../src/game/ai/botSenses';
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

describe('losClip 弹道截断', () => {
  it('有墙时返回墙附近的截断点', () => {
    const p = losClip(0, -5, 0, 5, [wall]);
    expect(p !== null).toBe(true);
    expect(p!.x).toBe(0);
    expect(p!.z > -0.5 && p!.z < 1.5).toBe(true); // 截断点落在墙附近(一个采样步长内)
  });
  it('没墙时返回 null', () => {
    expect(losClip(0, -5, 0, 5, [])).toBe(null);
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

describe('BotSenses 多目标挑选', () => {
  // 注意墙要够厚(z向2米)：losClear 每1.4米采样一次,太薄会被采样跨过去摸不到
  const wall2: Box = { min: { x: -0.5, y: 0, z: 2 }, max: { x: 0.5, y: 2, z: 4 } };
  it('挑最近的可见敌人', () => {
    const s = new BotSenses();
    s.updateVisionMulti(0, 0, 0, 1, [
      { id: '远', x: 0, z: 15 },
      { id: '近', x: 0, z: 8 },
    ], []);
    expect(s.visible).toBe(true);
    expect(s.visibleId).toBe('近');
    expect(s.lastKnown!.z).toBe(8);
  });
  it('最近的被墙挡住 → 挑更远但看得见的', () => {
    const s = new BotSenses();
    s.updateVisionMulti(0, 0, 0, 1, [
      { id: '被挡', x: 0, z: 8 },        // 视线穿 wall2(z∈[2,4]) 被挡
      { id: '侧面', x: 10, z: 10 },      // 斜前方,不穿墙
    ], [wall2]);
    expect(s.visible).toBe(true);
    expect(s.visibleId).toBe('侧面');
  });
  it('全部不可见 → visible=false 且 visibleId=null', () => {
    const s = new BotSenses();
    s.updateVisionMulti(0, 0, 0, 1, [{ id: 'a', x: 0, z: -10 }], []); // 在正后方
    expect(s.visible).toBe(false);
    expect(s.visibleId === null).toBe(true);
  });
  it('reset 清掉 visibleId', () => {
    const s = new BotSenses();
    s.updateVisionMulti(0, 0, 0, 1, [{ id: 'a', x: 0, z: 5 }], []);
    s.reset();
    expect(s.visibleId === null).toBe(true);
  });
});
