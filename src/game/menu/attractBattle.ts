import * as THREE from 'three';
import { createEgg, Team, GUN_MUZZLE } from './eggCharacter';

interface Fighter {
  group: THREE.Group;
  team: Team;
  home: THREE.Vector3;
  target: THREE.Vector3;
  shootCd: number;
  bob: number;
}

interface Tracer {
  line: THREE.Line;
  mat: THREE.LineBasicMaterial;
  life: number;
}

const TRACER_LIFE = 0.12;

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

// 主菜单背景里的"蛋蛋小战斗"：6 个蛋分两队，走位 + 瞄准 + 射弹道，循环播放。
export class AttractBattle {
  readonly group = new THREE.Group();
  private fighters: Fighter[] = [];
  private tracers: Tracer[] = [];

  constructor() {
    for (let i = 0; i < 6; i++) {
      const team: Team = i < 3 ? 'red' : 'blue';
      const sideX = team === 'red' ? -6 : 6;
      const egg = createEgg(team);
      const home = new THREE.Vector3(sideX + rand(-2, 2), 0, rand(-7, 5));
      egg.position.copy(home);
      this.group.add(egg);
      this.fighters.push({
        group: egg,
        team,
        home,
        target: this.pickTarget(home),
        shootCd: rand(0.4, 2.2),
        bob: rand(0, Math.PI * 2),
      });
    }
  }

  private pickTarget(home: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(home.x + rand(-3, 3), 0, home.z + rand(-3.5, 3.5));
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

  update(dt: number): void {
    for (const f of this.fighters) {
      const pos = f.group.position;

      // 走向目标点
      const to = f.target.clone().sub(pos); to.y = 0;
      if (to.length() < 0.4) {
        f.target = this.pickTarget(f.home);
      } else {
        to.normalize();
        pos.x += to.x * 2.2 * dt;
        pos.z += to.z * 2.2 * dt;
      }

      // 小蹦跳
      f.bob += dt * 8;
      pos.y = Math.abs(Math.sin(f.bob)) * 0.12;

      // 面朝最近的敌人（蛋蛋正面是 +Z）
      const enemy = this.nearestEnemy(f);
      if (enemy) {
        f.group.lookAt(enemy.group.position.x, pos.y, enemy.group.position.z);
      }

      // 开火
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

  private fire(f: Fighter, enemy: Fighter): void {
    f.group.updateMatrixWorld(true);
    const muzzle = GUN_MUZZLE.clone().applyMatrix4(f.group.matrixWorld);
    const aim = enemy.group.position.clone();
    aim.y = 0.7;
    aim.x += rand(-0.3, 0.3);
    aim.z += rand(-0.3, 0.3);

    const geo = new THREE.BufferGeometry().setFromPoints([muzzle, aim]);
    const mat = new THREE.LineBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 1 });
    const line = new THREE.Line(geo, mat);
    this.group.add(line);
    this.tracers.push({ line, mat, life: TRACER_LIFE });
  }
}
