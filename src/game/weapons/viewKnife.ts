import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// 一个姿势 = 刀在视野里的位置 + 朝向(四元数)
interface Pose { pos: THREE.Vector3; quat: THREE.Quaternion; }

// 刀面是模型本地的哪个横轴：试出来用 'z' 能让刀"躺平"（'x' 会立起来）
const FLAT_LOCAL: 'x' | 'z' = 'z';

// 构造一个"躺平"的姿势：让刀刃(模型本地+Y)指向 (dx,dy,dz)，并让刀面朝上 → 刀平着指向那个方向。
function flatQuat(dx: number, dy: number, dz: number): THREE.Quaternion {
  const Y = new THREE.Vector3(dx, dy, dz).normalize();           // 刀刃长度方向(指向刀尖)
  const worldUp = new THREE.Vector3(0, 1, 0);
  // 刀面法线：取世界"上"在垂直于刀刃方向上的分量（刀尖恰好朝上/下时换个参考避免退化）
  const up = worldUp.clone().addScaledVector(Y, -Y.dot(worldUp));
  if (up.lengthSq() < 1e-4) up.set(0, 0, -1);
  up.normalize();
  const m = new THREE.Matrix4();
  // makeBasis(本地X→, 本地Y→, 本地Z→)：本地+Y 永远对到刀尖方向 Y
  if (FLAT_LOCAL === 'z') m.makeBasis(new THREE.Vector3().crossVectors(Y, up), Y, up); // 本地Z面朝上
  else m.makeBasis(up, Y, new THREE.Vector3().crossVectors(up, Y));                    // 本地X面朝上
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

const q = (dx: number, dy: number, dz: number): THREE.Quaternion => flatQuat(dx, dy, dz);

// 静止：刀在视野右下角，刀尖朝上"竖着"拿着（略往左前倾，不是笔直垂直）。
const REST: Pose = {
  pos: new THREE.Vector3(0.42, -0.5, -0.6),
  quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, -0.5, 0.6, 'XYZ')),
};

// 三段连招的"终点姿势"（挥到这里停住等接招）：刀刃朝向放平(躺平)横着挥
const ENDS: Pose[] = [
  // 第一段：横扫到左——刀面放平、刀尖指向左屏幕边(略朝前)
  { pos: new THREE.Vector3(-0.2, -0.24, -0.55), quat: q(-1, 0, -0.35) },
  // 第二段：横扫到右——刀面放平、刀尖指向右屏幕边(略朝前)，中途经过"指向前方"，全程平着不抬高
  { pos: new THREE.Vector3(0.32, -0.24, -0.55), quat: q(1, 0, -0.35) },
  // 第三段：前刺——刀面放平、刀尖朝前略下
  { pos: new THREE.Vector3(0.12, -0.3, -0.74), quat: q(0, -0.2, -1) },
];

const STRIKE_DUR = 0.16;   // 挥过去：快（很有挥砍的爆发感）
const HOLD_DUR = 0.45;     // 挥到终点后停留：没接招就停这么久
const RECOVER_DUR = 0.4;   // 没接招后，慢慢回到静止位置
const HIT_AT = 0.65;       // 挥到这个进度算"砍中"
const MIN_INTERVAL = 0.32; // 两刀之间的最短间隔(秒)：点得再快也不会挥得更快

type Phase = 'idle' | 'strike' | 'hold' | 'recover';

// 第一人称军刀(Kabar CC0)：挂相机上、视野右下角。
// 挥砍手感：左键大幅横扫到终点 → 停一下 → 没接着按就慢慢收回；连按接三段连招。
// 用四元数 slerp 过渡：左右挥是水平横扫(刀躺平、刀尖从左经前方扫到右)，不抬上去也不立起来。
// 一旦完全收回到静止位置，连招就重置——下一刀又从第一招开始。
export class Knife {
  readonly group = new THREE.Group();
  private phase: Phase = 'idle';
  private phaseT = 0;          // 当前阶段已用时(秒)
  private variant = -1;        // 当前是第几段(0/1/2)
  private struck = false;
  private sinceSwing = 99;     // 距上一刀已过的时间(秒)，用来限制最快挥砍频率
  private startPos = new THREE.Vector3();  // 本段起始位置(从这里挥/收)
  private startQuat = new THREE.Quaternion(); // 本段起始朝向
  onStrike: (() => void) | null = null;    // 砍到最猛那一刻触发（检测命中/留痕）

