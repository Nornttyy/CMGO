import * as THREE from 'three';
import { createEgg } from '../menu/eggCharacter';
import { Box } from '../physics/aabb';
import { pushOut, blocked } from '../ai/steering';
import { PathGrid, Pt } from '../ai/pathfind';
import { BotBrain, BrainWorld } from '../ai/botBrain';
import { BotAim, AIM } from '../ai/botAim';
import { SENSE } from '../ai/botSenses';
import { generateCoverPoints } from '../ai/botCover';
import { BotSquad, SquadMate } from '../ai/botSquad';

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
const TURN_SMOOTH = 9;      // 转身平滑速度(越大转得越快)
const EGG_EYE = 1.25;       // 蛋蛋枪口/视线高度

// 弹痕：命中蛋身时贴一个深色圆斑，跟着蛋动，过一会淡出
const DECAL_LIFE = 1.8, DECAL_FADE = 1.8, DECAL_MAX = 4; // 弹痕：全程渐淡、1.8秒内消失、最多4个(不残留)
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
  brain: BotBrain;            // 新大脑(决策)
  aim: BotAim;                // 瞄准的手
  thinkAcc: number;           // 距上次思考累计了多久
  bob: number;
  stuck: number; lx: number; lz: number;
  hp: number;
  dead: boolean;
  respawn: number;
  flash: number;
  decals: { mesh: THREE.Mesh; life: number }[];
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
  private squad = new BotSquad();       // 全队一个对讲机
  private covers: Pt[];                 // 掩体点(启动时生成一次)
  private world: BrainWorld;            // 给大脑用的世界接口
  private thinkingI = 0;                // 当前谁在思考(coverTaken要排除自己)
  private frame = 0;                    // 轮流思考用
  private prevPlayer: Pt | null = null; // 上一帧玩家位置(算速度)
  private playerVel: Pt = { x: 0, z: 0 };

  // 蛋蛋打中玩家时调用(由 main 设进来，扣玩家血)
  setOnHit(cb: (dmg: number, fromX: number, fromZ: number) => void): void { this.onHit = cb; }
  // 准备阶段 false(不开枪)，光幕落下 true(开打)
  setCombat(on: boolean): void { this.combat = on; }
  // 玩家开枪：附近的蛋都听到(消音枪传得近)
  hearGun(x: number, z: number, suppressed: boolean): void {
    this.emitSound(x, z, suppressed ? SENSE.NOISE_GUN_SUPPRESSED : SENSE.NOISE_GUN);
  }
  // 玩家跑步脚步声
  hearFootstep(x: number, z: number): void { this.emitSound(x, z, SENSE.NOISE_FOOTSTEP); }
  private emitSound(x: number, z: number, radius: number): void {
    if (!this.combat) return; // 准备阶段不惊动
    for (const b of this.bots) {
      if (b.dead) continue;
      const p = b.group.position;
      if (Math.hypot(p.x - x, p.z - z) <= radius) b.brain.senses.hearAt(x, z);
    }
  }
  // 无头验证/调试用
  debugState(): { mode: string; role: string; hp: number; visible: boolean }[] {
    return this.bots.map((b, i) => ({
      mode: b.brain.drive.mode, role: this.squad.roles[i] ?? 'hold', hp: b.hp, visible: b.brain.senses.visible,
    }));
  }

  // spawnZone：出生/重生限定区（守方半场）；不传就全图随机。游走目标始终用全图 bounds。
  constructor(private walls: Box[], private bounds: Bounds, count: number, private spawnZone?: Bounds) {
    this.solids = walls;
    this.decalTex = makeDecalTexture();
    for (let i = 0; i < 12; i++) { // 子弹拖尾池
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 }));
      line.visible = false; line.frustumCulled = false; this.group.add(line);
      this.tracers.push({ line, t: 0 });
    }
    this.grid = new PathGrid(this.solids, bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ);
    this.covers = generateCoverPoints(walls, bounds); // 掩体点只认静态墙
    this.world = {
      solids: this.solids,
      covers: this.covers,
      findPath: (sx, sz, tx, tz) => this.grid.findPath(sx, sz, tx, tz),
      randomPoint: () => this.clearPoint(),
      // 掩体被"别的活蛋"占了才算占用
      coverTaken: (i) => this.bots.some((ob, j) => j !== this.thinkingI && !ob.dead && ob.brain.coverI === i),
    };
    for (let i = 0; i < count; i++) {
      const p = this.spawnPoint();
      const egg = createEgg('red');
      egg.scale.setScalar(EGG_SCALE); // 长高到和玩家差不多
      egg.position.set(p.x, 0, p.z);
      this.group.add(egg);
      const bodyMat = (egg.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
      bodyMat.emissive = new THREE.Color(0xffffff);
      bodyMat.emissiveIntensity = 0;
      const brain = new BotBrain(); brain.reset();
      const aim = new BotAim(); aim.reset(p.x, p.z);
      this.bots.push({
        group: egg, bodyMat, brain, aim, thinkAcc: Math.random() * 0.1, bob: Math.random() * 6,
        stuck: 0, lx: p.x, lz: p.z, hp: MAX_HP, dead: false, respawn: 0, flash: 0, decals: [],
      });
    }
  }

  // 出生光幕立起/落下时调用：立着时把光幕也算进碰撞和寻路(蛋蛋绕开、穿不过)；落下传 [] 恢复
  setBarrierBoxes(boxes: Box[]): void {
    this.solids = boxes.length ? this.walls.concat(boxes) : this.walls;
    this.grid = new PathGrid(this.solids, this.bounds.minX, this.bounds.minZ, this.bounds.maxX, this.bounds.maxZ);
    this.world.solids = this.solids; // 大脑看到的墙也要换
    for (const b of this.bots) b.brain.forceRepath(); // 世界变了,都重新想路
  }

  private clearPoint(zone?: Bounds): { x: number; z: number } {
    const b = zone ?? this.bounds;
    for (let i = 0; i < 20; i++) {
      const x = b.minX + (b.maxX - b.minX) * Math.random();
      const z = b.minZ + (b.maxZ - b.minZ) * Math.random();
      if (!blocked(x, z, this.solids, 1)) return { x, z };
    }
    return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
  }

  // 出生/重生点：限定在守方半场（没配置就退回全图）
  private spawnPoint(): { x: number; z: number } {
    return this.clearPoint(this.spawnZone);
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
    if (!bot.dead) this.addDecal(bot, hitPoint); // 还活着才在蛋身上留弹痕(死了看不见)
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
    if (!b.dead && this.combat) b.brain.senses.onDamaged(fromX, fromZ); // 挨打立刻回头找人
    if (b.hp <= 0) {
      b.dead = true;
      b.group.visible = false;
      b.respawn = RESPAWN_DELAY;
      b.bodyMat.emissiveIntensity = 0;
      this.clearDecals(b); // 死了清掉身上弹痕
      this.squad.noteDeath(); // 队友阵亡,全队谨慎一阵
    }
  }

  private spawnTracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    const tr = this.tracers.find((t) => t.t <= 0) || this.tracers[0];
    const pos = (tr.line.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, ax, ay, az); pos.setXYZ(1, bx, by, bz); pos.needsUpdate = true;
    tr.line.visible = true; (tr.line.material as THREE.LineBasicMaterial).opacity = 0.9; tr.t = 0.08;
  }

  update(dt: number, playerPos: THREE.Vector3, playerAlive = true): void {
    // 蛋蛋子弹拖尾淡出（原样保留）
    for (const tr of this.tracers) {
      if (tr.t > 0) { tr.t -= dt; (tr.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, tr.t / 0.08) * 0.9; if (tr.t <= 0) tr.line.visible = false; }
    }
    // 玩家速度(给瞄准甩枪用)；瞬移(重生)不算
    if (this.prevPlayer && dt > 1e-4) {
      const vx = (playerPos.x - this.prevPlayer.x) / dt, vz = (playerPos.z - this.prevPlayer.z) / dt;
      const sp = Math.hypot(vx, vz);
      this.playerVel = sp > 20 ? { x: 0, z: 0 } : { x: vx, z: vz };
    }
    this.prevPlayer = { x: playerPos.x, z: playerPos.z };

    // 对讲机：汇总谁看到了谁、分派正面/绕后/驻守
    const mates: SquadMate[] = this.bots.map((b) => ({
      alive: !b.dead, x: b.group.position.x, z: b.group.position.z,
      known: b.brain.senses.lastKnown, visible: b.brain.senses.visible,
    }));
    this.squad.update(dt, mates);

    // 轮流思考：每帧只有一只蛋"动脑子"(6只×60fps≈每只10Hz)
    this.frame++;
    const turn = this.frame % this.bots.length;

    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      b.thinkAcc += dt;
      if (b.dead) { // 死了：等重生
        b.respawn -= dt;
        if (b.respawn <= 0) {
          const sp = this.spawnPoint();
          b.group.position.set(sp.x, 0, sp.z);
          b.lx = sp.x; b.lz = sp.z;
          b.hp = MAX_HP; b.dead = false; b.group.visible = true;
          b.brain.reset(); b.aim.reset(sp.x, sp.z); b.thinkAcc = 0;
          this.clearDecals(b);
        }
        continue;
      }
      const p = b.group.position;

      if (i === turn) { // 这帧轮到它想事情
        this.thinkingI = i;
        const role = this.squad.roles[i] ?? 'hold';
        const squadView = {
          role, shared: this.squad.shared, caution: this.squad.caution,
          flankCands: role === 'flank' ? this.squad.flankCandidates(mates, i) : [],
        };
        b.brain.think(
          this.world,
          { x: p.x, z: p.z, faceX: Math.sin(b.group.rotation.y), faceZ: Math.cos(b.group.rotation.y), hp: b.hp },
          { x: playerPos.x, z: playerPos.z, alive: playerAlive },
          squadView, b.thinkAcc, this.combat,
        );
        b.thinkAcc = 0;
      }

      // —— 执行意图：走位(strafe)优先，否则沿路走 ——
      const d = b.brain.drive;
      const spd = SPEED * d.speedMul;
      let mvx = 0, mvz = 0;
      if (d.strafe) {
        const nx = p.x + d.strafe.x * spd * dt, nz = p.z + d.strafe.z * spd * dt;
        if (!blocked(nx, nz, this.solids, 0.5)) { p.x = nx; p.z = nz; mvx = d.strafe.x; mvz = d.strafe.z; }
        else b.brain.bumped = true; // 撞墙了,大脑下次换个方向
      } else if (d.pathI < d.path.length) {
        const wp = d.path[d.pathI];
        let dx = wp.x - p.x, dz = wp.z - p.z;
        const dd = Math.hypot(dx, dz);
        if (dd < 0.55) d.pathI++;
        else { dx /= dd; dz /= dd; p.x += dx * spd * dt; p.z += dz * spd * dt; mvx = dx; mvz = dz; }
      }
      pushOut(p, this.solids, 0.5);

      // 平滑转身：优先面朝大脑指定方向，否则面朝移动方向
      const fx = d.face ? d.face.x : mvx, fz = d.face ? d.face.z : mvz;
      if (fx !== 0 || fz !== 0) {
        const targetYaw = Math.atan2(fx, fz);
        let dy = targetYaw - b.group.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        b.group.rotation.y += dy * Math.min(1, dt * TURN_SMOOTH);
      }
      b.bob += dt * 8; p.y = Math.abs(Math.sin(b.bob)) * 0.12;

      // —— 开火：真瞄准(看得见+允许开火才有子弹) ——
      const shot = b.aim.update(
        dt, d.weaponsFree && this.combat, b.brain.senses.visible,
        { x: p.x, z: p.z }, { x: playerPos.x, z: playerPos.z }, this.playerVel,
      );
      if (shot) {
        const ty = shot.hit ? playerPos.y - 0.15 : 0.7 + Math.random(); // 弹着高度只影响拖尾视觉
        this.spawnTracer(p.x, EGG_EYE + p.y, p.z, shot.x, ty, shot.z);
        if (shot.hit && playerAlive && this.onHit) this.onHit(AIM.DMG, p.x, p.z);
      }

      // 受击闪白衰减（原样）
      if (b.flash > 0) { b.flash = Math.max(0, b.flash - dt); b.bodyMat.emissiveIntensity = (b.flash / FLASH_TIME) * 0.9; }
      // 弹痕淡出（原样）
      for (let i2 = b.decals.length - 1; i2 >= 0; i2--) {
        const dc = b.decals[i2]; dc.life -= dt;
        if (dc.life <= 0) { b.group.remove(dc.mesh); (dc.mesh.material as THREE.Material).dispose(); b.decals.splice(i2, 1); }
        else (dc.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, dc.life / DECAL_FADE);
      }

      // 卡住检测：在走路却没挪动 → 让大脑重新想路
      const moved = Math.hypot(p.x - b.lx, p.z - b.lz);
      if (moved < 0.012 && !d.strafe && d.pathI < d.path.length) {
        b.stuck += dt;
        if (b.stuck > 0.6) { b.brain.forceRepath(); b.stuck = 0; }
      } else b.stuck = 0;
      b.lx = p.x; b.lz = p.z;
    }

    // 互相分开，别叠在一起（原样保留）
    for (let i = 0; i < this.bots.length; i++) {
      if (this.bots[i].dead) continue;
      for (let j = i + 1; j < this.bots.length; j++) {
        if (this.bots[j].dead) continue;
        const a = this.bots[i].group.position, c = this.bots[j].group.position;
        const dx = a.x - c.x, dz = a.z - c.z, d2 = Math.hypot(dx, dz);
        if (d2 > 0.001 && d2 < 1.4) { const pu = (1.4 - d2) / 2, nx = dx / d2, nz = dz / d2; a.x += nx * pu; a.z += nz * pu; c.x -= nx * pu; c.z -= nz * pu; }
      }
    }
  }
}
