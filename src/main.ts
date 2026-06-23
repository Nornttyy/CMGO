import * as THREE from 'three';
import Stats from 'stats.js';
import { createRenderer, createScene, onResize } from './game/engine/scene';
import { buildTestMap } from './game/world/testMap';
import { Input } from './game/engine/input';
import { PlayerController } from './game/player/playerController';
import { AttractBattle } from './game/menu/attractBattle';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = createRenderer(canvas);
const scene = createScene();
const walls = buildTestMap(scene);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const input = new Input(canvas);
const player = new PlayerController(camera, walls);

// 主菜单背景的蛋蛋小战斗
const battle = new AttractBattle();
scene.add(battle.group);

const stats = new Stats();
stats.showPanel(0);
stats.dom.style.display = 'none'; // 菜单时先藏 FPS 面板
document.body.appendChild(stats.dom);

let state: 'menu' | 'play' | 'paused' = 'menu';
let menuTime = 0;

function startGame(): void {
  if (state === 'play') return;
  state = 'play';
  document.body.classList.add('playing');
  scene.remove(battle.group);
  stats.dom.style.display = 'block';
  input.active = true;
  try {
    const r = canvas.requestPointerLock();
    (r as unknown as Promise<void> | undefined)?.catch?.(() => {});
  } catch {
    /* 忽略，按键也会锁定 */
  }
  // 进游戏后第一次按键，隐藏操作提示
  const hint = document.getElementById('hint');
  window.addEventListener('keydown', () => { if (hint) hint.style.display = 'none'; }, { once: true });
}

function pause(): void {
  if (state !== 'play') return;
  state = 'paused';
  input.active = false;
  document.body.classList.add('paused');
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

// 按钮事件
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

let last = performance.now();
function animate(now: number): void {
  stats.begin();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (state === 'menu') {
    menuTime += dt;
    battle.update(dt);
    // 摄像机缓缓环绕，欣赏蛋蛋小战斗
    const a = menuTime * 0.1;
    camera.position.set(Math.sin(a) * 12, 4.2, Math.cos(a) * 12 + 1);
    camera.lookAt(0, 1, -2);
  } else if (state === 'play') {
    player.update(input, dt);
  }
  // 'paused' 状态：不更新逻辑，只渲染（画面定格）

  renderer.render(scene, camera);
  stats.end();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
