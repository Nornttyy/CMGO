// 战斗员名册：两队所有人(含玩家)的位置/速度/血量/存活/手持武器。
// 纯逻辑：蛋的感知从这里拿"敌人有谁"，瞄准从这里拿目标速度。
export type TeamId = 'blue' | 'red';

export interface Combatant {
  id: string; name: string; team: TeamId;
  x: number; z: number;
  vx: number; vz: number;   // 由 updatePos 推导(瞄准甩枪用)
  hp: number; alive: boolean;
  weaponId: string;         // 手持枪 id('classic'...)
  isPlayer: boolean;
}

const TELEPORT_SPEED = 20; // 超过这个速度视为瞬移(重生/传送),速度记0

export class Roster {
  private list: Combatant[] = [];
  private byId = new Map<string, Combatant>();

  add(c: Omit<Combatant, 'vx' | 'vz'>): Combatant {
    const full: Combatant = { ...c, vx: 0, vz: 0 };
    this.list.push(full);
    this.byId.set(full.id, full);
    return full;
  }

  get(id: string): Combatant | undefined { return this.byId.get(id); }
  all(): readonly Combatant[] { return this.list; }

  aliveEnemiesOf(team: TeamId): Combatant[] {
    return this.list.filter((c) => c.alive && c.team !== team);
  }
  aliveCount(team: TeamId): number {
    return this.list.reduce((n, c) => n + (c.team === team && c.alive ? 1 : 0), 0);
  }

  updatePos(id: string, x: number, z: number, dt: number): void {
    const c = this.byId.get(id);
    if (!c) return;
    if (dt > 1e-4) {
      const vx = (x - c.x) / dt, vz = (z - c.z) / dt;
      const sp = Math.hypot(vx, vz);
      if (sp > TELEPORT_SPEED) { c.vx = 0; c.vz = 0; } else { c.vx = vx; c.vz = vz; }
    }
    c.x = x; c.z = z;
  }

  setAlive(id: string, alive: boolean): void { const c = this.byId.get(id); if (c) c.alive = alive; }
  setHp(id: string, hp: number): void { const c = this.byId.get(id); if (c) c.hp = hp; }
  setWeapon(id: string, weaponId: string): void { const c = this.byId.get(id); if (c) c.weaponId = weaponId; }
}
