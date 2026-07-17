import { Pt } from './pathfind';
import { Box } from '../physics/aabb';
import { BotSenses, Known, TargetPing } from './botSenses';
import { pickCover, pickRetreatCover, peekPoint, COVER } from './botCover';
import { Role } from './botSquad';

export type BotMode = 'patrol' | 'investigate' | 'hunt' | 'flank' | 'holdpos' | 'combat' | 'retreat';

// 大脑数值（试玩后好调）
export const BRAIN = {
  RETREAT_HP: 35,      // 血量低于这个才想撤
  COMBAT_LINGER: 3,    // 跟丢后仍算交战的粘性时长
  COMBAT_NEAR: 5, COMBAT_FAR: 12, // 无掩体拉扯的距离带
  CAUTION_DIST: 4,     // 谨慎时距离带外推
  STRAFE_FLIP: 1.3,    // 走位换向基准间隔
  REPICK_MOVE: 3,      // 威胁挪了这么远就重挑掩体/重寻路
  ARRIVE: 0.7,         // 离目标点这么近算"到了"
  SEARCH_TIME: 3,      // hunt 到点后张望时长
  INVESTIGATE_TIME: 2, // 疑点处张望时长
  LOOK_SPIN: 2.2,      // 张望转头速度(弧度/秒)
  SPEED_RETREAT: 1.15, SPEED_SNEAK: 0.85, // 撤退跑快点/摸疑点走慢点
  KNIFE_DIST: 8, // 距目的地大于这个才切刀赶路
};

export interface Drive {
  mode: BotMode;
  path: Pt[]; pathI: number; // 身体沿它走并推进 pathI
  strafe: Pt | null;         // 即时移动方向(优先于 path)
  face: Pt | null;           // 想面朝的方向向量(null=面朝移动方向)
  weaponsFree: boolean;      // 允许开火(节奏由 botAim 管)
  speedMul: number;
  knife: boolean;            // 亮刀赶路(速度=刀速),身体据此定速
}

export interface BrainWorld {
  solids: Box[];
  covers: Pt[];
  findPath(sx: number, sz: number, tx: number, tz: number): Pt[];
  randomPoint(): Pt;
  coverTaken(i: number): boolean;
}

export interface SquadView { role: Role; shared: Known | null; caution: number; flankCands: Pt[] }
interface Self { x: number; z: number; faceX: number; faceZ: number; hp: number }

// 一只蛋的大脑：每次思考从上往下问(保命>交战>绕后>搜索>查看>巡逻)，输出意图给身体执行。
export class BotBrain {
  readonly senses = new BotSenses();
  coverI = -1;   // 占用的掩体点索引(-1=没有)；身体用它实现 coverTaken
  bumped = false; // 身体设置：走位撞墙了
  drive: Drive = { mode: 'patrol', path: [], pathI: 0, strafe: null, face: null, weaponsFree: false, speedMul: 1, knife: false };
  private strafeDir = 1; private strafeT = 0;
  private coverFor: Pt | null = null;            // 挑掩体时威胁在哪(挪远了重挑)
  private peekPhase: 'go' | 'hide' | 'out' = 'go';
  private peekT = 0; private peekPt: Pt | null = null;
  private flankGoal: Pt | null = null; private flankFor: Pt | null = null;
  private searchT = 0; private lookA = 0;        // 到点张望
  private pathFor: Pt | null = null;             // 当前 path 的目的地

  reset(rng: () => number = Math.random): void {
    this.senses.reset();
    this.strafeDir = rng() < 0.5 ? 1 : -1; this.strafeT = 0;
    this.clearTransient();
    this.drive = { mode: 'patrol', path: [], pathI: 0, strafe: null, face: null, weaponsFree: false, speedMul: 1, knife: false };
  }

  forceRepath(): void { this.drive.path = []; this.drive.pathI = 0; this.pathFor = null; }

  private clearTransient(): void {
    this.coverI = -1; this.coverFor = null; this.peekPhase = 'go'; this.peekT = 0; this.peekPt = null;
    this.flankGoal = null; this.flankFor = null; this.searchT = 0; this.lookA = 0; this.pathFor = null;
    this.drive.path = []; this.drive.pathI = 0;
  }

