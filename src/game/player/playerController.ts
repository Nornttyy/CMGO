import * as THREE from 'three';
import { Input } from '../engine/input';
import { horizontalVelocity } from './movement';
import { resolveCollisions, Box } from '../physics/aabb';
import { Vec3, vec3, add } from '../core/vec3';

const GRAVITY = -25;
const JUMP_SPEED = 8.5;     // 起跳速度
const HOLD_FACTOR = 0.45;   // 长按上升时重力减成这倍（按住跳得更高）
const MAX_HOLD = 0.32;      // 最多减重力多少秒
const FAST_FALL = 2.2;      // 空中蹲下时重力放大这倍（俯冲：下落更快）
const EYE_HEIGHT = 1.6;
const CROUCH_HEIGHT = 1.0;
const MOUSE_SENSITIVITY = 0.0022;

export class PlayerController {
  private pos: Vec3; // 玩家盒中心（脚在 y=0 时中心约 0.9）
  private velocityY = 0;
  private yaw = 0;
  private pitch = 0;
  private half = vec3(0.4, 0.9, 0.4);
  private grounded = false;  // 是否站在地面/方块上
  private jumping = false;   // 是否在"长按加力上升"阶段
  private jumpTime = 0;      // 起跳后计时（限制长按时长）
  private eyeHeight = EYE_HEIGHT; // 当前眼睛高度（蹲下/起身平滑过渡，不瞬切）
  sensitivity = 1; // 鼠标灵敏度倍数（设置里可调）

  // 是否在空中（跳跃/下落）—— 开枪散布用：在空中打更不准
  get airborne(): boolean { return !this.grounded; }

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
      { forward: input.forward(), right: input.right(), slowWalk: input.slowWalk, crouch: input.crouch },
      this.yaw,
    );

    // 3) 跳跃 + 重力（长按大跳：起跳后按住空格、上升阶段重力减半 → 跳更高；松手即收）
    //    蹲下时不能跳（按了也忽略，并把排队的跳跃消费掉，免得起身后突然蹦一下）
    const wantJump = input.jumpPressed();
    if (this.grounded && !input.crouch && wantJump) { this.velocityY = JUMP_SPEED; this.jumping = true; this.jumpTime = 0; this.grounded = false; }
    if (this.jumping) {
      this.jumpTime += dt;
      if (!input.jumpHeld || this.velocityY <= 0 || this.jumpTime > MAX_HOLD) this.jumping = false;
    }
    let gravity = this.jumping ? GRAVITY * HOLD_FACTOR : GRAVITY;
    if (!this.grounded && input.crouch) gravity = GRAVITY * FAST_FALL; // 空中蹲下 = 俯冲，掉得更快
    this.velocityY += gravity * dt;

    // 4) 试探新位置
    const want = add(this.pos, vec3(hv.x * dt, this.velocityY * dt, hv.z * dt));

    // 5) 碰撞推出
    const corrected = resolveCollisions(want, this.half, this.walls);

    // 6) 落地 / 撞头处理
    if (corrected.y > want.y + 1e-5 && this.velocityY <= 0) {
      this.velocityY = 0; this.grounded = true; this.jumping = false; // 落地
    } else if (corrected.y < want.y - 1e-5 && this.velocityY > 0) {
      this.velocityY = 0; this.jumping = false; // 撞到头
    } else {
      this.grounded = false; // 在空中
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
