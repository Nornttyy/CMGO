import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GunDef } from './gunDefs';

// 枪口火光贴图：中间白黄、向外透明的圆形爆闪
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

const loader = new GLTFLoader();

// 第一人称持枪视图：可换不同枪模型(setGun)；开火(火光+后坐)，抽枪前摇，换弹动作。
export class ViewGun {
  readonly group = new THREE.Group();
  private holder = new THREE.Group();   // 装枪模型(朝向/缩放)，和后坐/前摇分开
  private modelPath = '';
  private basePos = new THREE.Vector3(0.3, -0.34, -0.68);
  private muzzle = new THREE.Vector3(0, 0.06, -0.62);
  private flash: THREE.Mesh;
  private recoil = 0; private flashT = 0; private drawT = 0; private reloadT = 0; private reloadDur = 1.5;

  constructor() {
    this.group.add(this.holder);
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({ map: makeFlashTexture(), transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.flash.renderOrder = 1001;
    this.group.add(this.flash);
    this.group.position.copy(this.basePos);
  }

  // 换上某把枪：位置/朝向/缩放/枪口，按需加载模型
  setGun(def: GunDef): void {
    this.basePos.set(def.view.pos[0], def.view.pos[1], def.view.pos[2]);
    this.muzzle.set(0, 0.06, def.view.muzzleZ);
    this.flash.position.copy(this.muzzle);
    this.holder.rotation.set(0.05, def.view.rotY, 0);
    if (this.modelPath === def.model) return;
    this.modelPath = def.model;
    for (let i = this.holder.children.length - 1; i >= 0; i--) this.holder.remove(this.holder.children[i]);
    loader.load(import.meta.env.BASE_URL + def.model, (gltf) => {
      const m = gltf.scene;
      m.traverse((o) => {
        const me = o as THREE.Mesh;
        if (me.isMesh) {
          me.renderOrder = 999; me.castShadow = false;
          const mats = Array.isArray(me.material) ? me.material : [me.material];
          for (const mt of mats) (mt as THREE.Material).depthTest = false;
        }
      });
      const box = new THREE.Box3().setFromObject(m);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const s = def.view.size / Math.max(size.x, size.y, size.z, 0.001);
      m.position.set(-center.x * s, -center.y * s, -center.z * s);
      m.scale.setScalar(s);
      if (this.modelPath === def.model) this.holder.add(m); // 防止换太快加载错位
    });
  }

  fire(): void { this.recoil = 1; this.flashT = 0.06; this.flash.rotation.z = Math.random() * Math.PI; }
  equip(): void { this.drawT = 0.3; }
  reload(dur: number): void { this.reloadT = dur; this.reloadDur = dur; }

  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    this.group.updateMatrixWorld(true);
    return out.copy(this.muzzle).applyMatrix4(this.group.matrixWorld);
  }

  update(dt: number): void {
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt / 0.12);
    const r = this.recoil;
    this.group.position.set(this.basePos.x, this.basePos.y + r * 0.015, this.basePos.z + r * 0.06);
    this.group.rotation.set(r * 0.2, 0, 0);
    if (this.drawT > 0) { // 抽枪前摇：从下方升上来
      this.drawT = Math.max(0, this.drawT - dt);
      const e = ((p) => p * p * (3 - 2 * p))(1 - this.drawT / 0.3);
      this.group.position.y -= (1 - e) * 0.5;
      this.group.position.z += (1 - e) * 0.12;
    }
    if (this.reloadT > 0) { // 换弹动作：往下沉 + 把握把转向自己
      this.reloadT = Math.max(0, this.reloadT - dt);
      const dip = Math.sin((1 - this.reloadT / this.reloadDur) * Math.PI);
      this.group.position.y -= dip * 0.16;
      this.group.rotation.x += dip * 0.7;
      this.group.rotation.z += dip * 0.3;
    }
    const fm = this.flash.material as THREE.MeshBasicMaterial;
    if (this.flashT > 0) { this.flashT -= dt; fm.opacity = Math.min(1, this.flashT / 0.06); this.flash.scale.setScalar(1 + (1 - this.flashT / 0.06) * 0.4); }
    else fm.opacity = 0;
  }
}