  think(w: BrainWorld, self: Self, targets: TargetPing[], squad: SquadView, dt: number, combatOn: boolean, rng: () => number = Math.random): void {
    const d = this.drive;
    d.strafe = null; d.face = null; d.weaponsFree = false; d.speedMul = 1; d.knife = false;
    this.senses.tick(dt);
    if (!combatOn) { // 准备阶段:失忆并巡逻
      this.senses.reset();
      if (d.mode !== 'patrol') { d.mode = 'patrol'; this.clearTransient(); }
      this.patrol(w, self);
      this.updateKnife(self);
      return;
    }
    this.senses.updateVisionMulti(self.x, self.z, self.faceX, self.faceZ, targets, w.solids);
    const own = this.senses.lastKnown;
    const threat: Known | null = own ?? squad.shared; // 自己的情报优先,队友共享兜底
    // —— 从上往下问 ——
    let mode: BotMode;
    if (self.hp < BRAIN.RETREAT_HP && threat) mode = 'retreat';
    else if (this.senses.visible || (d.mode === 'combat' && own && own.age < BRAIN.COMBAT_LINGER)) mode = 'combat';
    else if (squad.role === 'flank' && squad.shared) mode = 'flank';
    else if (threat) mode = squad.role === 'hold' ? 'holdpos' : 'hunt';
    else if (this.senses.heard) mode = 'investigate';
    else mode = 'patrol';
    if (mode !== d.mode) { d.mode = mode; this.clearTransient(); }
    // 威胁的最新已知点：看得见用真身,看不见用记忆
    const vis = this.senses.visible ? targets.find((t) => t.id === this.senses.visibleId) ?? null : null;
    const tp: Pt = vis ? { x: vis.x, z: vis.z } : (threat ?? { x: self.x, z: self.z });
    switch (mode) {
      case 'retreat': this.retreat(w, self, tp); break;
      case 'combat': this.combat(w, self, tp, squad, dt, rng); break;
      case 'flank': this.flank(w, self, squad); break;
      case 'holdpos': this.holdPos(w, self, tp); break;
      case 'hunt': this.hunt(w, self, tp, dt); break;
      case 'investigate': this.investigate(w, self, dt); break;
      default: this.patrol(w, self); break;
    }
    this.updateKnife(self);
  }

  // 维护一条到 (tx,tz) 的路；返回是否已到
  private goTo(w: BrainWorld, self: Self, tx: number, tz: number): boolean {
    const d = this.drive;
    if (Math.hypot(tx - self.x, tz - self.z) < BRAIN.ARRIVE) { d.path = []; d.pathI = 0; return true; }
    if (!this.pathFor || Math.hypot(this.pathFor.x - tx, this.pathFor.z - tz) > BRAIN.REPICK_MOVE || d.pathI >= d.path.length) {
      const p = w.findPath(self.x, self.z, tx, tz);
      d.path = p.length ? p : [{ x: tx, z: tz }]; // 找不到路就直走兜底
      d.pathI = 0; this.pathFor = { x: tx, z: tz };
    }
    return false;
  }

  private patrol(w: BrainWorld, self: Self): void {
    const d = this.drive;
    d.mode = 'patrol';
    if (d.pathI < d.path.length) return;
    for (let i = 0; i < 6; i++) { // 随机挑个能走到的地方(旧 newDest 逻辑)
      const t = w.randomPoint();
      const p = w.findPath(self.x, self.z, t.x, t.z);
      if (p.length) { d.path = p; d.pathI = 0; this.pathFor = t; return; }
    }
    const t = w.randomPoint();
    d.path = [t]; d.pathI = 0; this.pathFor = t;
  }

  private combat(w: BrainWorld, self: Self, tp: Pt, squad: SquadView, dt: number, rng: () => number): void {
    const d = this.drive;
    d.face = { x: tp.x - self.x, z: tp.z - self.z };
    // 威胁挪远了 → 掩体作废重挑
    if (this.coverI >= 0 && this.coverFor && Math.hypot(tp.x - this.coverFor.x, tp.z - this.coverFor.z) > BRAIN.REPICK_MOVE) {
      this.coverI = -1; this.peekPt = null; this.peekPhase = 'go';
    }
    if (this.coverI < 0) {
      this.coverI = pickCover(w.covers, w.solids, self.x, self.z, tp.x, tp.z, w.coverTaken);
      this.coverFor = { x: tp.x, z: tp.z }; this.peekPhase = 'go';
    }
    if (this.coverI >= 0) this.coverFight(w, self, tp, squad, dt, rng);
    else this.openFight(self, tp, squad, dt, rng);
  }

