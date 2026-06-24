import * as THREE from 'three';
import { Input } from '../engine/input';
import { horizontalVelocity } from './movement';
import { resolveCollisions, Box } from '../physics/aabb';
import { Vec3, vec3, add } from '../core/vec3';

const GRAVITY = -25;
const JUMP_SPEED = 8;
const EYE_HEIGHT = 1.6;
const CROUCH_HEIGHT = 1.0;
const MOUSE_SENSITIVITY = 0.0022;

export class PlayerController {
  private pos: Vec3; // 玩家盒中心（脚在 y=0 时中心约 0.9）
  private velocityY = 0;
  private yaw = 0;
  private pitch = 0;
  private half = vec3(0.4, 0.9, 0.4);
  private jumps = 0; // 已跳次数（落地清零）——支持二段跳
  private eyeHeight = EYE_HEIGHT; // 当前眼睛高度（蹲下/起身平滑过渡，不瞬切）
  sensitivity = 1; // 鼠标灵敏度倍数（设置里可调）

  constructor(
    private camera: THREE.PerspectiveCamera,
    private walls: Box[],
    spawn: Vec3 = vec3(0, 0.9, 6),
  ) {
    this.pos = vec3(spawn.x, spawn.y, spawn.z);
  }

  update(input: Input, dt: number): void {
    // 1) 鼠标转头
    const m = input.consumeMouse();
    this.yaw -= m.dx * MOUSE_SENSITIVITY * this.sensitivity;
    this.pitch -= m.dy * MOUSE_SENSITIVITY * this.sensitivity;
    const maxPitch = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

    // 2) 水平移动
    const hv = horizontalVelocity(
      { forward: input.forward(), right: input.right(), slowWalk: input.slowWalk },
      this.yaw,
    );

    // 3) 重力与跳跃（二段跳：空中还能再跳一次）
    this.velocityY += GRAVITY * dt;
    if (input.jumpPressed() && this.jumps < 2) { this.velocityY = JUMP_SPEED; this.jumps++; }

    // 4) 试探新位置
    const want = add(this.pos, vec3(hv.x * dt, this.velocityY * dt, hv.z * dt));

    // 5) 碰撞推出
    const corrected = resolveCollisions(want, this.half, this.walls);

    // 6) 落地 / 撞头处理
    if (corrected.y > want.y + 1e-5 && this.velocityY <= 0) {
      this.velocityY = 0;
      this.jumps = 0; // 落地：二段跳次数清零
    } else if (corrected.y < want.y - 1e-5 && this.velocityY > 0) {
      this.velocityY = 0; // 撞到头
    }
    this.pos = corrected;

    // 7) 更新相机（眼睛高度，蹲下/起身平滑过渡，不再僵硬瞬切）
    const targetEye = input.crouch ? CROUCH_HEIGHT : EYE_HEIGHT;
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 12);
    this.camera.position.set(this.pos.x, this.pos.y - this.half.y + this.eyeHeight, this.pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
