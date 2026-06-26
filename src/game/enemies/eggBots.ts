import * as THREE from 'three';
import { createEgg } from '../menu/eggCharacter';
import { Box } from '../physics/aabb';
import { steer, pushOut, blocked } from '../ai/steering';

export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number; }

const SPEED = 2.6;          // 游走速度
const MAX_HP = 2;           // 两刀砍死
const RESPAWN_DELAY = 3;    // 死后多少秒重生
const MELEE_RANGE = 2.8;    // 玩家近战能砍到的距离
const MELEE_DOT = 0.5;      // 蛋蛋要在玩家正前方约 ±60° 内才砍得到
const FLASH_TIME = 0.16;    // 被砍中闪白时长

interface Bot {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial; // 受击闪白用
  tx: number; tz: number;     // 目标点
  bob: number;
  stuck: number; lx: number; lz: number;
  hp: number;
  dead: boolean;
  respawn: number;            // 死后重生倒计时
  flash: number;              // 被砍中闪白计时
}

// 局内的蛋蛋：在地图里自己寻路游走（避障、不卡、互相不重叠、小蹦跳）。
// 玩家用刀能砍它们：两刀砍死，砍中闪白+击退，死后过几秒在别处重生。
export class EggBots {
  readonly group = new THREE.Group();
  private bots: Bot[] = [];
  private tmpO = new THREE.Vector3();
  private tmpF = new THREE.Vector3();

  constructor(private walls: Box[], private bounds: Bounds, count: number) {
    for (let i = 0; i < count; i++) {
      const p = this.clearPoint();
      const egg = createEgg('red');
      egg.position.set(p.x, 0, p.z);
      this.group.add(egg);
      const bodyMat = (egg.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
      bodyMat.emissive = new THREE.Color(0xffffff);
      bodyMat.emissiveIntensity = 0;
      this.bots.push({
        group: egg, bodyMat, tx: p.x, tz: p.z, bob: Math.random() * 6,
        stuck: 0, lx: p.x, lz: p.z, hp: MAX_HP, dead: false, respawn: 0, flash: 0,
      });
    }
  }

  private clearPoint(): { x: number; z: number } {
    const b = this.bounds;
    for (let i = 0; i < 20; i++) {
      const x = b.minX + (b.maxX - b.minX) * Math.random();
      const z = b.minZ + (b.maxZ - b.minZ) * Math.random();
      if (!blocked(x, z, this.walls, 1)) return { x, z };
    }
    return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
  }

  // 玩家挥刀那一刻调用：砍到正前方近处的蛋蛋就扣血。命中返回 true。
  tryMelee(camera: THREE.Camera): boolean {
    camera.getWorldPosition(this.tmpO);
    camera.getWorldDirection(this.tmpF);
    this.tmpF.y = 0;
    if (this.tmpF.lengthSq() < 1e-6) return false;
    this.tmpF.normalize();
    let best: Bot | null = null;
    let bestD = Infinity;
    for (const b of this.bots) {
      if (b.dead) continue;
      const dx = b.group.position.x - this.tmpO.x, dz = b.group.position.z - this.tmpO.z;
      const d = Math.hypot(dx, dz);
      if (d > MELEE_RANGE || d < 1e-3) continue;
      if ((this.tmpF.x * dx + this.tmpF.z * dz) / d < MELEE_DOT) continue; // 不在身前
      if (d < bestD) { bestD = d; best = b; }
    }
    if (!best) return false;
    this.damage(best, this.tmpO.x, this.tmpO.z);
    return true;
  }

  private damage(b: Bot, fromX: number, fromZ: number): void {
    b.flash = FLASH_TIME;
    b.hp -= 1;
    // 击退：从玩家方向被推开一点（再推出墙，免得被推进墙里）
    let kx = b.group.position.x - fromX, kz = b.group.position.z - fromZ;
    const kd = Math.hypot(kx, kz) || 1;
    b.group.position.x += (kx / kd) * 0.45;
    b.group.position.z += (kz / kd) * 0.45;
    pushOut(b.group.position, this.walls, 0.5);
    if (b.hp <= 0) {
      b.dead = true;
      b.group.visible = false;
      b.respawn = RESPAWN_DELAY;
      b.bodyMat.emissiveIntensity = 0;
    }
  }

  update(dt: number): void {
    for (const b of this.bots) {
      if (b.dead) {                       // 死了：等待重生
        b.respawn -= dt;
        if (b.respawn <= 0) {
          const p = this.clearPoint();
          b.group.position.set(p.x, 0, p.z);
          b.tx = p.x; b.tz = p.z; b.lx = p.x; b.lz = p.z;
          b.hp = MAX_HP; b.dead = false; b.group.visible = true;
        }
        continue;
      }

      const p = b.group.position;
      let dx = b.tx - p.x, dz = b.tz - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5) {
        const t = this.clearPoint(); b.tx = t.x; b.tz = t.z;
      } else {
        dx /= dist; dz /= dist;
        const dir = steer(p.x, p.z, dx, dz, this.walls);
        p.x += dir.x * SPEED * dt; p.z += dir.z * SPEED * dt;
      }
      pushOut(p, this.walls, 0.5);
      b.group.lookAt(b.tx, p.y, b.tz);
      b.bob += dt * 8; p.y = Math.abs(Math.sin(b.bob)) * 0.12;

      // 受击闪白衰减
      if (b.flash > 0) {
        b.flash = Math.max(0, b.flash - dt);
        b.bodyMat.emissiveIntensity = (b.flash / FLASH_TIME) * 0.9;
      }

      // 卡住重选目标
      const moved = Math.hypot(p.x - b.lx, p.z - b.lz);
      if (moved < 0.01) { b.stuck += dt; if (b.stuck > 0.5) { const t = this.clearPoint(); b.tx = t.x; b.tz = t.z; b.stuck = 0; } }
      else b.stuck = 0;
      b.lx = p.x; b.lz = p.z;
    }

    // 互相分开，别叠在一起（只算活着的）
    for (let i = 0; i < this.bots.length; i++) {
      if (this.bots[i].dead) continue;
      for (let j = i + 1; j < this.bots.length; j++) {
        if (this.bots[j].dead) continue;
        const a = this.bots[i].group.position, c = this.bots[j].group.position;
        const dx = a.x - c.x, dz = a.z - c.z, d = Math.hypot(dx, dz);
        if (d > 0.001 && d < 1.4) { const pu = (1.4 - d) / 2, nx = dx / d, nz = dz / d; a.x += nx * pu; a.z += nz * pu; c.x -= nx * pu; c.z -= nz * pu; }
      }
    }
  }
}