  // 掩体打法：赶路(边跑边打) → 躲(不打) → 探头(打) → 缩回…
  private coverFight(w: BrainWorld, self: Self, tp: Pt, squad: SquadView, dt: number, rng: () => number): void {
    const d = this.drive;
    const cov = w.covers[this.coverI];
    const moveToward = (t: Pt): void => { // 短距离直线挪(不用A*)
      const dx = t.x - self.x, dz = t.z - self.z, l = Math.hypot(dx, dz);
      d.strafe = l > 0.15 ? { x: dx / l, z: dz / l } : null;
    };
    if (this.peekPhase === 'go') {
      if (!this.goTo(w, self, cov.x, cov.z)) { d.weaponsFree = true; return; } // 赶路中,能打就打
      this.peekPhase = 'hide';
      this.peekT = (COVER.HIDE_MIN + rng() * (COVER.HIDE_MAX - COVER.HIDE_MIN)) * (1 + 0.5 * squad.caution);
    }
    if (this.peekPhase === 'hide') {
      this.peekT -= dt;
      if (this.peekT > 0) { moveToward(cov); d.weaponsFree = false; return; } // 缩着不打
      this.peekPt = peekPoint(cov, w.solids, tp.x, tp.z);
      if (!this.peekPt) { this.coverI = -1; return; } // 探不出去,放弃这个掩体
      this.peekPhase = 'out'; this.peekT = COVER.EXPOSE_MAX; // 躲够了,同一拍就探头
    } else {
      this.peekT -= dt;
      if (this.peekT <= 0) { // 露够了,缩回去
        this.peekPhase = 'hide';
        this.peekT = (COVER.HIDE_MIN + rng() * (COVER.HIDE_MAX - COVER.HIDE_MIN)) * (1 + 0.5 * squad.caution);
        moveToward(cov); d.weaponsFree = false; return;
      }
    }
    if (this.peekPt) moveToward(this.peekPt); // 探头位开打
    d.weaponsFree = true;
  }

  // 开阔地打法：保持距离带+左右走位(老蛋蛋的打法,驻守角色不主动逼近)
  private openFight(self: Self, tp: Pt, squad: SquadView, dt: number, rng: () => number): void {
    const d = this.drive;
    const dx = tp.x - self.x, dz = tp.z - self.z, dist = Math.hypot(dx, dz) || 1e-3;
    const tx = dx / dist, tz = dz / dist, sxv = -tz, szv = tx;
    const near = BRAIN.COMBAT_NEAR + squad.caution * BRAIN.CAUTION_DIST;
    const far = BRAIN.COMBAT_FAR + squad.caution * BRAIN.CAUTION_DIST;
    let ax = 0, az = 0;
    if (dist > far && squad.role !== 'hold') { ax += tx; az += tz; }
    else if (dist < near) { ax -= tx; az -= tz; }
    ax += sxv * this.strafeDir * 0.95; az += szv * this.strafeDir * 0.95;
    const l = Math.hypot(ax, az) || 1;
    d.strafe = { x: ax / l, z: az / l };
    d.weaponsFree = true;
    this.strafeT -= dt;
    if (this.bumped || this.strafeT <= 0) {
      this.strafeDir *= -1; this.bumped = false;
      this.strafeT = BRAIN.STRAFE_FLIP * (0.7 + rng() * 0.6);
    }
  }

