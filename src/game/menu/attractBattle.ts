import * as THREE from 'three';
import { createEgg, Team, GUN_MUZZLE } from './eggCharacter';
import { Box } from '../physics/aabb';
import { steer, blocked } from '../ai/steering';

interface Fighter {
  group: THREE.Group;
  team: Team;
  home: THREE.Vector3;
  target: THREE.Vector3;
  shootCd: number;
  bob: number;
  lastX: number;  // 上帧位置（卡住检测用）
  lastZ: number;
  stuck: number;  // 卡住计时
}

interface Tracer {
  line: THREE.Line;
  mat: THREE.LineBasicMaterial;
  life: number;
}

const TRACER_LIFE = 0.12;
const EGG_RADIUS = 0.5;   // 蛋蛋绕开方块的半径
const SEPARATION = 1.3;   // 两个蛋蛋最近距离（防重叠穿模）

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

// 主菜单背景里的"蛋蛋小战斗"：6 个蛋分两队，走位 + 瞄准 + 射弹道，循环播放。
// cover：要绕开的掩体方块（不含大地板）。
export class AttractBattle {
  readonly group = new THREE.Group();
  private fighters: Fighter[] = [];
  private tracers: Tracer[] = [];

  constructor(private cover: Box[]) {
    for (let i = 0; i < 6; i++) {
      const team: Team = i < 3 ? 'red' : 'blue';
      const sideX = team === 'red' ? -8 : 8; // 两队拉到两侧开阔区，别都挤到中央建筑
      const egg = createEgg(team);
      const home = this.clearNear(sideX + rand(-1.5, 1.5), rand(-6, 4)); // 出生在空地，不嵌墙
      egg.position.copy(home);
      this.group.add(egg);
      this.fighters.push({
        group: egg,
        team,
        home,
        target: this.pickTarget(home),
        shootCd: rand(0.4, 2.2),
        bob: rand(0, Math.PI * 2),
        lastX: home.x,
        lastZ: home.z,
        stuck: 0,
      });
    }
    // 开局先把小人推出墙（避免一开始就嵌在建筑里）
    for (let k = 0; k < 5; k++) for (const f of this.fighters) this.avoidBoxes(f.group.position);
  }

  // 在 home 附近挑一个"不在墙里"的目标点（最多试 16 次），避免蛋蛋往墙里走、贴墙
  private pickTarget(home: THREE.Vector3): THREE.Vector3 {
    for (let i = 0; i < 16; i++) {
      const x = home.x + rand(-3.2, 3.2), z = home.z + rand(-3.5, 3.5);
      if (!blocked(x, z, this.cover, 0.7)) return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(home.x, 0, home.z);
  }

  // 在 (x,z) 附近找一个不在墙里的点（出生用，避免一开始就嵌在建筑里）
  private clearNear(x: number, z: number): THREE.Vector3 {
    for (let i = 0; i < 24; i++) {
      const a = x + rand(-2.5, 2.5), b = z + rand(-2.5, 2.5);
      if (!blocked(a, b, this.cover, 0.7)) return new THREE.Vector3(a, 0, b);
    }
    return new THREE.Vector3(x, 0, z);
  }

  private nearestEnemy(f: Fighter): Fighter | null {
    let best: Fighter | null = null;
    let bestDist = Infinity;
    for (const o of this.fighters) {
      if (o.team === f.team) continue;
      const d = o.group.position.distanceToSquared(f.group.position);
      if (d < bestDist) { bestDist = d; best = o; }
    }
    return best;
  }

  // 把蛋蛋（在水平面上）推出掩体方块，避免穿模
  private avoidBoxes(pos: THREE.Vector3): void {
    for (const b of this.cover) {
      const minx = b.min.x - EGG_RADIUS, maxx = b.max.x + EGG_RADIUS;
      const minz = b.min.z - EGG_RADIUS, maxz = b.max.z + EGG_RADIUS;
      if (pos.x > minx && pos.x < maxx && pos.z > minz && pos.z < maxz) {
        const pl = pos.x - minx, pr = maxx - pos.x, pd = pos.z - minz, pu = maxz - pos.z;
        const m = Math.min(pl, pr, pd, pu);
        if (m === pl) pos.x = minx;
        else if (m === pr) pos.x = maxx;
        else if (m === pd) pos.z = minz;
        else pos.z = maxz;
      }
    }
  }

  // 蛋蛋之间互相分开，别叠在一起
  private separate(): void {
    for (let i = 0; i < this.fighters.length; i++) {
      for (let j = i + 1; j < this.fighters.length; j++) {
        const a = this.fighters[i].group.position;
        const b = this.fighters[j].group.position;
        const dx = a.x - b.x, dz = a.z - b.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.0001 && d < SEPARATION) {
          const push = (SEPARATION - d) / 2;
          const nx = dx / d, nz = dz / d;
          a.x += nx * push; a.z += nz * push;
          b.x -= nx * push; b.z -= nz * push;
        }
      }
    }
  }

