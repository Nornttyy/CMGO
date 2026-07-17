import { describe, it, expect } from 'vitest';
import { GUN_BY_ID, GUNS, dmgAt } from '../src/game/weapons/gunDefs';

// 国服《无畏契约》官方武器库(valm.qq.com/guns.html)的佩枪数值，2026-07-16 抓取。
// 每把枪：价格 / 射速(发每秒) / 装备速度(秒) / 填弹速度(秒) / 首发弹道偏移(度) / 跑速(米每秒) / 弹匣 / 是否全自动 / 分距离伤害(头/身)。
// 游戏数值必须和这张表一致——改枪前先去官网核对，别凭感觉改！
const OFFICIAL = [
  { id: 'classic', price: 0, rate: 6.75, equip: 0.75, reload: 1.75, spread: 0.4, run: 5.73, mag: 12, auto: false,
    dmg: [{ d: 20, head: 78, body: 26 }, { d: 50, head: 66, body: 22 }] },
  { id: 'shorty', price: 150, rate: 3.0, equip: 0.75, reload: 1.75, spread: 4, run: 5.4, mag: 2, auto: false,
    dmg: [{ d: 7, head: 22, body: 11 }, { d: 15, head: 12, body: 6 }, { d: 50, head: 6, body: 3 }] },
  { id: 'frenzy', price: 450, rate: 10, equip: 1, reload: 1.5, spread: 0.45, run: 5.73, mag: 15, auto: true,
    dmg: [{ d: 20, head: 78, body: 26 }, { d: 50, head: 63, body: 21 }] },
  { id: 'ghost', price: 500, rate: 6.75, equip: 0.75, reload: 1.5, spread: 0.3, run: 5.73, mag: 13, auto: false,
    dmg: [{ d: 30, head: 105, body: 30 }, { d: 50, head: 87, body: 25 }] },
  { id: 'hunter', price: 600, rate: 5.1, equip: 0.75, reload: 1.5, spread: 0.275, run: 5.74, mag: 8, auto: false,
    dmg: [{ d: 10, head: 152, body: 39 }, { d: 30, head: 128, body: 39 }, { d: 50, head: 112, body: 34 }] },
  { id: 'sheriff', price: 800, rate: 4, equip: 1, reload: 2.25, spread: 0.25, run: 5.4, mag: 6, auto: false,
    dmg: [{ d: 30, head: 159, body: 55 }, { d: 50, head: 145, body: 50 }] },
];

describe('贯穿等级配置', () => {
  it('每把枪都有贯穿等级(1低/2中/3高)', () => {
    for (const g of GUNS) expect([1, 2, 3].includes(g.pen)).toBe(true);
  });
  it('霰弹最弱、重型左轮最强', () => {
    expect(GUN_BY_ID.shorty.pen).toBe(1);
    expect(GUN_BY_ID.sheriff.pen).toBe(3);
  });
});

describe('佩枪数值 1:1 对齐国服官方', () => {
  it('游戏里有且只有官方这 6 把佩枪', () => {
    expect(GUNS.map((g) => g.id).sort().join(',')).toBe(OFFICIAL.map((o) => o.id).sort().join(','));
  });

  for (const o of OFFICIAL) {
    const g = GUN_BY_ID[o.id];
    it(`${o.id}：价格/弹匣/全自动`, () => {
      expect(g.price).toBe(o.price);
      expect(g.mag).toBe(o.mag);
      expect(g.auto).toBe(o.auto);
    });
    it(`${o.id}：射速(两发间隔=1/${o.rate})`, () => {
      expect(Math.abs(g.fireCd - 1 / o.rate) < 0.001).toBe(true);
    });
    it(`${o.id}：装备/填弹/首发偏移/跑速`, () => {
      expect(g.equipTime).toBe(o.equip);
      expect(g.reloadTime).toBe(o.reload);
      expect(g.firstSpreadDeg).toBe(o.spread);
      expect(g.runSpeed).toBe(o.run);
    });
    it(`${o.id}：分距离伤害(每档边界内取头/身)`, () => {
      let prev = 0;
      for (const tier of o.dmg) {
        const mid = (prev + tier.d) / 2; // 取每档中间距离验证
        expect(dmgAt(g, mid, true)).toBe(tier.head);
        expect(dmgAt(g, mid, false)).toBe(tier.body);
        prev = tier.d;
      }
    });
  }
});
