import * as THREE from 'three';
import Stats from 'stats.js';
import { createRenderer, createScene, onResize } from './game/engine/scene';
import { buildDesertMap, DECOR_MODELS } from './game/world/desertMap';
import { loadObjects } from './game/world/mapData';
import { preloadModels } from './game/world/modelLoader';
import { Minimap } from './game/ui/minimap';
import { Input } from './game/engine/input';
import { PlayerController } from './game/player/playerController';
import { AttractBattle } from './game/menu/attractBattle';
import { EggBots } from './game/enemies/eggBots';
import { Knife } from './game/weapons/viewKnife';
import { Pistol } from './game/weapons/viewPistol';
import { GunFx } from './game/weapons/gunFx';
import { WeaponHud } from './game/ui/weaponHud';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = createRenderer(canvas);
const scene = createScene();
// 进图前先把沙漠装饰模型加载好（仙人掌/石头/棕榈…），不然撒不出来
try { await preloadModels(DECOR_MODELS); } catch (e) { console.warn('装饰模型加载失败：', e); }
const map = buildDesertMap(scene);
const mapObjs = loadObjects(); // 地图对象（小地图/算范围共用）

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const input = new Input(canvas);

// 玩家碰撞 = 静态墙体 + 出生光幕（光幕落下后从这个数组里移除）
const playerWalls = map.walls.concat(map.barriers.map((b) => b.box));
const player = new PlayerController(camera, playerWalls, map.attackerSpawn);
if (import.meta.env.DEV) {
  (window as unknown as { __map: typeof map; __player: PlayerController }).__map = map;
  (window as unknown as { __map: typeof map; __player: PlayerController }).__player = player;
}

// 第一人称军刀（挂相机上，视野右下；只游戏中显示）
const knife = new Knife();
knife.group.visible = false;
camera.add(knife.group);
scene.add(camera); // 让相机的子物体(刀/枪)能被渲染
if (import.meta.env.DEV) (window as unknown as { __knife: Knife }).__knife = knife;

// 第一人称手枪（同样挂相机上、视野右下；和刀切换显示）
const pistol = new Pistol();
pistol.group.visible = false;
camera.add(pistol.group);

// 开枪特效：子弹拖尾 + 墙上黑色弹孔
const gunFx = new GunFx(scene);
if (import.meta.env.DEV) (window as unknown as { __gunFx: GunFx }).__gunFx = gunFx;

// 实心墙体（给菜单蛋蛋/局内蛋蛋避障寻路用；排除地面和最外隐形边界）
const solidWalls = map.walls.filter((w) => w.max.y > 0.6 && w.max.y < 36);

// 主菜单背景的蛋蛋小战斗
const battle = new AttractBattle(solidWalls);
scene.add(battle.group);
if (import.meta.env.DEV) (window as unknown as { __battle: AttractBattle }).__battle = battle;

// 局内蛋蛋（在地图里游走）
let bMinX = -20, bMaxX = 20, bMinZ = -20, bMaxZ = 20;
for (const o of mapObjs) { bMinX = Math.min(bMinX, o.x); bMaxX = Math.max(bMaxX, o.x); bMinZ = Math.min(bMinZ, o.z); bMaxZ = Math.max(bMaxZ, o.z); }
const eggBots = new EggBots(map.walls, { minX: bMinX + 3, maxX: bMaxX - 3, minZ: bMinZ + 3, maxZ: bMaxZ - 3 }, 6);
// 挥刀砍中那一刻：尝试砍正前方近处的蛋蛋（两刀砍死）
knife.onStrike = () => { eggBots.tryMelee(camera); };
if (import.meta.env.DEV) {
  (window as unknown as { __eggBots: EggBots; __camera: THREE.Camera }).__eggBots = eggBots;
  (window as unknown as { __eggBots: EggBots; __camera: THREE.Camera }).__camera = camera;
}

// 右上角小地图
const minimapEl = document.getElementById('minimap') as HTMLCanvasElement | null;
const minimap = minimapEl ? new Minimap(minimapEl, mapObjs) : null;
if (import.meta.env.DEV) (window as unknown as { __minimap: Minimap | null }).__minimap = minimap;

const stats = new Stats();
stats.showPanel(0);
stats.dom.style.display = 'none';
document.body.appendChild(stats.dom);

