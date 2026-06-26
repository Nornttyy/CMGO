import * as THREE from 'three';

// 枪口在视图模型本地坐标的位置（枪口火光 + 射线起点用）
const MUZZLE = new THREE.Vector3(0, 0.08, -0.62);

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

// 建一把低多边形卡通手枪（套筒/机匣/握把/护圈/准星 + 红色装饰条）。
// onTop=true：第一人称视图用，关掉深度测试不被墙挡、永远画最上层。
export function buildPistolMesh(onTop: boolean): THREE.Group {
  const g = new THREE.Group();
  const slideMat = new THREE.MeshStandardMaterial({ color: 0x2e323b, roughness: 0.45, metalness: 0.5 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3b3f49, roughness: 0.55, metalness: 0.3 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x24262d, roughness: 0.8, metalness: 0.05 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff5630, roughness: 0.4, metalness: 0.2, emissive: 0x551005 });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.x = rx;
    g.add(m);
    return m;
  };

  add(new THREE.BoxGeometry(0.13, 0.14, 0.5), slideMat, 0, 0.07, -0.3);                       // 套筒(上)
  add(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 16), slideMat, 0, 0.08, -0.57, Math.PI / 2); // 枪口
  add(new THREE.BoxGeometry(0.11, 0.08, 0.4), frameMat, 0, -0.01, -0.26);                      // 下机匣
  add(new THREE.BoxGeometry(0.11, 0.3, 0.16), gripMat, 0, -0.22, 0.02, 0.34);                  // 握把(后倾)
  add(new THREE.BoxGeometry(0.12, 0.04, 0.17), frameMat, 0, -0.38, 0.07, 0.34);                // 弹匣底
  add(new THREE.TorusGeometry(0.05, 0.014, 8, 16), frameMat, 0, -0.12, -0.1, Math.PI / 2);     // 扳机护圈
  add(new THREE.BoxGeometry(0.02, 0.06, 0.015), gripMat, 0, -0.12, -0.1);                      // 扳机
  add(new THREE.BoxGeometry(0.02, 0.03, 0.02), slideMat, 0, 0.155, -0.53);                     // 准星(前)
  add(new THREE.BoxGeometry(0.07, 0.035, 0.02), slideMat, 0, 0.155, -0.06);                    // 照门(后)
  add(new THREE.BoxGeometry(0.135, 0.02, 0.34), accent, 0, 0.13, -0.28);                       // 红色装饰条

  if (onTop) {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.renderOrder = 999; m.castShadow = false; (m.material as THREE.Material).depthTest = false; }
    });
  }
  return g;
}

// 第一人称手枪：挂相机上、视野右下。能开火（枪口火光 + 后坐力）；命中检测在外部(eggBots.tryShoot)。
export class Pistol {
  readonly group = new THREE.Group();
  private basePos = new THREE.Vector3(0.28, -0.36, -0.66);
  private baseRot = new THREE.Euler(0.03, 0.07, 0);
  private flash: THREE.Mesh;
  private recoil = 0;   // 后坐力进度 1→0
  private flashT = 0;   // 枪口火光剩余秒数

  constructor() {
    this.group.add(buildPistolMesh(true));

    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({ map: makeFlashTexture(), transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.flash.position.copy(MUZZLE);
    this.flash.position.z -= 0.05; // 再往枪口前一点
    this.flash.renderOrder = 1001;
    this.group.add(this.flash);

    this.group.position.copy(this.basePos);
    this.group.rotation.copy(this.baseRot);
  }

  // 开火（外部已检查弹药/锁定）：触发枪口火光 + 后坐力
  fire(): void {
    this.recoil = 1;
    this.flashT = 0.05;
    this.flash.rotation.z = Math.random() * Math.PI; // 火光每次转个角度
  }

  update(dt: number): void {
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt / 0.12);
    const r = this.recoil;
    this.group.position.set(this.basePos.x, this.basePos.y + r * 0.015, this.basePos.z + r * 0.06);
    this.group.rotation.set(this.baseRot.x + r * 0.2, this.baseRot.y, this.baseRot.z);
    const fm = this.flash.material as THREE.MeshBasicMaterial;
    if (this.flashT > 0) { this.flashT -= dt; fm.opacity = Math.max(0, this.flashT / 0.05); this.flash.scale.setScalar(1 + (1 - this.flashT / 0.05) * 0.4); }
    else fm.opacity = 0;
  }
}
