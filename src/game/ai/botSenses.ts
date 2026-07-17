import { Box } from '../physics/aabb';
import { blocked } from './steering';

// 感知数值（都在这，试玩后好调）
export const SENSE = {
  FOV_DEG: 120,             // 视野扇形角度
  VIEW_DIST: 24,            // 能看多远
  FORGET: 8,                // 多少秒没消息就遗忘
  HEAR_ERR: 2,              // 听声辨位的误差(米)
  NOISE_GUN: 30,            // 普通枪声传多远
  NOISE_GUN_SUPPRESSED: 10, // 消音枪声传多远(鬼魅)
  NOISE_FOOTSTEP: 8,        // 跑步脚步声传多远
};

export interface Known { x: number; z: number; age: number }

// 两点之间有没有被墙挡住(沿线采样，和旧 eggBots.canSee 同款)
export function losClear(ax: number, az: number, bx: number, bz: number, solids: Box[]): boolean {
  const dx = bx - ax, dz = bz - az, dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.floor(dist / 1.4));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (blocked(ax + dx * t, az + dz * t, solids, 0.1)) return false;
  }
  return true;
}

const COS_HALF_FOV = Math.cos((SENSE.FOV_DEG / 2) * Math.PI / 180);

// 一只蛋的感知：眼睛(视野扇形+视线) + 耳朵(疑点) + 记忆(最后位置,会遗忘)
export class BotSenses {
  visible = false;              // 这一刻亲眼看到玩家
  lastKnown: Known | null = null; // 确认过的玩家位置(看到/挨打)
  heard: Known | null = null;     // 疑点(听到动静,不精确)

  // 思考tick调用：距离、扇形、视线三关都过才算看见
  updateVision(bx: number, bz: number, faceX: number, faceZ: number, px: number, pz: number, playerAlive: boolean, solids: Box[]): void {
    this.visible = false;
    if (!playerAlive) return;
    const dx = px - bx, dz = pz - bz, d = Math.hypot(dx, dz);
    if (d > SENSE.VIEW_DIST || d < 1e-3) return;
    const fl = Math.hypot(faceX, faceZ);
    if (fl > 1e-6 && (faceX * dx + faceZ * dz) / (fl * d) < COS_HALF_FOV) return; // 扇形外
    if (!losClear(bx, bz, px, pz, solids)) return; // 被墙挡
    this.visible = true;
    this.lastKnown = { x: px, z: pz, age: 0 };
    this.heard = null; // 都看见了，疑点作废
  }

  hearAt(x: number, z: number, rng: () => number = Math.random): void {
    const a = rng() * Math.PI * 2, r = rng() * SENSE.HEAR_ERR;
    this.heard = { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, age: 0 };
  }

  // 挨打：哪怕背后也立刻大致知道方向(±1m)
  onDamaged(fromX: number, fromZ: number, rng: () => number = Math.random): void {
    const a = rng() * Math.PI * 2, r = rng();
    this.lastKnown = { x: fromX + Math.cos(a) * r, z: fromZ + Math.sin(a) * r, age: 0 };
  }

  tick(dt: number): void {
    if (this.lastKnown && (this.lastKnown.age += dt) > SENSE.FORGET) this.lastKnown = null;
    if (this.heard && (this.heard.age += dt) > SENSE.FORGET) this.heard = null;
  }

  reset(): void { this.visible = false; this.lastKnown = null; this.heard = null; }
}
