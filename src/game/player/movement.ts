import { Vec3, vec3, normalize, scale } from '../core/vec3';

export const WALK_SPEED = 5;
export const SLOW_WALK_SPEED = 2.5; // 静步：慢慢走（以后加音效时还会不出脚步声）
export const CROUCH_SPEED = 2.0;    // 蹲下：移动更慢（比静步还慢一点）

export interface MoveInput {
  forward: number;   // -1..1（W=+1, S=-1）
  right: number;     // -1..1（D=+1, A=-1）
  slowWalk: boolean; // 静步开关（按 C 切换）
  crouch: boolean;   // 是否蹲下（蹲下移动更慢）
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
  const speed = input.crouch ? CROUCH_SPEED : input.slowWalk ? SLOW_WALK_SPEED : WALK_SPEED;
  return scale(world, speed);
}