const freezeEl = document.getElementById('freeze');
const FREEZE_TIME = 15; // 开局准备阶段秒数（光幕挡着，倒计时结束落下）
let barriersUp = false;
let freezeT = 0;

function raiseBarriers(): void {
  barriersUp = true;
  freezeT = 0;
  for (const b of map.barriers) {
    b.mesh.visible = true;
    if (!playerWalls.includes(b.box)) playerWalls.push(b.box);
  }
  eggBots.setBarrierBoxes(map.barriers.map((b) => b.box)); // 光幕立着时蛋蛋也绕开它
}
function dropBarriers(): void {
  barriersUp = false;
  if (freezeEl) freezeEl.style.display = 'none';
  for (const b of map.barriers) {
    b.mesh.visible = false;
    const i = playerWalls.indexOf(b.box);
    if (i >= 0) playerWalls.splice(i, 1);
  }
  eggBots.setBarrierBoxes([]); // 光幕落下，蛋蛋不再受它阻挡
}

let state: 'menu' | 'play' | 'paused' = 'menu';
let menuTime = 0;
let freeCam = false; // DEV：自由相机巡检地图（上线不启用）

// —— 武器系统：1=军刀, 2=手枪；左键用当前武器 ——
let weapon: 'knife' | 'gun' = 'knife';
// —— 手枪"标配"数值，参考《无畏契约》Classic ——
const MAG = 12;          // 弹匣
const RESERVE0 = 36;     // 备弹(3个弹匣)
const FIRE_CD = 0.148;   // 射速(6.75发/秒)
const GUN_BODY = 26;     // 身体伤害(近距离)
const GUN_HEAD = 78;     // 爆头伤害(近距离)
const SWAP_TIME = 0.3;   // 切武器前摇时长(秒)：抽枪/抽刀，期间不能攻击
const RELOAD_TIME = 1.5; // 手枪换弹时长(秒)
const BLOOM_PER_SHOT = 0.012; // 每开一枪增加的散布（越打越歪，再调小）
const BLOOM_MAX = 0.05;       // 连发最多歪到这（再调小，不那么飘）
const BLOOM_RECOVER = 2.0;    // 开始恢复后每秒减少多少（停火后约0.3秒内恢复满）
const RECOVER_DELAY = 0.25;   // 停火多久才算"停了"开始恢复（比射速间隔长，连发时不恢复）
const RECOIL_PER_SHOT = 0.007; // 每枪视角上抬(垂直后坐：子弹越打越往上，幅度调小)
const RECOIL_MAX = 0.05;       // 最多上抬到这(约3°，不那么夸张)
const RECOIL_RECOVER = 1.2;    // 停火/蹲下后视角回落速度
let mag = MAG, reserve = RESERVE0, fireCd = 0, reloading = 0, swapT = 0;
let bloom = 0, sinceShot = 99, recoil = 0; // 连发散布 + 距上次开枪时间 + 垂直后坐上抬量
const wslotKnife = document.getElementById('wslot-knife');
const wslotGun = document.getElementById('wslot-gun');
const ammoEl = document.getElementById('hud-ammo');
const reserveEl = document.getElementById('hud-reserve');
const gunNameEl = document.getElementById('hud-gun');
const kThumb = document.getElementById('wthumb-knife') as HTMLCanvasElement | null;
const gThumb = document.getElementById('wthumb-gun') as HTMLCanvasElement | null;
let weaponHud: WeaponHud | null = null;
try { if (kThumb && gThumb) weaponHud = new WeaponHud(kThumb, gThumb); }
catch (e) { console.warn('武器栏缩略图初始化失败（不影响游戏）：', e); }

function refreshWeaponHud(): void {
  wslotKnife?.classList.toggle('active', weapon === 'knife');
  wslotGun?.classList.toggle('active', weapon === 'gun');
  if (weapon === 'gun') {
    if (gunNameEl) gunNameEl.textContent = '标配';
    if (ammoEl) ammoEl.textContent = reloading > 0 ? '…' : String(mag);
    if (reserveEl) reserveEl.textContent = '/' + reserve;
  } else {
    if (gunNameEl) gunNameEl.textContent = '军刀';
    if (ammoEl) ammoEl.textContent = '—';
    if (reserveEl) reserveEl.textContent = '';
  }
}

