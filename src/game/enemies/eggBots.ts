import * as THREE from 'three';
import { createEgg } from '../menu/eggCharacter';
import { Box } from '../physics/aabb';
import { pushOut, blocked } from '../ai/steering';
import { PathGrid, Pt } from '../ai/pathfind';

export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number; }

const SPEED = 2.6;          // 游走速度
const MAX_HP = 100;         // 血量(参考无畏契约：特工100血)
const KNIFE_DMG = 50;       // 军刀伤害(无畏契约刀正面50，两刀砍死)
const RESPAWN_DELAY = 3;    // 死后多少秒重生
const MELEE_RANGE = 2.8;    // 玩家近战能砍到的距离
const MELEE_DOT = 0.5;      // 蛋蛋要在玩家正前方约 ±60° 内才砍得到
const FLASH_TIME = 0.16;    // 被砍中闪白时长
const EGG_SCALE = 1.3;      // 蛋蛋整体放大到和玩家差不多高(~1.8米)
const HEAD_Y = 1.15;        // 爆头判定：命中点高于"脚下 + 这个高度"算爆头(头部)
const DETECT = 13;          // 玩家走到这么近，蛋蛋会注意到、转头看你
const TURN_SMOOTH = 9;      // 转身平滑速度(越大转得越快)
// 战斗：发现玩家就拉枪线、走位、开枪反击
const SHOOT_RANGE = 26;     // 有视线 + 这么近 → 开枪
const CHASE_RANGE = 34;     // 这么近(可无视线) → 主动追上去找视线
const COMBAT_MIN = 5, COMBAT_MAX = 12; // 交战时想保持的距离
const EGG_FIRE_CD = 0.8;    // 蛋蛋两枪间隔(秒)
const EGG_REACT = 0.35;     // 看到玩家后开第一枪的反应延迟
const EGG_DMG = 13;         // 蛋蛋每枪伤害
const EGG_EYE = 1.25;       // 蛋蛋枪口/视线高度
const STRAFE_FLIP = 1.3;    // 多久换一次左右走位

