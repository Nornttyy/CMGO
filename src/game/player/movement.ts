import { Vec3, vec3, normalize, scale } from '../core/vec3';

export const WALK_SPEED = 5;        // 默认跑速（没传 runSpeed 时用；游戏里跑速由手上的武器决定）
export const SLOW_RATIO = 0.5;      // 静步 = 跑速的一半（以后加音效时还会不出脚步声）
export const CROUCH_RATIO = 0.4;    // 蹲下 = 跑速的 40%（比静步还慢一点）
export const SLOW_WALK_SPEED = WALK_SPEED * SLOW_RATIO;
export const CROUCH_SPEED = WALK_SPEED * CROUCH_RATIO;

export interface MoveInput {
  forward: number;   // -1..1（W=+1, S=-1）
  right: number;     // -1..1（D=+1, A=-1）
  slowWalk: boolean; // 静步开关（按 C 切换）
  crouch: boolean;   // 是否蹲下（蹲下移动更慢）
  runSpeed?: number; // 跑速(米/秒)：手上武器决定——刀快、枪按国服"跑速"数值
}

// yaw=0 时向前对应世界 -Z。绕 Y 轴旋转后大小不变。
export function horizontalVelocity(input: MoveInput, yaw: number): Vec3 {
  const local = vec3(input.right, 0, -input.forward);
  if (local.x === 0 && local.z === 0) return vec3();
  const dir = normalize(local);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  // 绕 Y 轴旋转 (x, z)
  const world = vec3(dir.x * cos + dir.z * sin, 0, -dir.x * sin + dir.z * cos);
  const run = input.runSpeed ?? WALK_SPEED;
  const speed = input.crouch ? run * CROUCH_RATIO : input.slowWalk ? run * SLOW_RATIO : run;
  return scale(world, speed);
}
