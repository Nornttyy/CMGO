import { Vec3, vec3, normalize, scale } from '../core/vec3';

export const WALK_SPEED = 5;

export interface MoveInput {
  forward: number; // -1..1（W=+1, S=-1）
  right: number;   // -1..1（D=+1, A=-1）
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
  return scale(world, WALK_SPEED);
}
