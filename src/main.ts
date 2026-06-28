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
import { ViewGun } from './game/weapons/viewGun';
import { GUNS, GUN_BY_ID, GunDef, dmgAt } from './game/weapons/gunDefs';
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

// 第一人称的枪（可在商店换不同枪，挂相机上、视野右下；和刀切换显示）
const gun = new ViewGun();
gun.setGun(GUN_BY_ID.classic);
gun.group.visible = false;
camera.add(gun.group);

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
  eggBots.setCombat(false); // 准备阶段蛋蛋不开枪
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
  eggBots.setCombat(true);  // 开打！蛋蛋开始反击
}

let state: 'menu' | 'play' | 'paused' = 'menu';
let menuTime = 0;
let freeCam = false; // DEV：自由相机巡检地图（上线不启用）

// —— 武器系统：1=军刀, 2=枪(商店可换)；左键攻击, 右键(标配)三连发, B 开商店 ——
let weapon: 'knife' | 'gun' = 'knife';
let curGun: GunDef = GUN_BY_ID.classic;       // 当前手里的枪
const owned = new Set<string>(['classic']);   // 已购买的枪
let money = 9000;                             // 钱(买枪用)
const SWAP_TIME = 0.3;   // 切武器前摇时长(秒)
const RELOAD_TIME = 1.5; // 换弹时长(秒)
const BLOOM_PER_SHOT = 0.012, BLOOM_MAX = 0.05, BLOOM_RECOVER = 2.0, RECOVER_DELAY = 0.25; // 散布累积/恢复
const RECOIL_PER_SHOT = 0.007, RECOIL_MAX = 0.05, RECOIL_RECOVER = 1.2;                    // 垂直后坐
let mag = curGun.mag, reserve = curGun.reserve, fireCd = 0, reloading = 0, swapT = 0;
let bloom = 0, sinceShot = 99, recoil = 0, firing = false; // 散布 + 距上次开枪 + 上抬量 + 是否按住开火

const wslotKnife = document.getElementById('wslot-knife');
const wslotGun = document.getElementById('wslot-gun');
const ammoEl = document.getElementById('hud-ammo');
const reserveEl = document.getElementById('hud-reserve');
const gunNameEl = document.getElementById('hud-gun');
const moneyEl = document.getElementById('hud-money');
const kThumb = document.getElementById('wthumb-knife') as HTMLCanvasElement | null;
const gThumb = document.getElementById('wthumb-gun') as HTMLCanvasElement | null;
let weaponHud: WeaponHud | null = null;
try { if (kThumb && gThumb) weaponHud = new WeaponHud(kThumb, gThumb); }
catch (e) { console.warn('武器栏缩略图初始化失败（不影响游戏）：', e); }

