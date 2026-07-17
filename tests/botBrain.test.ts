import { describe, it, expect } from 'vitest';
import { BotBrain, BrainWorld } from '../src/game/ai/botBrain';
import { Box } from '../src/game/physics/aabb';

const r0 = () => 0;
const openWorld = (covers: { x: number; z: number }[] = [], solids: Box[] = []): BrainWorld => ({
  solids, covers,
  findPath: (_sx, _sz, tx, tz) => [{ x: tx, z: tz }],
  randomPoint: () => ({ x: 30, z: 30 }),
  coverTaken: () => false,
});
const self0 = (x = 0, z = 0, hp = 100) => ({ x, z, faceX: 0, faceZ: 1, hp }); // 面朝+z
const noSquad = { role: 'front' as const, shared: null, caution: 0, flankCands: [] };

describe('BotBrain 优先级', () => {
  it('看见玩家 → combat 且允许开火', () => {
    const b = new BotBrain(); b.reset(r0);
    b.think(openWorld(), self0(), { x: 0, z: 8, alive: true }, noSquad, 0.1, true, r0);
    expect(b.drive.mode).toBe('combat');
    expect(b.drive.weaponsFree).toBe(true);
  });
  it('残血压过交战 → retreat', () => {
    const b = new BotBrain(); b.reset(r0);
    b.think(openWorld(), self0(0, 0, 20), { x: 0, z: 8, alive: true }, noSquad, 0.1, true, r0);
    expect(b.drive.mode).toBe('retreat');
  });
  it('看不见但有共享情报+被派绕后 → flank', () => {
    const b = new BotBrain(); b.reset(r0);
    const squad = { role: 'flank' as const, shared: { x: 0, z: 40, age: 1 }, caution: 0, flankCands: [{ x: 5, z: 45 }] };
    b.think(openWorld(), self0(), { x: 0, z: 40, alive: true }, squad, 0.1, true, r0); // 玩家在40米外看不见
    expect(b.drive.mode).toBe('flank');
  });
  it('看不见但有共享情报+正面 → hunt', () => {
    const b = new BotBrain(); b.reset(r0);
    const squad = { role: 'front' as const, shared: { x: 0, z: 40, age: 1 }, caution: 0, flankCands: [] };
    b.think(openWorld(), self0(), { x: 0, z: 40, alive: true }, squad, 0.1, true, r0);
    expect(b.drive.mode).toBe('hunt');
    expect(b.drive.path.length > 0).toBe(true);
  });
  it('驻守角色有情报 → holdpos(不追过去)', () => {
    const b = new BotBrain(); b.reset(r0);
    const squad = { role: 'hold' as const, shared: { x: 0, z: 40, age: 1 }, caution: 0, flankCands: [] };
    b.think(openWorld(), self0(), { x: 0, z: 40, alive: true }, squad, 0.1, true, r0);
    expect(b.drive.mode).toBe('holdpos');
  });
  it('只听到动静 → investigate 且不开火', () => {
    const b = new BotBrain(); b.reset(r0);
    b.senses.hearAt(6, 6, r0);
    b.think(openWorld(), self0(), { x: 0, z: 40, alive: true }, noSquad, 0.1, true, r0);
    expect(b.drive.mode).toBe('investigate');
    expect(b.drive.weaponsFree).toBe(false);
  });
  it('啥都没有 → patrol', () => {
    const b = new BotBrain(); b.reset(r0);
    b.think(openWorld(), self0(), { x: 0, z: 40, alive: true }, noSquad, 0.1, true, r0);
    expect(b.drive.mode).toBe('patrol');
  });
  it('战斗未开启(准备阶段)时就算玩家在眼前也 patrol', () => {
    const b = new BotBrain(); b.reset(r0);
    b.think(openWorld(), self0(), { x: 0, z: 5, alive: true }, noSquad, 0.1, false, r0);
    expect(b.drive.mode).toBe('patrol');
    expect(b.drive.weaponsFree).toBe(false);
  });
  it('记忆超8秒遗忘 → 回到 patrol', () => {
    const b = new BotBrain(); b.reset(r0);
    b.senses.onDamaged(3, 3, r0);
    b.think(openWorld(), self0(), { x: 0, z: 40, alive: true }, noSquad, 9, true, r0); // 9秒后才想
    expect(b.drive.mode).toBe('patrol');
  });
});

describe('BotBrain 掩体交战(躲→探头循环)', () => {
  // 窄墙 + 给定掩体点；蛋先在墙旁能看到玩家的位置
  const wall: Box = { min: { x: -0.5, y: 0, z: 0 }, max: { x: 0.5, y: 2, z: 1 } };
  const covers = [{ x: 0, z: -0.7 }];
  it('交战会先跑向掩体，到位后进入躲/探头循环', () => {
    const b = new BotBrain(); b.reset(r0);
    const w = openWorld(covers, [wall]);
    // 1) 在(2.5,-0.7)能看到(0,7)的玩家 → combat 并选中掩体0
    b.think(w, self0(2.5, -0.7), { x: 0, z: 7, alive: true }, noSquad, 0.1, true, r0);
    expect(b.drive.mode).toBe('combat');
    expect(b.coverI).toBe(0);
    // 2) 传送到掩体上再想 → 到位,开始"躲"(不开火)
    b.think(w, self0(0, -0.7), { x: 0, z: 7, alive: true }, noSquad, 0.1, true, r0);
    expect(b.drive.weaponsFree).toBe(false);
    // 3) 躲够了 → 探头(有探头点,开火放行)
    b.think(w, self0(0, -0.7), { x: 0, z: 7, alive: true }, noSquad, 2, true, r0);
    expect(b.drive.weaponsFree).toBe(true);
    expect(b.drive.strafe !== null).toBe(true); // 正在向探头点横移
  });
  it('玩家躲起来3秒内仍算交战(粘性),超时转 hunt', () => {
    const b = new BotBrain(); b.reset(r0);
    const w = openWorld([], []);
    b.think(w, self0(), { x: 0, z: 8, alive: true }, noSquad, 0.1, true, r0);
    expect(b.drive.mode).toBe('combat');
    // 玩家跑到40米外(看不见了),1秒后想:还在combat粘性期
    b.think(w, self0(), { x: 0, z: 40, alive: true }, noSquad, 1, true, r0);
    expect(b.drive.mode).toBe('combat');
    // 再过3秒:粘性过期 → hunt(去最后位置找)
    b.think(w, self0(), { x: 0, z: 40, alive: true }, noSquad, 3, true, r0);
    expect(b.drive.mode).toBe('hunt');
  });
});
