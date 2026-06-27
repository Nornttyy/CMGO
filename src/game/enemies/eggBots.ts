import * as THREE from 'three';
import { createEgg } from '../menu/eggCharacter';
import { Box } from '../physics/aabb';
import { pushOut, blocked } from '../ai/steering';
import { PathGrid, Pt } from '../ai/pathfind';

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
  path: Pt[]; pathI: number;  // A* 算出的路径(拐点) + 当前走到第几个
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
  private grid: PathGrid;
  private solids: Box[];   // 当前要避开的实体 = 静态墙 (+ 立着的光幕)
  private tmpO = new THREE.Vector3();
  private tmpF = new THREE.Vector3();

  constructor(private walls: Box[], private bounds: Bounds, count: number) {
    this.solids = walls;
    this.grid = new PathGrid(this.solids, bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ);
    for (let i = 0; i < count; i++) {
      const p = this.clearPoint();
      const egg = createEgg('red');
      egg.position.set(p.x, 0, p.z);
      this.group.add(egg);
      const bodyMat = (egg.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
      bodyMat.emissive = new THREE.Color(0xffffff);
      bodyMat.emissiveIntensity = 0;
      this.bots.push({
        group: egg, bodyMat, path: [], pathI: 0, bob: Math.random() * 6,
        stuck: 0, lx: p.x, lz: p.z, hp: MAX_HP, dead: false, respawn: 0, flash: 0,
      });
    }
  }

  // 给蛋蛋选个新目的地，并用 A* 算一条绕开墙的路
  private newDest(b: Bot): void {
    for (let i = 0; i < 6; i++) {
      const t = this.clearPoint();
      const path = this.grid.findPath(b.group.position.x, b.group.position.z, t.x, t.z);
      if (path.length) { b.path = path; b.pathI = 0; return; }
    }
    const t = this.clearPoint();
    b.path = [{ x: t.x, z: t.z }]; b.pathI = 0; // 兜底：直接走过去
  }

  // 出生光幕立起/落下时调用：立着时把光幕也算进碰撞和寻路(蛋蛋绕开、穿不过)；落下传 [] 恢复
  setBarrierBoxes(boxes: Box[]): void {
    this.solids = boxes.length ? this.walls.concat(boxes) : this.walls;
    this.grid = new PathGrid(this.solids, this.bounds.minX, this.bounds.minZ, this.bounds.maxX, this.bounds.maxZ);
    for (const b of this.bots) { b.path = []; b.pathI = 0; } // 重新规划路径
  }

  private clearPoint(): { x: number; z: number } {
    const b = this.bounds;
    for (let i = 0; i < 20; i++) {
      const x = b.minX + (b.maxX - b.minX) * Math.random();
      const z = b.minZ + (b.maxZ - b.minZ) * Math.random();
      if (!blocked(x, z, this.solids, 1)) return { x, z };
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

  // 玩家开枪命中某物体时调用：若该物体属于某只蛋蛋(子网格)就扣血，返回是否打到蛋蛋。
  // (统一射线在 main 里打，这里只负责"这是不是蛋蛋、是就扣血")
  shootObject(obj: THREE.Object3D, fromX: number, fromZ: number): boolean {
    const bot = this.bots.find((b) => {
      let q: THREE.Object3D | null = obj;
      while (q) { if (q === b.group) return true; q = q.parent; }
      return false;
    });
    if (!bot || bot.dead) return false;
    this.damage(bot, fromX, fromZ);
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
    pushOut(b.group.position, this.solids, 0.5);
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
          const sp = this.clearPoint();
          b.group.position.set(sp.x, 0, sp.z);
          b.path = []; b.pathI = 0; b.lx = sp.x; b.lz = sp.z; // 重生后重新规划路径
          b.hp = MAX_HP; b.dead = false; b.group.visible = true;
        }
        continue;
      }

      const p = b.group.position;
      // 没路或走完了 → 选新目的地并用 A* 算一条路
      if (b.pathI >= b.path.length) this.newDest(b);
      const wp = b.path[b.pathI];
      if (wp) {
        let dx = wp.x - p.x, dz = wp.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.55) { b.pathI++; }       // 到这个拐点了 → 去下一个
        else {
          dx /= d; dz /= d;
          p.x += dx * SPEED * dt; p.z += dz * SPEED * dt;
          b.group.lookAt(p.x + dx, p.y, p.z + dz); // 朝移动方向
        }
      }
      pushOut(p, this.solids, 0.5);
      b.bob += dt * 8; p.y = Math.abs(Math.sin(b.bob)) * 0.12;

      // 受击闪白衰减
      if (b.flash > 0) {
        b.flash = Math.max(0, b.flash - dt);
        b.bodyMat.emissiveIntensity = (b.flash / FLASH_TIME) * 0.9;
      }

      // 卡住(被挤/绕不过) → 重新规划路径
      const moved = Math.hypot(p.x - b.lx, p.z - b.lz);
      if (moved < 0.012) { b.stuck += dt; if (b.stuck > 0.6) { this.newDest(b); b.stuck = 0; } }
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
