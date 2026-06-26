import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// 枪口火光贴图：中间白黄、向外透明的圆形爆闪（任何背景都看得见）
function makeFlashTexture(): THREE.CanvasTexture {
  const S = 64;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d') as CanvasRenderingContext2D;
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,245,1)');
  g.addColorStop(0.35, 'rgba(255,224,130,0.95)');
  g.addColorStop(0.7, 'rgba(255,150,40,0.45)');
  g.addColorStop(1, 'rgba(255,120,20,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

// 加载下载来的手枪模型(Quaternius, CC0)，缩放/居中并摆成"枪口朝前"；onTop=视图用(不被墙挡)
export function loadPistolModel(onTop: boolean, onReady?: (g: THREE.Group) => void): THREE.Group {
  const holder = new THREE.Group();
  new GLTFLoader().load(import.meta.env.BASE_URL + 'models/weapons/pistol.glb', (gltf) => {
    const m = gltf.scene;
    if (onTop) {
      m.traverse((o) => {
        const me = o as THREE.Mesh;
        if (me.isMesh) {
          me.renderOrder = 999; me.castShadow = false;
          const mats = Array.isArray(me.material) ? me.material : [me.material];
          for (const mt of mats) (mt as THREE.Material).depthTest = false;
        }
      });
    }
    // 居中 + 缩放到合适大小
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = 0.5 / Math.max(size.x, size.y, size.z, 0.001);
    m.position.set(-center.x * s, -center.y * s, -center.z * s);
    m.scale.setScalar(s);
    holder.add(m);
    onReady?.(holder);
  });
  return holder;
}

// 第一人称手枪：挂相机上、视野右下。能开火（枪口火光 + 后坐力）；命中检测在外部(eggBots.tryShoot)。
export class Pistol {
  readonly group = new THREE.Group();
  readonly model: THREE.Group;     // 枪模型(方向/缩放在这调，和后坐力分开)
  private basePos = new THREE.Vector3(0.3, -0.34, -0.68);
  private baseRot = new THREE.Euler(0, 0, 0);
  private flash: THREE.Mesh;
  private recoil = 0;   // 后坐力进度 1→0
  private flashT = 0;   // 枪口火光剩余秒数
  private drawT = 0;    // 抽枪(切武器)前摇剩余时间

  constructor() {
    // 模型方向：让 GLB 枪口朝前(-Z)、握把朝下（按下载的模型实际朝向标定）
    this.model = loadPistolModel(true);
    this.model.rotation.set(0.05, Math.PI / 2 - 0.16, 0); // 枪口朝前 + 略下倾、略内倾，更自然
    this.model.position.set(0, 0, 0);
    this.group.add(this.model);

    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({ map: makeFlashTexture(), transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.flash.position.set(0, 0.06, -0.62);
    this.flash.renderOrder = 1001;
    this.group.add(this.flash);

    this.group.position.copy(this.basePos);
    this.group.rotation.copy(this.baseRot);
  }

  // 开火（外部已检查弹药/锁定）：触发枪口火光 + 后坐力
  fire(): void {
    this.recoil = 1;
    this.flashT = 0.06;
    this.flash.rotation.z = Math.random() * Math.PI; // 火光每次转个角度
  }

  // 切到本武器时：从下方"抽枪"上来(前摇)
  equip(): void { this.drawT = 0.3; }

  update(dt: number): void {
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt / 0.12);
    const r = this.recoil;
    this.group.position.set(this.basePos.x, this.basePos.y + r * 0.015, this.basePos.z + r * 0.06);
    this.group.rotation.set(this.baseRot.x + r * 0.2, this.baseRot.y, this.baseRot.z);
    // 抽枪前摇：刚切过来时枪在下方，平滑升到正常位置
    if (this.drawT > 0) {
      this.drawT = Math.max(0, this.drawT - dt);
      const p = 1 - this.drawT / 0.3;
      const e = p * p * (3 - 2 * p);
      this.group.position.y -= (1 - e) * 0.5;
      this.group.position.z += (1 - e) * 0.12;
    }
    const fm = this.flash.material as THREE.MeshBasicMaterial;
    if (this.flashT > 0) { this.flashT -= dt; fm.opacity = Math.min(1, this.flashT / 0.06); this.flash.scale.setScalar(1 + (1 - this.flashT / 0.06) * 0.4); }
    else fm.opacity = 0;
  }
}
