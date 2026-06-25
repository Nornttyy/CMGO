import * as THREE from 'three';
import { createEgg } from '../menu/eggCharacter';
import { Box } from '../physics/aabb';
import { steer, pushOut, blocked } from '../ai/steering';

export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number; }

interface Bot {
  group: THREE.Group;
  tx: number; tz: number;     // 目标点
  bob: number;
  stuck: number; lx: number; lz: number;
}

// 局内的蛋蛋：在地图里游走（避障寻路、不卡、互相不重叠、小蹦跳）。
// 先只游走，以后再加发现玩家/开枪/被打死（M2）。
export class EggBots {
  readonly group = new THREE.Group();
  private bots: Bot[] = [];

  constructor(private walls: Box[], private bounds: Bounds, count: number) {
    for (let i = 0; i < count; i++) {
      const p = this.clearPoint();
      const egg = createEgg('red');
      egg.position.set(p.x, 0, p.z);
      this.group.add(egg);
      this.bots.push({ group: egg, tx: p.x, tz: p.z, bob: Math.random() * 6, stuck: 0, lx: p.x, lz: p.z });
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

  update(dt: number): void {
    for (const b of this.bots) {
      const p = b.group.position;
      let dx = b.tx - p.x, dz = b.tz - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5) {
        const t = this.clearPoint(); b.tx = t.x; b.tz = t.z;
      } else {
        dx /= dist; dz /= dist;
        const dir = steer(p.x, p.z, dx, dz, this.walls);
        p.x += dir.x * 2.6 * dt; p.z += dir.z * 2.6 * dt;
      }
      pushOut(p, this.walls, 0.5);
      b.group.lookAt(b.tx, p.y, b.tz);
      b.bob += dt * 8; p.y = Math.abs(Math.sin(b.bob)) * 0.12;
      // 卡住重选目标
      const moved = Math.hypot(p.x - b.lx, p.z - b.lz);
      if (moved < 0.01) { b.stuck += dt; if (b.stuck > 0.6) { const t = this.clearPoint(); b.tx = t.x; b.tz = t.z; b.stuck = 0; } }
      else b.stuck = 0;
      b.lx = p.x; b.lz = p.z;
    }
    // 互相分开，别叠在一起
    for (let i = 0; i < this.bots.length; i++) for (let j = i + 1; j < this.bots.length; j++) {
      const a = this.bots[i].group.position, c = this.bots[j].group.position;
      const dx = a.x - c.x, dz = a.z - c.z, d = Math.hypot(dx, dz);
      if (d > 0.001 && d < 1.4) { const pu = (1.4 - d) / 2, nx = dx / d, nz = dz / d; a.x += nx * pu; a.z += nz * pu; c.x -= nx * pu; c.z -= nz * pu; }
    }
  }
}
