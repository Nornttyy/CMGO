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
const RECOIL_SMOOTH = 13;    // 后坐上抬/回落的平滑速度（越大越跟手，越小越柔）
const MOVE_ACCEL = 11;       // 移动惯性：当前速度逼近目标速度的快慢（越小越"滑"，一点点惯性）

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
  private recoil = 0;            // 当前实际上抬(平滑跟随目标，不一顿一顿)
  private recoilTarget = 0;      // 目标上抬量(开枪累积/回落由 main 给)
  private vx = 0; private vz = 0; // 当前水平速度(带惯性，平滑加减速)
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

    // 2) 水平移动（带一点惯性：当前速度平滑逼近目标速度，起步/停下有点滑）
    const hv = horizontalVelocity(
      { forward: input.forward(), right: input.right(), slowWalk: input.slowWalk, crouch: input.crouch },
      this.yaw,
    );
    const accel = Math.min(1, dt * MOVE_ACCEL);
    this.vx += (hv.x - this.vx) * accel;
    this.vz += (hv.z - this.vz) * accel;

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

    // 4) 试探新位置（用带惯性的速度 vx/vz）
    const want = add(this.pos, vec3(this.vx * dt, this.velocityY * dt, this.vz * dt));

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
    // 后坐上抬：当前值平滑逼近目标值（避免一枪一跳的生硬感）
    this.recoil += (this.recoilTarget - this.recoil) * Math.min(1, dt * RECOIL_SMOOTH);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch + this.recoil, this.yaw, 0); // recoil 让视角上抬(开枪后坐)
  }

  // 开枪后坐目标：让视角额外上抬 r 弧度（由 main 累积/回落后设进来，相机会平滑过渡过去）
  setRecoil(r: number): void { this.recoilTarget = r; }

  // 重生：把玩家瞬移回某个出生点，清掉速度/后坐
  teleport(spawn: Vec3): void {
    this.pos = vec3(spawn.x, spawn.y, spawn.z);
    this.velocityY = 0; this.vx = 0; this.vz = 0;
    this.recoil = 0; this.recoilTarget = 0;
  }
}