// —— 玩家血量 / 受伤红屏 / 阵亡重生 ——
const PLAYER_MAX_HP = 100, PLAYER_RESPAWN = 4;
let playerHp = PLAYER_MAX_HP, playerDead = false, deadT = 0, hurtFx = 0, invulnT = 0;
const hpEl = document.getElementById('hud-hp');
const hpFillEl = document.getElementById('hud-hp-fill');
const hurtEl = document.getElementById('hurt');
const deadEl = document.getElementById('dead');
const deadNEl = document.getElementById('dead-n');
function refreshHpHud(): void {
  if (hpEl) hpEl.textContent = String(Math.max(0, Math.ceil(playerHp)));
  if (hpFillEl) hpFillEl.style.width = (Math.max(0, playerHp) / PLAYER_MAX_HP) * 100 + '%';
}
// 蛋蛋打中玩家：扣血 + 红屏闪；血空→阵亡，倒计时后在出生点重生
function damagePlayer(dmg: number): void {
  if (playerDead || barriersUp || invulnT > 0 || state !== 'play') return; // 准备阶段/重生保护无敌
  playerHp -= dmg;
  hurtFx = Math.min(0.9, hurtFx + dmg / 35);
  refreshHpHud();
  if (playerHp <= 0) {
    playerHp = 0; playerDead = true; deadT = PLAYER_RESPAWN; firing = false; input.active = false;
    try { document.exitPointerLock(); } catch { /* ignore */ }
    deadEl?.classList.remove('hidden');
  }
}
function respawnPlayer(): void {
  playerDead = false; playerHp = PLAYER_MAX_HP; hurtFx = 0; invulnT = 2; // 重生后 2 秒无敌
  player.teleport(map.attackerSpawn);
  refreshHpHud();
  deadEl?.classList.add('hidden');
  if (state === 'play') { input.active = true; try { const r = canvas.requestPointerLock(); (r as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* ignore */ } }
}
eggBots.setOnHit((dmg) => damagePlayer(dmg));

function refreshWeaponHud(): void {
  wslotKnife?.classList.toggle('active', weapon === 'knife');
  wslotGun?.classList.toggle('active', weapon === 'gun');
  if (weapon === 'gun') {
    if (gunNameEl) gunNameEl.textContent = curGun.name;
    if (ammoEl) ammoEl.textContent = reloading > 0 ? '…' : String(mag);
    if (reserveEl) reserveEl.textContent = '/' + reserve;
  } else {
    if (gunNameEl) gunNameEl.textContent = '军刀';
    if (ammoEl) ammoEl.textContent = '—';
    if (reserveEl) reserveEl.textContent = '';
  }
  if (moneyEl) moneyEl.textContent = String(money);
}

function setWeapon(w: 'knife' | 'gun'): void {
  weapon = w; firing = false;
  knife.group.visible = (w === 'knife');
  gun.group.visible = (w === 'gun');
  if (w === 'knife') knife.equip(); else gun.equip(); // 抽刀/抽枪前摇
  swapT = SWAP_TIME;
  refreshWeaponHud();
}

// 装上某把枪：换模型、满弹、切到枪并播放抽枪
function equipGun(def: GunDef): void {
  curGun = def;
  gun.setGun(def);
  mag = def.mag; reserve = def.reserve; reloading = 0;
  weaponHud?.setGunModel(def.model);
  setWeapon('gun');
}

function reloadGun(): void {
  if (weapon !== 'gun' || reloading > 0 || mag >= curGun.mag || reserve <= 0) return;
  reloading = RELOAD_TIME;
  gun.reload(RELOAD_TIME);
  refreshWeaponHud();
}

// 开枪射线 + 偏移 + 特效
const shotRay = new THREE.Raycaster(); shotRay.far = 100;
const _dir = new THREE.Vector3(), _orig = new THREE.Vector3(), _muz = new THREE.Vector3(), _end = new THREE.Vector3(), _n = new THREE.Vector3();
const _rt = new THREE.Vector3(), _up = new THREE.Vector3(), _baseDir = new THREE.Vector3();
function applySpread(dir: THREE.Vector3, amount: number): void {
  const a = Math.random() * Math.PI * 2, rad = Math.random() * amount;
  _up.set(Math.abs(dir.y) < 0.9 ? 0 : 1, Math.abs(dir.y) < 0.9 ? 1 : 0, 0);
  _rt.crossVectors(dir, _up).normalize();
  _up.crossVectors(_rt, dir).normalize();
  dir.addScaledVector(_rt, Math.cos(a) * rad).addScaledVector(_up, Math.sin(a) * rad).normalize();
}
// 这一枪的散布量：每把枪各自的腰射准度 + 移动/跳跃更散 + 连发累积 + 蹲下更准(但不锁死)
// 无畏契约手感：站定不动第一枪指哪打哪(散布≈0)；连发才累积散布；走动/跳跃才散。蹲下不加准。
function currentSpread(): number {
  let spread = bloom;                                                  // 连发累积(站定首发=0)
  if (input.forward() !== 0 || input.right() !== 0) spread += 0.035;   // 走动就散
  if (player.airborne) spread += 0.08;                                 // 跳跃最散
  return spread;
}
function fireGunShot(): void {
  camera.getWorldPosition(_orig);
  camera.getWorldDirection(_baseDir);
  const spread = currentSpread();
  const pellets = curGun.pellets ?? 1;      // 散弹枪一枪多颗弹丸
  const cone = curGun.pelletSpread ?? 0;    // 弹丸额外散开的锥角
  const targets = scene.children.filter((c) => c !== camera);
  gun.muzzleWorld(_muz);
  for (let i = 0; i < pellets; i++) {
    _dir.copy(_baseDir);
    applySpread(_dir, spread + cone);
    shotRay.set(_orig, _dir);
    const hit = shotRay.intersectObjects(targets, true).find((h) => h.face);
    if (hit) {
      const dist = _orig.distanceTo(hit.point);                       // 距离衰减：越远伤害越低
      const body = dmgAt(curGun, dist, false), head = dmgAt(curGun, dist, true);
      const dmg = eggBots.shootObject(hit.object, hit.point, body, head, _orig.x, _orig.z);
      if (!dmg && hit.face) { _n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize(); gunFx.hole(hit.point, _n); }
      gunFx.tracer(_muz, hit.point);
    } else {
      gunFx.tracer(_muz, _end.copy(_orig).addScaledVector(_dir, 60));
    }
  }
  bloom = Math.min(BLOOM_MAX, bloom + BLOOM_PER_SHOT);
  recoil = Math.min(RECOIL_MAX, recoil + RECOIL_PER_SHOT);
  sinceShot = 0;
}

function gunShoot(): void { mag -= 1; gun.fire(); fireGunShot(); refreshWeaponHud(); }

// 开一枪(检查冷却/弹药)：半自动按一下打一发，全自动按住连发(主循环里调)
function tryFireGun(): void {
  if (swapT > 0 || fireCd > 0 || reloading > 0) return;
  if (mag <= 0) { reloadGun(); return; }
  fireCd = curGun.fireCd;
  gunShoot();
}

// 左键按下：刀挥砍 / 枪开火(按住=全自动)
function onPrimaryDown(): void {
  if (swapT > 0) return;
  if (weapon === 'knife') { knife.swing(); return; }
  firing = true; tryFireGun();
}
function onPrimaryUp(): void { firing = false; }

// 右键：标配专属——一次性同时射出3发
function altFire(): void {
  if (weapon !== 'gun' || !curGun.altBurst || swapT > 0 || reloading > 0 || fireCd > 0) return;
  if (mag <= 0) { reloadGun(); return; }
  const n = Math.min(3, mag);
  for (let i = 0; i < n; i++) gunShoot();
  fireCd = 0.32;
}

// —— 商店：准备阶段按 B 打开，用钱买枪 ——
let shopOpen = false;
const shopEl = document.getElementById('shop');
const shopListEl = document.getElementById('shop-list');
const shopMoneyEl = document.getElementById('shop-money');
const shopCards = new Map<string, HTMLButtonElement>();
function buildShop(): void {
  if (!shopListEl) return;
  for (const def of GUNS) {
    const card = document.createElement('button');
    card.className = 'shop-card';
    card.innerHTML = `<span class="sc-name">${def.name}</span>` +
      `<span class="sc-stat">伤害 ${def.bodyDmg}/爆头 ${def.headDmg}　弹匣 ${def.mag}${def.auto ? '　连发' : ''}</span>` +
      `<span class="sc-price">${def.price === 0 ? '免费' : '$' + def.price}</span>`;
    card.addEventListener('click', () => buyGun(def));
    shopListEl.appendChild(card);
    shopCards.set(def.id, card);
  }
}
function refreshShop(): void {
  if (shopMoneyEl) shopMoneyEl.textContent = '$' + money;
  for (const def of GUNS) {
    const card = shopCards.get(def.id);
    if (!card) continue;
    const have = owned.has(def.id);
    const afford = have || money >= def.price;
    card.classList.toggle('owned', def.id === curGun.id);
    card.classList.toggle('cant', !afford);
  }
}
function openShop(): void {
  if (state !== 'play' || shopOpen || !barriersUp) return; // 只在准备阶段(光幕未落)能买
  shopOpen = true;
  document.body.classList.add('shopping');
  shopEl?.classList.remove('hidden');
  input.active = false; firing = false;
  try { document.exitPointerLock(); } catch { /* ignore */ }
  refreshShop();
}
function closeShop(): void {
  if (!shopOpen) return;
  shopOpen = false;
  document.body.classList.remove('shopping');
  shopEl?.classList.add('hidden');
  input.active = true;
  try { const r = canvas.requestPointerLock(); (r as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* ignore */ }
}
function buyGun(def: GunDef): void {
  if (!owned.has(def.id)) {
    if (money < def.price) return;   // 买不起
    money -= def.price; owned.add(def.id);
  }
  equipGun(def);                      // 买了/已有 → 直接拿出来
  refreshShop();
  closeShop();
}

refreshWeaponHud();
buildShop();
if (import.meta.env.DEV) {
  (window as unknown as { __wp: unknown }).__wp = {
    primary: () => onPrimaryDown(), up: () => onPrimaryUp(), alt: () => altFire(),
    set: (w: 'knife' | 'gun') => setWeapon(w), buy: (id: string) => buyGun(GUN_BY_ID[id]),
    shop: (open: boolean) => (open ? openShop() : closeShop()),
    hurt: (d: number) => damagePlayer(d),
    dropBarriers: () => dropBarriers(),
    state: () => ({ weapon, gun: curGun.id, mag, reserve, money, reloading: +reloading.toFixed(2), hp: Math.ceil(playerHp), dead: playerDead, barriersUp }),
  };
  (window as unknown as { __gun: ViewGun }).__gun = gun;
}

function startGame(): void {
  if (state === 'play') return;
  state = 'play';
  document.body.classList.add('playing');
  scene.remove(battle.group);
  scene.add(eggBots.group);
  // 每局重置：钱、已购、回到标配 + 满弹
  money = 9000; owned.clear(); owned.add('classic'); curGun = GUN_BY_ID.classic;
  gun.setGun(curGun); weaponHud?.setGunModel(curGun.model);
  mag = curGun.mag; reserve = curGun.reserve; reloading = 0; fireCd = 0; bloom = 0; sinceShot = 99; recoil = 0; firing = false;
  playerHp = PLAYER_MAX_HP; playerDead = false; deadT = 0; hurtFx = 0; // 重置血量
  refreshHpHud(); deadEl?.classList.add('hidden');
  setWeapon('knife'); // 开局拿刀
  refreshShop();
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
  closeShop();
  document.body.classList.remove('playing', 'paused');
  document.getElementById('pause')?.classList.add('hidden');
  document.getElementById('panel-settings')?.classList.add('hidden');
  if (freezeEl) freezeEl.style.display = 'none';
  scene.add(battle.group);
  scene.remove(eggBots.group);
  knife.group.visible = false;
  gun.group.visible = false;
  stats.dom.style.display = 'none';
}

// 游戏中：Esc 暂停/关商店；B 开关商店；1/2 切武器；R 换弹
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') { if (shopOpen) return; if (state === 'play') pause(); return; } // 商店不靠Esc关(只用B开关/买完自动关)
  if (state !== 'play') return;
  if (e.code === 'KeyB') { shopOpen ? closeShop() : openShop(); return; }
  if (shopOpen) return; // 商店开着时不处理武器键
  if (e.code === 'Digit1') setWeapon('knife');
  else if (e.code === 'Digit2') setWeapon('gun');
  else if (e.code === 'KeyR') reloadGun();
});
document.addEventListener('pointerlockchange', () => {
  if (state === 'play' && !shopOpen && !playerDead && document.pointerLockElement !== canvas) pause(); // 商店/阵亡解锁鼠标不算暂停
});
// 游戏中：左键攻击(枪按住=连发)，右键=标配三连发（鼠标已锁定时）
canvas.addEventListener('mousedown', (e) => {
  if (state !== 'play' || !input.locked) return;
  if (e.button === 0) onPrimaryDown();
  else if (e.button === 2) altFire();
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) onPrimaryUp(); });
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
    // 受伤红屏淡出 + 重生保护倒计时 + 准备阶段显示购买图标
    if (hurtFx > 0) hurtFx = Math.max(0, hurtFx - dt * 1.8);
    if (invulnT > 0) invulnT = Math.max(0, invulnT - dt);
    if (hurtEl) hurtEl.style.opacity = String(hurtFx);
    document.body.classList.toggle('canbuy', barriersUp && !shopOpen);

    if (playerDead) {                       // 阵亡：等待重生，玩家停止操作
      deadT -= dt;
      if (deadNEl) deadNEl.textContent = String(Math.max(0, Math.ceil(deadT)));
      if (deadT <= 0) respawnPlayer();
    } else {
      player.update(input, dt);
      knife.update(dt);    // 挥刀动作
      gun.update(dt);      // 枪的后坐/火光/换弹动作
      // 切武器前摇 + 射速冷却 + 全自动连发 + 连发散布恢复
      if (swapT > 0) swapT = Math.max(0, swapT - dt);
      if (fireCd > 0) fireCd = Math.max(0, fireCd - dt);
      if (firing && weapon === 'gun' && curGun.auto) tryFireGun();
      sinceShot += dt;
      const recovering = sinceShot > RECOVER_DELAY; // 停火才恢复散布/视角(蹲下无加成，同无畏契约)
      if (bloom > 0 && recovering) bloom = Math.max(0, bloom - BLOOM_RECOVER * dt);
      if (recoil > 0 && recovering) recoil = Math.max(0, recoil - RECOIL_RECOVER * dt);
      player.setRecoil(recoil);
      if (reloading > 0) {
        reloading -= dt;
        if (reloading <= 0) {
          if (barriersUp) mag = curGun.mag;                                     // 准备阶段：换弹不耗子弹(免费补满)
          else { const take = Math.min(curGun.mag - mag, reserve); mag += take; reserve -= take; }
        }
        refreshWeaponHud();
      }
    }
    gunFx.update(dt);    // 子弹拖尾 + 弹孔淡出(阵亡也继续)
    eggBots.update(dt, camera.position);  // 蛋蛋走位/追击/开枪反击(阵亡也继续动)
    weaponHud?.update(dt); // 右下角武器栏缩略图
    minimap?.draw(camera.position.x, camera.position.z, camera.rotation.y, barriersUp);
  }
  // 'paused'：只渲染，不更新

  renderer.render(scene, camera);
  stats.end();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