  private retreat(w: BrainWorld, self: Self, tp: Pt): void {
    const d = this.drive;
    if (this.coverI >= 0 && this.coverFor && Math.hypot(tp.x - this.coverFor.x, tp.z - this.coverFor.z) > 6) this.coverI = -1;
    if (this.coverI < 0) {
      this.coverI = pickRetreatCover(w.covers, w.solids, self.x, self.z, tp.x, tp.z, w.coverTaken);
      this.coverFor = { x: tp.x, z: tp.z };
    }
    d.weaponsFree = true; // 边撤边还手/到点守株待兔
    if (this.coverI < 0) { // 没处可撤:面朝威胁边打边退
      const dx = self.x - tp.x, dz = self.z - tp.z, l = Math.hypot(dx, dz) || 1;
      d.strafe = { x: dx / l, z: dz / l };
      d.face = { x: -dx, z: -dz };
      return;
    }
    const cov = w.covers[this.coverI];
    const arrived = this.goTo(w, self, cov.x, cov.z);
    d.speedMul = BRAIN.SPEED_RETREAT;
    d.face = arrived ? { x: tp.x - self.x, z: tp.z - self.z } : null; // 跑路看路,到点盯来路
  }

  private flank(w: BrainWorld, self: Self, squad: SquadView): void {
    const t = squad.shared as Known; // 进这个模式必有 shared
    if (this.flankGoal && this.flankFor && Math.hypot(t.x - this.flankFor.x, t.z - this.flankFor.z) > 4) this.flankGoal = null;
    if (!this.flankGoal) {
      for (const c of squad.flankCands) {
        if (w.findPath(self.x, self.z, c.x, c.z).length) { this.flankGoal = c; break; }
      }
      this.flankFor = { x: t.x, z: t.z };
    }
    const goal = this.flankGoal ?? { x: t.x, z: t.z }; // 候选都不可达就直扑
    if (this.goTo(w, self, goal.x, goal.z)) this.goTo(w, self, t.x, t.z); // 到了绕后点→扑向目标
  }

  private holdPos(w: BrainWorld, self: Self, tp: Pt): void {
    const d = this.drive;
    d.weaponsFree = true; // 驻守警戒:看见就打,但不追
    if (this.coverI < 0) {
      this.coverI = pickCover(w.covers, w.solids, self.x, self.z, tp.x, tp.z, w.coverTaken);
      this.coverFor = { x: tp.x, z: tp.z };
    }
    if (this.coverI >= 0) {
      const cov = w.covers[this.coverI];
      if (!this.goTo(w, self, cov.x, cov.z)) return; // 还在去掩体的路上
    }
    d.face = { x: tp.x - self.x, z: tp.z - self.z }; // 到位:面朝威胁方向警戒
  }

  private hunt(w: BrainWorld, self: Self, tp: Pt, dt: number): void {
    const d = this.drive;
    if (!this.goTo(w, self, tp.x, tp.z)) return;
    this.searchT += dt; this.lookA += BRAIN.LOOK_SPIN * dt; // 到点了,转圈张望
    d.face = { x: Math.sin(this.lookA), z: Math.cos(this.lookA) };
    if (this.searchT > BRAIN.SEARCH_TIME) { this.senses.lastKnown = null; this.searchT = 0; } // 搜不到,放弃
  }

  private investigate(w: BrainWorld, self: Self, dt: number): void {
    const d = this.drive;
    const spot = this.senses.heard as Known;
    d.speedMul = BRAIN.SPEED_SNEAK; // 疑神疑鬼,走慢点
    if (!this.goTo(w, self, spot.x, spot.z)) return;
    this.searchT += dt; this.lookA += BRAIN.LOOK_SPIN * dt;
    d.face = { x: Math.sin(this.lookA), z: Math.cos(this.lookA) };
    if (this.searchT > BRAIN.INVESTIGATE_TIME) { this.senses.heard = null; this.searchT = 0; } // 看完了,没事
  }

  // 切刀加速：没有任何威胁且目的地还远 → 亮刀赶路(速度=刀速)
  private updateKnife(self: Self): void {
    const d = this.drive;
    const threatened = this.senses.visible || !!this.senses.lastKnown || !!this.senses.heard;
    const goal = this.pathFor;
    d.knife = !threatened && !!goal && Math.hypot(goal.x - self.x, goal.z - self.z) > BRAIN.KNIFE_DIST
      && (d.mode === 'patrol' || d.mode === 'hunt' || d.mode === 'flank' || d.mode === 'investigate');
  }
}