  constructor() {
    this.group.position.copy(REST.pos);
    this.group.quaternion.copy(REST.quat);
    new GLTFLoader().load(import.meta.env.BASE_URL + 'models/weapons/kabar.glb', (gltf) => {
      const model = gltf.scene;
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.renderOrder = 999; m.castShadow = false;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mt of mats) (mt as THREE.Material).depthTest = false;
        }
      });
      const box0 = new THREE.Box3().setFromObject(model);
      model.scale.setScalar(0.55 / Math.max(box0.getSize(new THREE.Vector3()).x, box0.getSize(new THREE.Vector3()).y, box0.getSize(new THREE.Vector3()).z));
      // 把"刀柄那端"对到旋转中心(原点)，这样挥刀绕刀柄转：刀刃划出去、刀柄基本不动
      const b = new THREE.Box3().setFromObject(model);
      const c = b.getCenter(new THREE.Vector3());
      const sz = b.getSize(new THREE.Vector3());
      model.position.set(-c.x, -c.y, -c.z); // 先居中
      if (sz.y >= sz.x && sz.y >= sz.z) model.position.y += sz.y / 2;        // 刀身沿Y
      else if (sz.x >= sz.z) model.position.x += sz.x / 2;                   // 刀身沿X
      else model.position.z += sz.z / 2;                                     // 刀身沿Z
      this.group.add(model);
    });
  }

  // 挥一刀（停在终点/正在收回时再按，会从当前位置接下一段连招）
  swing(): void {
    if (this.sinceSwing < MIN_INTERVAL) return; // 离上一刀太近就忽略：点再快也不会超速
    this.sinceSwing = 0;
    this.variant = (this.variant + 1) % ENDS.length;
    this.beginPhase('strike'); // 从"当前所在位置"开始挥向终点
    this.struck = false;
  }

  update(dt: number): void {
    this.sinceSwing += dt; // 不论有没有在挥，都累计冷却时间
    if (this.phase === 'idle') return;
    this.phaseT += dt;

    if (this.phase === 'strike') {
      const k = Math.min(1, this.phaseT / STRIKE_DUR);
      const e = 1 - (1 - k) * (1 - k); // easeOut：起手快、到终点稳住
      this.lerpTo(ENDS[this.variant], e);
      if (!this.struck && k >= HIT_AT) { this.struck = true; this.onStrike?.(); }
      if (k >= 1) { this.phase = 'hold'; this.phaseT = 0; }
    } else if (this.phase === 'hold') {
      this.setPose(ENDS[this.variant]);        // 停在终点等接招
      if (this.phaseT >= HOLD_DUR) this.beginPhase('recover'); // 等够了没人接 → 收回
    } else { // recover：慢慢回到静止位置
      const k = Math.min(1, this.phaseT / RECOVER_DUR);
      const e = k * k * (3 - 2 * k); // 平滑
      this.lerpTo(REST, e);
      // 完全回到原位 → 连招重置：下一刀从第一招(横扫左)重新开始
      if (k >= 1) { this.phase = 'idle'; this.setPose(REST); this.variant = -1; }
    }
  }

  // 记下"当前姿势"为起点，进入某个阶段（挥/收都从现在的位置出发，连招才顺）
  private beginPhase(phase: Phase): void {
    this.startPos.copy(this.group.position);
    this.startQuat.copy(this.group.quaternion);
    this.phase = phase;
    this.phaseT = 0;
  }

  // 从本段起点 插值 到目标姿势（e=0→起点, 1→目标）：位置直线插值、朝向用 slerp
  private lerpTo(target: Pose, e: number): void {
    this.group.position.lerpVectors(this.startPos, target.pos, e);
    this.group.quaternion.slerpQuaternions(this.startQuat, target.quat, e);
  }

  private setPose(p: Pose): void {
    this.group.position.copy(p.pos);
    this.group.quaternion.copy(p.quat);
  }
}
