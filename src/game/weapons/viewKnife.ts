import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// 一招的动作偏移（从静止姿势出刀到最猛时的旋转/位移峰值）
interface Swing { rx: number; ry: number; rz: number; px: number; py: number; pz: number; }
const SWINGS: Swing[] = [
  { rx: 0.25, ry: 0.8, rz: -1.2, px: -0.20, py: 0.06, pz: 0.04 },  // 第一段：横扫 →
  { rx: 0.25, ry: -0.8, rz: 1.2, px: 0.14, py: 0.06, pz: 0.04 },   // 第二段：横扫 ←
  { rx: -1.3, ry: 0.1, rz: 0.15, px: 0, py: -0.14, pz: -0.18 },    // 第三段：下劈/前刺
];
const DUR = 0.3;        // 一挥时长(秒)
const STRIKE_AT = 0.34; // 在进度多少时算"砍中"

// 第一人称军刀(Kabar CC0)：挂相机上、视野右下角；能挥、三段连招、砍中回调留痕。
export class Knife {
  readonly group = new THREE.Group();
  private basePos = new THREE.Vector3(0.45, -0.52, -0.6);
  private baseRot = new THREE.Euler(0.05, -0.5, 0.6);
  private t = -1;          // 挥刀进度 0..1，-1=没在挥
  private variant = -1;
  private struck = false;
  onStrike: (() => void) | null = null; // 砍到最猛那一刻触发（检测命中/留痕）

  constructor() {
    this.group.position.copy(this.basePos);
    this.group.rotation.copy(this.baseRot);
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

  // 挥一刀（连点会接成三段连招）
  swing(): void {
    if (this.t >= 0 && this.t < 0.45) return; // 前半段不打断，过半可接招
    this.variant = (this.variant + 1) % 3;
    this.t = 0; this.struck = false;
  }

  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt / DUR;
    if (!this.struck && this.t >= STRIKE_AT) { this.struck = true; this.onStrike?.(); }
    if (this.t >= 1) { // 收刀回静止
      this.t = -1;
      this.group.position.copy(this.basePos);
      this.group.rotation.copy(this.baseRot);
      return;
    }
    const k = this.t < STRIKE_AT ? this.t / STRIKE_AT : 1 - (this.t - STRIKE_AT) / (1 - STRIKE_AT);
    const e = k * k * (3 - 2 * k); // 平滑
    const s = SWINGS[this.variant];
    this.group.position.set(this.basePos.x + s.px * e, this.basePos.y + s.py * e, this.basePos.z + s.pz * e);
    this.group.rotation.set(this.baseRot.x + s.rx * e, this.baseRot.y + s.ry * e, this.baseRot.z + s.rz * e);
  }
}
