import * as THREE from 'three';

// 黑色弹孔贴图：中间深黑、向外淡出的圆点
function makeHoleTexture(): THREE.CanvasTexture {
  const S = 64;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d') as CanvasRenderingContext2D;
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(8,7,7,0.95)');
  g.addColorStop(0.55, 'rgba(10,8,8,0.8)');
  g.addColorStop(0.8, 'rgba(20,16,14,0.35)');
  g.addColorStop(1, 'rgba(20,16,14,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

const HOLE_LIFE = 5;     // 弹孔存在秒数
const HOLE_FADE = 1.4;   // 最后这几秒里慢慢淡出
const TRACER_LIFE = 0.06;
const MAX_HOLES = 30;

interface Hole { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; }
interface Tracer { line: THREE.Line; mat: THREE.LineBasicMaterial; life: number; }

// 开枪特效：子弹拖尾(从枪口到命中点的一条亮线，快速淡出) + 墙上的黑色圆弹孔(过一会慢慢消失)。
export class GunFx {
  private group = new THREE.Group();
  private holeTex = makeHoleTexture();
  private holeGeo = new THREE.PlaneGeometry(0.17, 0.17);
  private holes: Hole[] = [];
  private tracers: Tracer[] = [];

  constructor(scene: THREE.Scene) { scene.add(this.group); }

  // 子弹拖尾：枪口 → 命中点 的一条亮线，很快淡出
  tracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = new THREE.LineBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.85, depthWrite: false });
    const line = new THREE.Line(geo, mat);
    line.raycast = () => {}; // 别让后续子弹打到拖尾本身
    this.group.add(line);
    this.tracers.push({ line, mat, life: TRACER_LIFE });
  }

  // 墙上的黑色弹孔（贴在命中点的面上，朝法线方向）
  hole(point: THREE.Vector3, normal: THREE.Vector3): void {
    const mat = new THREE.MeshBasicMaterial({
      map: this.holeTex, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    const mesh = new THREE.Mesh(this.holeGeo, mat);
    mesh.raycast = () => {}; // 别让后续子弹打到旧弹孔
    mesh.position.copy(point).addScaledVector(normal, 0.012); // 略浮在面上免 z 打架
    mesh.lookAt(point.clone().add(normal));
    mesh.rotateZ(Math.random() * Math.PI);
    this.group.add(mesh);
    this.holes.push({ mesh, mat, life: HOLE_LIFE });
    if (this.holes.length > MAX_HOLES) this.disposeHole(0); // 太多了删最旧的
  }

  private disposeHole(i: number): void {
    const h = this.holes.splice(i, 1)[0];
    if (!h) return;
    this.group.remove(h.mesh); h.mat.dispose();
  }

  update(dt: number): void {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.mat.opacity = Math.max(0, t.life / TRACER_LIFE) * 0.85;
      if (t.life <= 0) { this.group.remove(t.line); t.line.geometry.dispose(); t.mat.dispose(); this.tracers.splice(i, 1); }
    }
    for (let i = this.holes.length - 1; i >= 0; i--) {
      const h = this.holes[i];
      h.life -= dt;
      h.mat.opacity = h.life > HOLE_FADE ? 1 : Math.max(0, h.life / HOLE_FADE); // 最后慢慢淡出
      if (h.life <= 0) this.disposeHole(i);
    }
  }
}
