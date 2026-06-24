import * as THREE from 'three';
import Stats from 'stats.js';
import { createRenderer, createScene, onResize } from './game/engine/scene';
import { buildDesertMap } from './game/world/desertMap';
import { Input } from './game/engine/input';
import { PlayerController } from './game/player/playerController';
import { AttractBattle } from './game/menu/attractBattle';
import { MapEditor, Brush } from './game/editor/mapEditor';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = createRenderer(canvas);
const scene = createScene();
const map = buildDesertMap(scene);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const input = new Input(canvas);

// 玩家碰撞 = 静态墙体 + 出生光幕（光幕落下后从这个数组里移除）
const playerWalls = map.walls.concat(map.barriers.map((b) => b.box));
const player = new PlayerController(camera, playerWalls, map.attackerSpawn);

// 主菜单背景的蛋蛋小战斗（用建筑/箱子当掩体）
const battle = new AttractBattle(map.walls.filter((w) => w.max.x - w.min.x < 20));
scene.add(battle.group);

// 可视化地图编辑器（自己的 3D 场景）
const editor = new MapEditor(renderer, canvas);

const stats = new Stats();
stats.showPanel(0);
stats.dom.style.display = 'none';
document.body.appendChild(stats.dom);

const freezeEl = document.getElementById('freeze');
const FREEZE_TIME = 5; // 开局准备阶段秒数
let barriersUp = false;
let freezeT = 0;

function raiseBarriers(): void {
  barriersUp = true;
  freezeT = 0;
  for (const b of map.barriers) {
    b.mesh.visible = true;
    if (!playerWalls.includes(b.box)) playerWalls.push(b.box);
  }
}
function dropBarriers(): void {
  barriersUp = false;
  if (freezeEl) freezeEl.style.display = 'none';
  for (const b of map.barriers) {
    b.mesh.visible = false;
    const i = playerWalls.indexOf(b.box);
    if (i >= 0) playerWalls.splice(i, 1);
  }
}

let state: 'menu' | 'play' | 'paused' | 'editor' = 'menu';
let menuTime = 0;
let freeCam = false; // DEV：自由相机巡检地图（上线不启用）

const menuEl = document.querySelector('.menu') as HTMLElement | null;
function enterEditor(): void {
  state = 'editor';
  if (menuEl) menuEl.style.display = 'none';
  document.getElementById('editor-ui')?.classList.remove('hidden');
  scene.remove(battle.group);
  input.active = false;
  try { document.exitPointerLock(); } catch { /* ignore */ }
  editor.enable();
}
function exitEditor(): void {
  editor.save();
  editor.disable();
  document.getElementById('editor-ui')?.classList.add('hidden');
  if (menuEl) menuEl.style.display = '';
  scene.add(battle.group);
  state = 'menu';
}
function playEdited(): void {
  editor.save();
  try { sessionStorage.setItem('cmgo_autoplay', '1'); } catch { /* ignore */ }
  location.reload(); // 重新加载，游戏会读你刚存的地图
}

function startGame(): void {
  if (state === 'play') return;
  state = 'play';
  document.body.classList.add('playing');
  scene.remove(battle.group);
  stats.dom.style.display = 'block';
  input.active = true;
  raiseBarriers();
  try {
    const r = canvas.requestPointerLock();
    (r as unknown as Promise<void> | undefined)?.catch?.(() => {});
  } catch {
    /* 忽略，按键也会锁定 */
  }
  const hint = document.getElementById('hint');
  window.addEventListener('keydown', () => { if (hint) hint.style.display = 'none'; }, { once: true });
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
  stats.dom.style.display = 'none';
}

// 游戏中按 Esc（或鼠标解锁）就暂停
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && state === 'play') pause();
});
document.addEventListener('pointerlockchange', () => {
  if (state === 'play' && document.pointerLockElement !== canvas) pause();
});

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

// 地图编辑器按钮
document.getElementById('btn-editor')?.addEventListener('click', enterEditor);
document.getElementById('ed-back')?.addEventListener('click', exitEditor);
document.getElementById('ed-play')?.addEventListener('click', playEdited);
document.getElementById('ed-clear')?.addEventListener('click', () => editor.clear());
document.querySelectorAll('.ed-brush').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.ed-brush').forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
  editor.setBrush((b as HTMLElement).dataset.brush as Brush);
}));
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

window.addEventListener('resize', () => { onResize(renderer, camera); editor.resize(); });

// 从编辑器点"试玩"会重载页面，这里自动进入游戏玩刚做的地图
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
  };
}

let last = performance.now();
function animate(now: number): void {
  stats.begin();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (state === 'editor') {
    editor.update(); // 编辑器渲染自己的场景
    stats.end();
    requestAnimationFrame(animate);
    return;
  }

  if (state === 'menu') {
    menuTime += dt;
    battle.update(dt);
    if (!freeCam) {
      const a = menuTime * 0.1;
      camera.position.set(Math.sin(a) * 12, 4.2, Math.cos(a) * 12 + 1);
      camera.lookAt(0, 1, -2);
    }
  } else if (state === 'play') {
    // 开局准备阶段：光幕挡着，倒计时结束才落下
    if (barriersUp) {
      freezeT += dt;
      const op = 0.26 + Math.sin(freezeT * 5) * 0.08;
      for (const b of map.barriers) (b.mesh.material as THREE.MeshStandardMaterial).opacity = op;
      if (freezeEl) {
        freezeEl.style.display = 'block';
        freezeEl.textContent = '准备阶段 ' + Math.ceil(FREEZE_TIME - freezeT);
      }
      if (freezeT >= FREEZE_TIME) dropBarriers();
    }
    player.update(input, dt);
  }
  // 'paused'：只渲染，不更新

  renderer.render(scene, camera);
  stats.end();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
