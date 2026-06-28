import * as THREE from 'three';

// 风沙颗粒：一团随风飘动的沙尘点，始终包裹在玩家周围(飘出范围就绕回另一边)。
// 配合黄沙浓雾，营造风沙弥漫的紧张战场感。性能很轻(几百个点，每帧只改数组)。
const COUNT = 650;
const AREA = 60;   // 水平包裹范围(小一点→颗粒更密集围在身边)
const HMIN = 0.3, HMAX = 15; // 高度范围
const WIND = new THREE.Vector3(5.0, -0.15, 1.8); // 风向/风速(更明显的横风)

function makeDustTexture(): THREE.CanvasTexture {
  const S = 32;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d') as CanvasRenderingContext2D;
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(226,210,170,0.9)');
  g.addColorStop(0.5, 'rgba(214,193,150,0.5)');
  g.addColorStop(1, 'rgba(214,193,150,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

export class DustField {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private phase: Float32Array; // 每颗的小幅上下飘动相位

  constructor() {
    this.pos = new Float32Array(COUNT * 3);
    this.phase = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * AREA;
      this.pos[i * 3 + 1] = HMIN + Math.random() * (HMAX - HMIN);
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * AREA;
      this.phase[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const mat = new THREE.PointsMaterial({
      map: makeDustTexture(), color: 0xddc792, size: 0.26, sizeAttenuation: true,
      transparent: true, opacity: 0.72, depthWrite: false, fog: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  // 每帧：随风飘 + 始终绕在 center(玩家) 周围
  update(dt: number, center: THREE.Vector3): void {
    const half = AREA / 2;
    for (let i = 0; i < COUNT; i++) {
      this.phase[i] += dt * 1.5;
      let x = this.pos[i * 3] + WIND.x * dt;
      let y = this.pos[i * 3 + 1] + WIND.y * dt + Math.sin(this.phase[i]) * dt * 0.5;
      let z = this.pos[i * 3 + 2] + WIND.z * dt;
      // 绕回：相对 center 超出范围就从另一边出现
      let rx = x - center.x; if (rx > half) rx -= AREA; else if (rx < -half) rx += AREA;
      let rz = z - center.z; if (rz > half) rz -= AREA; else if (rz < -half) rz += AREA;
      if (y < HMIN) y = HMAX; else if (y > HMAX) y = HMIN;
      x = center.x + rx; z = center.z + rz;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