function setWeapon(w: 'knife' | 'gun'): void {
  weapon = w;
  knife.group.visible = (w === 'knife');
  pistol.group.visible = (w === 'gun');
  if (w === 'knife') knife.equip(); else pistol.equip(); // 抽刀/抽枪前摇
  swapT = SWAP_TIME;                                      // 前摇期间不能攻击
  refreshWeaponHud();
}

function reloadGun(): void {
  if (weapon !== 'gun' || reloading > 0 || mag >= MAG || reserve <= 0) return;
  reloading = RELOAD_TIME;
  pistol.reload(RELOAD_TIME); // 播放换弹动作
  refreshWeaponHud();
}

// 开枪射线 + 偏移 + 特效
const shotRay = new THREE.Raycaster(); shotRay.far = 100;
const _dir = new THREE.Vector3(), _orig = new THREE.Vector3(), _muz = new THREE.Vector3(), _end = new THREE.Vector3(), _n = new THREE.Vector3();
const _rt = new THREE.Vector3(), _up = new THREE.Vector3();
// 给方向加一点随机偏移（站定小、移动大）：在垂直于方向的平面里随机偏
function applySpread(dir: THREE.Vector3, amount: number): void {
  const a = Math.random() * Math.PI * 2, rad = Math.random() * amount;
  _up.set(Math.abs(dir.y) < 0.9 ? 0 : 1, Math.abs(dir.y) < 0.9 ? 1 : 0, 0);
  _rt.crossVectors(dir, _up).normalize();
  _up.crossVectors(_rt, dir).normalize();
  dir.addScaledVector(_rt, Math.cos(a) * rad).addScaledVector(_up, Math.sin(a) * rad).normalize();
}
function fireGunShot(): void {
  camera.getWorldPosition(_orig);
  camera.getWorldDirection(_dir);
  // 散布：站定准；移动散；跳跃/在空中最散；再加上连发累积(越打越歪)；蹲下更准
  let spread = 0.009;
  if (input.forward() !== 0 || input.right() !== 0) spread += 0.03; // 移动
  if (player.airborne) spread += 0.08;                             // 跳跃/在空中
  spread += bloom;                                                  // 连发越打越歪
  if (input.crouch) spread *= 0.45;                                 // 蹲下更准
  applySpread(_dir, spread);
  bloom = Math.min(BLOOM_MAX, bloom + BLOOM_PER_SHOT);   // 这一枪让之后更歪
  recoil = Math.min(RECOIL_MAX, recoil + RECOIL_PER_SHOT); // 视角上抬：越打越往上
  sinceShot = 0;
  shotRay.set(_orig, _dir);
  const hit = shotRay.intersectObjects(scene.children.filter((c) => c !== camera), true).find((h) => h.face);
  pistol.muzzleWorld(_muz);
  if (hit) {
    const dmg = eggBots.shootObject(hit.object, hit.point.y, GUN_BODY, GUN_HEAD, _orig.x, _orig.z);
    if (!dmg && hit.face) { _n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize(); gunFx.hole(hit.point, _n); } // 没打到蛋蛋才留弹孔
    gunFx.tracer(_muz, hit.point);
  } else {
    gunFx.tracer(_muz, _end.copy(_orig).addScaledVector(_dir, 60));
  }
}

// 真正打一发：扣弹 + 火光后坐 + 射线特效 + 命中扣血
function gunShoot(): void {
  mag -= 1;
  pistol.fire();
  fireGunShot();             // 偏移 + 射线 + 拖尾 + 弹孔 + 命中蛋蛋扣血(含爆头)
  refreshWeaponHud();
}

// 左键：用当前武器（刀=挥砍，枪=半自动开火）
function useWeapon(): void {
  if (swapT > 0) return; // 切武器前摇期间不能攻击/开火
  if (weapon === 'knife') { knife.swing(); return; }
  if (fireCd > 0 || reloading > 0) return;
  if (mag <= 0) { reloadGun(); return; }
  fireCd = FIRE_CD;
  gunShoot();
}

