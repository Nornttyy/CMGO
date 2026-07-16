import * as THREE from 'three';
import { createHeroEgg } from './eggCharacter';

// 主菜单的"英雄展台"：沙岩台阶 + 站在上面的英雄蛋蛋 + 专属打光，
// 背景就是沙漠小镇本体（不打架）。相机走低角度电影感镜头，缓慢漂移。
// 用法：new 完把 group 加进场景；菜单每帧调 update(dt) + cameraPose(camera)。

const SANDSTONE = 0xe0c699; // 和小镇房子同色(ADOBE2)，融为一体
const MENU_FOV = 46;        // 菜单用窄视角(电影感)；进游戏恢复 75

// 警戒条纹贴图（蛋黄/墨色斜条），刷在台阶前沿——和页脚条纹呼应
function stripeTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 64; c.height = 16;
  const x = c.getContext('2d') as CanvasRenderingContext2D;
  x.fillStyle = '#ffc23c'; x.fillRect(0, 0, 64, 16);
  x.fillStyle = '#161a24';
  for (let i = -1; i < 5; i++) { x.beginPath(); x.moveTo(i * 16, 16); x.lineTo(i * 16 + 8, 0); x.lineTo(i * 16 + 16, 0); x.lineTo(i * 16 + 8, 16); x.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1);
  return t;
}

export class MenuVignette {
  readonly group = new THREE.Group();
  private hero: THREE.Group;
  private t = 0;
  private pos: THREE.Vector3;     // 展台中心
  private outDir: THREE.Vector3;  // 从小镇中心指向展台的方向(相机在这一侧)
  private savedFov = 75;

  // (x,z)=展台位置。相机会站在"背对小镇中心"的一侧往回拍，让小镇当背景。
  constructor(x: number, z: number) {
    this.pos = new THREE.Vector3(x, 0, z);
    this.outDir = new THREE.Vector3(x, 0, z).normalize();
    if (this.outDir.lengthSq() < 0.5) this.outDir.set(0, 0, 1);

    // —— 沙岩台阶(三层) —— 顶面高度0.66，蛋蛋站上面
    const mat = new THREE.MeshStandardMaterial({ color: SANDSTONE, roughness: 0.95 });
    const steps: [number, number, number, number][] = [ // [宽, 高, 深, 底部y]
      [3.6, 0.22, 3.0, 0],
      [2.9, 0.22, 2.4, 0.22],
      [2.2, 0.22, 1.8, 0.44],
    ];
    for (const [w, h, d, y] of steps) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(0, y + h / 2, 0);
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }
    // 顶层前沿的警戒条纹带
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.07, 0.05),
      new THREE.MeshStandardMaterial({ map: stripeTex(), roughness: 0.8 }),
    );
    band.position.set(0, 0.60, 0.9);
    this.group.add(band);

    // —— 英雄蛋蛋，站顶层 ——
    this.hero = createHeroEgg();
    this.hero.position.y = 0.66;
    this.group.add(this.hero);

    // —— 专属打光：暖阳主光(前上方) + 冷蓝轮廓光(后方)，都不投影(省性能) ——
    const key = new THREE.SpotLight(0xffd9a0, 140, 16, 0.6, 0.7);
    key.position.set(3.4, 4.5, 3.2); // 从相机那侧打过来，脸是亮的
    key.target = this.hero;
    this.group.add(key, key.target);
    const rim = new THREE.PointLight(0x36c5f0, 26, 9);
    rim.position.set(-1.6, 2.2, -2.0);
    this.group.add(rim);

    this.group.position.set(x, 0, z);
    // 面向相机那侧(背对小镇中心)
    this.group.rotation.y = Math.atan2(this.outDir.x, this.outDir.z);
  }

  update(dt: number): void {
    this.t += dt;
    // 呼吸感：轻微起伏 + 极慢左右摆头，像在站岗(0.55=基准朝向偏向相机)
    this.hero.scale.y = 1 + Math.sin(this.t * 1.6) * 0.012;
    this.hero.rotation.y = 0.55 + Math.sin(this.t * 0.35) * 0.1;
  }

  // 电影感镜头：低角度3/4，缓慢漂移；蛋蛋被安排在画面右侧(左边留给标题按钮)
  cameraPose(cam: THREE.PerspectiveCamera): void {
    if (cam.fov !== MENU_FOV) { this.savedFov = cam.fov; cam.fov = MENU_FOV; cam.updateProjectionMatrix(); }
    const drift = Math.sin(this.t * 0.13) * 0.10;
    const yaw = Math.atan2(this.outDir.x, this.outDir.z) + 0.76 + drift; // 相机绕展台的方位角
    const r = 6.4;
    const cx = this.pos.x + Math.sin(yaw) * r;
    const cz = this.pos.z + Math.cos(yaw) * r;
    const cy = 1.05 + Math.sin(this.t * 0.21) * 0.05; // 低机位仰拍：更英雄，also 地平线压到UI下面
    cam.position.set(cx, cy, cz);
    // 看向蛋蛋头部左侧一点 → 蛋蛋落在画面右侧约2/3处
    const head = new THREE.Vector3(this.pos.x, 1.3, this.pos.z);
    const dir = head.clone().sub(cam.position).normalize();
    const left = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
    cam.lookAt(head.add(left.multiplyScalar(1.1)));
  }

  // 进游戏时恢复正常视角
  restoreFov(cam: THREE.PerspectiveCamera): void {
    if (cam.fov !== this.savedFov) { cam.fov = this.savedFov; cam.updateProjectionMatrix(); }
  }
}
