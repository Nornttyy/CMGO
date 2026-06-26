import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// 一个姿势 = 刀在视野里的位置 + 朝向
interface Pose { pos: THREE.Vector3; rot: THREE.Euler; }

// 静止：刀在视野右下角
const REST: Pose = { pos: new THREE.Vector3(0.45, -0.52, -0.6), rot: new THREE.Euler(0.05, -0.5, 0.6) };

// 三段连招的"终点姿势"（挥到这里停住等接招）：大幅度横扫，从右一直划到左、再划回右、再下劈
const ENDS: Pose[] = [
  // 第一段：从右大幅横扫到左，刀柄到中左、刀尖横着指向左屏幕边
  { pos: new THREE.Vector3(-0.2, -0.33, -0.58), rot: new THREE.Euler(0.2, -0.2, 1.62) },
  // 第二段：从左横扫回到右，刀柄到中右、刀尖横着指向右屏幕边（与左挥对称、不被弹药挡）
  { pos: new THREE.Vector3(0.2, -0.33, -0.58), rot: new THREE.Euler(0.2, 0.2, -1.62) },
  // 第三段：从高处下劈到中间（刀刃朝前下方，别被底部血条挡住）
  { pos: new THREE.Vector3(0.08, -0.46, -0.78), rot: new THREE.Euler(-1.05, -0.3, 0.4) },
];

const STRIKE_DUR = 0.16;   // 挥过去：快（很有挥砍的爆发感）
const HOLD_DUR = 0.45;     // 挥到终点后停留：没接招就停这么久
const RECOVER_DUR = 0.4;   // 没接招后，慢慢回到静止位置
const HIT_AT = 0.65;       // 挥到这个进度算"砍中"
const MIN_INTERVAL = 0.5; // 两刀之间的最短间隔(秒)：点得再快也不会挥得更快

type Phase = 'idle' | 'strike' | 'hold' | 'recover';

// 第一人称军刀(Kabar CC0)：挂相机上、视野右下角。
// 挥砍手感：左键大幅横扫到终点 → 停一下 → 没接着按就慢慢收回；连按接三段连招。
export class Knife {
  readonly group = new THREE.Group();
  private phase: Phase = 'idle';
  private phaseT = 0;          // 当前阶段已用时(秒)
  private variant = -1;        // 当前是第几段(0/1/2)
  private struck = false;
  private sinceSwing = 99;     // 距上一刀已过的时间(秒)，用来限制最快挥砍频率
  private startPos = new THREE.Vector3(); // 本段起始位置(从这里挥/收)
  private startRot = new THREE.Euler();
  onStrike: (() => void) | null = null;   // 砍到最猛那一刻触发（检测命中/留痕）

  constructor() {
    this.group.position.copy(REST.pos);
    this.group.rotation.copy(REST.rot);
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
      if (k >= 1) { this.phase = 'idle'; this.setPose(REST); }
    }
  }

  // 记下"当前姿势"为起点，进入某个阶段（挥/收都从现在的位置出发，连招才顺）
  private beginPhase(phase: Phase): void {
    this.startPos.copy(this.group.position);
    this.startRot.copy(this.group.rotation);
    this.phase = phase;
    this.phaseT = 0;
  }

  // 从本段起点 lerp 到目标姿势（e=0→起点, 1→目标）
  private lerpTo(target: Pose, e: number): void {
    this.group.position.lerpVectors(this.startPos, target.pos, e);
    this.group.rotation.set(
      this.startRot.x + (target.rot.x - this.startRot.x) * e,
      this.startRot.y + (target.rot.y - this.startRot.y) * e,
      this.startRot.z + (target.rot.z - this.startRot.z) * e,
    );
  }

  private setPose(p: Pose): void {
    this.group.position.copy(p.pos);
    this.group.rotation.copy(p.rot);
  }
}