// 右键：标配特殊技能——一次性同时射出3发(各自有散布，形成小扇形)
function altFire(): void {
  if (weapon !== 'gun' || swapT > 0 || reloading > 0 || fireCd > 0) return;
  if (mag <= 0) { reloadGun(); return; }
  const n = Math.min(3, mag);
  for (let i = 0; i < n; i++) gunShoot();
  fireCd = 0.32; // 三连发后冷却
}
refreshWeaponHud();
if (import.meta.env.DEV) {
  (window as unknown as { __wp: unknown }).__wp = { use: () => useWeapon(), alt: () => altFire(), set: (w: 'knife' | 'gun') => setWeapon(w), state: () => ({ weapon, mag, reserve, reloading: +reloading.toFixed(2), bloom: +bloom.toFixed(3), recoil: +recoil.toFixed(3) }) };
  (window as unknown as { __pistol: Pistol }).__pistol = pistol;
}

function startGame(): void {
  if (state === 'play') return;
  state = 'play';
  document.body.classList.add('playing');
  scene.remove(battle.group);
  scene.add(eggBots.group);
  mag = MAG; reserve = RESERVE0; reloading = 0; fireCd = 0; bloom = 0; sinceShot = 99; recoil = 0; // 每局重置弹药/散布/后坐
  setWeapon('knife'); // 开局拿刀
  stats.dom.style.display = 'block';
  input.active = true;
  raiseBarriers();
  try {
    const r = canvas.requestPointerLock();
    (r as unknown as Promise<void> | undefined)?.catch?.(() => {});
  } catch {
    /* 忽略，按键也会锁定 */
  }
}

function pause(): void {
  if (state !== 'play') return;
  state = 'paused';
  input.active = false;
  document.body.classList.add('paused');
  if (freezeEl) freezeEl.style.display = 'none';
  document.getElementById('pause')?.classList.remove('hidden');
}

function resume(): void {
  if (state !== 'paused') return;
  state = 'play';
  input.active = true;
  document.body.classList.remove('paused');
  document.getElementById('pause')?.classList.add('hidden');
  document.getElementById('panel-settings')?.classList.add('hidden');
  try {
    const r = canvas.requestPointerLock();
    (r as unknown as Promise<void> | undefined)?.catch?.(() => {});
  } catch {
    /* 忽略 */
  }
}

function backToMenu(): void {
  state = 'menu';
  input.active = false;
  document.body.classList.remove('playing', 'paused');
  document.getElementById('pause')?.classList.add('hidden');
  document.getElementById('panel-settings')?.classList.add('hidden');
  if (freezeEl) freezeEl.style.display = 'none';
  scene.add(battle.group);
  scene.remove(eggBots.group);
  knife.group.visible = false;
  pistol.group.visible = false;
  stats.dom.style.display = 'none';
}

