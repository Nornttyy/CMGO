import { Pt } from './pathfind';
import { Known } from './botSenses';

// 小队数值
export const SQUAD = {
  RADIO: 0.5,     // 喊话延迟(发现→全队知道)
  FRONT: 2,       // 正面交战名额
  FLANK_R: 12,    // 绕后点离目标多远
  CAUTION_T: 20,  // 队友阵亡后的谨慎时长
};

export type Role = 'front' | 'flank' | 'hold';
export interface SquadMate { alive: boolean; x: number; z: number; known: Known | null; visible: boolean }

// 全队一个：对讲机+指挥官。谁看到了玩家、谁上正面、谁绕后，都它说了算。
export class BotSquad {
  shared: Known | null = null; // 全队共享的玩家位置
  roles: Role[] = [];
  private radioT = -1;         // ≥0:正在喊话
  private cautionT = 0;

  get caution(): number { return this.cautionT > 0 ? 1 : 0; }
  noteDeath(): void { this.cautionT = SQUAD.CAUTION_T; }

  update(dt: number, mates: SquadMate[]): void {
    if (this.cautionT > 0) this.cautionT = Math.max(0, this.cautionT - dt);
    // 最新鲜的亲眼情报(只算活蛋)
    let best: Known | null = null;
    for (const m of mates) if (m.alive && m.known && (!best || m.known.age < best.age)) best = m.known;
    if (!best) { this.shared = null; this.radioT = -1; }
    else if (this.shared) { this.shared = { x: best.x, z: best.z, age: best.age }; } // 已通网:实时跟进
    else { // 初次发现:喊话0.5秒后才通网
      if (this.radioT < 0) this.radioT = SQUAD.RADIO;
      this.radioT -= dt;
      if (this.radioT <= 0) { this.shared = { x: best.x, z: best.z, age: best.age }; this.radioT = -1; }
    }
    this.assignRoles(mates);
  }

  // 离目标最近的2只上正面，第3只绕后，其余驻守
  private assignRoles(mates: SquadMate[]): void {
    this.roles = mates.map(() => 'hold' as Role);
    const t = this.shared;
    if (!t) return;
    const alive = mates.map((m, i) => ({ m, i })).filter((e) => e.m.alive)
      .sort((a, b) => Math.hypot(a.m.x - t.x, a.m.z - t.z) - Math.hypot(b.m.x - t.x, b.m.z - t.z));
    for (const e of alive.slice(0, SQUAD.FRONT)) this.roles[e.i] = 'front';
    if (alive.length > SQUAD.FRONT) this.roles[alive[SQUAD.FRONT].i] = 'flank';
  }

  // 绕后候选：以"正面蛋质心→目标"为轴，目标背面±45°、12米处；同侧优先
  flankCandidates(mates: SquadMate[], flankerI: number): Pt[] {
    const t = this.shared;
    if (!t) return [];
    const fronts = mates.filter((m, i) => this.roles[i] === 'front' && m.alive);
    let cx = mates[flankerI].x, cz = mates[flankerI].z;
    if (fronts.length) {
      cx = 0; cz = 0;
      for (const f of fronts) { cx += f.x; cz += f.z; }
      cx /= fronts.length; cz /= fronts.length;
    }
    const base = Math.atan2(t.z - cz, t.x - cx); // 正面→目标的方向角
    const f = mates[flankerI];
    const side = Math.sign((f.x - cx) * (t.z - cz) - (f.z - cz) * (t.x - cx)) || 1; // 绕后蛋在轴哪侧
    const mk = (s: number): Pt => ({
      x: t.x + Math.cos(base + s * Math.PI / 4) * SQUAD.FLANK_R,
      z: t.z + Math.sin(base + s * Math.PI / 4) * SQUAD.FLANK_R,
    });
    return [mk(side), mk(-side)];
  }
}
