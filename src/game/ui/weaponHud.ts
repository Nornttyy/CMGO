import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildPistolMesh } from '../weapons/viewPistol';

// 右下角武器栏：用一个小离屏渲染器，把"刀/枪"的真实 3D 模型缓缓转着渲染到两个槽位画布里。
// 当前使用的武器由 CSS 的 .active(白色边框) 标出（在 main 里切换 class）。
export class WeaponHud {
  private r: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam: THREE.PerspectiveCamera;
  private knife: THREE.Group | null = null;
  private pistol: THREE.Group;
  private kctx: CanvasRenderingContext2D;
  private gctx: CanvasRenderingContext2D;
  private t = 0;
  private readonly W = 120;
  private readonly H = 76;

  constructor(knifeCanvas: HTMLCanvasElement, gunCanvas: HTMLCanvasElement) {
    this.r = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.r.setPixelRatio(1);
    this.r.setSize(this.W, this.H, false);
    this.cam = new THREE.PerspectiveCamera(30, this.W / this.H, 0.1, 50);
    this.cam.position.set(0, 0, 5);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x40444c, 1.4));
    const dl = new THREE.DirectionalLight(0xffffff, 1.7); dl.position.set(2, 3, 4); this.scene.add(dl);

    // 枪：直接建模；刀：加载 GLB
    this.pistol = this.frame(buildPistolMesh(false), 2.3);
    new GLTFLoader().load(import.meta.env.BASE_URL + 'models/weapons/kabar.glb', (g) => {
      this.knife = this.frame(g.scene, 2.4);
    });

    this.kctx = knifeCanvas.getContext('2d') as CanvasRenderingContext2D;
    this.gctx = gunCanvas.getContext('2d') as CanvasRenderingContext2D;
  }

  // 把模型居中、缩放到合适大小、套一层 wrap 用来转；返回 wrap
  private frame(obj: THREE.Object3D, fit: number): THREE.Group {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = fit / Math.max(size.x, size.y, size.z, 0.001);
    obj.position.set(-center.x, -center.y, -center.z);
    const wrap = new THREE.Group();
    wrap.add(obj);
    wrap.scale.setScalar(s);
    return wrap;
  }

  update(dt: number): void {
    this.t += dt;
    this.renderOne(this.pistol, this.gctx);
    if (this.knife) this.renderOne(this.knife, this.kctx);
  }

  private renderOne(wrap: THREE.Group, ctx: CanvasRenderingContext2D): void {
    wrap.rotation.set(0.35, this.t * 0.9, 0); // 略微俯视 + 缓慢转
    this.scene.add(wrap);
    this.r.render(this.scene, this.cam);
    this.scene.remove(wrap);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(this.r.domElement, 0, 0, ctx.canvas.width, ctx.canvas.height);
  }
}