// 弹痕：命中蛋身时贴一个深色圆斑，跟着蛋动，过一会淡出
const DECAL_LIFE = 3.0, DECAL_FADE = 1.0, DECAL_MAX = 6;
const DECAL_GEO = new THREE.PlaneGeometry(0.22, 0.22);
function makeDecalTexture(): THREE.CanvasTexture {
  const S = 48; const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d') as CanvasRenderingContext2D;
  const g = x.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(18,10,6,0.95)'); g.addColorStop(0.6, 'rgba(28,16,10,0.55)'); g.addColorStop(1, 'rgba(28,16,10,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

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
  decals: { mesh: THREE.Mesh; life: number }[]; // 身上的弹痕
  shootCd: number;            // 距下次开枪
  reactT: number;             // 看到玩家后的反应延迟
  strafeDir: number;          // 走位方向(+1/-1)
  strafeT: number;            // 距下次换走位方向
  repathT: number;            // 追击时距下次重算路径
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
  private decalTex: THREE.CanvasTexture;
  private onHit?: (dmg: number, fromX: number, fromZ: number) => void; // 打中玩家的回调
  private combat = false;     // 是否进入战斗(光幕落下后才会开枪)
  private tracers: { line: THREE.Line; t: number }[] = []; // 蛋蛋开枪的子弹拖尾池

  // 蛋蛋打中玩家时调用(由 main 设进来，扣玩家血)
  setOnHit(cb: (dmg: number, fromX: number, fromZ: number) => void): void { this.onHit = cb; }
  // 准备阶段 false(不开枪)，光幕落下 true(开打)
  setCombat(on: boolean): void { this.combat = on; }

  constructor(private walls: Box[], private bounds: Bounds, count: number) {
    this.solids = walls;
    this.decalTex = makeDecalTexture();
    for (let i = 0; i < 12; i++) { // 子弹拖尾池
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 }));
      line.visible = false; line.frustumCulled = false; this.group.add(line);
      this.tracers.push({ line, t: 0 });
    }
    this.grid = new PathGrid(this.solids, bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ);
    for (let i = 0; i < count; i++) {
      const p = this.clearPoint();
      const egg = createEgg('red');
      egg.scale.setScalar(EGG_SCALE); // 长高到和玩家差不多
      egg.position.set(p.x, 0, p.z);
      this.group.add(egg);
      const bodyMat = (egg.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
      bodyMat.emissive = new THREE.Color(0xffffff);
      bodyMat.emissiveIntensity = 0;
      this.bots.push({
        group: egg, bodyMat, path: [], pathI: 0, bob: Math.random() * 6,
        stuck: 0, lx: p.x, lz: p.z, hp: MAX_HP, dead: false, respawn: 0, flash: 0, decals: [],
        shootCd: 0, reactT: EGG_REACT, strafeDir: Math.random() < 0.5 ? 1 : -1, strafeT: 0, repathT: 0,
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
    this.damage(best, KNIFE_DMG, this.tmpO.x, this.tmpO.z);
    return true;
  }

  // 玩家开枪命中某物体时调用：若该物体属于某只蛋蛋就扣血(命中点够高算爆头，伤害更高)。
  // bodyDmg/headDmg 由枪传入(无畏契约数值)；返回 'head' / 'body' / null(没打到蛋蛋)
  shootObject(obj: THREE.Object3D, hitPoint: THREE.Vector3, bodyDmg: number, headDmg: number, fromX: number, fromZ: number): 'head' | 'body' | null {
    const bot = this.bots.find((b) => {
      let q: THREE.Object3D | null = obj;
      while (q) { if (q === b.group) return true; q = q.parent; }
      return false;
    });
    if (!bot || bot.dead) return null;
    const head = hitPoint.y > bot.group.position.y + HEAD_Y;
    this.damage(bot, head ? headDmg : bodyDmg, fromX, fromZ);
    this.addDecal(bot, hitPoint); // 在蛋身上留弹痕
    return head ? 'head' : 'body';
  }

  // 在蛋身命中点贴一个深色弹痕(挂在蛋身上跟着动)，超过上限删最旧的
  private addDecal(bot: Bot, world: THREE.Vector3): void {
    const local = world.clone().sub(bot.group.position).multiplyScalar(1 / EGG_SCALE);
    const mat = new THREE.MeshBasicMaterial({ map: this.decalTex, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(DECAL_GEO, mat);
    mesh.position.copy(local);
    const out = new THREE.Vector3(local.x, 0, local.z);
    if (out.lengthSq() < 1e-4) out.set(0, 0, 1); else out.normalize();
    mesh.lookAt(local.x + out.x, local.y, local.z + out.z); // 朝外贴在表面
    mesh.renderOrder = 6;
    bot.group.add(mesh);
    bot.decals.push({ mesh, life: DECAL_LIFE });
    while (bot.decals.length > DECAL_MAX) { const old = bot.decals.shift() as { mesh: THREE.Mesh }; bot.group.remove(old.mesh); (old.mesh.material as THREE.Material).dispose(); }
  }
  private clearDecals(b: Bot): void {
    for (const d of b.decals) { b.group.remove(d.mesh); (d.mesh.material as THREE.Material).dispose(); }
    b.decals = [];
  }

  private damage(b: Bot, dmg: number, fromX: number, fromZ: number): void {
    b.flash = FLASH_TIME;
    b.hp -= dmg;
    // 击退：从玩家方向被推开一点(按伤害缩放，散弹枪每颗弹丸只推一点点)；再推出墙，免得被推进墙里
    const kb = Math.min(0.5, dmg * 0.014);
    let kx = b.group.position.x - fromX, kz = b.group.position.z - fromZ;
    const kd = Math.hypot(kx, kz) || 1;
    b.group.position.x += (kx / kd) * kb;
    b.group.position.z += (kz / kd) * kb;
    pushOut(b.group.position, this.solids, 0.5);
    if (b.hp <= 0) {
      b.dead = true;
      b.group.visible = false;
      b.respawn = RESPAWN_DELAY;
      b.bodyMat.emissiveIntensity = 0;
      this.clearDecals(b); // 死了清掉身上弹痕
    }
  }

  // 蛋眼到玩家之间有没有被墙挡住(沿线采样)
  private canSee(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax, dz = bz - az, dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.floor(dist / 1.4));
    for (let i = 1; i < steps; i++) { const t = i / steps; if (blocked(ax + dx * t, az + dz * t, this.solids, 0.1)) return false; }
    return true;
  }

  // 蛋蛋朝玩家开一枪：画拖尾 + 有概率命中(越近越准)
  private fireAtPlayer(b: Bot, playerPos: THREE.Vector3, distP: number): void {
    const ex = b.group.position.x, ez = b.group.position.z, ey = EGG_EYE + b.group.position.y;
    const hit = Math.random() < Math.max(0.15, Math.min(0.7, 0.72 - distP * 0.018));
    let tx = playerPos.x, ty = playerPos.y, tz = playerPos.z;
    if (!hit) { const off = 0.6 + Math.random() * 1.2, a = Math.random() * Math.PI * 2; tx += Math.cos(a) * off; tz += Math.sin(a) * off; ty += (Math.random() - 0.5) * 1.2; }
    this.spawnTracer(ex, ey, ez, tx, ty, tz);
    if (hit && this.onHit) this.onHit(EGG_DMG, ex, ez);
  }

  private spawnTracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    const tr = this.tracers.find((t) => t.t <= 0) || this.tracers[0];
    const pos = (tr.line.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, ax, ay, az); pos.setXYZ(1, bx, by, bz); pos.needsUpdate = true;
    tr.line.visible = true; (tr.line.material as THREE.LineBasicMaterial).opacity = 0.9; tr.t = 0.08;
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    // 蛋蛋子弹拖尾淡出
    for (const tr of this.tracers) {
      if (tr.t > 0) { tr.t -= dt; (tr.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, tr.t / 0.08) * 0.9; if (tr.t <= 0) tr.line.visible = false; }
    }
    for (const b of this.bots) {
      if (b.dead) {                       // 死了：等待重生
        b.respawn -= dt;
        if (b.respawn <= 0) {
          const sp = this.clearPoint();
          b.group.position.set(sp.x, 0, sp.z);
          b.path = []; b.pathI = 0; b.lx = sp.x; b.lz = sp.z;
          b.hp = MAX_HP; b.dead = false; b.group.visible = true;
          b.reactT = EGG_REACT; b.shootCd = 0; this.clearDecals(b);
        }
        continue;
      }

      const p = b.group.position;
      const dpx = playerPos.x - p.x, dpz = playerPos.z - p.z;
      const distP = Math.hypot(dpx, dpz) || 1e-3;
      const hasLOS = this.combat && distP < SHOOT_RANGE && this.canSee(p.x, p.z, playerPos.x, playerPos.z);
      let mvx = 0, mvz = 0, faceX = 0, faceZ = 0;

      if (hasLOS) {
        // —— 交战：保持距离 + 左右走位 + 开枪 ——
        const tx = dpx / distP, tz = dpz / distP, sx = -tz, sz = tx;
        let ax = 0, az = 0;
        if (distP > COMBAT_MAX) { ax += tx; az += tz; }       // 太远→靠近
        else if (distP < COMBAT_MIN) { ax -= tx; az -= tz; }  // 太近→后退
        ax += sx * b.strafeDir * 0.95; az += sz * b.strafeDir * 0.95; // 走位
        const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
        const nx = p.x + ax * SPEED * dt, nz = p.z + az * SPEED * dt;
        if (!blocked(nx, nz, this.solids, 0.5)) { p.x = nx; p.z = nz; mvx = ax; mvz = az; }
        else b.strafeDir *= -1;
        faceX = dpx; faceZ = dpz;
        b.strafeT -= dt; if (b.strafeT <= 0) { b.strafeDir *= -1; b.strafeT = STRAFE_FLIP * (0.7 + Math.random() * 0.6); }
        b.reactT -= dt;
        if (b.reactT <= 0) { b.shootCd -= dt; if (b.shootCd <= 0) { this.fireAtPlayer(b, playerPos, distP); b.shootCd = EGG_FIRE_CD * (0.85 + Math.random() * 0.3); } }
      } else if (this.combat && distP < CHASE_RANGE) {
        // —— 追击：没视线但很近 → A* 朝玩家走，去找视线 ——
        b.reactT = EGG_REACT;
        b.repathT -= dt;
        if (b.repathT <= 0 || b.pathI >= b.path.length) {
          const path = this.grid.findPath(p.x, p.z, playerPos.x, playerPos.z);
          if (path.length) { b.path = path; b.pathI = 0; } else this.newDest(b);
          b.repathT = 0.5;
        }
        const wp = b.path[b.pathI];
        if (wp) { let dx = wp.x - p.x, dz = wp.z - p.z; const d = Math.hypot(dx, dz); if (d < 0.55) b.pathI++; else { dx /= d; dz /= d; p.x += dx * SPEED * dt; p.z += dz * SPEED * dt; mvx = dx; mvz = dz; } }
        faceX = dpx; faceZ = dpz;
      } else {
        // —— 平时：随机游走 ——
        b.reactT = EGG_REACT;
        if (b.pathI >= b.path.length) this.newDest(b);
        const wp = b.path[b.pathI];
        if (wp) { let dx = wp.x - p.x, dz = wp.z - p.z; const d = Math.hypot(dx, dz); if (d < 0.55) b.pathI++; else { dx /= d; dz /= d; p.x += dx * SPEED * dt; p.z += dz * SPEED * dt; mvx = dx; mvz = dz; } }
        faceX = mvx; faceZ = mvz;
        if (distP > 0.6 && distP < DETECT) { faceX = dpx; faceZ = dpz; }
      }
      pushOut(p, this.solids, 0.5);

      // 平滑转身
      if (faceX !== 0 || faceZ !== 0) {
        const targetYaw = Math.atan2(faceX, faceZ);
        let dy = targetYaw - b.group.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        b.group.rotation.y += dy * Math.min(1, dt * TURN_SMOOTH);
      }
      b.bob += dt * 8; p.y = Math.abs(Math.sin(b.bob)) * 0.12;

      // 受击闪白衰减
      if (b.flash > 0) { b.flash = Math.max(0, b.flash - dt); b.bodyMat.emissiveIntensity = (b.flash / FLASH_TIME) * 0.9; }
      // 弹痕淡出
      for (let i = b.decals.length - 1; i >= 0; i--) {
        const d = b.decals[i]; d.life -= dt;
        if (d.life <= 0) { b.group.remove(d.mesh); (d.mesh.material as THREE.Material).dispose(); b.decals.splice(i, 1); }
        else (d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, d.life / DECAL_FADE);
      }

      // 卡住 → 重新规划(交战时靠撞墙换边，不重规划)
      const moved = Math.hypot(p.x - b.lx, p.z - b.lz);
      if (moved < 0.012 && !hasLOS) { b.stuck += dt; if (b.stuck > 0.6) { this.newDest(b); b.stuck = 0; } }
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
