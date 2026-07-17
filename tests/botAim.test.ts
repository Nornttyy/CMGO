import { describe, it, expect } from 'vitest';
import { BotAim, AIM } from '../src/game/ai/botAim';

const bot = { x: 0, z: 0 };
const still = { x: 0, z: 0 };
// 推进 n 秒(步长0.016≈60fps)，收集所有开枪事件
function run(aim: BotAim, secs: number, player: { x: number; z: number }, vel = still, rng = () => 0) {
  const shots = [];
  for (let t = 0; t < secs; t += 1 / 60) {
    const s = aim.update(1 / 60, true, true, bot, player, vel, rng);
    if (s) shots.push({ t, s });
  }
  return shots;
}

describe('BotAim 反应时间', () => {
  it('刚看到的前0.4秒不开枪', () => {
    const aim = new BotAim(); aim.reset(0, 0);
    const shots = run(aim, AIM.REACT_FIRST - 0.05, { x: 0, z: 10 });
    expect(shots.length).toBe(0);
  });
  it('过了反应时间就开枪', () => {
    const aim = new BotAim(); aim.reset(0, 0);
    const shots = run(aim, AIM.REACT_FIRST + 0.3, { x: 0, z: 10 });
    expect(shots.length > 0).toBe(true);
  });
  it('free=false(非战斗)永不开枪', () => {
    const aim = new BotAim(); aim.reset(0, 0);
    let any = false;
    for (let t = 0; t < 2; t += 1 / 60) if (aim.update(1 / 60, false, true, bot, { x: 0, z: 10 }, still)) any = true;
    expect(any).toBe(false);
  });
  it('刚跟丢又看到：用更短的反应时间(0.25s)', () => {
    const aim = new BotAim(); aim.reset(0, 10);
    run(aim, 1, { x: 0, z: 10 }); // 先瞄稳打过
    for (let t = 0; t < 0.5; t += 1 / 60) aim.update(1 / 60, true, false, bot, { x: 0, z: 10 }, still); // 丢0.5秒(<LOST_RESET)
    const shots: number[] = [];
    for (let t = 0; t < 0.6; t += 1 / 60) { const s = aim.update(1 / 60, true, true, bot, { x: 0, z: 10 }, still, () => 0); if (s) shots.push(t); }
    expect(shots.length > 0).toBe(true);
    expect(shots[0] > 0.2).toBe(true);              // 确实等了~0.25s
    expect(shots[0] < AIM.REACT_FIRST).toBe(true);  // 但比首见(0.4s)快
  });

  it('跟丢再看到会取消上一组点射(不续快间隔)', () => {
    const aim = new BotAim(); aim.reset(0, 10);
    let first = null; let t = 0;
    while (!first && t < 1) { first = aim.update(1 / 60, true, true, bot, { x: 0, z: 10 }, still, () => 0); t += 1 / 60; } // 打出第一发,正处点射中途
    aim.update(1 / 60, true, false, bot, { x: 0, z: 10 }, still, () => 0); // 丢一帧
    const shots: number[] = [];
    for (let tt = 0; tt < 0.6; tt += 1 / 60) { const s = aim.update(1 / 60, true, true, bot, { x: 0, z: 10 }, still, () => 0); if (s) shots.push(tt); }
    expect(shots.length > 0).toBe(true);
    expect(shots[0] > AIM.SHOT_GAP).toBe(true); // 若没取消,会在0.22s续第二发;取消后要重走0.25s反应
  });
});

describe('BotAim 准度', () => {
  it('站桩1.5秒收敛后基本枪枪中(rng=0误差圈为0)', () => {
    const aim = new BotAim(); aim.reset(0, 10); // 准星直接放目标上
    const shots = run(aim, 3, { x: 0, z: 10 });
    const later = shots.filter((e) => e.t > AIM.SETTLE_TIME);
    expect(later.length > 0).toBe(true);
    expect(later.every((e) => e.s.hit)).toBe(true);
  });
  it('目标持续快速横移，准星追不上→打不中', () => {
    const aim = new BotAim(); aim.reset(0, 10);
    run(aim, 1, { x: 0, z: 10 }); // 先瞄稳站桩目标
    // 玩家以4m/s持续横移：追踪的稳态滞后≈4/3.2=1.25米>0.4命中半径,必打偏
    const player = { x: 0, z: 10 }, vel = { x: 4, z: 0 };
    let shot = null as ReturnType<BotAim['update']>;
    for (let i = 0; i < 120 && !shot; i++) { player.x += 4 / 60; shot = aim.update(1 / 60, true, true, bot, player, vel, () => 0); }
    expect(shot !== null).toBe(true);
    expect(shot!.hit).toBe(false);
  });
  it('误差公式生效：相同随机数下,目标速度越快弹着点偏得越远', () => {
    const rng1 = () => 0.999; // 固定随机:误差圈取到接近最大半径
    const a1 = new BotAim(); a1.reset(0, 10);
    const a2 = new BotAim(); a2.reset(0, 10);
    let last1 = null, last2 = null;
    for (let i = 0; i < 180; i++) { // 3秒,双方都已收敛
      const r1 = a1.update(1 / 60, true, true, bot, { x: 0, z: 10 }, still, rng1); if (r1) last1 = r1;
      const r2 = a2.update(1 / 60, true, true, bot, { x: 0, z: 10 }, { x: 5, z: 0 }, rng1); if (r2) last2 = r2;
    }
    expect(last1 !== null && last2 !== null).toBe(true);
    expect(last1!.hit).toBe(true);  // 站桩目标:误差(0.3+0.03*10)*0.35≈0.21<0.4 → 中
    expect(last2!.hit).toBe(false); // 高速目标:误差(0.3+0.22*5+0.3)*0.35≈0.59>0.4 → 偏
    const d1 = Math.hypot(last1!.x - 0, last1!.z - 10), d2 = Math.hypot(last2!.x - 0, last2!.z - 10);
    expect(d1 < d2).toBe(true);
  });
});

describe('BotAim 点射节奏', () => {
  it('先2~3发快射再停顿(枪与枪间隔有两种)', () => {
    const aim = new BotAim(); aim.reset(0, 10);
    const shots = run(aim, 3, { x: 0, z: 10 });
    expect(shots.length >= 4).toBe(true);
    const gaps = shots.slice(1).map((e, i) => e.t - shots[i].t);
    const shortGaps = gaps.filter((g) => g < AIM.SHOT_GAP + 0.05);
    const longGaps = gaps.filter((g) => g > AIM.BURST_GAP - 0.05);
    expect(shortGaps.length > 0).toBe(true); // 点射内的快间隔
    expect(longGaps.length > 0).toBe(true);  // 点射间的喘气
  });
  it('看不见时不追踪也不开枪', () => {
    const aim = new BotAim(); aim.reset(0, 0);
    const s = aim.update(1, true, false, bot, { x: 0, z: 10 }, still);
    expect(s === null).toBe(true);
    expect(aim.aimZ).toBe(0); // 准星没动
  });
});