// 游戏中按 Esc 暂停；按 1/2 切换 武器(刀/枪)；按 R 换弹
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && state === 'play') { pause(); return; }
  if (state !== 'play') return;
  if (e.code === 'Digit1') setWeapon('knife');
  else if (e.code === 'Digit2') setWeapon('gun');
  else if (e.code === 'KeyR') reloadGun();
});
document.addEventListener('pointerlockchange', () => {
  if (state === 'play' && document.pointerLockElement !== canvas) pause();
});
// 游戏中：左键用当前武器(刀挥砍/枪开火)，右键=手枪三连发（鼠标已锁定时）
canvas.addEventListener('mousedown', (e) => {
  if (state !== 'play' || !input.locked) return;
  if (e.button === 0) useWeapon();
  else if (e.button === 2) altFire();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // 右键不弹出浏览器菜单

// 暂停菜单按钮
document.getElementById('btn-resume')?.addEventListener('click', resume);
document.getElementById('btn-tomenu')?.addEventListener('click', backToMenu);
document.getElementById('btn-pause-settings')?.addEventListener('click', () =>
  document.getElementById('panel-settings')?.classList.remove('hidden'));

// 主菜单按钮
document.getElementById('btn-start')?.addEventListener('click', startGame);
const help = document.getElementById('panel-help');
const settings = document.getElementById('panel-settings');
document.getElementById('btn-help')?.addEventListener('click', () => help?.classList.remove('hidden'));
document.getElementById('btn-settings')?.addEventListener('click', () => settings?.classList.remove('hidden'));
document.querySelectorAll('.panel-close').forEach((b) => {
  b.addEventListener('click', () => {
    help?.classList.add('hidden');
    settings?.classList.add('hidden');
  });
});

// 鼠标灵敏度设置
const sens = document.getElementById('sens') as HTMLInputElement | null;
const sensVal = document.getElementById('sens-val');
sens?.addEventListener('input', () => {
  const v = parseFloat(sens.value);
  player.sensitivity = v;
  if (sensVal) sensVal.textContent = v.toFixed(1) + '×';
});

window.addEventListener('resize', () => onResize(renderer, camera));

// 从地图编辑器网页点"试玩"会带着这个标记跳回来，自动进入游戏玩刚做的地图
try {
  if (sessionStorage.getItem('cmgo_autoplay')) { sessionStorage.removeItem('cmgo_autoplay'); startGame(); }
} catch { /* ignore */ }

// DEV 巡检钩子：菜单状态下 __dbg.free(true) 再 __dbg.look(px,py,pz, tx,ty,tz) 摆相机看地图
if (import.meta.env.DEV) {
  (window as unknown as { __dbg: unknown }).__dbg = {
    free: (on: boolean) => { freeCam = on; },
    look: (px: number, py: number, pz: number, tx: number, ty: number, tz: number) => {
      camera.position.set(px, py, pz); camera.lookAt(tx, ty, tz);
    },
    pos: () => ({ x: +camera.position.x.toFixed(2), y: +camera.position.y.toFixed(2), z: +camera.position.z.toFixed(2) }),
  };
}

let last = performance.now();
function animate(now: number): void {
  stats.begin();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (state === 'menu') {
    menuTime += dt;
    battle.update(dt);
    if (!freeCam) {
      const a = menuTime * 0.12; // 上空缓慢旋转
      camera.position.set(Math.sin(a) * 22, 30, Math.cos(a) * 22);
      camera.lookAt(0, 0, 0);
    }
  } else if (state === 'play') {
    // 开局准备阶段：光幕挡着，倒计时结束才落下
    if (barriersUp) {
      freezeT += dt;
      const glow = 1.1 + Math.sin(freezeT * 5) * 0.5; // 脉动发光（不动透明度，保持几乎不透明）
      for (const b of map.barriers) {
        (b.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = glow;
        b.tick?.(dt); // 光幕里能量粒子流动
      }
      if (freezeEl) {
        freezeEl.style.display = 'block';
        freezeEl.textContent = '准备阶段 ' + Math.ceil(FREEZE_TIME - freezeT);
      }
      if (freezeT >= FREEZE_TIME) dropBarriers();
    }
    player.update(input, dt);
    knife.update(dt);    // 挥刀动作
    pistol.update(dt);   // 手枪后坐/火光/换弹动作
    gunFx.update(dt);    // 子弹拖尾 + 弹孔淡出
    eggBots.update(dt);  // 局内蛋蛋游走
    weaponHud?.update(dt); // 右下角武器栏缩略图
    // 切武器前摇 + 手枪射速冷却 + 换弹计时 + 连发散布恢复
    if (swapT > 0) swapT = Math.max(0, swapT - dt);
    if (fireCd > 0) fireCd = Math.max(0, fireCd - dt);
    sinceShot += dt;
    // 停火(超过 RECOVER_DELAY，连发时不恢复)、或按住蹲下 → 恢复准度+视角回落（蹲下更快，可边打边蹲压枪）
    const recovering = sinceShot > RECOVER_DELAY || input.crouch;
    if (bloom > 0 && recovering) bloom = Math.max(0, bloom - (input.crouch ? BLOOM_RECOVER * 1.8 : BLOOM_RECOVER) * dt);
    if (recoil > 0 && recovering) recoil = Math.max(0, recoil - (input.crouch ? RECOIL_RECOVER * 1.8 : RECOIL_RECOVER) * dt);
    player.setRecoil(recoil); // 把当前上抬量交给相机(开枪后坐视角上抬，停火回落)
    if (reloading > 0) {
      reloading -= dt;
      if (reloading <= 0) {
        if (barriersUp) mag = MAG;                                       // 准备阶段：换弹不耗子弹(免费补满)
        else { const take = Math.min(MAG - mag, reserve); mag += take; reserve -= take; }
      }
      refreshWeaponHud();
    }
    minimap?.draw(camera.position.x, camera.position.z, camera.rotation.y, barriersUp);
  }
  // 'paused'：只渲染，不更新

  renderer.render(scene, camera);
  stats.end();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
