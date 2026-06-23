import * as THREE from 'three';
import Stats from 'stats.js';
import { createRenderer, createScene, onResize } from './game/engine/scene';
import { buildTestMap } from './game/world/testMap';
import { Input } from './game/engine/input';
import { PlayerController } from './game/player/playerController';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = createRenderer(canvas);
const scene = createScene();
const walls = buildTestMap(scene);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const input = new Input(canvas);
const player = new PlayerController(camera, walls);

// 左上角 FPS 面板
const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

// 第一次按键或点击后，隐藏操作提示
const hint = document.getElementById('hint');
const hideHint = (): void => { if (hint) hint.style.display = 'none'; };
window.addEventListener('keydown', hideHint, { once: true });
window.addEventListener('mousedown', hideHint, { once: true });

window.addEventListener('resize', () => onResize(renderer, camera));

let last = performance.now();
function animate(now: number): void {
  stats.begin();
  const dt = Math.min((now - last) / 1000, 0.05); // 限制最大步长，防卡顿穿墙
  last = now;
  player.update(input, dt);
  renderer.render(scene, camera);
  stats.end();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
