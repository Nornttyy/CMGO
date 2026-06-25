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
    const mat = new THREE.MeshBasicMaterial({
      map: this.tex, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), mat);
    m.position.copy(point).addScaledVector(normal, 0.02); // 略浮在表面上，免 z 打架
    m.lookAt(point.clone().add(normal));                  // 朝着法线方向（贴在面上）
    m.rotateZ(Math.random() * Math.PI * 2);               // 随机转一下，每刀不一样
    this.scene.add(m);
    this.marks.push(m);
    if (this.marks.length > 40) {                          // 最多留 40 个，旧的删掉
      const old = this.marks.shift();
      if (old) { this.scene.remove(old); old.geometry.dispose(); }
    }
  }
}