  update(dt: number): void {
    for (const f of this.fighters) {
      const pos = f.group.position;

      // 走向目标点（避障寻路：绕开墙，不直挺挺撞上去）
      const to = f.target.clone().sub(pos); to.y = 0;
      if (to.length() < 0.5) {
        f.target = this.pickTarget(f.home);
      } else {
        to.normalize();
        const dir = steer(pos.x, pos.z, to.x, to.z, this.cover, 3, 0.6);
        pos.x += dir.x * 2.2 * dt;
        pos.z += dir.z * 2.2 * dt;
      }

      // 小蹦跳
      f.bob += dt * 8;
      pos.y = Math.abs(Math.sin(f.bob)) * 0.12;
    }

    // 多次松弛：互相分开 + 绕开掩体，确保不重叠、不穿模
    for (let k = 0; k < 4; k++) {
      this.separate();
      for (const f of this.fighters) this.avoidBoxes(f.group.position);
    }

    // 卡住检测：被墙顶住几乎没动 → 换个方向重选目标（不再一直顶着墙）
    for (const f of this.fighters) {
      const pos = f.group.position;
      const moved = Math.hypot(pos.x - f.lastX, pos.z - f.lastZ);
      if (moved < 0.012) {
        f.stuck += dt;
        // 贴墙没动一会儿 → 在当前位置附近重选一个"空地"目标，转身离开墙
        if (f.stuck > 0.35) { f.target.copy(this.pickTarget(pos)); f.stuck = 0; }
      } else { f.stuck = 0; }
      f.lastX = pos.x; f.lastZ = pos.z;
    }

    // 面朝最近的敌人 + 开火
    for (const f of this.fighters) {
      const enemy = this.nearestEnemy(f);
      if (enemy) {
        f.group.lookAt(enemy.group.position.x, f.group.position.y, enemy.group.position.z);
      }
      f.shootCd -= dt;
      if (f.shootCd <= 0 && enemy) {
        f.shootCd = rand(0.6, 1.8);
        this.fire(f, enemy);
      }
    }

    // 弹道淡出
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.mat.opacity = Math.max(0, t.life / TRACER_LIFE);
      if (t.life <= 0) {
        this.group.remove(t.line);
        t.line.geometry.dispose();
        t.mat.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  // 弹道遇到掩体方块就截断到墙面（避免子弹穿模）
  private clipToCover(p0: THREE.Vector3, p1: THREE.Vector3): THREE.Vector3 {
    const dir = p1.clone().sub(p0);
    let bestT = 1;
    for (const b of this.cover) {
      const t = this.rayBoxEntry(p0, dir, b);
      if (t !== null && t < bestT) bestT = t;
    }
    return p0.clone().add(dir.multiplyScalar(bestT));
  }

  // 线段 p0→(p0+dir) 与方块 b 的入射参数 t（0~1），不相交返回 null
  private rayBoxEntry(p0: THREE.Vector3, dir: THREE.Vector3, b: Box): number | null {
    const o = [p0.x, p0.y, p0.z];
    const d = [dir.x, dir.y, dir.z];
    const lo = [b.min.x, b.min.y, b.min.z];
    const hi = [b.max.x, b.max.y, b.max.z];
    let tmin = 0;
    let tmax = 1;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-8) {
        if (o[i] < lo[i] || o[i] > hi[i]) return null;
      } else {
        let t1 = (lo[i] - o[i]) / d[i];
        let t2 = (hi[i] - o[i]) / d[i];
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }
    return tmin;
  }

  private fire(f: Fighter, enemy: Fighter): void {
    f.group.updateMatrixWorld(true);
    const muzzle = GUN_MUZZLE.clone().applyMatrix4(f.group.matrixWorld);
    const aim = enemy.group.position.clone();
    aim.y = 0.7;
    aim.x += rand(-0.3, 0.3);
    aim.z += rand(-0.3, 0.3);

    // 弹道遇到掩体就停在墙上，不穿模
    const end = this.clipToCover(muzzle, aim);
    const geo = new THREE.BufferGeometry().setFromPoints([muzzle, end]);
    const mat = new THREE.LineBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 1 });
    const line = new THREE.Line(geo, mat);
    this.group.add(line);
    this.tracers.push({ line, mat, life: TRACER_LIFE });
  }
}
