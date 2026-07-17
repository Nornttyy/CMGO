import { Pt } from './pathfind';

// 瞄准数值（试玩后好调）
export const AIM = {
  REACT_FIRST: 0.4,   // 首次发现的反应时间(玩家的反杀窗口)
  REACT_RESEE: 0.25,  // 刚跟丢又看到的反应时间
  LOST_RESET: 2.0,    // 丢视线超过这么久,再见面按"首次"算
  TRACK_RATE: 3.2,    // 准星追踪速率(越大越跟手)
  ERR_BASE: 0.3,      // 基础误差半径(米)
  ERR_SPEED: 0.22,    // 玩家每1m/s速度加的误差
  ERR_DIST: 0.03,     // 每1m距离加的误差
  SETTLE_TIME: 1.5,   // 持续可见多久误差收敛到最小
  SETTLE_MIN: 0.35,   // 收敛后的误差倍率
  BURST_MIN: 2, BURST_MAX: 3, // 一组点射几发
  SHOT_GAP: 0.22,     // 点射内两发间隔(秒)
  BURST_GAP: 0.9,     // 两组点射之间的停顿
  HIT_RADIUS: 0.4,    // 玩家身体胶囊半径(弹着点落进来算中)
  DMG: 13,            // 蛋蛋每枪伤害
};

export interface Shot { hit: boolean; x: number; z: number } // 水平弹着点

// 一只蛋的"手"：看不见的准星像追气球一样追玩家，追上了才打得中。
export class BotAim {
  aimX = 0; aimZ = 0;
  private react = AIM.REACT_FIRST; // 剩余反应时间
  private seen = 0;                // 已连续看到多久(误差收敛)
  private unseen = 99;             // 已多久没看到
  private shotT = 0;               // 距下一发
  private burstLeft = 0;           // 本组点射还剩几发

  reset(x: number, z: number): void {
    this.aimX = x; this.aimZ = z;
    this.react = AIM.REACT_FIRST; this.seen = 0; this.unseen = 99; this.shotT = 0; this.burstLeft = 0;
  }

  // 每帧调用；返回开枪事件或 null
  update(dt: number, free: boolean, visible: boolean, bot: Pt, player: Pt, vel: Pt, rng: () => number = Math.random): Shot | null {
    if (!visible) { this.unseen += dt; this.seen = 0; return null; }
    if (this.unseen > 0) { // 重新看到:定反应时间,取消上一组点射
      this.react = this.unseen > AIM.LOST_RESET ? AIM.REACT_FIRST : AIM.REACT_RESEE;
      this.unseen = 0; this.burstLeft = 0; this.shotT = 0;
    }
    this.seen += dt;
    const k = Math.min(1, AIM.TRACK_RATE * dt); // 指数趋近:快速横移会甩开它
    this.aimX += (player.x - this.aimX) * k;
    this.aimZ += (player.z - this.aimZ) * k;
    if (!free) return null;
    if (this.react > 0) { this.react -= dt; return null; }
    this.shotT -= dt;
    if (this.shotT > 0) return null;
    if (this.burstLeft <= 0) this.burstLeft = AIM.BURST_MIN + Math.floor(rng() * (AIM.BURST_MAX - AIM.BURST_MIN + 1));
    this.burstLeft -= 1;
    this.shotT = this.burstLeft > 0 ? AIM.SHOT_GAP : AIM.BURST_GAP;
    // 弹着点 = 准星 + 误差圈(误差随目标速度/距离变大,盯久了收敛)
    const settle = AIM.SETTLE_MIN + (1 - AIM.SETTLE_MIN) * Math.max(0, 1 - this.seen / AIM.SETTLE_TIME);
    const dist = Math.hypot(player.x - bot.x, player.z - bot.z);
    const err = (AIM.ERR_BASE + AIM.ERR_SPEED * Math.hypot(vel.x, vel.z) + AIM.ERR_DIST * dist) * settle;
    const a = rng() * Math.PI * 2, r = rng() * err;
    const sx = this.aimX + Math.cos(a) * r, sz = this.aimZ + Math.sin(a) * r;
    return { hit: Math.hypot(sx - player.x, sz - player.z) < AIM.HIT_RADIUS, x: sx, z: sz };
  }
}
