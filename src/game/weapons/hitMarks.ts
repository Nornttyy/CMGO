import * as THREE from 'three';

// 砍中物体时在表面留下的"刀痕"贴片。
function makeSlashTex(): THREE.CanvasTexture {
  const S = 64;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d') as CanvasRenderingContext2D;
  x.clearRect(0, 0, S, S);
  x.strokeStyle = 'rgba(38,30,22,0.85)'; x.lineCap = 'round';
  const slashes: [number, number, number, number][] = [[14, 50, 52, 12], [20, 53, 49, 19], [11, 41, 43, 7]];
  for (let i = 0; i < slashes.length; i++) {
    x.lineWidth = 3.2 - i * 0.8;
    const [x0, y0, x1, y1] = slashes[i];
    x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 - 6, x1, y1); x.stroke();
  }
  return new THREE.CanvasTexture(c);
}

export class HitMarks {
  private marks: THREE.Mesh[] = [];
  private tex: THREE.Texture;

  constructor(private scene: THREE.Scene) { this.tex = makeSlashTex(); }

  add(point: THREE.Vector3, normal: THREE.Vector3): void {
    // 同一处附近已有刀痕：先删掉旧的，避免反复砍同一地方越叠越厚、凸出来
    const MERGE2 = 0.3 * 0.3;
    for (let i = this.marks.length - 1; i >= 0; i--) {
      if (this.marks[i].position.distanceToSquared(point) < MERGE2) this.dispose(i);
    }
    const mat = new THREE.MeshBasicMaterial({
      map: this.tex, transparent: true, depthWrite: false,
      // 用 polygonOffset 解决 z 打架，几乎不靠位移，刀痕就贴在面上不凸出
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), mat);
    m.position.copy(point).addScaledVector(normal, 0.006); // 只抬一丁点，紧贴表面
    m.lookAt(point.clone().add(normal));                   // 朝着法线方向（贴在面上）
    m.rotateZ(Math.random() * Math.PI * 2);                // 随机转一下，每刀不一样
    this.scene.add(m);
    this.marks.push(m);
    if (this.marks.length > 30) this.dispose(0);           // 最多留 30 个，最旧的删掉
  }

  // 删除并释放第 i 个刀痕
  private dispose(i: number): void {
    const old = this.marks.splice(i, 1)[0];
    if (!old) return;
    this.scene.remove(old);
    old.geometry.dispose();
    (old.material as THREE.Material).dispose();
  }
}
