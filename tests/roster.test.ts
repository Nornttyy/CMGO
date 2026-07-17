import { describe, it, expect } from 'vitest';
import { Roster } from '../src/game/combat/roster';

const mk = (id: string, team: 'blue' | 'red', alive = true) =>
  ({ id, name: id, team, x: 0, z: 0, hp: 100, alive, weaponId: 'classic', isPlayer: id === 'player' });

describe('Roster 名册', () => {
  it('登记后能按 id 取到', () => {
    const r = new Roster();
    r.add(mk('player', 'blue'));
    expect(r.get('player')!.name).toBe('player');
    expect(r.all().length).toBe(1);
  });
  it('aliveEnemiesOf 只给活着的敌队', () => {
    const r = new Roster();
    r.add(mk('player', 'blue'));
    r.add(mk('蛋定', 'blue'));
    r.add(mk('皮蛋', 'red'));
    r.add(mk('咸蛋', 'red', false)); // 死的不算
    const es = r.aliveEnemiesOf('blue');
    expect(es.length).toBe(1);
    expect(es[0].id).toBe('皮蛋');
    expect(r.aliveEnemiesOf('red').length).toBe(2);
  });
  it('aliveCount 数活人', () => {
    const r = new Roster();
    r.add(mk('a', 'blue')); r.add(mk('b', 'blue', false)); r.add(mk('c', 'red'));
    expect(r.aliveCount('blue')).toBe(1);
    r.setAlive('a', false);
    expect(r.aliveCount('blue')).toBe(0);
  });
  it('updatePos 推导速度,瞬移不算', () => {
    const r = new Roster();
    r.add(mk('a', 'red'));
    r.updatePos('a', 1, 0, 0.1); // 第一次:从(0,0)到(1,0),0.1秒 → vx=10
    expect(r.get('a')!.vx).toBeCloseTo(10, 5);
    r.updatePos('a', 100, 0, 0.1); // 瞬移(990m/s>20) → 记0
    expect(r.get('a')!.vx).toBe(0);
    expect(r.get('a')!.x).toBe(100); // 位置照更新
  });
  it('setHp/setWeapon 生效', () => {
    const r = new Roster();
    r.add(mk('a', 'red'));
    r.setHp('a', 55); r.setWeapon('a', 'ghost');
    expect(r.get('a')!.hp).toBe(55);
    expect(r.get('a')!.weaponId).toBe('ghost');
  });
});
